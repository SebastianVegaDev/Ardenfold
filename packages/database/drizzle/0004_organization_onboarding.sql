CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'cancelled');--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"role_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitations_email_normalized" CHECK ("organization_invitations"."email" = lower(btrim("organization_invitations"."email"))),
	CONSTRAINT "organization_invitations_token_hash_format" CHECK ("organization_invitations"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "organization_invitations_lifecycle_check" CHECK (
                ("organization_invitations"."status" = 'pending' AND "organization_invitations"."accepted_by_user_id" IS NULL AND "organization_invitations"."accepted_at" IS NULL AND "organization_invitations"."cancelled_at" IS NULL)
                OR ("organization_invitations"."status" = 'accepted' AND "organization_invitations"."accepted_by_user_id" IS NOT NULL AND "organization_invitations"."accepted_at" IS NOT NULL AND "organization_invitations"."cancelled_at" IS NULL)
                OR ("organization_invitations"."status" = 'cancelled' AND "organization_invitations"."accepted_by_user_id" IS NULL AND "organization_invitations"."accepted_at" IS NULL AND "organization_invitations"."cancelled_at" IS NOT NULL)
            ),
	CONSTRAINT "organization_invitations_expiry_after_creation" CHECK ("organization_invitations"."expires_at" > "organization_invitations"."created_at")
);
--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_role_id_organization_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."organization_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_token_hash_uidx" ON "organization_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_pending_email_uidx" ON "organization_invitations" USING btree ("organization_id","email") WHERE "organization_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "organization_invitations_organization_status_idx" ON "organization_invitations" USING btree ("organization_id","status");
--> statement-breakpoint
REVOKE ALL ON TABLE organization_invitations FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE organization_invitations TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organization_invitations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organization_invitations_tenant_access ON organization_invitations
    FOR ALL
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND (
            current_setting('ardenfold.permission.members.read', true) = 'true'
            OR current_setting('ardenfold.permission.members.invite', true) = 'true'
            OR current_setting('ardenfold.permission.members.manage', true) = 'true'
        )
    )
    WITH CHECK (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND current_setting('ardenfold.permission.members.invite', true) = 'true'
    );
--> statement-breakpoint
CREATE POLICY organization_invitations_token_acceptance ON organization_invitations
    FOR ALL
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'invitation'
        AND token_hash = current_setting('ardenfold.invitation_token_hash', true)
    )
    WITH CHECK (
        current_setting('ardenfold.context_kind', true) = 'invitation'
        AND token_hash = current_setting('ardenfold.invitation_token_hash', true)
    );
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
        id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND current_setting('ardenfold.context_kind', true) IN ('tenant', 'bootstrap')
    );
--> statement-breakpoint
CREATE POLICY organization_memberships_bootstrap_owner ON organization_memberships
    FOR INSERT
    TO ardenfold_runtime
    WITH CHECK (
        current_setting('ardenfold.context_kind', true) = 'bootstrap'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
        AND role_id = '00000000-0000-4000-8000-000000000001'::uuid
        AND status = 'active'
    );
--> statement-breakpoint
CREATE POLICY organization_memberships_invitation_acceptance ON organization_memberships
    FOR INSERT
    TO ardenfold_runtime
    WITH CHECK (
        current_setting('ardenfold.context_kind', true) = 'invitation'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
        AND role_id = NULLIF(current_setting('ardenfold.invitation_role_id', true), '')::uuid
        AND status = 'active'
    );
--> statement-breakpoint
CREATE POLICY organization_memberships_invitation_read ON organization_memberships
    FOR SELECT
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'invitation'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
    );
