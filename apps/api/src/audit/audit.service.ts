import {
    auditActionSchema,
    auditEventListResponseSchema,
    auditMetadataSchema,
    type AuditAction,
    type AuditEventListResponse,
    type AuditEventQuery,
    type AuditMetadata,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import { auditEvents } from "@ardenfold/database/schema";
import { getCorrelationId } from "@ardenfold/observability";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";

import { ContractException } from "../http/contracts";
import type { AuthenticatedPrincipal } from "../auth/authentication/types";
import { OrganizationAuthorizationService } from "../auth/authorization/organization-authorization.service";

const cursorSchema = z.strictObject({
    occurredAt: z.iso.datetime({ precision: 3 }),
    id: z.uuid(),
});
const sensitiveMetadataKey = /(token|secret|password|document|content|email)/iu;

export type RecordAuditEvent = Readonly<{
    organizationId: string;
    actorUserId: string;
    actorType?: "user" | "administrator";
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    metadata?: AuditMetadata;
}>;

export async function recordAuditEvent(
    transaction: ArdenfoldTransaction,
    event: RecordAuditEvent,
): Promise<void> {
    const traceId = getCorrelationId();

    if (!traceId) {
        throw new Error("Audit events require an active request correlation context.");
    }

    const action = auditActionSchema.parse(event.action);
    const metadata = auditMetadataSchema.parse(event.metadata ?? {});

    if (Object.keys(metadata).some((key) => sensitiveMetadataKey.test(key))) {
        throw new Error("Audit metadata contains a prohibited sensitive field name.");
    }

    if (Buffer.byteLength(JSON.stringify(metadata), "utf8") > 8_192) {
        throw new Error("Audit metadata exceeds the 8 KiB limit.");
    }

    await transaction.insert(auditEvents).values({
        organizationId: event.organizationId,
        actorType: event.actorType ?? "user",
        actorUserId: event.actorUserId,
        action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        traceId,
        metadata,
    });
}

@Injectable()
export class AuditService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    async list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: AuditEventQuery,
    ): Promise<AuditEventListResponse> {
        const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;

        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["audit.read"],
            async (transaction) => {
                const cursorCondition = cursor
                    ? or(
                          lt(auditEvents.occurredAt, new Date(cursor.occurredAt)),
                          and(
                              eq(auditEvents.occurredAt, new Date(cursor.occurredAt)),
                              lt(auditEvents.id, cursor.id),
                          ),
                      )
                    : undefined;
                const rows = await transaction
                    .select()
                    .from(auditEvents)
                    .where(cursorCondition)
                    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
                    .limit(query.limit + 1);
                const hasNext = rows.length > query.limit;
                const page = rows.slice(0, query.limit);
                const last = page.at(-1);

                return auditEventListResponseSchema.parse({
                    data: page.map((event) => ({
                        id: event.id,
                        organizationId: event.organizationId,
                        actor: { type: event.actorType, userId: event.actorUserId },
                        action: event.action,
                        resourceType: event.resourceType,
                        resourceId: event.resourceId,
                        traceId: event.traceId,
                        metadata: event.metadata,
                        occurredAt: event.occurredAt.toISOString(),
                    })),
                    nextCursor:
                        hasNext && last
                            ? this.encodeCursor({
                                  occurredAt: last.occurredAt.toISOString(),
                                  id: last.id,
                              })
                            : null,
                });
            },
        );
    }

    private encodeCursor(cursor: z.infer<typeof cursorSchema>): string {
        return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
    }

    private decodeCursor(value: string): z.infer<typeof cursorSchema> {
        try {
            const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
            return cursorSchema.parse(decoded);
        } catch {
            throw new ContractException("INVALID_AUDIT_CURSOR", 400);
        }
    }
}
