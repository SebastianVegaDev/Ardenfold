CREATE TYPE "public"."service_request_history_kind" AS ENUM('created', 'updated', 'cancelled', 'closed');--> statement-breakpoint
CREATE TYPE "public"."service_request_status" AS ENUM('active', 'cancelled', 'closed');--> statement-breakpoint
CREATE TABLE "service_request_history_entries" (
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" "service_request_history_kind" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_request_history_entries_pk" PRIMARY KEY("organization_id","request_id","version"),
	CONSTRAINT "service_request_history_entries_version_positive" CHECK ("service_request_history_entries"."version" > 0),
	CONSTRAINT "service_request_history_entries_snapshot_object" CHECK (jsonb_typeof("service_request_history_entries"."snapshot") = 'object'),
	CONSTRAINT "service_request_history_entries_reason_not_blank" CHECK ("service_request_history_entries"."reason" IS NULL OR char_length(btrim("service_request_history_entries"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "service_request_scope_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"asset_id" uuid,
	"unidentified_asset_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_request_scope_items_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "service_request_scope_items_request_position_unique" UNIQUE("organization_id","request_id","position"),
	CONSTRAINT "service_request_scope_items_position_positive" CHECK ("service_request_scope_items"."position" > 0),
	CONSTRAINT "service_request_scope_items_description_not_blank" CHECK (char_length(btrim("service_request_scope_items"."description")) > 0),
	CONSTRAINT "service_request_scope_items_unidentified_asset_not_blank" CHECK ("service_request_scope_items"."unidentified_asset_description" IS NULL OR char_length(btrim("service_request_scope_items"."unidentified_asset_description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_party_id" uuid NOT NULL,
	"customer_role" "party_role" DEFAULT 'customer' NOT NULL,
	"requester_contact_id" uuid,
	"requester_name" varchar(200),
	"site_id" uuid,
	"summary" varchar(300) NOT NULL,
	"customer_context" text,
	"status" "service_request_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"terminal_at" timestamp with time zone,
	"terminal_reason" text,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_requests_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "service_requests_customer_role_check" CHECK ("service_requests"."customer_role" = 'customer'),
	CONSTRAINT "service_requests_summary_not_blank" CHECK (char_length(btrim("service_requests"."summary")) > 0),
	CONSTRAINT "service_requests_requester_name_not_blank" CHECK ("service_requests"."requester_name" IS NULL OR char_length(btrim("service_requests"."requester_name")) > 0),
	CONSTRAINT "service_requests_customer_context_not_blank" CHECK ("service_requests"."customer_context" IS NULL OR char_length(btrim("service_requests"."customer_context")) > 0),
	CONSTRAINT "service_requests_version_positive" CHECK ("service_requests"."version" > 0),
	CONSTRAINT "service_requests_terminal_state" CHECK (("service_requests"."status" = 'active' AND "service_requests"."terminal_at" IS NULL AND "service_requests"."terminal_reason" IS NULL) OR ("service_requests"."status" IN ('cancelled', 'closed') AND "service_requests"."terminal_at" IS NOT NULL AND "service_requests"."terminal_reason" IS NOT NULL AND char_length(btrim("service_requests"."terminal_reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "service_request_history_entries" ADD CONSTRAINT "service_request_history_entries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_request_history_entries" ADD CONSTRAINT "service_request_history_entries_request_fk" FOREIGN KEY ("organization_id","request_id") REFERENCES "public"."service_requests"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_request_scope_items" ADD CONSTRAINT "service_request_scope_items_request_fk" FOREIGN KEY ("organization_id","request_id") REFERENCES "public"."service_requests"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_request_scope_items" ADD CONSTRAINT "service_request_scope_items_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_party_fk" FOREIGN KEY ("organization_id","customer_party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_role_fk" FOREIGN KEY ("organization_id","customer_party_id","customer_role") REFERENCES "public"."party_roles"("organization_id","party_id","role") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_contacts" ADD CONSTRAINT "party_contacts_organization_party_id_id_unique" UNIQUE("organization_id","party_id","id");--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_requester_contact_fk" FOREIGN KEY ("organization_id","customer_party_id","requester_contact_id") REFERENCES "public"."party_contacts"("organization_id","party_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_site_fk" FOREIGN KEY ("organization_id","site_id") REFERENCES "public"."organization_sites"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_requests_org_status_created_id_idx" ON "service_requests" USING btree ("organization_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "service_requests_org_customer_created_idx" ON "service_requests" USING btree ("organization_id","customer_party_id","created_at");--> statement-breakpoint
REVOKE ALL ON TABLE service_requests, service_request_scope_items, service_request_history_entries FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE service_requests TO ardenfold_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE service_request_scope_items TO ardenfold_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE service_request_history_entries TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE service_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE service_request_scope_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE service_request_scope_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE service_request_history_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE service_request_history_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION ardenfold_service_request_tenant_allowed(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
    SELECT current_setting('ardenfold.context_kind', true) = 'tenant'
       AND target_organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
       AND EXISTS (
           SELECT 1 FROM organization_memberships membership
           WHERE membership.organization_id = target_organization_id
             AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
             AND membership.status = 'active'
       );
$$;
--> statement-breakpoint
CREATE POLICY service_requests_tenant ON service_requests
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id))
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id));
--> statement-breakpoint
CREATE POLICY service_request_scope_items_tenant ON service_request_scope_items
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id))
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id));
--> statement-breakpoint
CREATE POLICY service_request_history_entries_tenant ON service_request_history_entries
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id))
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id));
--> statement-breakpoint
CREATE FUNCTION ardenfold_service_request_write_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'active' OR NEW.version <> 1 OR NEW.created_by_user_id <> NEW.updated_by_user_id THEN
            RAISE EXCEPTION 'A service request must begin active at version 1' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
           OR NEW.id IS DISTINCT FROM OLD.id
           OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.customer_role IS DISTINCT FROM OLD.customer_role THEN
            RAISE EXCEPTION 'Service request identity is immutable' USING ERRCODE = '23514';
        END IF;
        IF OLD.status <> 'active' THEN
            RAISE EXCEPTION 'Terminal service requests are read-only' USING ERRCODE = '23514';
        END IF;
        IF NEW.version <> OLD.version + 1 THEN
            RAISE EXCEPTION 'Service request version must advance by one' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER service_request_write_guard
BEFORE INSERT OR UPDATE ON service_requests
FOR EACH ROW EXECUTE FUNCTION ardenfold_service_request_write_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_service_request_scope_write_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_organization_id uuid;
    target_request_id uuid;
BEGIN
    target_organization_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
    target_request_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.request_id ELSE NEW.request_id END;
    IF TG_OP = 'UPDATE' AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id
                              OR NEW.request_id IS DISTINCT FROM OLD.request_id
                              OR NEW.id IS DISTINCT FROM OLD.id
                              OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
        RAISE EXCEPTION 'Service request scope identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM service_requests request
        WHERE request.organization_id = target_organization_id
          AND request.id = target_request_id
          AND request.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Service request scope requires an active request' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER service_request_scope_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON service_request_scope_items
FOR EACH ROW EXECUTE FUNCTION ardenfold_service_request_scope_write_guard();
