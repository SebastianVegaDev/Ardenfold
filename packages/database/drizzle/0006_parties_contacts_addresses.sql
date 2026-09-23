CREATE TYPE "public"."contact_channel_type" AS ENUM('email', 'phone', 'other');--> statement-breakpoint
CREATE TYPE "public"."party_kind" AS ENUM('organization', 'individual');--> statement-breakpoint
CREATE TYPE "public"."party_role" AS ENUM('customer', 'provider');--> statement-breakpoint
CREATE TYPE "public"."party_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "party_kind" NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"legal_name" varchar(200),
	"status" "party_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parties_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "parties_display_name_not_blank" CHECK (char_length(btrim("parties"."display_name")) > 0),
	CONSTRAINT "parties_legal_name_not_blank" CHECK ("parties"."legal_name" IS NULL OR char_length(btrim("parties"."legal_name")) > 0),
	CONSTRAINT "parties_version_positive" CHECK ("parties"."version" > 0),
	CONSTRAINT "parties_archive_state" CHECK (("parties"."status" = 'active' AND "parties"."archived_at" IS NULL) OR ("parties"."status" = 'archived' AND "parties"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "party_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"label" varchar(80) NOT NULL,
	"line_1" varchar(200) NOT NULL,
	"line_2" varchar(200),
	"locality" varchar(120) NOT NULL,
	"region" varchar(120),
	"postal_code" varchar(32),
	"country_code" varchar(2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_addresses_label_not_blank" CHECK (char_length(btrim("party_addresses"."label")) > 0),
	CONSTRAINT "party_addresses_line_1_not_blank" CHECK (char_length(btrim("party_addresses"."line_1")) > 0),
	CONSTRAINT "party_addresses_locality_not_blank" CHECK (char_length(btrim("party_addresses"."locality")) > 0),
	CONSTRAINT "party_addresses_country_code_format" CHECK ("party_addresses"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "party_addresses_line_2_not_blank" CHECK ("party_addresses"."line_2" IS NULL OR char_length(btrim("party_addresses"."line_2")) > 0),
	CONSTRAINT "party_addresses_region_not_blank" CHECK ("party_addresses"."region" IS NULL OR char_length(btrim("party_addresses"."region")) > 0),
	CONSTRAINT "party_addresses_postal_code_not_blank" CHECK ("party_addresses"."postal_code" IS NULL OR char_length(btrim("party_addresses"."postal_code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "party_contact_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"type" "contact_channel_type" NOT NULL,
	"label" varchar(80),
	"value" varchar(320) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_contact_channels_value_not_blank" CHECK (char_length(btrim("party_contact_channels"."value")) > 0),
	CONSTRAINT "party_contact_channels_label_not_blank" CHECK ("party_contact_channels"."label" IS NULL OR char_length(btrim("party_contact_channels"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "party_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"job_title" varchar(120),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_contacts_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "party_contacts_display_name_not_blank" CHECK (char_length(btrim("party_contacts"."display_name")) > 0),
	CONSTRAINT "party_contacts_job_title_not_blank" CHECK ("party_contacts"."job_title" IS NULL OR char_length(btrim("party_contacts"."job_title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "party_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"type" varchar(64) NOT NULL,
	"original_value" varchar(255) NOT NULL,
	"normalized_value" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_identifiers_type_not_blank" CHECK (char_length(btrim("party_identifiers"."type")) > 0),
	CONSTRAINT "party_identifiers_original_not_blank" CHECK (char_length(btrim("party_identifiers"."original_value")) > 0),
	CONSTRAINT "party_identifiers_normalized_not_blank" CHECK (char_length(btrim("party_identifiers"."normalized_value")) > 0)
);
--> statement-breakpoint
CREATE TABLE "party_roles" (
	"organization_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"role" "party_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_roles_pk" PRIMARY KEY("organization_id","party_id","role")
);
--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_addresses" ADD CONSTRAINT "party_addresses_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_contact_channels" ADD CONSTRAINT "party_contact_channels_contact_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."party_contacts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_contacts" ADD CONSTRAINT "party_contacts_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_identifiers" ADD CONSTRAINT "party_identifiers_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_roles" ADD CONSTRAINT "party_roles_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parties_organization_status_name_id_idx" ON "parties" USING btree ("organization_id","status","display_name","id");--> statement-breakpoint
CREATE INDEX "party_addresses_org_party_idx" ON "party_addresses" USING btree ("organization_id","party_id");--> statement-breakpoint
CREATE INDEX "party_contact_channels_org_contact_idx" ON "party_contact_channels" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "party_contacts_org_party_idx" ON "party_contacts" USING btree ("organization_id","party_id");--> statement-breakpoint
CREATE INDEX "party_identifiers_org_type_normalized_idx" ON "party_identifiers" USING btree ("organization_id","type","normalized_value");--> statement-breakpoint
CREATE INDEX "party_identifiers_org_party_idx" ON "party_identifiers" USING btree ("organization_id","party_id");
--> statement-breakpoint
INSERT INTO permissions (code) VALUES
    ('parties.read'), ('parties.write'), ('parties.archive'),
    ('assets.read'), ('assets.write'), ('assets.manage_relationships'),
    ('assets.archive'), ('registry.import');
--> statement-breakpoint
INSERT INTO organization_role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM organization_roles role CROSS JOIN permissions permission
WHERE permission.code IN (
    'parties.read', 'parties.write', 'parties.archive',
    'assets.read', 'assets.write', 'assets.manage_relationships',
    'assets.archive', 'registry.import'
)
AND (
    role.key IN ('owner', 'administrator')
    OR (role.key = 'member' AND permission.code IN (
        'parties.read', 'parties.write', 'assets.read', 'assets.write',
        'assets.manage_relationships'
    ))
    OR (role.key = 'viewer' AND permission.code IN ('parties.read', 'assets.read'))
);
--> statement-breakpoint
REVOKE ALL ON TABLE parties, party_roles, party_identifiers,
    party_contacts, party_contact_channels, party_addresses FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE parties TO ardenfold_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE party_roles, party_identifiers,
    party_contacts, party_contact_channels, party_addresses TO ardenfold_runtime;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'parties', 'party_roles', 'party_identifiers',
        'party_contacts', 'party_contact_channels', 'party_addresses'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format($policy$
            CREATE POLICY %I ON %I FOR SELECT TO ardenfold_runtime USING (
                current_setting('ardenfold.context_kind', true) = 'tenant'
                AND organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
                AND current_setting('ardenfold.permission.parties.read', true) = 'true'
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
                AND current_setting('ardenfold.permission.parties.write', true) = 'true'
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
                AND current_setting('ardenfold.permission.parties.write', true) = 'true'
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
