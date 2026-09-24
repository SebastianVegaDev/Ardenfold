import {
    organizationMemberListResponseSchema,
    type OrganizationMemberListResponse,
    type OrganizationRole,
    type UpdateMembershipRoleRequest,
} from "@ardenfold/contracts";
import {
    organizationMemberships,
    organizationRoles,
    systemOrganizationRoleIds,
    users,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, count, eq, ne, sql } from "drizzle-orm";

import { recordAuditEvent } from "../../audit/audit.service";
import { ContractException } from "../../http/contracts";
import type { AuthenticatedPrincipal } from "../authentication/types";
import { OrganizationAuthorizationService } from "../authorization/organization-authorization.service";

@Injectable()
export class MembershipManagementService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

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
        await this.manageMembership(
            principal,
            organizationId,
            membershipId,
            undefined,
            "suspended",
        );
    }

    async removeMembership(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        membershipId: string,
    ): Promise<void> {
        await this.manageMembership(principal, organizationId, membershipId, undefined, "removed");
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
                const removesOwnership =
                    targetIsOwner && (role !== "owner" || status !== undefined);

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

                const action = role
                    ? "membership.role_changed"
                    : status === "suspended"
                      ? "membership.suspended"
                      : "membership.removed";

                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action,
                    resourceType: "membership",
                    resourceId: membershipId,
                    metadata: role
                        ? {
                              previousRole: this.roleKeyFromId(target.roleId),
                              newRole: role,
                          }
                        : { status: status! },
                });
            },
        );
    }

    private roleKeyFromId(roleId: string): OrganizationRole {
        const entry = Object.entries(systemOrganizationRoleIds).find(([, id]) => id === roleId);

        if (!entry) {
            throw new Error("Membership references an unknown system role.");
        }

        return entry[0] as OrganizationRole;
    }
}
