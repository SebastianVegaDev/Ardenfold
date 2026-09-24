import { z } from "zod";

import { ContractException } from "../http/contracts";

export const registryCursorSchema = z.strictObject({
    key: z.string(),
    id: z.uuid(),
    sort: z.enum(["name_asc", "name_desc", "updated_desc"]),
    filters: z.string(),
});

export type RegistryCursor = z.infer<typeof registryCursorSchema>;

export function registryFilterKey(filters: Record<string, string | undefined>): string {
    return JSON.stringify(filters);
}

export function decodeRegistryCursor(value: string, filters: string, code: string): RegistryCursor {
    try {
        const cursor = registryCursorSchema.parse(
            JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
        );
        if (cursor.filters !== filters) throw new Error("Cursor filters changed.");
        if (cursor.sort === "updated_desc" && Number.isNaN(Date.parse(cursor.key)))
            throw new Error("Invalid cursor timestamp.");
        return cursor;
    } catch {
        throw new ContractException(code, 400);
    }
}

export function encodeRegistryCursor(cursor: RegistryCursor): string {
    return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function searchPattern(value: string): string {
    const normalized = value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\\%_]/gu, "\\$&");
    return `%${normalized}%`;
}
