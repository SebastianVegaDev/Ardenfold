CREATE TYPE "public"."asset_history_event" AS ENUM('asset_created', 'asset_updated', 'lifecycle_changed', 'identifier_added', 'identifier_changed', 'identifier_retired', 'asset_archived', 'asset_restored', 'relationship_started', 'relationship_ended', 'relationship_corrected');--> statement-breakpoint
CREATE TYPE "public"."asset_relationship_kind" AS ENUM('ownership', 'custody', 'location');--> statement-breakpoint
CREATE TYPE "public"."asset_relationship_subject" AS ENUM('party', 'recording_organization', 'site', 'party_address', 'freeform');--> statement-breakpoint
CREATE TABLE "asset_history_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"event" "asset_history_event" NOT NULL,
	"aggregate_version" integer NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"trace_id" uuid NOT NULL,
	"source" varchar(64) DEFAULT 'asset_registry' NOT NULL,
	"source_reference_id" uuid,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_history_entries_version_positive" CHECK ("asset_history_entries"."aggregate_version" > 0),
	CONSTRAINT "asset_history_entries_source_not_blank" CHECK (char_length(btrim("asset_history_entries"."source")) > 0)
);
--> statement-breakpoint
CREATE TABLE "asset_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" "asset_relationship_kind" NOT NULL,
	"subject" "asset_relationship_subject" NOT NULL,
	"party_id" uuid,
	"site_id" uuid,
	"party_address_id" uuid,
	"location_description" varchar(500),
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"supersedes_id" uuid,
	"superseded_at" timestamp with time zone,
	"revision_reason" varchar(500),
	"aggregate_version" integer NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_relationships_org_asset_id_unique" UNIQUE("organization_id","asset_id","id"),
	CONSTRAINT "asset_relationships_interval_order" CHECK ("asset_relationships"."effective_to" IS NULL OR "asset_relationships"."effective_to" > "asset_relationships"."effective_from"),
	CONSTRAINT "asset_relationships_aggregate_version_positive" CHECK ("asset_relationships"."aggregate_version" > 0),
	CONSTRAINT "asset_relationships_reason_not_blank" CHECK ("asset_relationships"."revision_reason" IS NULL OR char_length(btrim("asset_relationships"."revision_reason")) > 0),
	CONSTRAINT "asset_relationships_location_not_blank" CHECK ("asset_relationships"."location_description" IS NULL OR char_length(btrim("asset_relationships"."location_description")) > 0),
	CONSTRAINT "asset_relationships_subject_shape" CHECK (
                (
                    "asset_relationships"."kind" IN ('ownership', 'custody')
                    AND "asset_relationships"."location_description" IS NULL
                    AND "asset_relationships"."site_id" IS NULL
                    AND "asset_relationships"."party_address_id" IS NULL
                    AND (
                        ("asset_relationships"."subject" = 'party' AND "asset_relationships"."party_id" IS NOT NULL)
                        OR ("asset_relationships"."subject" = 'recording_organization' AND "asset_relationships"."party_id" IS NULL)
                    )
                ) OR (
                    "asset_relationships"."kind" = 'location'
                    AND "asset_relationships"."party_id" IS NULL
                    AND "asset_relationships"."location_description" IS NOT NULL
                    AND (
                        ("asset_relationships"."subject" = 'site' AND "asset_relationships"."site_id" IS NOT NULL AND "asset_relationships"."party_address_id" IS NULL)
                        OR ("asset_relationships"."subject" = 'party_address' AND "asset_relationships"."party_address_id" IS NOT NULL AND "asset_relationships"."site_id" IS NULL)
                        OR ("asset_relationships"."subject" = 'freeform' AND "asset_relationships"."site_id" IS NULL AND "asset_relationships"."party_address_id" IS NULL)
                    )
                )
            )
);
--> statement-breakpoint
ALTER TABLE "organization_sites" ADD CONSTRAINT "organization_sites_organization_id_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "party_addresses" ADD CONSTRAINT "party_addresses_organization_id_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "asset_history_entries" ADD CONSTRAINT "asset_history_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_history_entries" ADD CONSTRAINT "asset_history_entries_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_site_fk" FOREIGN KEY ("organization_id","site_id") REFERENCES "public"."organization_sites"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_address_fk" FOREIGN KEY ("organization_id","party_address_id") REFERENCES "public"."party_addresses"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_supersedes_fk" FOREIGN KEY ("organization_id","asset_id","supersedes_id") REFERENCES "public"."asset_relationships"("organization_id","asset_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_history_entries_org_asset_occurred_idx" ON "asset_history_entries" USING btree ("organization_id","asset_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "asset_relationships_org_asset_kind_from_idx" ON "asset_relationships" USING btree ("organization_id","asset_id","kind","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_relationships_current_unique" ON "asset_relationships" USING btree ("organization_id","asset_id","kind") WHERE "asset_relationships"."effective_to" IS NULL AND "asset_relationships"."superseded_at" IS NULL;--> statement-breakpoint
REVOKE ALL ON TABLE asset_relationships, asset_history_entries FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE asset_relationships TO ardenfold_runtime;
--> statement-breakpoint
GRANT UPDATE (superseded_at) ON TABLE asset_relationships TO ardenfold_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE asset_history_entries TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE asset_relationships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE asset_relationships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE asset_history_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE asset_history_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY asset_relationships_tenant_read ON asset_relationships
FOR SELECT TO ardenfold_runtime USING (
    current_setting('ardenfold.context_kind', true) = 'tenant'
    AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    AND current_setting('ardenfold.permission.assets.read', true) = 'true'
    AND EXISTS (
        SELECT 1 FROM organization_memberships membership
        WHERE membership.organization_id = asset_relationships.organization_id
          AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
          AND membership.status = 'active'
    )
);
--> statement-breakpoint
CREATE POLICY asset_relationships_tenant_write ON asset_relationships
FOR ALL TO ardenfold_runtime
USING (
    current_setting('ardenfold.context_kind', true) = 'tenant'
    AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    AND current_setting('ardenfold.permission.assets.manage_relationships', true) = 'true'
    AND EXISTS (
        SELECT 1 FROM organization_memberships membership
        WHERE membership.organization_id = asset_relationships.organization_id
          AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
          AND membership.status = 'active'
    )
)
WITH CHECK (
    current_setting('ardenfold.context_kind', true) = 'tenant'
    AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    AND current_setting('ardenfold.permission.assets.manage_relationships', true) = 'true'
    AND EXISTS (
        SELECT 1 FROM organization_memberships membership
        WHERE membership.organization_id = asset_relationships.organization_id
          AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
          AND membership.status = 'active'
    )
);
--> statement-breakpoint
CREATE POLICY asset_history_entries_tenant_read ON asset_history_entries
FOR SELECT TO ardenfold_runtime USING (
    current_setting('ardenfold.context_kind', true) = 'tenant'
    AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    AND current_setting('ardenfold.permission.assets.read', true) = 'true'
    AND EXISTS (
        SELECT 1 FROM organization_memberships membership
        WHERE membership.organization_id = asset_history_entries.organization_id
          AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
          AND membership.status = 'active'
    )
);
--> statement-breakpoint
CREATE POLICY asset_history_entries_tenant_insert ON asset_history_entries
FOR INSERT TO ardenfold_runtime WITH CHECK (
    current_setting('ardenfold.context_kind', true) = 'tenant'
    AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    AND (
        current_setting('ardenfold.permission.assets.write', true) = 'true'
        OR current_setting('ardenfold.permission.assets.manage_relationships', true) = 'true'
        OR current_setting('ardenfold.permission.assets.archive', true) = 'true'
    )
    AND EXISTS (
        SELECT 1 FROM organization_memberships membership
        WHERE membership.organization_id = asset_history_entries.organization_id
          AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
          AND membership.status = 'active'
    )
);
--> statement-breakpoint
CREATE FUNCTION asset_relationships_preserve_revision() RETURNS trigger AS $$
BEGIN
    IF OLD.superseded_at IS NOT NULL
       OR NEW.superseded_at IS NULL
       OR (to_jsonb(NEW) - 'superseded_at') <> (to_jsonb(OLD) - 'superseded_at') THEN
        RAISE EXCEPTION 'asset relationship revisions are immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'asset_relationships_revision_immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER asset_relationships_revision_immutable
BEFORE UPDATE ON asset_relationships
FOR EACH ROW EXECUTE FUNCTION asset_relationships_preserve_revision();
