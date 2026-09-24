CREATE TABLE "registry_import_rows" (
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"kind" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"payload" jsonb,
	"errors" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"duplicate_candidates" jsonb NOT NULL,
	"resource_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_import_rows_pk" PRIMARY KEY("organization_id","session_id","row_number"),
	CONSTRAINT "registry_import_rows_kind_check" CHECK ("registry_import_rows"."kind" IN ('party', 'asset')),
	CONSTRAINT "registry_import_rows_status_check" CHECK ("registry_import_rows"."status" IN ('valid', 'rejected', 'committed', 'failed', 'skipped')),
	CONSTRAINT "registry_import_rows_number_check" CHECK ("registry_import_rows"."row_number" BETWEEN 2 AND 501)
);
--> statement-breakpoint
CREATE TABLE "registry_import_sessions" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"template_version" integer NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'previewed' NOT NULL,
	"total_rows" integer NOT NULL,
	"approved_rows" jsonb,
	"summary" jsonb,
	"lease_until" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "registry_import_sessions_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "registry_import_sessions_kind_check" CHECK ("registry_import_sessions"."kind" IN ('party', 'asset')),
	CONSTRAINT "registry_import_sessions_template_version_check" CHECK ("registry_import_sessions"."template_version" = 1),
	CONSTRAINT "registry_import_sessions_status_check" CHECK ("registry_import_sessions"."status" IN ('previewed', 'committing', 'completed')),
	CONSTRAINT "registry_import_sessions_total_rows_check" CHECK ("registry_import_sessions"."total_rows" BETWEEN 0 AND 500)
);
--> statement-breakpoint
ALTER TABLE "registry_import_rows" ADD CONSTRAINT "registry_import_rows_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."registry_import_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_import_sessions" ADD CONSTRAINT "registry_import_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_import_sessions" ADD CONSTRAINT "registry_import_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registry_import_rows_session_status_idx" ON "registry_import_rows" USING btree ("organization_id","session_id","status");--> statement-breakpoint
CREATE INDEX "registry_import_sessions_org_created_idx" ON "registry_import_sessions" USING btree ("organization_id","created_at");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE registry_import_sessions, registry_import_rows TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE registry_import_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE registry_import_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE registry_import_rows ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE registry_import_rows FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION ardenfold_registry_import_allowed(target_organization_id uuid, import_kind varchar)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
    SELECT current_setting('ardenfold.context_kind', true) = 'tenant'
       AND target_organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
       AND ((import_kind = 'party' AND current_setting('ardenfold.permission.parties.write', true) = 'true')
            OR (import_kind = 'asset' AND current_setting('ardenfold.permission.assets.write', true) = 'true'))
       AND EXISTS (
           SELECT 1 FROM organization_memberships membership
           WHERE membership.organization_id = target_organization_id
             AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
             AND membership.status = 'active'
       );
$$;
--> statement-breakpoint
CREATE POLICY registry_import_sessions_tenant ON registry_import_sessions
FOR ALL TO ardenfold_runtime
USING (ardenfold_registry_import_allowed(organization_id, kind))
WITH CHECK (ardenfold_registry_import_allowed(organization_id, kind));
--> statement-breakpoint
CREATE POLICY registry_import_rows_tenant ON registry_import_rows
FOR ALL TO ardenfold_runtime
USING (ardenfold_registry_import_allowed(organization_id, kind))
WITH CHECK (ardenfold_registry_import_allowed(organization_id, kind));
--> statement-breakpoint
CREATE FUNCTION ardenfold_registry_import_row_kind_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM registry_import_sessions session
        WHERE session.organization_id = NEW.organization_id
          AND session.id = NEW.session_id
          AND session.kind = NEW.kind
    ) THEN
        RAISE EXCEPTION 'Import row kind must match its session' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER registry_import_row_kind_guard
BEFORE INSERT OR UPDATE ON registry_import_rows
FOR EACH ROW EXECUTE FUNCTION ardenfold_registry_import_row_kind_guard();
