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
    workOrderSummarySchema,
    workOrderTransitionSchema,
} from "./service-management/work-orders/work-orders";
import {
    dateOnlySchema,
    decimalSchema,
    identifierSchema,
    instantSchema,
} from "./shared/primitives";

export * from "./assets/assets";
export * from "./assets/history";
export * from "./audit/audit";
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
export * from "./service-management/work-orders/work-orders";

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
    CreateWorkOrder: createWorkOrderSchema,
    UpdateWorkOrder: updateWorkOrderSchema,
    WorkOrderTransition: workOrderTransitionSchema,
    UpdateWorkItem: updateWorkItemSchema,
    WorkItemTransition: workItemTransitionSchema,
    RestructureWorkItem: restructureWorkItemSchema,
};
