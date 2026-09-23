import { z } from "zod";

const id = z.uuid();
const name = z.string().trim().min(1).max(200);
const version = z.number().int().positive();
const expectedVersion = z.strictObject({ expectedVersion: version });

export const partyKindSchema = z.enum(["organization", "individual"]);
export const partyRoleSchema = z.enum(["customer", "provider"]);
export const partyStatusSchema = z.enum(["active", "archived"]);
export const contactChannelTypeSchema = z.enum(["email", "phone", "other"]);

export const partyIdentifierSchema = z.strictObject({
    id,
    type: z.string().min(1).max(64),
    originalValue: z.string().min(1).max(255),
    normalizedValue: z.string().min(1).max(255),
});

export const partyContactChannelSchema = z.strictObject({
    id,
    type: contactChannelTypeSchema,
    label: z.string().min(1).max(80).nullable(),
    value: z.string().min(1).max(320),
});

export const partyContactSchema = z.strictObject({
    id,
    displayName: name,
    jobTitle: z.string().min(1).max(120).nullable(),
    isPrimary: z.boolean(),
    channels: z.array(partyContactChannelSchema),
});

export const partyAddressSchema = z.strictObject({
    id,
    label: z.string().min(1).max(80),
    line1: name,
    line2: name.nullable(),
    locality: z.string().min(1).max(120),
    region: z.string().min(1).max(120).nullable(),
    postalCode: z.string().min(1).max(32).nullable(),
    countryCode: z.string().regex(/^[A-Z]{2}$/u),
});

export const partySummarySchema = z.strictObject({
    id,
    kind: partyKindSchema,
    displayName: name,
    legalName: name.nullable(),
    roles: z.array(partyRoleSchema),
    status: partyStatusSchema,
    version,
    createdAt: z.iso.datetime({ precision: 3 }),
    updatedAt: z.iso.datetime({ precision: 3 }),
    archivedAt: z.iso.datetime({ precision: 3 }).nullable(),
});

export const partyDetailSchema = partySummarySchema.extend({
    identifiers: z.array(partyIdentifierSchema),
    contacts: z.array(partyContactSchema),
    addresses: z.array(partyAddressSchema),
});

export const partyListQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    status: partyStatusSchema.optional(),
    role: partyRoleSchema.optional(),
    name: z.string().trim().min(1).max(100).optional(),
});

export const partyListResponseSchema = z.strictObject({
    data: z.array(partySummarySchema),
    nextCursor: z.string().nullable(),
});

export const createPartyRequestSchema = z.strictObject({
    kind: partyKindSchema,
    displayName: name,
    legalName: name.nullable().optional(),
    roles: z
        .array(partyRoleSchema)
        .min(1)
        .max(2)
        .refine((roles) => new Set(roles).size === roles.length),
});

export const updatePartyRequestSchema = expectedVersion
    .extend({
        displayName: name.optional(),
        legalName: name.nullable().optional(),
    })
    .refine((input) => input.displayName !== undefined || input.legalName !== undefined);

export const setPartyRolesRequestSchema = expectedVersion.extend({
    roles: z
        .array(partyRoleSchema)
        .min(1)
        .max(2)
        .refine((roles) => new Set(roles).size === roles.length),
});

export const partyVersionRequestSchema = expectedVersion;

export const addPartyIdentifierRequestSchema = expectedVersion.extend({
    type: z.string().trim().min(1).max(64),
    originalValue: z.string().trim().min(1).max(255),
});

export const createPartyContactRequestSchema = expectedVersion.extend({
    displayName: name,
    jobTitle: z.string().trim().min(1).max(120).nullable().optional(),
    isPrimary: z.boolean().default(false),
});

export const updatePartyContactRequestSchema = expectedVersion
    .extend({
        displayName: name.optional(),
        jobTitle: z.string().trim().min(1).max(120).nullable().optional(),
        isPrimary: z.boolean().optional(),
    })
    .refine(
        (input) =>
            input.displayName !== undefined ||
            input.jobTitle !== undefined ||
            input.isPrimary !== undefined,
    );

export const createPartyContactChannelRequestSchema = expectedVersion.extend({
    type: contactChannelTypeSchema,
    label: z.string().trim().min(1).max(80).nullable().optional(),
    value: z.string().trim().min(1).max(320),
});

export const updatePartyContactChannelRequestSchema = expectedVersion
    .extend({
        type: contactChannelTypeSchema.optional(),
        label: z.string().trim().min(1).max(80).nullable().optional(),
        value: z.string().trim().min(1).max(320).optional(),
    })
    .refine(
        (input) =>
            input.type !== undefined || input.label !== undefined || input.value !== undefined,
    );

export const createPartyAddressRequestSchema = expectedVersion.extend({
    label: z.string().trim().min(1).max(80),
    line1: name,
    line2: name.nullable().optional(),
    locality: z.string().trim().min(1).max(120),
    region: z.string().trim().min(1).max(120).nullable().optional(),
    postalCode: z.string().trim().min(1).max(32).nullable().optional(),
    countryCode: z
        .string()
        .trim()
        .regex(/^[A-Za-z]{2}$/u),
});

export const updatePartyAddressRequestSchema = createPartyAddressRequestSchema
    .partial()
    .required({ expectedVersion: true });

export type PartySummary = z.infer<typeof partySummarySchema>;
export type PartyDetail = z.infer<typeof partyDetailSchema>;
export type PartyListQuery = z.infer<typeof partyListQuerySchema>;
export type PartyListResponse = z.infer<typeof partyListResponseSchema>;
export type CreatePartyRequest = z.infer<typeof createPartyRequestSchema>;
export type UpdatePartyRequest = z.infer<typeof updatePartyRequestSchema>;
export type SetPartyRolesRequest = z.infer<typeof setPartyRolesRequestSchema>;
export type PartyVersionRequest = z.infer<typeof partyVersionRequestSchema>;
export type AddPartyIdentifierRequest = z.infer<typeof addPartyIdentifierRequestSchema>;
export type CreatePartyContactRequest = z.infer<typeof createPartyContactRequestSchema>;
export type UpdatePartyContactRequest = z.infer<typeof updatePartyContactRequestSchema>;
export type CreatePartyContactChannelRequest = z.infer<
    typeof createPartyContactChannelRequestSchema
>;
export type UpdatePartyContactChannelRequest = z.infer<
    typeof updatePartyContactChannelRequestSchema
>;
export type CreatePartyAddressRequest = z.infer<typeof createPartyAddressRequestSchema>;
export type UpdatePartyAddressRequest = z.infer<typeof updatePartyAddressRequestSchema>;
