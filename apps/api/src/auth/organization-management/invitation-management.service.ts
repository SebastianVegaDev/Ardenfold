import { createHash, randomBytes } from "node:crypto";

import {
    createdInvitationResponseSchema,
    organizationInvitationListResponseSchema,
    type AcceptInvitationRequest,
    type CreateInvitationRequest,
    type CreatedInvitationResponse,
    type OrganizationInvitationListResponse,
    type OrganizationRole,
} from "@ardenfold/contracts";
import {
    organizationInvitations,
    organizationMemberships,
    organizationRoles,
    systemOrganizationRoleIds,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";

import { recordAuditEvent } from "../../audit/audit.service";
import { ContractException } from "../../http/contracts";
import { DatabaseService } from "../../infrastructure/database/database.service";
import type { AuthenticatedPrincipal } from "../auth.types";
import { OrganizationAuthorizationService } from "../organization-authorization.service";

function hashInvitationToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

function invitationStatus(status: "pending" | "accepted" | "cancelled", expiresAt: Date) {
    return status === "pending" && expiresAt.getTime() <= Date.now() ? "expired" : status;
}

@Injectable()
export class InvitationManagementService {
    constructor(
        private readonly database: DatabaseService,
        private readonly authorization: OrganizationAuthorizationService,
    ) {}

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

                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "invitation.created",
                    resourceType: "invitation",
                    resourceId: invitation.id,
                    metadata: { role: input.role },
                });

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

                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "invitation.cancelled",
                    resourceType: "invitation",
                    resourceId: invitationId,
                });
            },
        );
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

            await recordAuditEvent(transaction, {
                organizationId: invitation.organizationId,
                actorUserId: principal.user.id,
                action: "invitation.accepted",
                resourceType: "invitation",
                resourceId: invitation.id,
                metadata: { role: this.roleKeyFromId(invitation.roleId) },
            });

            return { organizationId: invitation.organizationId };
        });
    }

    private roleKeyFromId(roleId: string): OrganizationRole {
        const entry = Object.entries(systemOrganizationRoleIds).find(([, id]) => id === roleId);

        if (!entry) {
            throw new Error("Membership references an unknown system role.");
        }

        return entry[0] as OrganizationRole;
    }
}