import { z } from "zod";

import { identifierSchema, instantSchema } from "../shared/primitives";

export const auditActionSchema = z.enum([
    "organization.created",
    "organization.updated",
    "site.created",
    "invitation.created",
    "invitation.cancelled",
    "invitation.accepted",
    "membership.role_changed",
    "membership.suspended",
    "membership.removed",
    "party.created",
    "party.updated",
    "party.roles_changed",
    "party.details_changed",
    "party.archived",
    "party.restored",
    "asset.created",
    "asset.updated",
    "asset.lifecycle_changed",
    "asset.identifier_added",
    "asset.identifier_changed",
    "asset.identifier_retired",
    "asset.archived",
    "asset.restored",
    "asset.relationship_started",
    "asset.relationship_ended",
    "asset.relationship_corrected",
    "registry.import_completed",
]);
export const auditMetadataSchema = z.record(
    z.string().min(1).max(80),
    z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]),
);
export const auditEventSchema = z.strictObject({
    id: identifierSchema,
    organizationId: identifierSchema,
    actor: z.strictObject({
        type: z.enum(["user", "system", "administrator"]),
        userId: identifierSchema.nullable(),
    }),
    action: auditActionSchema,
    resourceType: z.string().min(1).max(80),
    resourceId: z.string().min(1),
    traceId: identifierSchema,
    metadata: auditMetadataSchema,
    occurredAt: instantSchema,
});
export const auditEventQuerySchema = z.strictObject({
    limit: z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number)
        .pipe(z.number().int().max(100))
        .default(50),
    cursor: z.string().min(1).max(500).optional(),
});
export const auditEventListResponseSchema = z.strictObject({
    data: z.array(auditEventSchema),
    nextCursor: z.string().nullable(),
});

export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditMetadata = z.infer<typeof auditMetadataSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditEventQuery = z.infer<typeof auditEventQuerySchema>;
export type AuditEventListResponse = z.infer<typeof auditEventListResponseSchema>;
