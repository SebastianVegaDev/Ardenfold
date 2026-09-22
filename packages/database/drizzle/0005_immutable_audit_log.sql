CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'system', 'administrator');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(120) NOT NULL,
	"resource_type" varchar(80) NOT NULL,
	"resource_id" text NOT NULL,
	"trace_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_action_not_blank" CHECK (char_length(btrim("audit_events"."action")) > 0),
	CONSTRAINT "audit_events_resource_type_not_blank" CHECK (char_length(btrim("audit_events"."resource_type")) > 0),
	CONSTRAINT "audit_events_resource_id_not_blank" CHECK (char_length(btrim("audit_events"."resource_id")) > 0),
	CONSTRAINT "audit_events_metadata_object" CHECK (jsonb_typeof("audit_events"."metadata") = 'object'),
	CONSTRAINT "audit_events_metadata_size" CHECK (octet_length("audit_events"."metadata"::text) <= 8192),
	CONSTRAINT "audit_events_actor_check" CHECK (
                ("audit_events"."actor_type" = 'system' AND "audit_events"."actor_user_id" IS NULL)
                OR ("audit_events"."actor_type" IN ('user', 'administrator') AND "audit_events"."actor_user_id" IS NOT NULL)
            )
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_organization_occurred_id_idx" ON "audit_events" USING btree ("organization_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
REVOKE ALL ON TABLE audit_events FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE audit_events TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_events_tenant_read ON audit_events
    FOR SELECT
    TO ardenfold_runtime
    USING (
        current_setting('ardenfold.context_kind', true) = 'tenant'
        AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND current_setting('ardenfold.permission.audit.read', true) = 'true'
    );
--> statement-breakpoint
CREATE POLICY audit_events_domain_insert ON audit_events
    FOR INSERT
    TO ardenfold_runtime
    WITH CHECK (
        organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
        AND actor_user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
        AND current_setting('ardenfold.context_kind', true) IN ('tenant', 'bootstrap', 'invitation')
    );
