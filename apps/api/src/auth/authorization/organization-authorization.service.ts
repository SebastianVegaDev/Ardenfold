import {
    permissionCodeSchema,
    organizationListResponseSchema,
    organizationRoleSchema,
    type OrganizationListResponse,
    type PermissionCode,
} from "@ardenfold/contracts";
import {
    organizationMemberships,
    organizationRolePermissions,
    organizationRoles,
    organizations,
} from "@ardenfold/database/schema";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";

import { ContractException } from "../../http/contracts";
import { DatabaseService } from "../../infrastructure/database/database.service";
import type { ActiveOrganizationContext } from "../organization-context/organization-context.types";

@Injectable()
export class OrganizationAuthorizationService {
    constructor(private readonly database: DatabaseService) {}

    async listAccessibleOrganizations(userId: string): Promise<OrganizationListResponse> {
        const rows = await this.database.withUserTransaction(userId, async (transaction) => {
            return transaction
                .select({
                    id: organizations.id,
                    name: organizations.name,
                    defaultLocale: organizations.defaultLocale,
                    defaultTimeZone: organizations.defaultTimeZone,
                    role: organizationRoles.key,
                })
                .from(organizationMemberships)
                .innerJoin(
                    organizations,
                    eq(organizations.id, organizationMemberships.organizationId),
                )
                .innerJoin(
                    organizationRoles,
                    eq(organizationRoles.id, organizationMemberships.roleId),
                )
                .where(
                    and(
                        eq(organizationMemberships.userId, userId),
                        eq(organizationMemberships.status, "active"),
                        eq(organizations.status, "active"),
                    ),
                )
                .orderBy(sql`lower(${organizations.name})`, organizations.id);
        });

        return organizationListResponseSchema.parse({ data: rows });
    }

    async authorize(
        userId: string,
        organizationId: string,
        requiredPermissions: readonly PermissionCode[],
    ): Promise<ActiveOrganizationContext> {
        return this.database.withTenantTransaction({ organizationId, userId }, (transaction) =>
            this.resolveInTransaction(transaction, userId, organizationId, requiredPermissions),
        );
    }

    async withAuthorizedTransaction<Result>(
        userId: string,
        organizationId: string,
        requiredPermissions: readonly PermissionCode[],
        operation: (
            transaction: ArdenfoldTransaction,
            context: ActiveOrganizationContext,
        ) => Promise<Result>,
    ): Promise<Result> {
        return this.database.withTenantTransaction(
            { organizationId, userId },
            async (transaction) => {
                const context = await this.resolveInTransaction(
                    transaction,
                    userId,
                    organizationId,
                    requiredPermissions,
                );

                await transaction.execute(sql`
                    SELECT
                        set_config(
                            'ardenfold.permission.members.read',
                            ${String(context.permissions.includes("members.read"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.members.manage',
                            ${String(context.permissions.includes("members.manage"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.members.invite',
                            ${String(context.permissions.includes("members.invite"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.audit.read',
                            ${String(context.permissions.includes("audit.read"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.parties.read',
                            ${String(context.permissions.includes("parties.read"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.parties.write',
                            ${String(context.permissions.includes("parties.write"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.assets.read',
                            ${String(context.permissions.includes("assets.read"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.assets.write',
                            ${String(context.permissions.includes("assets.write"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.assets.manage_relationships',
                            ${String(context.permissions.includes("assets.manage_relationships"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.assets.archive',
                            ${String(context.permissions.includes("assets.archive"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.service_requests.read',
                            ${String(context.permissions.includes("service_requests.read"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.service_requests.write',
                            ${String(context.permissions.includes("service_requests.write"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.quotations.read',
                            ${String(context.permissions.includes("quotations.read"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.quotations.write',
                            ${String(context.permissions.includes("quotations.write"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.work_orders.read',
                            ${String(context.permissions.includes("work_orders.read"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.work_orders.write',
                            ${String(context.permissions.includes("work_orders.write"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.receipts.read',
                            ${String(context.permissions.includes("receipts.read"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.receipts.write',
                            ${String(context.permissions.includes("receipts.write"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.technical_executions.read',
                            ${String(context.permissions.includes("technical_executions.read"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.technical_executions.write',
                            ${String(context.permissions.includes("technical_executions.write"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.files.upload',
                            ${String(context.permissions.includes("files.upload"))},
                            true
                        ),
                        set_config(
                            'ardenfold.permission.files.read',
                            ${String(context.permissions.includes("files.read"))},
                            true
                        )
                `);

                return operation(transaction, context);
            },
        );
    }

    requireInTransaction(
        transaction: ArdenfoldTransaction,
        userId: string,
        organizationId: string,
        requiredPermissions: readonly PermissionCode[],
    ): Promise<ActiveOrganizationContext> {
        return this.resolveInTransaction(transaction, userId, organizationId, requiredPermissions);
    }

    private async resolveInTransaction(
        transaction: ArdenfoldTransaction,
        userId: string,
        organizationId: string,
        requiredPermissions: readonly PermissionCode[],
    ): Promise<ActiveOrganizationContext> {
        const rows = await transaction
            .select({
                id: organizations.id,
                name: organizations.name,
                defaultLocale: organizations.defaultLocale,
                defaultTimeZone: organizations.defaultTimeZone,
                role: organizationRoles.key,
                permission: organizationRolePermissions.permissionCode,
            })
            .from(organizationMemberships)
            .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
            .innerJoin(organizationRoles, eq(organizationRoles.id, organizationMemberships.roleId))
            .leftJoin(
                organizationRolePermissions,
                eq(organizationRolePermissions.roleId, organizationRoles.id),
            )
            .where(
                and(
                    eq(organizationMemberships.organizationId, organizationId),
                    eq(organizationMemberships.userId, userId),
                    eq(organizationMemberships.status, "active"),
                    eq(organizations.status, "active"),
                ),
            );

        const first = rows[0];

        if (!first) {
            throw new ContractException("ORGANIZATION_ACCESS_DENIED", 403);
        }

        const permissions = rows.flatMap((row) => {
            const parsed = permissionCodeSchema.safeParse(row.permission);
            return parsed.success ? [parsed.data] : [];
        });
        const missing = requiredPermissions.filter(
            (permission) => !permissions.includes(permission),
        );

        if (missing.length > 0) {
            throw new ContractException("PERMISSION_DENIED", 403);
        }

        return {
            id: first.id,
            name: first.name,
            defaultLocale: first.defaultLocale,
            defaultTimeZone: first.defaultTimeZone,
            role: organizationRoleSchema.parse(first.role),
            permissions,
        };
    }
}
