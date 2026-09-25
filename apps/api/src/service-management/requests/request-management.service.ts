import type {
    CreateServiceRequest,
    PermissionCode,
    ServiceRequestDetail,
    TransitionServiceRequest,
    UpdateServiceRequest,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    quotes,
    serviceRequestHistoryEntries,
    serviceRequestScopeItems,
    serviceRequests,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { AssetReferenceService } from "../../assets/queries/asset-reference.service";
import { recordAuditEvent } from "../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { SiteManagementService } from "../../auth/organizations/site-management.service";
import { ContractException } from "../../http/contracts";
import { PartyReferenceService } from "../../parties/queries/party-reference.service";
import { RequestQueriesService } from "./request-queries.service";

type ScopeInput = CreateServiceRequest["scopeItems"][number] & { id?: string | undefined };

@Injectable()
export class RequestManagementService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly parties: PartyReferenceService,
        private readonly assets: AssetReferenceService,
        private readonly sites: SiteManagementService,
        private readonly queries: RequestQueriesService,
    ) {}

    create(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: CreateServiceRequest,
    ): Promise<ServiceRequestDetail> {
        const required: PermissionCode[] = ["service_requests.write", "parties.read"];
        if (input.siteId) required.push("sites.read");
        if (input.scopeItems.some((item) => item.assetId)) required.push("assets.read");
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            required,
            async (tx) => {
                await this.parties.requireActiveCustomer(
                    tx,
                    organizationId,
                    input.customerPartyId,
                    input.requesterContactId ?? null,
                );
                if (input.siteId)
                    await this.sites.requireActiveSite(tx, organizationId, input.siteId);
                await this.validateAssets(tx, organizationId, input.scopeItems);
                const [request] = await tx
                    .insert(serviceRequests)
                    .values({
                        organizationId,
                        customerPartyId: input.customerPartyId,
                        requesterContactId: input.requesterContactId ?? null,
                        requesterName: input.requesterName ?? null,
                        siteId: input.siteId ?? null,
                        summary: input.summary,
                        customerContext: input.customerContext ?? null,
                        createdByUserId: principal.user.id,
                        updatedByUserId: principal.user.id,
                    })
                    .returning();
                if (input.scopeItems.length) {
                    await tx.insert(serviceRequestScopeItems).values(
                        input.scopeItems.map((item, index) => ({
                            organizationId,
                            requestId: request!.id,
                            position: index + 1,
                            description: item.description,
                            assetId: item.assetId ?? null,
                            unidentifiedAssetDescription: item.unidentifiedAssetDescription ?? null,
                        })),
                    );
                }
                const detail = await this.queries.getInTransaction(tx, organizationId, request!.id);
                await this.recordChange(tx, principal, organizationId, detail, "created", null);
                return detail;
            },
        );
    }

    update(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        requestId: string,
        input: UpdateServiceRequest,
    ): Promise<ServiceRequestDetail> {
        const required: PermissionCode[] = ["service_requests.write"];
        if (input.customerPartyId || input.requesterContactId) required.push("parties.read");
        if (input.customerPartyId) required.push("quotations.read");
        if (input.siteId) required.push("sites.read");
        if (input.scopeItems?.some((item) => item.assetId)) required.push("assets.read");
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            required,
            async (tx) => {
                await tx
                    .select({ id: serviceRequests.id })
                    .from(serviceRequests)
                    .where(
                        and(
                            eq(serviceRequests.organizationId, organizationId),
                            eq(serviceRequests.id, requestId),
                        ),
                    )
                    .for("update");
                const existing = await this.queries.getInTransaction(tx, organizationId, requestId);
                this.requireEditable(existing, input.expectedVersion);
                if (input.customerPartyId && input.customerPartyId !== existing.customerPartyId) {
                    const [quote] = await tx
                        .select({ id: quotes.id })
                        .from(quotes)
                        .where(
                            and(
                                eq(quotes.organizationId, organizationId),
                                eq(quotes.requestId, requestId),
                            ),
                        )
                        .limit(1);
                    if (quote) throw new ContractException("REQUEST_CUSTOMER_LOCKED_BY_QUOTE", 409);
                }
                const customerPartyId = input.customerPartyId ?? existing.customerPartyId;
                const requesterContactId =
                    input.requesterContactId !== undefined
                        ? input.requesterContactId
                        : input.customerPartyId &&
                            input.customerPartyId !== existing.customerPartyId
                          ? null
                          : existing.requesterContactId;
                if (input.customerPartyId || input.requesterContactId) {
                    await this.parties.requireActiveCustomer(
                        tx,
                        organizationId,
                        customerPartyId,
                        requesterContactId,
                    );
                }
                if (input.siteId)
                    await this.sites.requireActiveSite(tx, organizationId, input.siteId);
                if (input.scopeItems) {
                    this.validateScopeIdentities(existing, input.scopeItems);
                    const oldAssets = new Map(
                        existing.scopeItems.map((item) => [item.id, item.assetId]),
                    );
                    await this.validateAssets(
                        tx,
                        organizationId,
                        input.scopeItems.filter(
                            (item) =>
                                item.assetId &&
                                (!item.id || oldAssets.get(item.id) !== item.assetId),
                        ),
                    );
                }
                const [updated] = await tx
                    .update(serviceRequests)
                    .set({
                        customerPartyId,
                        requesterContactId,
                        requesterName:
                            input.requesterName === undefined
                                ? existing.requesterName
                                : input.requesterName,
                        siteId: input.siteId === undefined ? existing.siteId : input.siteId,
                        summary: input.summary ?? existing.summary,
                        customerContext:
                            input.customerContext === undefined
                                ? existing.customerContext
                                : input.customerContext,
                        version: input.expectedVersion + 1,
                        updatedByUserId: principal.user.id,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(serviceRequests.organizationId, organizationId),
                            eq(serviceRequests.id, requestId),
                            eq(serviceRequests.version, input.expectedVersion),
                            eq(serviceRequests.status, "active"),
                        ),
                    )
                    .returning();
                if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
                if (input.scopeItems) {
                    await tx
                        .delete(serviceRequestScopeItems)
                        .where(
                            and(
                                eq(serviceRequestScopeItems.organizationId, organizationId),
                                eq(serviceRequestScopeItems.requestId, requestId),
                            ),
                        );
                    if (input.scopeItems.length) {
                        await tx.insert(serviceRequestScopeItems).values(
                            input.scopeItems.map((item, index) => ({
                                id: item.id,
                                organizationId,
                                requestId,
                                position: index + 1,
                                description: item.description,
                                assetId: item.assetId ?? null,
                                unidentifiedAssetDescription:
                                    item.unidentifiedAssetDescription ?? null,
                            })),
                        );
                    }
                }
                const detail = await this.queries.getInTransaction(tx, organizationId, requestId);
                await this.recordChange(
                    tx,
                    principal,
                    organizationId,
                    detail,
                    "updated",
                    input.reason,
                );
                return detail;
            },
        );
    }

    transition(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        requestId: string,
        target: "cancelled" | "closed",
        input: TransitionServiceRequest,
    ): Promise<ServiceRequestDetail> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["service_requests.write", "quotations.read"],
            async (tx) => {
                await tx
                    .select({ id: serviceRequests.id })
                    .from(serviceRequests)
                    .where(
                        and(
                            eq(serviceRequests.organizationId, organizationId),
                            eq(serviceRequests.id, requestId),
                        ),
                    )
                    .for("update");
                const existing = await this.queries.getInTransaction(tx, organizationId, requestId);
                this.requireEditable(existing, input.expectedVersion);
                const [openQuote] = await tx
                    .select({ id: quotes.id })
                    .from(quotes)
                    .where(
                        and(
                            eq(quotes.organizationId, organizationId),
                            eq(quotes.requestId, requestId),
                        ),
                    )
                    .limit(1);
                if (openQuote) {
                    const allQuotes = await tx
                        .select({ status: quotes.status })
                        .from(quotes)
                        .where(
                            and(
                                eq(quotes.organizationId, organizationId),
                                eq(quotes.requestId, requestId),
                            ),
                        );
                    if (allQuotes.some((quote) => quote.status !== "closed"))
                        throw new ContractException("REQUEST_HAS_ACTIVE_QUOTES", 409);
                }
                const [updated] = await tx
                    .update(serviceRequests)
                    .set({
                        status: target,
                        terminalAt: new Date(),
                        terminalReason: input.reason,
                        version: input.expectedVersion + 1,
                        updatedByUserId: principal.user.id,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(serviceRequests.organizationId, organizationId),
                            eq(serviceRequests.id, requestId),
                            eq(serviceRequests.version, input.expectedVersion),
                            eq(serviceRequests.status, "active"),
                        ),
                    )
                    .returning();
                if (!updated) throw new ContractException("VERSION_CONFLICT", 409);
                const detail = await this.queries.getInTransaction(tx, organizationId, requestId);
                await this.recordChange(
                    tx,
                    principal,
                    organizationId,
                    detail,
                    target,
                    input.reason,
                );
                return detail;
            },
        );
    }

    private requireEditable(request: ServiceRequestDetail, expectedVersion: number): void {
        if (request.version !== expectedVersion)
            throw new ContractException("VERSION_CONFLICT", 409);
        if (request.status !== "active")
            throw new ContractException("SERVICE_REQUEST_TERMINAL", 409);
    }

    private validateScopeIdentities(existing: ServiceRequestDetail, items: ScopeInput[]): void {
        const existingIds = new Set(existing.scopeItems.map((item) => item.id));
        const seen = new Set<string>();
        for (const item of items) {
            if (!item.id) continue;
            if (!existingIds.has(item.id))
                throw new ContractException("REQUEST_SCOPE_ITEM_NOT_FOUND", 404);
            if (seen.has(item.id)) throw new ContractException("DUPLICATE_REQUEST_SCOPE_ITEM", 400);
            seen.add(item.id);
        }
    }

    private async validateAssets(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        items: ScopeInput[],
    ): Promise<void> {
        for (const assetId of new Set(
            items.map((item) => item.assetId).filter((id): id is string => !!id),
        )) {
            await this.assets.requireActiveAsset(transaction, organizationId, assetId);
        }
    }

    private async recordChange(
        transaction: ArdenfoldTransaction,
        principal: AuthenticatedPrincipal,
        organizationId: string,
        detail: ServiceRequestDetail,
        kind: "created" | "updated" | "cancelled" | "closed",
        reason: string | null,
    ): Promise<void> {
        await transaction.insert(serviceRequestHistoryEntries).values({
            organizationId,
            requestId: detail.id,
            version: detail.version,
            kind,
            snapshot: detail,
            reason,
            recordedByUserId: principal.user.id,
        });
        await recordAuditEvent(transaction, {
            organizationId,
            actorUserId: principal.user.id,
            action: `service_request.${kind}`,
            resourceType: "service_request",
            resourceId: detail.id,
            metadata: { version: detail.version },
        });
    }
}
