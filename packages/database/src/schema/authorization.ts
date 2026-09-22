import { sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, varchar, uuid } from "drizzle-orm/pg-core";

export const permissionCodes = [
    "organization.read",
    "organization.update",
    "sites.read",
    "sites.manage",
    "members.read",
    "members.invite",
    "members.manage",
    "audit.read",
] as const;

export type PermissionCode = (typeof permissionCodes)[number];

export const organizationRoleKeys = ["owner", "administrator", "member", "viewer"] as const;
export type OrganizationRoleKey = (typeof organizationRoleKeys)[number];

export const systemOrganizationRoleIds: Readonly<Record<OrganizationRoleKey, string>> = {
    owner: "00000000-0000-4000-8000-000000000001",
    administrator: "00000000-0000-4000-8000-000000000002",
    member: "00000000-0000-4000-8000-000000000003",
    viewer: "00000000-0000-4000-8000-000000000004",
};

export const permissions = pgTable(
    "permissions",
    {
        code: varchar("code", { length: 80 }).primaryKey(),
    },
    (table) => [check("permissions_code_not_blank", sql`char_length(btrim(${table.code})) > 0`)],
);

export const organizationRoles = pgTable(
    "organization_roles",
    {
        id: uuid("id").primaryKey(),
        key: varchar("key", { length: 64 }).notNull().unique(),
        isSystem: boolean("is_system").default(true).notNull(),
    },
    (table) => [
        check("organization_roles_key_not_blank", sql`char_length(btrim(${table.key})) > 0`),
        check("organization_roles_system_only", sql`${table.isSystem} = true`),
    ],
);

export const organizationRolePermissions = pgTable(
    "organization_role_permissions",
    {
        roleId: uuid("role_id")
            .notNull()
            .references(() => organizationRoles.id, { onDelete: "cascade" }),
        permissionCode: varchar("permission_code", { length: 80 })
            .notNull()
            .references(() => permissions.code, { onDelete: "cascade" }),
    },
    (table) => [
        primaryKey({
            name: "organization_role_permissions_pk",
            columns: [table.roleId, table.permissionCode],
        }),
    ],
);

export type Permission = typeof permissions.$inferSelect;
export type OrganizationRole = typeof organizationRoles.$inferSelect;
export type OrganizationRolePermission = typeof organizationRolePermissions.$inferSelect;
