import { createHash } from "node:crypto";

import {
    createAssetRequestSchema,
    createPartyRequestSchema,
    registryImportSessionResponseSchema,
    type CommitRegistryImportRequest,
    type PreviewRegistryImportRequest,
    type RegistryImportCandidate,
    type RegistryImportIssue,
    type RegistryImportSessionResponse,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    registryImportRows,
    registryImportSessions,
    type RegistryImportRow,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";

import { recordAuditEvent } from "../audit/audit.service";
import { AssetManagementService } from "../assets/management/asset-management.service";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { OrganizationAuthorizationService } from "../auth/organization-authorization.service";
import { ContractException } from "../http/contracts";
import { PartyDetailsService } from "../parties/party-details.service";
import { PartyManagementService } from "../parties/party-management.service";
import { normalizeRegistryIdentifier } from "./identifier-normalization";
import { parseImportCsv, type ParsedImportRow } from "./import-parser";

type Kind = "party" | "asset";

function permission(kind: Kind): "parties.write" | "assets.write" {
    return kind === "party" ? "parties.write" : "assets.write";
}

function sameNumbers(first: readonly number[] | null, second: readonly number[]): boolean {
    return (
        first !== null &&
        first.length === second.length &&
        first.every((value, index) => value === second[index])
    );
}

function errorIssue(error: unknown): RegistryImportIssue {
    return {
        code:
            error instanceof ContractException && error.getStatus() < 500
                ? error.code
                : "IMPORT_ROW_FAILED",
        field: null,
    };
}

function csvCell(value: string): string {
    const safe = /^[=+@\-\t\r]/u.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/gu, '""')}"`;
}

@Injectable()
export class RegistryImportService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly parties: PartyManagementService,
        private readonly partyDetails: PartyDetailsService,
        private readonly assets: AssetManagementService,
    ) {}

    async assertPermission(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        kind: Kind,
    ): Promise<void> {
        await this.authorization.authorize(principal.user.id, organizationId, [permission(kind)]);
    }

    async preview(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: PreviewRegistryImportRequest,
    ): Promise<RegistryImportSessionResponse> {
        const parsedRows = parseImportCsv(input.kind, input.csv);
        const hash = createHash("sha256")
            .update(input.kind)
            .update("\0")
            .update(input.csv)
            .digest("hex");
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [permission(input.kind)],
            async (transaction) => {
                const existing = await transaction
                    .select()
                    .from(registryImportSessions)
                    .where(
                        and(
                            eq(registryImportSessions.organizationId, organizationId),
                            eq(registryImportSessions.id, input.sessionId),
                        ),
                    )
                    .limit(1);
                if (existing[0]) {
                    if (existing[0].kind !== input.kind || existing[0].contentHash !== hash)
                        throw new ContractException("IMPORT_SESSION_CONFLICT", 409);
                    return this.getInTransaction(transaction, organizationId, input.sessionId);
                }
                const seen = new Set<string>();
                const staged: Array<typeof registryImportRows.$inferInsert> = [];
                for (const row of parsedRows) {
                    const { warnings, candidates } = await this.warningsForRow(
                        transaction,
                        organizationId,
                        input.kind,
                        row,
                        seen,
                    );
                    staged.push({
                        organizationId,
                        sessionId: input.sessionId,
                        rowNumber: row.rowNumber,
                        kind: input.kind,
                        status: row.errors.length ? "rejected" : "valid",
                        payload:
                            row.payload === null
                                ? { displayName: row.displayName }
                                : input.kind === "party"
                                  ? { party: row.payload, identifier: row.identifier }
                                  : row.payload,
                        errors: row.errors,
                        warnings,
                        duplicateCandidates: candidates,
                    });
                }
                const inserted = await transaction
                    .insert(registryImportSessions)
                    .values({
                        id: input.sessionId,
                        organizationId,
                        kind: input.kind,
                        templateVersion: 1,
                        contentHash: hash,
                        totalRows: parsedRows.length,
                        createdByUserId: principal.user.id,
                    })
                    .onConflictDoNothing()
                    .returning({ id: registryImportSessions.id });
                if (!inserted.length) {
                    const [other] = await transaction
                        .select()
                        .from(registryImportSessions)
                        .where(
                            and(
                                eq(registryImportSessions.organizationId, organizationId),
                                eq(registryImportSessions.id, input.sessionId),
                            ),
                        );
                    if (!other || other.kind !== input.kind || other.contentHash !== hash)
                        throw new ContractException("IMPORT_SESSION_CONFLICT", 409);
                    return this.getInTransaction(transaction, organizationId, input.sessionId);
                }
                if (staged.length) await transaction.insert(registryImportRows).values(staged);
                return this.getInTransaction(transaction, organizationId, input.sessionId);
            },
        );
    }

    async get(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        sessionId: string,
    ): Promise<RegistryImportSessionResponse> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [],
            (transaction) => this.getInTransaction(transaction, organizationId, sessionId),
        );
    }

    async commit(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        sessionId: string,
        input: CommitRegistryImportRequest,
    ): Promise<RegistryImportSessionResponse> {
        const approved = [...input.approvedRows].sort((a, b) => a - b);
        const preview = await this.get(principal, organizationId, sessionId);
        const required = permission(preview.kind);
        const claim = await this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [required],
            async (transaction) => {
                const locked = await transaction.execute<{
                    status: string;
                    approvedRows: number[] | null;
                    leaseUntil: Date | null;
                }>(sql`
                    SELECT status, approved_rows AS "approvedRows", lease_until AS "leaseUntil"
                    FROM registry_import_sessions
                    WHERE organization_id = ${organizationId}::uuid AND id = ${sessionId}::uuid
                    FOR UPDATE
                `);
                const session = locked.rows[0];
                if (!session) throw new ContractException("IMPORT_SESSION_NOT_FOUND", 404);
                if (session.status === "completed") {
                    if (!sameNumbers(session.approvedRows, approved))
                        throw new ContractException("IMPORT_CONFIRMATION_CONFLICT", 409);
                    return false;
                }
                if (session.status === "committing") {
                    if (!sameNumbers(session.approvedRows, approved))
                        throw new ContractException("IMPORT_CONFIRMATION_CONFLICT", 409);
                    if (session.leaseUntil && session.leaseUntil > new Date())
                        throw new ContractException("IMPORT_ALREADY_COMMITTING", 409);
                } else {
                    const current = await this.getInTransaction(
                        transaction,
                        organizationId,
                        sessionId,
                    );
                    const valid = new Set(
                        current.rows
                            .filter((row) => row.status === "valid")
                            .map((row) => row.rowNumber),
                    );
                    if (approved.some((row) => !valid.has(row)))
                        throw new ContractException("IMPORT_APPROVAL_INVALID", 400);
                    await transaction
                        .update(registryImportRows)
                        .set({ status: "skipped", updatedAt: new Date() })
                        .where(
                            and(
                                eq(registryImportRows.organizationId, organizationId),
                                eq(registryImportRows.sessionId, sessionId),
                                eq(registryImportRows.status, "valid"),
                                ...(approved.length
                                    ? [
                                          sql`${registryImportRows.rowNumber} NOT IN (${sql.join(
                                              approved.map((row) => sql`${row}`),
                                              sql`, `,
                                          )})`,
                                      ]
                                    : []),
                            ),
                        );
                }
                await transaction
                    .update(registryImportSessions)
                    .set({
                        status: "committing",
                        approvedRows: approved,
                        leaseUntil: new Date(Date.now() + 60_000),
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(registryImportSessions.organizationId, organizationId),
                            eq(registryImportSessions.id, sessionId),
                        ),
                    );
                return true;
            },
        );
        if (!claim) return this.get(principal, organizationId, sessionId);

        for (const rowNumber of approved) {
            try {
                await this.authorization.withAuthorizedTransaction(
                    principal.user.id,
                    organizationId,
                    [required],
                    async (transaction) => {
                        const locked = await transaction.execute<RegistryImportRow>(sql`
                            SELECT * FROM registry_import_rows
                            WHERE organization_id = ${organizationId}::uuid
                              AND session_id = ${sessionId}::uuid
                              AND row_number = ${rowNumber}
                            FOR UPDATE
                        `);
                        const row = locked.rows[0];
                        if (!row || row.status === "committed" || row.status === "failed") return;
                        if (row.status !== "valid" || !row.payload)
                            throw new ContractException("IMPORT_ROW_NOT_VALID", 409);
                        let resourceId: string;
                        if (preview.kind === "party") {
                            const source = row.payload as { party?: unknown; identifier?: unknown };
                            const party = createPartyRequestSchema.parse(source.party);
                            const created = await this.parties.createInTransaction(
                                transaction,
                                principal,
                                organizationId,
                                party,
                            );
                            resourceId = created.id;
                            if (source.identifier) {
                                const identifier = source.identifier as {
                                    type: string;
                                    originalValue: string;
                                };
                                await this.partyDetails.addIdentifierInTransaction(
                                    transaction,
                                    principal,
                                    organizationId,
                                    created.id,
                                    {
                                        expectedVersion: created.version,
                                        type: identifier.type,
                                        originalValue: identifier.originalValue,
                                    },
                                );
                            }
                        } else {
                            const asset = createAssetRequestSchema.parse(row.payload);
                            const created = await this.assets.createInTransaction(
                                transaction,
                                principal,
                                organizationId,
                                asset,
                            );
                            resourceId = created.id;
                        }
                        await transaction
                            .update(registryImportRows)
                            .set({
                                status: "committed",
                                resourceId,
                                errors: [],
                                updatedAt: new Date(),
                            })
                            .where(
                                and(
                                    eq(registryImportRows.organizationId, organizationId),
                                    eq(registryImportRows.sessionId, sessionId),
                                    eq(registryImportRows.rowNumber, rowNumber),
                                ),
                            );
                    },
                );
            } catch (error) {
                if (error instanceof ContractException && error.getStatus() === 403) throw error;
                await this.authorization.withAuthorizedTransaction(
                    principal.user.id,
                    organizationId,
                    [required],
                    async (transaction) => {
                        await transaction
                            .update(registryImportRows)
                            .set({
                                status: "failed",
                                errors: [errorIssue(error)],
                                updatedAt: new Date(),
                            })
                            .where(
                                and(
                                    eq(registryImportRows.organizationId, organizationId),
                                    eq(registryImportRows.sessionId, sessionId),
                                    eq(registryImportRows.rowNumber, rowNumber),
                                    eq(registryImportRows.status, "valid"),
                                ),
                            );
                    },
                );
            }
        }

        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            [required],
            async (transaction) => {
                const result = await this.getInTransaction(transaction, organizationId, sessionId);
                if (
                    approved.some((rowNumber) =>
                        result.rows.some(
                            (row) => row.rowNumber === rowNumber && row.status === "valid",
                        ),
                    )
                )
                    throw new ContractException("IMPORT_INCOMPLETE", 409);
                const [completed] = await transaction
                    .update(registryImportSessions)
                    .set({
                        status: "completed",
                        leaseUntil: null,
                        summary: result.summary,
                        completedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(registryImportSessions.organizationId, organizationId),
                            eq(registryImportSessions.id, sessionId),
                            eq(registryImportSessions.status, "committing"),
                        ),
                    )
                    .returning({ id: registryImportSessions.id });
                if (completed)
                    await recordAuditEvent(transaction, {
                        organizationId,
                        actorUserId: principal.user.id,
                        action: "registry.import_completed",
                        resourceType: "registry_import_session",
                        resourceId: sessionId,
                        metadata: { kind: preview.kind, ...result.summary },
                    });
                return { ...result, status: "completed" };
            },
        );
    }

    async errorsCsv(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        sessionId: string,
    ): Promise<string> {
        const session = await this.get(principal, organizationId, sessionId);
        const lines = ["row_number,display_name,status,error_code,field"];
        for (const row of session.rows) {
            for (const error of row.errors) {
                lines.push(
                    [
                        String(row.rowNumber),
                        csvCell(row.displayName ?? ""),
                        row.status,
                        csvCell(error.code),
                        csvCell(error.field ?? ""),
                    ].join(","),
                );
            }
        }
        return `${lines.join("\r\n")}\r\n`;
    }

    private async getInTransaction(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        sessionId: string,
    ): Promise<RegistryImportSessionResponse> {
        const [session] = await transaction
            .select()
            .from(registryImportSessions)
            .where(
                and(
                    eq(registryImportSessions.organizationId, organizationId),
                    eq(registryImportSessions.id, sessionId),
                ),
            )
            .limit(1);
        if (!session) throw new ContractException("IMPORT_SESSION_NOT_FOUND", 404);
        const rows = await transaction
            .select()
            .from(registryImportRows)
            .where(
                and(
                    eq(registryImportRows.organizationId, organizationId),
                    eq(registryImportRows.sessionId, sessionId),
                ),
            )
            .orderBy(asc(registryImportRows.rowNumber));
        const summary = { valid: 0, rejected: 0, committed: 0, failed: 0, skipped: 0 };
        for (const row of rows) summary[row.status as keyof typeof summary] += 1;
        return registryImportSessionResponseSchema.parse({
            id: session.id,
            kind: session.kind,
            status: session.status,
            templateVersion: session.templateVersion,
            totalRows: session.totalRows,
            approvedRows: session.approvedRows,
            summary,
            rows: rows.map((row) => ({
                rowNumber: row.rowNumber,
                displayName:
                    row.kind === "party"
                        ? ((
                              row.payload as {
                                  party?: { displayName?: string };
                                  displayName?: string;
                              } | null
                          )?.party?.displayName ??
                          (row.payload as { displayName?: string } | null)?.displayName ??
                          null)
                        : ((row.payload as { displayName?: string } | null)?.displayName ?? null),
                status: row.status,
                errors: row.errors,
                warnings: row.warnings,
                duplicateCandidates: row.duplicateCandidates,
                resourceId: row.resourceId,
            })),
        });
    }

    private async warningsForRow(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        kind: Kind,
        row: ParsedImportRow,
        seen: Set<string>,
    ): Promise<{ warnings: RegistryImportIssue[]; candidates: RegistryImportCandidate[] }> {
        const warnings: RegistryImportIssue[] = [];
        if (!row.identifier || row.errors.length) return { warnings, candidates: [] };
        const type = row.identifier.type.toLowerCase();
        const normalized = normalizeRegistryIdentifier(row.identifier.originalValue);
        const key = `${type}:${normalized}`;
        if (seen.has(key)) warnings.push({ code: "DUPLICATE_IN_FILE", field: "identifier_value" });
        seen.add(key);
        const result =
            kind === "party"
                ? await transaction.execute<RegistryImportCandidate>(sql`
                  SELECT candidate.id, candidate.display_name AS "displayName", identifier.type AS "matchedType"
                  FROM party_identifiers identifier
                  JOIN parties candidate ON candidate.organization_id = identifier.organization_id AND candidate.id = identifier.party_id
                  WHERE identifier.organization_id = ${organizationId}::uuid
                    AND identifier.type = ${type}
                    AND identifier.normalized_value = ${normalized}
                  ORDER BY candidate.display_name, candidate.id LIMIT 10
              `)
                : await transaction.execute<RegistryImportCandidate>(sql`
                  SELECT candidate.id, candidate.display_name AS "displayName", identifier.type AS "matchedType"
                  FROM asset_identifiers identifier
                  JOIN assets candidate ON candidate.organization_id = identifier.organization_id AND candidate.id = identifier.asset_id
                  WHERE identifier.organization_id = ${organizationId}::uuid
                    AND identifier.status = 'active'
                    AND identifier.type = ${type}
                    AND identifier.normalized_value = ${normalized}
                  ORDER BY candidate.display_name, candidate.id LIMIT 10
              `);
        if (result.rows.length)
            warnings.push({ code: "POSSIBLE_DUPLICATE", field: "identifier_value" });
        return { warnings, candidates: result.rows };
    }
}
