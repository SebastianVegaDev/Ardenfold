import { randomUUID } from "node:crypto";

import {
    organizationSummarySchema,
    type CreateOrganizationRequest,
    type OrganizationSummary,
    type UpdateOrganizationRequest,
} from "@ardenfold/contracts";
import {
    organizationMemberships,
    organizations,
    systemOrganizationRoleIds,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { recordAuditEvent } from "../../audit/audit.service";
import { ContractException } from "../../http/contracts";
import { DatabaseService } from "../../infrastructure/database/database.service";
import type { AuthenticatedPrincipal } from "../authentication/types";
import { OrganizationAuthorizationService } from "../authorization/organization-authorization.service";

function ensureTimeZone(timeZone: string): void {
    try {
        new Intl.DateTimeFormat("en", { timeZone }).format();
    } catch {
        throw new ContractException("INVALID_TIME_ZONE", 400);
    }
}

@Injectable()
export class OrganizationLifecycleService {
    constructor(
        private readonly database: DatabaseService,
        private readonly authorization: OrganizationAuthorizationService,
    ) {}

    async createOrganization(
        principal: AuthenticatedPrincipal,
        input: CreateOrganizationRequest,
    ): Promise<OrganizationSummary> {
        ensureTimeZone(input.defaultTimeZone);
        const organizationId = randomUUID();

        return this.database.withOrganizationBootstrapTransaction(
            { organizationId, userId: principal.user.id },
            async (transaction) => {
                await transaction.insert(organizations).values({ id: organizationId, ...input });

                await transaction.insert(organizationMemberships).values({
                    organizationId,
                    userId: principal.user.id,
                    roleId: systemOrganizationRoleIds.owner,
                    status: "active",
                });

                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "organization.created",
                    resourceType: "organization",
                    resourceId: organizationId,
                });

                return organizationSummarySchema.parse({
                    id: organizationId,
                    name: input.name,
                    defaultLocale: input.defaultLocale,
                    defaultTimeZone: input.defaultTimeZone,
                    role: "owner",
                });
            },
        );
    }

    async updateOrganization(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: UpdateOrganizationRequest,
    ): Promise<OrganizationSummary> {
        if (input.defaultTimeZone) {
            ensureTimeZone(input.defaultTimeZone);
        }

        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["organization.update"],
            async (transaction, context) => {
                const [updated] = await transaction
                    .update(organizations)
                    .set({ ...input, updatedAt: new Date() })
                    .where(eq(organizations.id, organizationId))
                    .returning();

                if (!updated) {
                    throw new ContractException("ORGANIZATION_ACCESS_DENIED", 403);
                }

                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "organization.updated",
                    resourceType: "organization",
                    resourceId: organizationId,
                    metadata: { fields: Object.keys(input).sort().join(",") },
                });

                return organizationSummarySchema.parse({ ...updated, role: context.role });
            },
        );
    }
}
