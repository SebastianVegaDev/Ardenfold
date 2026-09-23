CREATE TYPE "public"."asset_identifier_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."asset_lifecycle" AS ENUM('registered', 'in_service', 'out_of_service', 'retired');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "asset_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"type" varchar(64) NOT NULL,
	"original_value" varchar(255) NOT NULL,
	"normalized_value" varchar(255) NOT NULL,
	"status" "asset_identifier_status" DEFAULT 'active' NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_identifiers_type_not_blank" CHECK (char_length(btrim("asset_identifiers"."type")) > 0),
	CONSTRAINT "asset_identifiers_original_not_blank" CHECK (char_length(btrim("asset_identifiers"."original_value")) > 0),
	CONSTRAINT "asset_identifiers_normalized_not_blank" CHECK (char_length(btrim("asset_identifiers"."normalized_value")) > 0),
	CONSTRAINT "asset_identifiers_retired_state" CHECK (("asset_identifiers"."status" = 'active' AND "asset_identifiers"."retired_at" IS NULL) OR ("asset_identifiers"."status" = 'retired' AND "asset_identifiers"."retired_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"description" text,
	"manufacturer" varchar(200),
	"model" varchar(200),
	"classification" varchar(120),
	"lifecycle" "asset_lifecycle" DEFAULT 'registered' NOT NULL,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "assets_display_name_not_blank" CHECK (char_length(btrim("assets"."display_name")) > 0),
	CONSTRAINT "assets_description_not_blank" CHECK ("assets"."description" IS NULL OR char_length(btrim("assets"."description")) > 0),
	CONSTRAINT "assets_manufacturer_not_blank" CHECK ("assets"."manufacturer" IS NULL OR char_length(btrim("assets"."manufacturer")) > 0),
	CONSTRAINT "assets_model_not_blank" CHECK ("assets"."model" IS NULL OR char_length(btrim("assets"."model")) > 0),
	CONSTRAINT "assets_classification_not_blank" CHECK ("assets"."classification" IS NULL OR char_length(btrim("assets"."classification")) > 0),
	CONSTRAINT "assets_version_positive" CHECK ("assets"."version" > 0),
	CONSTRAINT "assets_archive_state" CHECK (("assets"."status" = 'active' AND "assets"."archived_at" IS NULL) OR ("assets"."status" = 'archived' AND "assets"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "asset_identifiers" ADD CONSTRAINT "asset_identifiers_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_identifiers_org_asset_status_idx" ON "asset_identifiers" USING btree ("organization_id","asset_id","status");--> statement-breakpoint
CREATE INDEX "asset_identifiers_org_type_normalized_idx" ON "asset_identifiers" USING btree ("organization_id","type","normalized_value");--> statement-breakpoint
CREATE INDEX "assets_organization_status_name_id_idx" ON "assets" USING btree ("organization_id","status","display_name","id");--> statement-breakpoint
CREATE INDEX "assets_organization_lifecycle_idx" ON "assets" USING btree ("organization_id","lifecycle");
--> statement-breakpoint
REVOKE ALL ON TABLE assets, asset_identifiers FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE assets TO ardenfold_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE asset_identifiers TO ardenfold_runtime;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['assets', 'asset_identifiers'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format($policy$
            CREATE POLICY %I ON %I FOR SELECT TO ardenfold_runtime USING (
                current_setting('ardenfold.context_kind', true) = 'tenant'
                AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
                AND current_setting('ardenfold.permission.assets.read', true) = 'true'
                AND EXISTS (
                    SELECT 1 FROM organization_memberships membership
                    WHERE membership.organization_id = %I.organization_id
                    AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
                    AND membership.status = 'active'
                )
            )
        $policy$, table_name || '_tenant_read', table_name, table_name);
        EXECUTE format($policy$
            CREATE POLICY %I ON %I FOR ALL TO ardenfold_runtime
            USING (
                current_setting('ardenfold.context_kind', true) = 'tenant'
                AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
                AND current_setting('ardenfold.permission.assets.write', true) = 'true'
                AND EXISTS (
                    SELECT 1 FROM organization_memberships membership
                    WHERE membership.organization_id = %I.organization_id
                    AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
                    AND membership.status = 'active'
                )
            )
            WITH CHECK (
                current_setting('ardenfold.context_kind', true) = 'tenant'
                AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
                AND current_setting('ardenfold.permission.assets.write', true) = 'true'
                AND EXISTS (
                    SELECT 1 FROM organization_memberships membership
                    WHERE membership.organization_id = %I.organization_id
                    AND membership.user_id = NULLIF(current_setting('ardenfold.user_id', true), '')::uuid
                    AND membership.status = 'active'
                )
            )
        $policy$, table_name || '_tenant_write', table_name, table_name, table_name);
    END LOOP;
END $$;
