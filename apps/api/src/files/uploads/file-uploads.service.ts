import { createHash, randomUUID } from "node:crypto";

import {
    storedObjectSchema,
    type RequestFileUpload,
    type StoredObject,
} from "@ardenfold/contracts";
import { storedObjects } from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq, lt, sql } from "drizzle-orm";

import { recordAuditEvent } from "../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../http/contracts";
import { PrivateObjectStore, maxPrivateFileBytes } from "../storage/private-object-store";
import { detectMediaType, safeFilename, sha256 } from "./file-content";

type Row = typeof storedObjects.$inferSelect;

function response(row: Row): StoredObject {
    return storedObjectSchema.parse({
        id: row.id,
        filename: row.originalFilename,
        mediaType: row.mediaType,
        expectedByteLength: row.expectedByteLength,
        byteLength: row.byteLength,
        sha256: row.sha256,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        finalizedAt: row.finalizedAt?.toISOString() ?? null,
    });
}

@Injectable()
export class FileUploadsService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly storage: PrivateObjectStore,
    ) {}

    reserve(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: RequestFileUpload,
    ): Promise<StoredObject> {
        const filename = safeFilename(input.filename);
        const requestHash = createHash("sha256")
            .update(JSON.stringify({ ...input, filename }))
            .digest("hex");
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["files.upload"],
            async (tx) => {
                const existing = await tx
                    .select()
                    .from(storedObjects)
                    .where(
                        and(
                            eq(storedObjects.organizationId, organizationId),
                            eq(storedObjects.idempotencyKey, input.idempotencyKey),
                        ),
                    )
                    .limit(1);
                if (existing[0]) {
                    if (
                        existing[0].requestHash !== requestHash ||
                        existing[0].uploadedByUserId !== principal.user.id
                    )
                        throw new ContractException("IDEMPOTENCY_CONFLICT", 409);
                    return response(existing[0]);
                }
                const [inserted] = await tx
                    .insert(storedObjects)
                    .values({
                        organizationId,
                        storageKey: `${organizationId}/${randomUUID()}`,
                        originalFilename: filename,
                        declaredMediaType: input.mediaType,
                        expectedByteLength: input.byteLength,
                        expectedSha256: input.sha256,
                        idempotencyKey: input.idempotencyKey,
                        requestHash,
                        uploadedByUserId: principal.user.id,
                    })
                    .onConflictDoNothing({
                        target: [storedObjects.organizationId, storedObjects.idempotencyKey],
                    })
                    .returning();
                const [row] = inserted
                    ? [inserted]
                    : await tx
                          .select()
                          .from(storedObjects)
                          .where(
                              and(
                                  eq(storedObjects.organizationId, organizationId),
                                  eq(storedObjects.idempotencyKey, input.idempotencyKey),
                              ),
                          )
                          .limit(1);
                if (
                    !row ||
                    row.requestHash !== requestHash ||
                    row.uploadedByUserId !== principal.user.id
                )
                    throw new ContractException("IDEMPOTENCY_CONFLICT", 409);
                if (!inserted) return response(row);
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "file.upload_requested",
                    resourceType: "stored_object",
                    resourceId: row.id,
                });
                return response(row);
            },
        );
    }

    upload(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        id: string,
        bytes: Buffer,
    ): Promise<StoredObject> {
        if (bytes.length < 1 || bytes.length > maxPrivateFileBytes)
            throw new ContractException("FILE_SIZE_INVALID", 413);
        const digest = sha256(bytes);
        const mediaType = detectMediaType(bytes);
        if (!mediaType) throw new ContractException("FILE_TYPE_UNSUPPORTED", 415);
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["files.upload"],
            async (tx) => {
                const rows = await tx
                    .select()
                    .from(storedObjects)
                    .where(
                        and(
                            eq(storedObjects.organizationId, organizationId),
                            eq(storedObjects.id, id),
                        ),
                    )
                    .for("update");
                const row = rows[0];
                if (!row || row.uploadedByUserId !== principal.user.id)
                    throw new ContractException("FILE_NOT_FOUND", 404);
                if (row.status === "uploaded" || row.status === "finalized") {
                    if (
                        row.sha256 !== digest ||
                        row.byteLength !== bytes.length ||
                        row.mediaType !== mediaType
                    )
                        throw new ContractException("UPLOAD_CONFLICT", 409);
                    return response(row);
                }
                if (row.status !== "pending") throw new ContractException("UPLOAD_CONFLICT", 409);
                if (
                    bytes.length !== row.expectedByteLength ||
                    digest !== row.expectedSha256 ||
                    mediaType !== row.declaredMediaType
                )
                    throw new ContractException("UPLOAD_MISMATCH", 422);
                await this.storage.put(row.storageKey, { bytes, mediaType }, digest);
                const [updated] = await tx
                    .update(storedObjects)
                    .set({
                        status: "uploaded",
                        mediaType,
                        byteLength: bytes.length,
                        sha256: digest,
                        uploadedAt: new Date(),
                    })
                    .where(eq(storedObjects.id, id))
                    .returning();
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "file.uploaded",
                    resourceType: "stored_object",
                    resourceId: id,
                });
                return response(updated!);
            },
        );
    }

    finalize(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        id: string,
    ): Promise<StoredObject> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["files.upload"],
            async (tx) => {
                const rows = await tx
                    .select()
                    .from(storedObjects)
                    .where(
                        and(
                            eq(storedObjects.organizationId, organizationId),
                            eq(storedObjects.id, id),
                        ),
                    )
                    .for("update");
                const row = rows[0];
                if (!row || row.uploadedByUserId !== principal.user.id)
                    throw new ContractException("FILE_NOT_FOUND", 404);
                if (row.status === "finalized") return response(row);
                if (row.status !== "uploaded")
                    throw new ContractException("UPLOAD_INCOMPLETE", 409);
                const object = await this.storage.get(row.storageKey);
                if (
                    !object ||
                    object.bytes.length !== row.expectedByteLength ||
                    sha256(object.bytes) !== row.expectedSha256 ||
                    detectMediaType(object.bytes) !== row.mediaType ||
                    object.mediaType !== row.mediaType
                )
                    throw new ContractException("STORED_OBJECT_MISMATCH", 409);
                const [updated] = await tx
                    .update(storedObjects)
                    .set({ status: "finalized", finalizedAt: new Date() })
                    .where(eq(storedObjects.id, id))
                    .returning();
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "file.finalized",
                    resourceType: "stored_object",
                    resourceId: id,
                });
                return response(updated!);
            },
        );
    }

    async download(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        id: string,
    ): Promise<{ bytes: Buffer; mediaType: string; filename: string }> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["files.read"],
            async (tx) => {
                const [row] = await tx
                    .select()
                    .from(storedObjects)
                    .where(
                        and(
                            eq(storedObjects.organizationId, organizationId),
                            eq(storedObjects.id, id),
                        ),
                    )
                    .limit(1);
                if (
                    !row ||
                    row.status !== "finalized" ||
                    row.retainedAt ||
                    row.uploadedByUserId !== principal.user.id
                )
                    throw new ContractException("FILE_NOT_FOUND", 404);
                const object = await this.storage.get(row.storageKey);
                if (
                    !object ||
                    object.bytes.length !== row.byteLength ||
                    sha256(object.bytes) !== row.sha256 ||
                    object.mediaType !== row.mediaType
                )
                    throw new ContractException("STORED_OBJECT_MISMATCH", 409);
                return { ...object, filename: row.originalFilename };
            },
        );
    }

    async abandonExpired(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        before: Date,
    ): Promise<number> {
        const keys = await this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["files.upload"],
            async (tx) => {
                const rows = await tx
                    .select()
                    .from(storedObjects)
                    .where(
                        and(
                            eq(storedObjects.organizationId, organizationId),
                            lt(storedObjects.createdAt, before),
                            sql`${storedObjects.retainedAt} IS NULL`,
                        ),
                    )
                    .for("update");
                for (const row of rows) {
                    if (row.status !== "abandoned")
                        await tx
                            .update(storedObjects)
                            .set({ status: "abandoned", abandonedAt: new Date() })
                            .where(eq(storedObjects.id, row.id));
                }
                return rows.map((row) => row.storageKey);
            },
        );
        for (const key of keys) await this.storage.delete(key);
        return keys.length;
    }
}
