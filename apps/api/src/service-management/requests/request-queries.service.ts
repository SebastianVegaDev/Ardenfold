import {
    serviceRequestDetailSchema,
    serviceRequestListResponseSchema,
    serviceRequestSummarySchema,
    type ServiceRequestDetail,
    type ServiceRequestListQuery,
    type ServiceRequestListResponse,
    type ServiceRequestSummary,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    serviceRequestScopeItems,
    serviceRequests,
    type ServiceRequest,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, getTableColumns, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import { ContractException } from "../../http/contracts";

const cursorSchema = z.strictObject({
    createdAt: z.iso.datetime({ precision: 6 }),
    id: z.uuid(),
    status: z.string().nullable(),
    customerPartyId: z.uuid().nullable(),
});

function summary(row: ServiceRequest): ServiceRequestSummary {
    return serviceRequestSummarySchema.parse({
        id: row.id,
        customerPartyId: row.customerPartyId,
        requesterContactId: row.requesterContactId,
        siteId: row.siteId,
        summary: row.summary,
        status: row.status,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        terminalAt: row.terminalAt?.toISOString() ?? null,
    });
}

@Injectable()
export class RequestQueriesService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    get(principal: AuthenticatedPrincipal, organizationId: string, requestId: string) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["service_requests.read"],
            (transaction) => this.getInTransaction(transaction, organizationId, requestId),
        );
    }

    async getInTransaction(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        requestId: string,
    ): Promise<ServiceRequestDetail> {
        const [row] = await transaction
            .select()
            .from(serviceRequests)
            .where(
                and(
                    eq(serviceRequests.organizationId, organizationId),
                    eq(serviceRequests.id, requestId),
                ),
            );
        if (!row) throw new ContractException("SERVICE_REQUEST_NOT_FOUND", 404);
        const items = await transaction
            .select()
            .from(serviceRequestScopeItems)
            .where(
                and(
                    eq(serviceRequestScopeItems.organizationId, organizationId),
                    eq(serviceRequestScopeItems.requestId, requestId),
                ),
            )
            .orderBy(serviceRequestScopeItems.position);
        return serviceRequestDetailSchema.parse({
            ...summary(row),
            requesterName: row.requesterName,
            customerContext: row.customerContext,
            terminalReason: row.terminalReason,
            scopeItems: items.map((item) => ({
                id: item.id,
                position: item.position,
                description: item.description,
                assetId: item.assetId,
                unidentifiedAssetDescription: item.unidentifiedAssetDescription,
            })),
        });
    }

    list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: ServiceRequestListQuery,
    ): Promise<ServiceRequestListResponse> {
        const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
        if (
            cursor &&
            (cursor.status !== (query.status ?? null) ||
                cursor.customerPartyId !== (query.customerPartyId ?? null))
        ) {
            throw new ContractException("INVALID_SERVICE_REQUEST_CURSOR", 400);
        }
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["service_requests.read"],
            async (transaction) => {
                const cursorInstant = cursor ? sql`${cursor.createdAt}::timestamptz` : undefined;
                const cursorCondition = cursorInstant
                    ? or(
                          lt(serviceRequests.createdAt, cursorInstant),
                          and(
                              eq(serviceRequests.createdAt, cursorInstant),
                              lt(serviceRequests.id, cursor!.id),
                          ),
                      )
                    : undefined;
                const rows = await transaction
                    .select({
                        ...getTableColumns(serviceRequests),
                        createdAtExact: sql<string>`to_char(${serviceRequests.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
                    })
                    .from(serviceRequests)
                    .where(
                        and(
                            eq(serviceRequests.organizationId, organizationId),
                            query.status ? eq(serviceRequests.status, query.status) : undefined,
                            query.customerPartyId
                                ? eq(serviceRequests.customerPartyId, query.customerPartyId)
                                : undefined,
                            cursorCondition,
                        ),
                    )
                    .orderBy(desc(serviceRequests.createdAt), desc(serviceRequests.id))
                    .limit(query.limit + 1);
                const page = rows.slice(0, query.limit);
                const last = page.at(-1);
                return serviceRequestListResponseSchema.parse({
                    data: page.map(summary),
                    nextCursor:
                        rows.length > query.limit && last
                            ? this.encodeCursor({
                                  createdAt: last.createdAtExact,
                                  id: last.id,
                                  status: query.status ?? null,
                                  customerPartyId: query.customerPartyId ?? null,
                              })
                            : null,
                });
            },
        );
    }

    private encodeCursor(value: z.infer<typeof cursorSchema>): string {
        return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    }

    private decodeCursor(value: string): z.infer<typeof cursorSchema> {
        try {
            const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
            return cursorSchema.parse(decoded);
        } catch {
            throw new ContractException("INVALID_SERVICE_REQUEST_CURSOR", 400);
        }
    }
}
