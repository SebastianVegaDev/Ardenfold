import { z } from "zod";

import { identifierSchema, instantSchema } from "../../shared/primitives";

const id = identifierSchema;
const version = z.number().int().positive();
const note = z.string().trim().min(1).max(10_000);
const label = z.string().trim().min(1).max(120);
const decimalInput = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/);
const signedAmount = z.string().regex(/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,4})?$/);

export const supportedQuoteCurrencies = { PEN: 2, USD: 2, EUR: 2, JPY: 0, KWD: 3 } as const;
export const quoteCurrencySchema = z.enum(["PEN", "USD", "EUR", "JPY", "KWD"]);
export const quoteStatusSchema = z.enum(["open", "accepted", "closed"]);
export const quoteRevisionStatusSchema = z.enum([
    "draft",
    "offered",
    "discarded",
    "accepted",
    "rejected",
    "expired",
    "superseded",
    "withdrawn",
]);
export const quoteAdjustmentSchema = z.strictObject({
    label,
    amount: signedAmount,
});
export const quoteLineInputSchema = z.strictObject({
    description: note,
    quantity: decimalInput.refine((value) => !/^0(?:\.0+)?$/.test(value)),
    unit: z.string().trim().min(1).max(40),
    unitPrice: decimalInput,
    partyId: id.nullable().optional(),
    assetId: id.nullable().optional(),
    adjustments: z.array(quoteAdjustmentSchema).max(20).default([]),
});
export const quoteDraftContentSchema = z.strictObject({
    currencyCode: quoteCurrencySchema,
    paymentTerms: note.nullable(),
    deliveryTerms: note.nullable(),
    serviceLocation: note.nullable(),
    intakeExpectations: note.nullable(),
    exclusions: note.nullable(),
    validUntil: instantSchema.nullable(),
    lines: z.array(quoteLineInputSchema).max(100),
    adjustments: z.array(quoteAdjustmentSchema).max(20),
});
export const createQuoteSchema = z.strictObject({
    requestId: id,
    reference: z.string().trim().min(1).max(80),
    draft: quoteDraftContentSchema,
});
export const editQuoteDraftSchema = z.strictObject({
    expectedVersion: version,
    reason: note,
    draft: quoteDraftContentSchema,
});
export const copyQuoteRevisionSchema = z.strictObject({
    expectedVersion: version,
    sourceRevisionId: id,
});
export const quoteVersionSchema = z.strictObject({ expectedVersion: version, reason: note });
export const issueQuoteRevisionSchema = z.strictObject({
    expectedVersion: version,
    channel: label,
});
export const acceptQuoteRevisionSchema = z.strictObject({
    expectedVersion: version,
    idempotencyKey: id,
    revisionId: id,
    agreementAt: instantSchema.nullable(),
    suppliedByName: label.nullable(),
    suppliedByContactId: id.nullable(),
    channel: label,
    externalReference: label.nullable(),
});
export const rejectQuoteRevisionSchema = z.strictObject({
    expectedVersion: version,
    revisionId: id,
    reason: note,
    channel: label,
    suppliedByName: label.nullable(),
});
export const quoteLineSchema = quoteLineInputSchema.extend({
    id,
    position: version,
    roundedBaseAmount: signedAmount.nullable(),
    totalAmount: signedAmount.nullable(),
    partySnapshot: z.record(z.string(), z.unknown()).nullable(),
    assetSnapshot: z.record(z.string(), z.unknown()).nullable(),
});
export const quoteRevisionSchema = quoteDraftContentSchema.omit({ lines: true }).extend({
    id,
    quoteId: id,
    revisionNumber: version,
    sourceRevisionId: id.nullable(),
    status: quoteRevisionStatusSchema,
    version,
    sourceRequestVersion: version,
    currencyScale: z.number().int().min(0).max(4),
    calculationPolicyVersion: z.literal(1),
    lines: z.array(quoteLineSchema),
    subtotal: signedAmount.nullable(),
    total: signedAmount.nullable(),
    customerSnapshot: z.record(z.string(), z.unknown()).nullable(),
    issuedAt: instantSchema.nullable(),
    issueChannel: label.nullable(),
    supersededByRevisionId: id.nullable(),
    createdAt: instantSchema,
});
export const quoteAcceptanceSchema = z.strictObject({
    id,
    quoteId: id,
    revisionId: id,
    agreementAt: instantSchema.nullable(),
    recordedAt: instantSchema,
    recordedByUserId: id,
    suppliedByName: label.nullable(),
    suppliedByContactId: id.nullable(),
    channel: label,
    externalReference: label.nullable(),
    withdrawnAt: instantSchema.nullable(),
    withdrawalReason: note.nullable(),
});
export const quoteHistoryEntrySchema = z.strictObject({
    id,
    quoteId: id,
    version,
    kind: z.string(),
    revisionId: id.nullable(),
    acceptanceId: id.nullable(),
    reason: note.nullable(),
    context: z.record(z.string(), z.unknown()).nullable(),
    recordedAt: instantSchema,
    recordedByUserId: id,
});
export const quoteSummarySchema = z.strictObject({
    id,
    requestId: id,
    customerPartyId: id,
    reference: z.string(),
    status: quoteStatusSchema,
    version,
    activeAcceptanceId: id.nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
});
export const quoteDetailSchema = quoteSummarySchema.extend({
    revisions: z.array(quoteRevisionSchema),
    acceptances: z.array(quoteAcceptanceSchema),
    history: z.array(quoteHistoryEntrySchema),
});
export const quoteListQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    status: quoteStatusSchema.optional(),
    requestId: id.optional(),
    customerPartyId: id.optional(),
    siteId: id.optional(),
    assetId: id.optional(),
    q: z.string().trim().min(2).max(100).optional(),
    createdFrom: instantSchema.optional(),
    createdTo: instantSchema.optional(),
    sort: z.enum(["newest", "oldest"]).optional(),
});
export const quoteListResponseSchema = z.strictObject({
    data: z.array(quoteSummarySchema),
    nextCursor: z.string().nullable(),
});

export type CreateQuote = z.infer<typeof createQuoteSchema>;
export type EditQuoteDraft = z.infer<typeof editQuoteDraftSchema>;
export type CopyQuoteRevision = z.infer<typeof copyQuoteRevisionSchema>;
export type QuoteVersion = z.infer<typeof quoteVersionSchema>;
export type IssueQuoteRevision = z.infer<typeof issueQuoteRevisionSchema>;
export type AcceptQuoteRevision = z.infer<typeof acceptQuoteRevisionSchema>;
export type RejectQuoteRevision = z.infer<typeof rejectQuoteRevisionSchema>;
export type QuoteDetail = z.infer<typeof quoteDetailSchema>;
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;
export type QuoteListResponse = z.infer<typeof quoteListResponseSchema>;
