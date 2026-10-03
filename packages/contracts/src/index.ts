import {
    addAssetIdentifierRequestSchema,
    assetDetailSchema,
    assetIdentifierSchema,
    assetListResponseSchema,
    assetSummarySchema,
    assetVersionRequestSchema,
    changeAssetIdentifierRequestSchema,
    createAssetRequestSchema,
    setAssetLifecycleRequestSchema,
    updateAssetRequestSchema,
} from "./assets/assets";
import {
    assetCurrentRelationshipsSchema,
    assetHistoryEntrySchema,
    assetHistoryResponseSchema,
    assetRelationshipHistoryResponseSchema,
    assetRelationshipSchema,
    correctAssetRelationshipRequestSchema,
    endAssetRelationshipRequestSchema,
    startAssetRelationshipRequestSchema,
} from "./assets/history";
import { auditEventListResponseSchema, auditEventSchema } from "./audit/audit";
import { requestFileUploadSchema, storedObjectSchema } from "./files/stored-objects";
import { authenticatedUserResponseSchema } from "./auth/session";
import {
    organizationInvitationListResponseSchema,
    organizationInvitationSchema,
    createdInvitationResponseSchema,
} from "./organizations/invitations";
import {
    organizationMemberListResponseSchema,
    organizationMemberSchema,
} from "./organizations/memberships";
import {
    activeOrganizationResponseSchema,
    organizationListResponseSchema,
    organizationSiteListResponseSchema,
    organizationSiteSchema,
    organizationSummarySchema,
} from "./organizations/organizations";
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
} from "./parties/parties";
import { livenessResponseSchema, readinessResponseSchema } from "./platform/health";
import {
    commitRegistryImportRequestSchema,
    previewRegistryImportRequestSchema,
    registryImportCandidateSchema,
    registryImportIssueSchema,
    registryImportRowSchema,
    registryImportSessionResponseSchema,
} from "./registry-imports/registry-imports";
import { apiErrorSchema, pageInfoSchema, validationIssueSchema } from "./shared/api";
import {
    createServiceRequestSchema,
    serviceRequestDetailSchema,
    serviceRequestListResponseSchema,
    serviceRequestScopeItemSchema,
    serviceRequestSummarySchema,
    transitionServiceRequestSchema,
    updateServiceRequestSchema,
} from "./service-management/requests/requests";
import {
    acceptQuoteRevisionSchema,
    copyQuoteRevisionSchema,
    createQuoteSchema,
    editQuoteDraftSchema,
    issueQuoteRevisionSchema,
    quoteAcceptanceSchema,
    quoteDetailSchema,
    quoteHistoryEntrySchema,
    quoteLineSchema,
    quoteListResponseSchema,
    quoteRevisionSchema,
    quoteSummarySchema,
    quoteVersionSchema,
    rejectQuoteRevisionSchema,
} from "./service-management/quotations/quotations";
import {
    correctReceiptSchema,
    createReceiptSchema,
    receiptCorrectionSchema,
    receiptDetailSchema,
    receiptListResponseSchema,
    receiptSchema,
} from "./service-management/receipts/receipts";
import {
    operationalQueueEntrySchema,
    operationalQueueResponseSchema,
    requestTimelineEventSchema,
    requestTimelineResponseSchema,
} from "./service-management/queries/operational";
import {
    createWorkOrderSchema,
    restructureWorkItemSchema,
    updateWorkItemSchema,
    updateWorkOrderSchema,
    workItemHistoryEntrySchema,
    workItemSchema,
    workItemTransitionSchema,
    workOrderDetailSchema,
    workOrderHistoryEntrySchema,
    workOrderListResponseSchema,
    workOrderReadinessResponseSchema,
    workOrderSummarySchema,
    workOrderTransitionSchema,
} from "./service-management/work-orders/work-orders";
import {
    dateOnlySchema,
    decimalSchema,
    identifierSchema,
    instantSchema,
} from "./shared/primitives";
import {
    abandonTechnicalExecutionSchema,
    createSuccessorRevisionSchema,
    discardExecutionDraftSchema,
    editExecutionDraftSchema,
    startTechnicalExecutionSchema,
    submitExecutionRevisionSchema,
} from "./technical-operations/executions/executions";
import {
    createTechnicalResultSchema,
    updateTechnicalResultSchema,
    removeTechnicalResultSchema,
    createTechnicalResultGroupSchema,
    updateTechnicalResultGroupSchema,
    removeTechnicalResultGroupSchema,
    reorderTechnicalResultsSchema,
    reorderTechnicalResultGroupsSchema,
} from "./technical-operations/results/results";
import {
    createTechnicalEvidenceSchema,
    updateTechnicalEvidenceSchema,
    removeTechnicalEvidenceSchema,
} from "./technical-operations/evidence/evidence";
import { technicalDecisionPolicySchema } from "./technical-operations/reviews/decision-policy";
import {
    decideTechnicalReviewSchema,
    decideTechnicalApprovalSchema,
} from "./technical-operations/reviews/decisions";

export * from "./assets/assets";
export * from "./assets/history";
export * from "./audit/audit";
export * from "./files/stored-objects";
export * from "./auth/session";
export * from "./authorization/permissions";
export * from "./organizations/invitations";
export * from "./organizations/memberships";
export * from "./organizations/organizations";
export * from "./parties/parties";
export * from "./platform/health";
export * from "./registry-imports/registry-imports";
export * from "./shared/api";
export * from "./shared/primitives";
export * from "./service-management/requests/requests";
export * from "./service-management/quotations/quotations";
export * from "./service-management/queries/operational";
export * from "./service-management/receipts/receipts";
export * from "./service-management/work-orders/work-orders";
export * from "./technical-operations/executions/executions";
export * from "./technical-operations/results/results";
export * from "./technical-operations/evidence/evidence";
export * from "./technical-operations/reviews/decision-policy";
export * from "./technical-operations/reviews/decisions";

// This is the only package-level composition point. Contract definitions stay
// in their owning domain modules; OpenAPI consumes this stable public registry.
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
    RequestFileUpload: requestFileUploadSchema,
    StoredObject: storedObjectSchema,
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
    AssetIdentifier: assetIdentifierSchema,
    AssetSummary: assetSummarySchema,
    AssetDetail: assetDetailSchema,
    AssetListResponse: assetListResponseSchema,
    CreateAssetRequest: createAssetRequestSchema,
    UpdateAssetRequest: updateAssetRequestSchema,
    AssetVersionRequest: assetVersionRequestSchema,
    SetAssetLifecycleRequest: setAssetLifecycleRequestSchema,
    AddAssetIdentifierRequest: addAssetIdentifierRequestSchema,
    ChangeAssetIdentifierRequest: changeAssetIdentifierRequestSchema,
    AssetRelationship: assetRelationshipSchema,
    AssetCurrentRelationships: assetCurrentRelationshipsSchema,
    AssetRelationshipHistoryResponse: assetRelationshipHistoryResponseSchema,
    AssetHistoryEntry: assetHistoryEntrySchema,
    AssetHistoryResponse: assetHistoryResponseSchema,
    StartAssetRelationshipRequest: startAssetRelationshipRequestSchema,
    EndAssetRelationshipRequest: endAssetRelationshipRequestSchema,
    CorrectAssetRelationshipRequest: correctAssetRelationshipRequestSchema,
    PreviewRegistryImportRequest: previewRegistryImportRequestSchema,
    CommitRegistryImportRequest: commitRegistryImportRequestSchema,
    RegistryImportIssue: registryImportIssueSchema,
    RegistryImportCandidate: registryImportCandidateSchema,
    RegistryImportRow: registryImportRowSchema,
    RegistryImportSessionResponse: registryImportSessionResponseSchema,
    ServiceRequestScopeItem: serviceRequestScopeItemSchema,
    ServiceRequestSummary: serviceRequestSummarySchema,
    ServiceRequestDetail: serviceRequestDetailSchema,
    ServiceRequestListResponse: serviceRequestListResponseSchema,
    OperationalQueueEntry: operationalQueueEntrySchema,
    OperationalQueueResponse: operationalQueueResponseSchema,
    RequestTimelineEvent: requestTimelineEventSchema,
    RequestTimelineResponse: requestTimelineResponseSchema,
    CreateServiceRequest: createServiceRequestSchema,
    UpdateServiceRequest: updateServiceRequestSchema,
    TransitionServiceRequest: transitionServiceRequestSchema,
    QuoteLine: quoteLineSchema,
    QuoteRevision: quoteRevisionSchema,
    QuoteAcceptance: quoteAcceptanceSchema,
    QuoteHistoryEntry: quoteHistoryEntrySchema,
    QuoteSummary: quoteSummarySchema,
    QuoteDetail: quoteDetailSchema,
    QuoteListResponse: quoteListResponseSchema,
    CreateQuote: createQuoteSchema,
    EditQuoteDraft: editQuoteDraftSchema,
    CopyQuoteRevision: copyQuoteRevisionSchema,
    QuoteVersion: quoteVersionSchema,
    IssueQuoteRevision: issueQuoteRevisionSchema,
    AcceptQuoteRevision: acceptQuoteRevisionSchema,
    RejectQuoteRevision: rejectQuoteRevisionSchema,
    WorkItem: workItemSchema,
    WorkItemHistoryEntry: workItemHistoryEntrySchema,
    WorkOrderSummary: workOrderSummarySchema,
    WorkOrderDetail: workOrderDetailSchema,
    WorkOrderHistoryEntry: workOrderHistoryEntrySchema,
    WorkOrderListResponse: workOrderListResponseSchema,
    WorkOrderReadinessResponse: workOrderReadinessResponseSchema,
    CreateWorkOrder: createWorkOrderSchema,
    UpdateWorkOrder: updateWorkOrderSchema,
    WorkOrderTransition: workOrderTransitionSchema,
    UpdateWorkItem: updateWorkItemSchema,
    WorkItemTransition: workItemTransitionSchema,
    RestructureWorkItem: restructureWorkItemSchema,
    Receipt: receiptSchema,
    ReceiptCorrection: receiptCorrectionSchema,
    ReceiptDetail: receiptDetailSchema,
    ReceiptListResponse: receiptListResponseSchema,
    CreateReceipt: createReceiptSchema,
    CorrectReceipt: correctReceiptSchema,
    StartTechnicalExecution: startTechnicalExecutionSchema,
    EditExecutionDraft: editExecutionDraftSchema,
    SubmitExecutionRevision: submitExecutionRevisionSchema,
    CreateSuccessorRevision: createSuccessorRevisionSchema,
    DiscardExecutionDraft: discardExecutionDraftSchema,
    AbandonTechnicalExecution: abandonTechnicalExecutionSchema,
    CreateTechnicalResult: createTechnicalResultSchema,
    UpdateTechnicalResult: updateTechnicalResultSchema,
    RemoveTechnicalResult: removeTechnicalResultSchema,
    CreateTechnicalResultGroup: createTechnicalResultGroupSchema,
    UpdateTechnicalResultGroup: updateTechnicalResultGroupSchema,
    RemoveTechnicalResultGroup: removeTechnicalResultGroupSchema,
    ReorderTechnicalResults: reorderTechnicalResultsSchema,
    ReorderTechnicalResultGroups: reorderTechnicalResultGroupsSchema,
    CreateTechnicalEvidence: createTechnicalEvidenceSchema,
    UpdateTechnicalEvidence: updateTechnicalEvidenceSchema,
    RemoveTechnicalEvidence: removeTechnicalEvidenceSchema,
    TechnicalDecisionPolicy: technicalDecisionPolicySchema,
    DecideTechnicalReview: decideTechnicalReviewSchema,
    DecideTechnicalApproval: decideTechnicalApprovalSchema,
};
