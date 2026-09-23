import {
    organizationSiteListResponseSchema,
    organizationSiteSchema,
    type CreateOrganizationSiteRequest,
    type OrganizationSite,
    type OrganizationSiteListResponse,
} from "@ardenfold/contracts";
import {
    organizationSites,
    type OrganizationSite as OrganizationSiteRow,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { recordAuditEvent } from "../../audit/audit.service";
import { ContractException } from "../../http/contracts";
import type { AuthenticatedPrincipal } from "../auth.types";
import { OrganizationAuthorizationService } from "../organization-authorization.service";

function ensureTimeZone(timeZone: string): void {
    try {
        new Intl.DateTimeFormat("en", { timeZone }).format();
    } catch {
        throw new ContractException("INVALID_TIME_ZONE", 400);
    }
}

function siteSummary(site: OrganizationSiteRow): OrganizationSite {
    return organizationSiteSchema.parse({
        id: site.id,
        organizationId: site.organizationId,
        name: site.name,
        code: site.code,
        timeZone: site.timeZone,
        isActive: site.isActive,
    });
}

@Injectable()
export class SiteManagementService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    async createSite(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: CreateOrganizationSiteRequest,
    ): Promise<OrganizationSite> {
        if (input.timeZone) {
            ensureTimeZone(input.timeZone);
        }

        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["sites.manage"],
            async (transaction) => {
                const [site] = await transaction
                    .insert(organizationSites)
                    .values({
                        organizationId,
                        name: input.name,
                        code: input.code?.toUpperCase() ?? null,
                        timeZone: input.timeZone ?? null,
                    })
                    .returning();

                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "site.created",
                    resourceType: "site",
                    resourceId: site!.id,
                    metadata: { code: site!.code },
                });

                return siteSummary(site!);
            },
        );
    }

    async listSites(
        principal: AuthenticatedPrincipal,
        organizationId: string,
    ): Promise<OrganizationSiteListResponse> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["sites.read"],
            async (transaction) => {
                const sites = await transaction
                    .select()
                    .from(organizationSites)
                    .orderBy(sql`lower(${organizationSites.name})`);

                return organizationSiteListResponseSchema.parse({ data: sites.map(siteSummary) });
            },
        );
    }
}
