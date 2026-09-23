import { z } from "zod";
import {
    addPartyIdentifierRequestSchema,
    createPartyAddressRequestSchema,
    createPartyContactChannelRequestSchema,
    createPartyContactRequestSchema,
    createPartyRequestSchema,
    partyAddressSchema,
    partyContactSchema,
    partyDetailSchema,
    partyIdentifierSchema,
    partyListResponseSchema,
    partySummarySchema,
    partyVersionRequestSchema,
    setPartyRolesRequestSchema,
    updatePartyAddressRequestSchema,
    updatePartyContactChannelRequestSchema,
    updatePartyContactRequestSchema,
    updatePartyRequestSchema,
} from "./parties";

export * from "./parties";

export const identifierSchema = z.uuid();

export const instantSchema = z.iso.datetime({
    precision: 3,
});

export const dateOnlySchema = z.iso.date();

export const decimalSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const validationIssueSchema = z.strictObject({
    source: z.enum(["body", "query", "params"]),
    path: z.string(),
    code: z.enum([
        "INVALID_TYPE",
        "INVALID_FORMAT",
        "OUT_OF_RANGE",
        "UNKNOWN_FIELD",
        "INVALID_VALUE",
    ]),
});

export const apiErrorSchema = z.strictObject({
    error: z.strictObject({
        code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
        status: z.number().int().min(400).max(599),
        traceId: z.uuid(),
        issues: z.array(validationIssueSchema),
        metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    }),
});

export const paginationQuerySchema = z.strictObject({
    page: z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number)
        .pipe(z.number().int().max(1_000_000))
        .default(1),

    limit: z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number)
        .pipe(z.number().int().max(100))
        .default(25),
});

export const pageInfoSchema = z.strictObject({
    page: z.number().int().min(1).max(1_000_000),
    limit: z.number().int().min(1).max(100),
    hasNextPage: z.boolean(),
});

export function pageSchema<T extends z.ZodType>(item: T) {
    return z.strictObject({
        data: z.array(item),
        pageInfo: pageInfoSchema,
    });
}

export const livenessResponseSchema = z.strictObject({
    status: z.literal("ok"),
    service: z.literal("api"),
});

export const readinessResponseSchema = livenessResponseSchema.extend({
    database: z.literal("up"),
});

export const authenticatedUserResponseSchema = z.strictObject({
    user: z.strictObject({
        id: identifierSchema,
        email: z.email(),
        displayName: z.string().min(1).nullable(),
    }),
    session: z.strictObject({
        id: z.string().min(1),
    }),
});

export const organizationRoleSchema = z.enum(["owner", "administrator", "member", "viewer"]);

export const permissionCodeSchema = z.enum([
    "organization.read",
    "organization.update",
    "sites.read",
    "sites.manage",
    "members.read",
    "members.invite",
    "members.manage",
    "audit.read",
    "parties.read",
    "parties.write",
    "parties.archive",
    "assets.read",
    "assets.write",
    "assets.manage_relationships",
    "assets.archive",
    "registry.import",
]);

export const organizationSummarySchema = z.strictObject({
    id: identifierSchema,
    name: z.string().min(1),
    defaultLocale: z.string().min(1),
    defaultTimeZone: z.string().min(1),
    role: organizationRoleSchema,
});

export const organizationListResponseSchema = z.strictObject({
    data: z.array(organizationSummarySchema),
});

export const activeOrganizationResponseSchema = organizationSummarySchema.extend({
    permissions: z.array(permissionCodeSchema),
});

const organizationNameSchema = z.string().trim().min(1).max(200);
const optionalCodeSchema = z.string().trim().min(1).max(64).nullable();

export const createOrganizationRequestSchema = z.strictObject({
    name: organizationNameSchema,
    defaultLocale: z.enum(["en", "es"]),
    defaultTimeZone: z.string().trim().min(1).max(255),
});

export const updateOrganizationRequestSchema = createOrganizationRequestSchema
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
        message: "At least one field is required.",
    });

export const organizationSiteSchema = z.strictObject({
    id: identifierSchema,
    organizationId: identifierSchema,
    name: organizationNameSchema,
    code: optionalCodeSchema,
    timeZone: z.string().min(1).max(255).nullable(),
    isActive: z.boolean(),
});

export const createOrganizationSiteRequestSchema = z.strictObject({
    name: organizationNameSchema,
    code: optionalCodeSchema.optional(),
    timeZone: z.string().trim().min(1).max(255).nullable().optional(),
});

export const organizationSiteListResponseSchema = z.strictObject({
    data: z.array(organizationSiteSchema),
});

export const organizationMemberSchema = z.strictObject({
    membershipId: identifierSchema,
    userId: identifierSchema,
    email: z.email(),
    displayName: z.string().min(1).nullable(),
    role: organizationRoleSchema,
    status: z.enum(["active", "suspended", "removed"]),
});

export const organizationMemberListResponseSchema = z.strictObject({
    data: z.array(organizationMemberSchema),
});

export const createInvitationRequestSchema = z.strictObject({
    email: z.email().transform((value) => value.trim().toLowerCase()),
    role: organizationRoleSchema,
});

export const organizationInvitationSchema = z.strictObject({
    id: identifierSchema,
    email: z.email(),
    role: organizationRoleSchema,
    status: z.enum(["pending", "accepted", "cancelled", "expired"]),
    expiresAt: instantSchema,
});

export const createdInvitationResponseSchema = organizationInvitationSchema.extend({
    acceptanceToken: z.string().min(32),
});

export const organizationInvitationListResponseSchema = z.strictObject({
    data: z.array(organizationInvitationSchema),
});

export const acceptInvitationRequestSchema = z.strictObject({
    token: z.string().min(32).max(512),
});

export const updateMembershipRoleRequestSchema = z.strictObject({
    role: organizationRoleSchema,
});

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

export const contractSchemas = {
    Identifier: identifierSchema,
    Instant: instantSchema,
    DateOnly: dateOnlySchema,
    Decimal: decimalSchema,
    ValidationIssue: validationIssueSchema,
    ApiError: apiErrorSchema,
    PageInfo: pageInfoSchema,
    LivenessResponse: livenessResponseSchema,
    ReadinessResponse: readinessResponseSchema,
    AuthenticatedUserResponse: authenticatedUserResponseSchema,
    OrganizationSummary: organizationSummarySchema,
    OrganizationListResponse: organizationListResponseSchema,
    ActiveOrganizationResponse: activeOrganizationResponseSchema,
    OrganizationSite: organizationSiteSchema,
    OrganizationSiteListResponse: organizationSiteListResponseSchema,
    OrganizationMember: organizationMemberSchema,
    OrganizationMemberListResponse: organizationMemberListResponseSchema,
    OrganizationInvitation: organizationInvitationSchema,
    CreatedInvitationResponse: createdInvitationResponseSchema,
    OrganizationInvitationListResponse: organizationInvitationListResponseSchema,
    AuditEvent: auditEventSchema,
    AuditEventListResponse: auditEventListResponseSchema,
    PartyIdentifier: partyIdentifierSchema,
    PartyContact: partyContactSchema,
    PartyAddress: partyAddressSchema,
    PartySummary: partySummarySchema,
    PartyDetail: partyDetailSchema,
    PartyListResponse: partyListResponseSchema,
    CreatePartyRequest: createPartyRequestSchema,
    UpdatePartyRequest: updatePartyRequestSchema,
    SetPartyRolesRequest: setPartyRolesRequestSchema,
    PartyVersionRequest: partyVersionRequestSchema,
    AddPartyIdentifierRequest: addPartyIdentifierRequestSchema,
    CreatePartyContactRequest: createPartyContactRequestSchema,
    UpdatePartyContactRequest: updatePartyContactRequestSchema,
    CreatePartyContactChannelRequest: createPartyContactChannelRequestSchema,
    UpdatePartyContactChannelRequest: updatePartyContactChannelRequestSchema,
    CreatePartyAddressRequest: createPartyAddressRequestSchema,
    UpdatePartyAddressRequest: updatePartyAddressRequestSchema,
};

export type ApiError = z.infer<typeof apiErrorSchema>;

export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export type AuthenticatedUserResponse = z.infer<typeof authenticatedUserResponseSchema>;
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export type PermissionCode = z.infer<typeof permissionCodeSchema>;
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;
export type OrganizationListResponse = z.infer<typeof organizationListResponseSchema>;
export type ActiveOrganizationResponse = z.infer<typeof activeOrganizationResponseSchema>;
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;
export type OrganizationSite = z.infer<typeof organizationSiteSchema>;
export type CreateOrganizationSiteRequest = z.infer<typeof createOrganizationSiteRequestSchema>;
export type OrganizationSiteListResponse = z.infer<typeof organizationSiteListResponseSchema>;
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;
export type OrganizationMemberListResponse = z.infer<typeof organizationMemberListResponseSchema>;
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;
export type OrganizationInvitation = z.infer<typeof organizationInvitationSchema>;
export type CreatedInvitationResponse = z.infer<typeof createdInvitationResponseSchema>;
export type OrganizationInvitationListResponse = z.infer<
    typeof organizationInvitationListResponseSchema
>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
export type UpdateMembershipRoleRequest = z.infer<typeof updateMembershipRoleRequestSchema>;
export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditMetadata = z.infer<typeof auditMetadataSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditEventQuery = z.infer<typeof auditEventQuerySchema>;
export type AuditEventListResponse = z.infer<typeof auditEventListResponseSchema>;
