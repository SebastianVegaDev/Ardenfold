import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
    createdInvitationResponseSchema,
    organizationInvitationListResponseSchema,
    organizationMemberListResponseSchema,
    organizationSiteSchema,
    organizationSiteListResponseSchema,
    organizationSummarySchema,
    type AcceptInvitationRequest,
    type CreateInvitationRequest,
    type CreateOrganizationRequest,
    type CreateOrganizationSiteRequest,
    type CreatedInvitationResponse,
    type OrganizationInvitationListResponse,
    type OrganizationMemberListResponse,
    type OrganizationRole,
    type OrganizationSite,
    type OrganizationSiteListResponse,
    type OrganizationSummary,
    type UpdateMembershipRoleRequest,
    type UpdateOrganizationRequest,
} from "@ardenfold/contracts";
import {
    organizationInvitations,
    organizationMemberships,
    organizationRoles,
    organizations,
    organizationSites,
    systemOrganizationRoleIds,
    users,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, count, eq, ne, sql } from "drizzle-orm";

import { ContractException } from "../http/contracts";
import { DatabaseService } from "../infrastructure/database/database.service";
import type { AuthenticatedPrincipal } from "./auth.types";
import { OrganizationAuthorizationService } from "./organization-authorization.service";

function ensureTimeZone(timeZone: string): void {
    try {
        new Intl.DateTimeFormat("en", { timeZone }).format();
    } catch {
        throw new ContractException("INVALID_TIME_ZONE", 400);
    }
}

function hashInvitationToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

function invitationStatus(status: "pending" | "accepted" | "cancelled", expiresAt: Date) {
    return status === "pending" && expiresAt.getTime() <= Date.now() ? "expired" : status;
}

@Injectable()
export class OrganizationManagementService {
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

                return organizationSummarySchema.parse({ ...updated, role: context.role });
            },
        );
    }

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

                return organizationSiteSchema.parse(site);
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

                return organizationSiteListResponseSchema.parse({ data: sites });
            },
        );
    }

    async listMembers(
        principal: AuthenticatedPrincipal,
        organizationId: string,
    ): Promise<OrganizationMemberListResponse> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["members.read"],
            async (transaction) => {
                const members = await transaction
                    .select({
                        membershipId: organizationMemberships.id,
                        userId: users.id,
                        email: users.primaryEmail,
                        displayName: users.displayName,
                        role: organizationRoles.key,
                        status: organizationMemberships.status,
                    })
                    .from(organizationMemberships)
                    .innerJoin(users, eq(users.id, organizationMemberships.userId))
                    .innerJoin(
                        organizationRoles,
                        eq(organizationRoles.id, organizationMemberships.roleId),
                    )
                    .where(ne(organizationMemberships.status, "removed"))
                    .orderBy(sql`lower(${users.primaryEmail})`);

                return organizationMemberListResponseSchema.parse({ data: members });
            },
        );
    }

    async createInvitation(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: CreateInvitationRequest,
    ): Promise<CreatedInvitationResponse> {
        const token = randomBytes(32).toString("base64url");
        const tokenHash = hashInvitationToken(token);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);

        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["members.invite"],
            async (transaction, context) => {
                if (input.role === "owner" && context.role !== "owner") {
                    throw new ContractException("ROLE_ASSIGNMENT_DENIED", 403);
                }

                const [role] = await transaction
                    .select({ id: organizationRoles.id, key: organizationRoles.key })
                    .from(organizationRoles)
                    .where(eq(organizationRoles.key, input.role))
                    .limit(1);

                if (!role) {
                    throw new ContractException("INVALID_ROLE", 400);
                }

                const [existing] = await transaction
                    .select({
                        id: organizationInvitations.id,
                        expiresAt: organizationInvitations.expiresAt,
                    })
                    .from(organizationInvitations)
                    .where(
                        and(
                            eq(organizationInvitations.email, input.email),
                            eq(organizationInvitations.status, "pending"),
                        ),
                    )
                    .limit(1);

                if (existing && existing.expiresAt.getTime() > Date.now()) {
                    throw new ContractException("INVITATION_ALREADY_PENDING", 409);
                }

                if (existing) {
                    await transaction
                        .update(organizationInvitations)
                        .set({
                            status: "cancelled",
                            cancelledAt: new Date(),
                            updatedAt: new Date(),
                        })
                        .where(eq(organizationInvitations.id, existing.id));
                }

                const [invitation] = await transaction
                    .insert(organizationInvitations)
                    .values({
                        organizationId,
                        email: input.email,
                        roleId: role.id,
                        tokenHash,
                        invitedByUserId: principal.user.id,
                        expiresAt,
                    })
                    .onConflictDoNothing()
                    .returning();

                if (!invitation) {
                    throw new ContractException("INVITATION_ALREADY_PENDING", 409);
                }

                return createdInvitationResponseSchema.parse({
                    id: invitation.id,
                    email: invitation.email,
                    role: role.key,
                    status: "pending",
                    expiresAt: invitation.expiresAt.toISOString(),
                    acceptanceToken: token,
                });
            },
        );
    }

    async listInvitations(
        principal: AuthenticatedPrincipal,
        organizationId: string,
    ): Promise<OrganizationInvitationListResponse> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["members.read"],
            async (transaction) => {
                const rows = await transaction
                    .select({
                        id: organizationInvitations.id,
                        email: organizationInvitations.email,
                        role: organizationRoles.key,
                        status: organizationInvitations.status,
                        expiresAt: organizationInvitations.expiresAt,
                    })
                    .from(organizationInvitations)
                    .innerJoin(
                        organizationRoles,
                        eq(organizationRoles.id, organizationInvitations.roleId),
                    )
                    .orderBy(sql`${organizationInvitations.createdAt} DESC`);

                return organizationInvitationListResponseSchema.parse({
                    data: rows.map((row) => ({
                        ...row,
                        status: invitationStatus(row.status, row.expiresAt),
                        expiresAt: row.expiresAt.toISOString(),
                    })),
                });
            },
        );
    }

    async cancelInvitation(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        invitationId: string,
    ): Promise<void> {
        await this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["members.invite"],
            async (transaction) => {
                const cancelled = await transaction
                    .update(organizationInvitations)
                    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
                    .where(
                        and(
                            eq(organizationInvitations.id, invitationId),
                            eq(organizationInvitations.status, "pending"),
                        ),
                    )
                    .returning({ id: organizationInvitations.id });

                if (!cancelled[0]) {
                    throw new ContractException("INVITATION_NOT_PENDING", 409);
                }
            },
        );
    }

    async updateMembershipRole(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        membershipId: string,
        input: UpdateMembershipRoleRequest,
    ): Promise<void> {
        await this.manageMembership(principal, organizationId, membershipId, input.role);
    }

    async suspendMembership(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        membershipId: string,
    ): Promise<void> {
        await this.manageMembership(principal, organizationId, membershipId, undefined, "suspended");
    }

    async removeMembership(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        membershipId: string,
    ): Promise<void> {
        await this.manageMembership(principal, organizationId, membershipId, undefined, "removed");
    }

    async acceptInvitation(
        principal: AuthenticatedPrincipal,
        input: AcceptInvitationRequest,
    ): Promise<{ organizationId: string }> {
        const tokenHash = hashInvitationToken(input.token);

        return this.database.withInvitationTransaction(tokenHash, async (transaction) => {
            const [invitation] = await transaction
                .select()
                .from(organizationInvitations)
                .where(eq(organizationInvitations.tokenHash, tokenHash))
                .limit(1);

            if (!invitation || invitation.status !== "pending") {
                throw new ContractException("INVITATION_INVALID", 404);
            }

            if (invitation.expiresAt.getTime() <= Date.now()) {
                throw new ContractException("INVITATION_EXPIRED", 410);
            }

            if (invitation.email !== principal.user.primaryEmail.trim().toLowerCase()) {
                throw new ContractException("INVITATION_EMAIL_MISMATCH", 403);
            }

            await transaction.execute(sql`
                SELECT
                    set_config('ardenfold.organization_id', ${invitation.organizationId}, true),
                    set_config('ardenfold.user_id', ${principal.user.id}, true),
                    set_config('ardenfold.invitation_role_id', ${invitation.roleId}, true)
            `);

            const membership = await transaction
                .insert(organizationMemberships)
                .values({
                    organizationId: invitation.organizationId,
                    userId: principal.user.id,
                    roleId: invitation.roleId,
                    status: "active",
                })
                .onConflictDoNothing()
                .returning({ id: organizationMemberships.id });

            if (!membership[0]) {
                throw new ContractException("INVITATION_ALREADY_MEMBER", 409);
            }

            await transaction
                .update(organizationInvitations)
                .set({
                    status: "accepted",
                    acceptedByUserId: principal.user.id,
                    acceptedAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(organizationInvitations.id, invitation.id));

            return { organizationId: invitation.organizationId };
        });
    }

    private async manageMembership(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        membershipId: string,
        role?: OrganizationRole,
        status?: "suspended" | "removed",
    ): Promise<void> {
        await this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["members.manage"],
            async (transaction, context) => {
                const [target] = await transaction
                    .select()
                    .from(organizationMemberships)
                    .where(eq(organizationMemberships.id, membershipId))
                    .limit(1);

                if (!target || target.status === "removed") {
                    throw new ContractException("MEMBERSHIP_NOT_FOUND", 404);
                }

                const targetIsOwner = target.roleId === systemOrganizationRoleIds.owner;
                const removesOwnership = targetIsOwner && (role !== "owner" || status !== undefined);

                if ((targetIsOwner || role === "owner") && context.role !== "owner") {
                    throw new ContractException("ROLE_ASSIGNMENT_DENIED", 403);
                }

                if (removesOwnership) {
                    const [owners] = await transaction
                        .select({ value: count() })
                        .from(organizationMemberships)
                        .where(
                            and(
                                eq(organizationMemberships.roleId, systemOrganizationRoleIds.owner),
                                eq(organizationMemberships.status, "active"),
                            ),
                        );

                    if ((owners?.value ?? 0) <= 1) {
                        throw new ContractException("LAST_OWNER_REQUIRED", 409);
                    }
                }

                const changes: Partial<typeof organizationMemberships.$inferInsert> = {
                    updatedAt: new Date(),
                };

                if (role) {
                    changes.roleId = systemOrganizationRoleIds[role];
                }

                if (status === "suspended") {
                    changes.status = "suspended";
                    changes.suspendedAt = new Date();
                }

                if (status === "removed") {
                    changes.status = "removed";
                    changes.removedAt = new Date();
                }

                await transaction
                    .update(organizationMemberships)
                    .set(changes)
                    .where(eq(organizationMemberships.id, membershipId));
            },
        );
    }
}
