import {
    createAssetRequestSchema,
    createPartyRequestSchema,
    newAssetIdentifierSchema,
    type CreateAssetRequest,
    type CreatePartyRequest,
    type RegistryImportIssue,
} from "@ardenfold/contracts";

import { ContractException } from "../http/contracts";
import { normalizeRegistryIdentifier } from "./identifier-normalization";

export const importHeaders = {
    party: [
        "template_version", "display_name", "kind", "roles", "legal_name",
        "identifier_type", "identifier_value",
    ],
    asset: [
        "template_version", "display_name", "description", "manufacturer", "model",
        "classification", "lifecycle", "identifier_type", "identifier_value",
    ],
} as const;

export type ParsedImportRow = {
    rowNumber: number;
    displayName: string | null;
    payload: CreatePartyRequest | CreateAssetRequest | null;
    identifier: { type: string; originalValue: string } | null;
    errors: RegistryImportIssue[];
};

function issue(code: string, field: string | null = null): RegistryImportIssue {
    return { code, field };
}

function splitCsv(csv: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    let afterQuote = false;
    for (let index = 0; index < csv.length; index += 1) {
        const char = csv[index]!;
        if (quoted) {
            if (char === '"') {
                if (csv[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else {
                    quoted = false;
                    afterQuote = true;
                }
            } else {
                field += char;
            }
        } else if (char === '"') {
            if (field || afterQuote) throw new ContractException("MALFORMED_IMPORT_CSV", 400);
            quoted = true;
        } else if (char === "," || char === "\n" || char === "\r") {
            row.push(field);
            field = "";
            afterQuote = false;
            if (char !== ",") {
                if (char === "\r") {
                    if (csv[index + 1] !== "\n") throw new ContractException("MALFORMED_IMPORT_CSV", 400);
                    index += 1;
                }
                rows.push(row);
                row = [];
                if (rows.length > 501) throw new ContractException("IMPORT_ROW_LIMIT_EXCEEDED", 400);
            }
        } else {
            if (afterQuote) throw new ContractException("MALFORMED_IMPORT_CSV", 400);
            field += char;
        }
        if (field.length > 10_000) throw new ContractException("IMPORT_FIELD_TOO_LARGE", 400);
    }
    if (quoted) throw new ContractException("MALFORMED_IMPORT_CSV", 400);
    if (field || row.length || afterQuote) {
        row.push(field);
        rows.push(row);
    }
    if (rows.length > 501) throw new ContractException("IMPORT_ROW_LIMIT_EXCEEDED", 400);
    return rows;
}

function optional(value: string): string | null {
    return value.trim() || null;
}

function parseRow(kind: "party" | "asset", values: string[], rowNumber: number): ParsedImportRow {
    const columns = importHeaders[kind];
    const record = Object.fromEntries(columns.map((column, index) => [column, values[index]?.trim() ?? ""]));
    const errors: RegistryImportIssue[] = [];
    if (values.length !== columns.length) errors.push(issue("INVALID_COLUMN_COUNT"));
    if (record.template_version !== "1") errors.push(issue("INVALID_TEMPLATE_VERSION", "template_version"));
    const displayName = record.display_name || null;
    if (!displayName) errors.push(issue("REQUIRED_FIELD", "display_name"));
    const identifierType = record.identifier_type ?? "";
    const identifierValue = record.identifier_value ?? "";
    if (Boolean(identifierType) !== Boolean(identifierValue)) {
        errors.push(issue("INCOMPLETE_IDENTIFIER", identifierType ? "identifier_value" : "identifier_type"));
    }
    const parsedIdentifier = identifierType && identifierValue
        ? newAssetIdentifierSchema.safeParse({ type: identifierType, originalValue: identifierValue })
        : null;
    if (parsedIdentifier && !parsedIdentifier.success) errors.push(issue("INVALID_IDENTIFIER", "identifier_value"));
    const identifier = parsedIdentifier?.success ? parsedIdentifier.data : null;
    if (identifier) {
        try {
            normalizeRegistryIdentifier(identifier.originalValue);
        } catch {
            errors.push(issue("INVALID_IDENTIFIER", "identifier_value"));
        }
    }
    if (kind === "party") {
        const roles = (record.roles ?? "").split("|").map((role) => role.trim()).filter(Boolean);
        const parsed = createPartyRequestSchema.safeParse({
            kind: record.kind,
            displayName,
            legalName: optional(record.legal_name ?? ""),
            roles,
        });
        if (!parsed.success) {
            for (const problem of parsed.error.issues) {
                const field = String(problem.path[0] ?? "row");
                errors.push(issue(field === "kind" ? "INVALID_KIND" : field === "roles" ? "INVALID_ROLES" : "INVALID_FIELD", field));
            }
        }
        return { rowNumber, displayName, payload: parsed.success && !errors.length ? parsed.data : null, identifier, errors };
    }
    const parsed = createAssetRequestSchema.safeParse({
        displayName,
        description: optional(record.description ?? ""),
        manufacturer: optional(record.manufacturer ?? ""),
        model: optional(record.model ?? ""),
        classification: optional(record.classification ?? ""),
        lifecycle: record.lifecycle || "registered",
        identifiers: identifier ? [identifier] : [],
    });
    if (!parsed.success) {
        for (const problem of parsed.error.issues) {
            const field = String(problem.path[0] ?? "row");
            errors.push(issue(field === "lifecycle" ? "INVALID_LIFECYCLE" : "INVALID_FIELD", field));
        }
    }
    return { rowNumber, displayName, payload: parsed.success && !errors.length ? parsed.data : null, identifier, errors };
}

export function parseImportCsv(kind: "party" | "asset", input: string): ParsedImportRow[] {
    if (Buffer.byteLength(input, "utf8") > 524_288) throw new ContractException("IMPORT_FILE_TOO_LARGE", 400);
    if (/[\u0000\uFFFD]/u.test(input)) throw new ContractException("INVALID_IMPORT_ENCODING", 400);
    const csv = input.startsWith("\uFEFF") ? input.slice(1) : input;
    const rows = splitCsv(csv);
    const expected = importHeaders[kind];
    if (!rows[0] || rows[0].length !== expected.length || rows[0].some((value, index) => value !== expected[index]))
        throw new ContractException("INVALID_IMPORT_HEADER", 400);
    return rows.slice(1).map((values, index) => parseRow(kind, values, index + 2));
}

export function csvTemplate(kind: "party" | "asset"): string {
    const sample = kind === "party"
        ? ["1", "Example Customer", "organization", "customer", "", "tax_id", "TAX-001"]
        : ["1", "Example Meter", "", "Example Maker", "M-100", "Electrical", "registered", "serial", "SN-001"];
    return `${importHeaders[kind].join(",")}\r\n${sample.join(",")}\r\n`;
}
