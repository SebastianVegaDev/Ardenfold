CREATE TABLE "organization_role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_code" varchar(80) NOT NULL,
	CONSTRAINT "organization_role_permissions_pk" PRIMARY KEY("role_id","permission_code")
);
--> statement-breakpoint
CREATE TABLE "organization_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	CONSTRAINT "organization_roles_key_unique" UNIQUE("key"),
	CONSTRAINT "organization_roles_key_not_blank" CHECK (char_length(btrim("organization_roles"."key")) > 0),
	CONSTRAINT "organization_roles_system_only" CHECK ("organization_roles"."is_system" = true)
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"code" varchar(80) PRIMARY KEY NOT NULL,
	CONSTRAINT "permissions_code_not_blank" CHECK (char_length(btrim("permissions"."code")) > 0)
);
--> statement-breakpoint
INSERT INTO "permissions" ("code") VALUES
    ('organization.read'),
    ('organization.update'),
    ('sites.read'),
    ('sites.manage'),
    ('members.read'),
    ('members.invite'),
    ('members.manage'),
    ('audit.read');
--> statement-breakpoint
INSERT INTO "organization_roles" ("id", "key", "is_system") VALUES
    ('00000000-0000-4000-8000-000000000001', 'owner', true),
    ('00000000-0000-4000-8000-000000000002', 'administrator', true),
    ('00000000-0000-4000-8000-000000000003', 'member', true),
    ('00000000-0000-4000-8000-000000000004', 'viewer', true);
--> statement-breakpoint
INSERT INTO "organization_role_permissions" ("role_id", "permission_code")
SELECT role.id, permission.code
FROM "organization_roles" role
CROSS JOIN "permissions" permission
WHERE role.key IN ('owner', 'administrator')
   OR (role.key = 'member' AND permission.code IN ('organization.read', 'sites.read', 'sites.manage'))
   OR (role.key = 'viewer' AND permission.code IN ('organization.read', 'sites.read'));
--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD COLUMN "role_id" uuid DEFAULT '00000000-0000-4000-8000-000000000004' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_role_permissions" ADD CONSTRAINT "organization_role_permissions_role_id_organization_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."organization_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_role_permissions" ADD CONSTRAINT "organization_role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_role_id_organization_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."organization_roles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
REVOKE ALL ON TABLE
    permissions,
    organization_roles,
    organization_role_permissions
FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON TABLE
    permissions,
    organization_roles,
    organization_role_permissions
TO ardenfold_runtime;
--> statement-breakpoint
DROP POLICY organizations_tenant_isolation ON organizations;
--> statement-breakpoint
CREATE POLICY organizations_tenant_isolation ON organizations
    FOR ALL
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND EXISTS (
            SELECT 1
            FROM organization_memberships membership
            WHERE membership.organization_id = organizations.id
              AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
              AND membership.status = 'active'
        )
    )
    WITH CHECK (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    );
--> statement-breakpoint
DROP POLICY organization_sites_tenant_isolation ON organization_sites;
--> statement-breakpoint
CREATE POLICY organization_sites_tenant_isolation ON organization_sites
    FOR ALL
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND EXISTS (
            SELECT 1
            FROM organization_memberships membership
            WHERE membership.organization_id = organization_sites.organization_id
              AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
              AND membership.status = 'active'
        )
    )
    WITH CHECK (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    );
--> statement-breakpoint
DROP POLICY organization_memberships_tenant_isolation ON organization_memberships;
--> statement-breakpoint
CREATE POLICY organization_memberships_self_read ON organization_memberships
    FOR SELECT
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
    );
--> statement-breakpoint
CREATE POLICY organization_memberships_authorized_read ON organization_memberships
    FOR SELECT
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND current_setting('ardenfold.permission.members.read', true) = 'true'
    );
--> statement-breakpoint
CREATE POLICY organization_memberships_authorized_write ON organization_memberships
    FOR ALL
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND current_setting('ardenfold.permission.members.manage', true) = 'true'
    )
    WITH CHECK (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND current_setting('ardenfold.permission.members.manage', true) = 'true'
    );
--> statement-breakpoint
CREATE POLICY organization_memberships_user_directory ON organization_memberships
    FOR SELECT
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'user'
        AND user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
        AND status = 'active'
    );
--> statement-breakpoint
CREATE POLICY organizations_user_directory ON organizations
    FOR SELECT
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'user'
        AND status = 'active'
        AND EXISTS (
            SELECT 1
            FROM organization_memberships membership
            WHERE membership.organization_id = organizations.id
              AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
              AND membership.status = 'active'
        )
    );
