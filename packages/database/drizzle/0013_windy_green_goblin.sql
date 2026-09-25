CREATE TYPE "public"."quote_revision_status" AS ENUM('draft', 'offered', 'discarded', 'accepted', 'rejected', 'expired', 'superseded', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('open', 'accepted', 'closed');--> statement-breakpoint
CREATE TABLE "quote_line_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"currency_scale" integer NOT NULL,
	"position" integer NOT NULL,
	"label" varchar(120) NOT NULL,
	"amount" numeric NOT NULL,
	CONSTRAINT "quote_line_adjustments_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "quote_line_adjustments_position_unique" UNIQUE("organization_id","line_id","position"),
	CONSTRAINT "quote_line_adjustments_position_positive" CHECK ("quote_line_adjustments"."position" > 0),
	CONSTRAINT "quote_line_adjustments_label_not_blank" CHECK (char_length(btrim("quote_line_adjustments"."label")) > 0),
	CONSTRAINT "quote_line_adjustments_amount_scale" CHECK ("quote_line_adjustments"."amount" = round("quote_line_adjustments"."amount", "quote_line_adjustments"."currency_scale") AND abs("quote_line_adjustments"."amount") < 1000000000000000000)
);
--> statement-breakpoint
CREATE TABLE "quote_revision_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"currency_scale" integer NOT NULL,
	"position" integer NOT NULL,
	"label" varchar(120) NOT NULL,
	"amount" numeric NOT NULL,
	CONSTRAINT "quote_revision_adjustments_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "quote_revision_adjustments_position_unique" UNIQUE("organization_id","revision_id","position"),
	CONSTRAINT "quote_revision_adjustments_position_positive" CHECK ("quote_revision_adjustments"."position" > 0),
	CONSTRAINT "quote_revision_adjustments_label_not_blank" CHECK (char_length(btrim("quote_revision_adjustments"."label")) > 0),
	CONSTRAINT "quote_revision_adjustments_amount_scale" CHECK ("quote_revision_adjustments"."amount" = round("quote_revision_adjustments"."amount", "quote_revision_adjustments"."currency_scale") AND abs("quote_revision_adjustments"."amount") < 1000000000000000000)
);
--> statement-breakpoint
CREATE TABLE "quote_revision_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"currency_scale" integer NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" varchar(40) NOT NULL,
	"unit_price" numeric NOT NULL,
	"rounded_base_amount" numeric,
	"total_amount" numeric,
	"party_id" uuid,
	"asset_id" uuid,
	"party_snapshot" jsonb,
	"asset_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_revision_lines_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "quote_revision_lines_org_revision_id_unique" UNIQUE("organization_id","revision_id","id"),
	CONSTRAINT "quote_revision_lines_position_unique" UNIQUE("organization_id","revision_id","position"),
	CONSTRAINT "quote_revision_lines_position_positive" CHECK ("quote_revision_lines"."position" > 0),
	CONSTRAINT "quote_revision_lines_description_not_blank" CHECK (char_length(btrim("quote_revision_lines"."description")) > 0),
	CONSTRAINT "quote_revision_lines_unit_not_blank" CHECK (char_length(btrim("quote_revision_lines"."unit")) > 0),
	CONSTRAINT "quote_revision_lines_quantity_precision" CHECK ("quote_revision_lines"."quantity" > 0 AND "quote_revision_lines"."quantity" < 1000000000000 AND "quote_revision_lines"."quantity" = round("quote_revision_lines"."quantity", 6)),
	CONSTRAINT "quote_revision_lines_unit_price_precision" CHECK ("quote_revision_lines"."unit_price" >= 0 AND "quote_revision_lines"."unit_price" < 1000000000000 AND "quote_revision_lines"."unit_price" = round("quote_revision_lines"."unit_price", 6)),
	CONSTRAINT "quote_revision_lines_amount_scale" CHECK (("quote_revision_lines"."rounded_base_amount" IS NULL OR ("quote_revision_lines"."rounded_base_amount" = round("quote_revision_lines"."rounded_base_amount", "quote_revision_lines"."currency_scale") AND "quote_revision_lines"."rounded_base_amount" >= 0 AND "quote_revision_lines"."rounded_base_amount" < 1000000000000000000)) AND ("quote_revision_lines"."total_amount" IS NULL OR ("quote_revision_lines"."total_amount" = round("quote_revision_lines"."total_amount", "quote_revision_lines"."currency_scale") AND "quote_revision_lines"."total_amount" >= 0 AND "quote_revision_lines"."total_amount" < 1000000000000000000))),
	CONSTRAINT "quote_revision_lines_snapshot_objects" CHECK (("quote_revision_lines"."party_snapshot" IS NULL OR jsonb_typeof("quote_revision_lines"."party_snapshot") = 'object') AND ("quote_revision_lines"."asset_snapshot" IS NULL OR jsonb_typeof("quote_revision_lines"."asset_snapshot") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "quote_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"source_revision_id" uuid,
	"superseded_by_revision_id" uuid,
	"status" "quote_revision_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source_request_version" integer NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"currency_scale" integer NOT NULL,
	"calculation_policy_version" integer DEFAULT 1 NOT NULL,
	"payment_terms" text,
	"delivery_terms" text,
	"service_location" text,
	"intake_expectations" text,
	"exclusions" text,
	"valid_until" timestamp with time zone,
	"customer_snapshot" jsonb,
	"issued_at" timestamp with time zone,
	"issue_channel" varchar(80),
	"issued_by_user_id" uuid,
	"subtotal" numeric,
	"total" numeric,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_revisions_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "quote_revisions_org_quote_id_unique" UNIQUE("organization_id","quote_id","id"),
	CONSTRAINT "quote_revisions_quote_number_unique" UNIQUE("organization_id","quote_id","revision_number"),
	CONSTRAINT "quote_revisions_org_id_scale_unique" UNIQUE("organization_id","id","currency_scale"),
	CONSTRAINT "quote_revisions_number_positive" CHECK ("quote_revisions"."revision_number" > 0),
	CONSTRAINT "quote_revisions_version_positive" CHECK ("quote_revisions"."version" > 0),
	CONSTRAINT "quote_revisions_request_version_positive" CHECK ("quote_revisions"."source_request_version" > 0),
	CONSTRAINT "quote_revisions_currency_code" CHECK ("quote_revisions"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "quote_revisions_currency_scale" CHECK ("quote_revisions"."currency_scale" BETWEEN 0 AND 4),
	CONSTRAINT "quote_revisions_calculation_policy" CHECK ("quote_revisions"."calculation_policy_version" = 1),
	CONSTRAINT "quote_revisions_customer_snapshot_object" CHECK ("quote_revisions"."customer_snapshot" IS NULL OR jsonb_typeof("quote_revisions"."customer_snapshot") = 'object'),
	CONSTRAINT "quote_revisions_issued_metadata" CHECK (("quote_revisions"."status" IN ('draft', 'discarded') AND "quote_revisions"."issued_at" IS NULL AND "quote_revisions"."issue_channel" IS NULL AND "quote_revisions"."issued_by_user_id" IS NULL) OR ("quote_revisions"."status" NOT IN ('draft', 'discarded') AND "quote_revisions"."issued_at" IS NOT NULL AND "quote_revisions"."issue_channel" IS NOT NULL AND "quote_revisions"."issued_by_user_id" IS NOT NULL AND "quote_revisions"."customer_snapshot" IS NOT NULL AND "quote_revisions"."subtotal" IS NOT NULL AND "quote_revisions"."total" IS NOT NULL)),
	CONSTRAINT "quote_revisions_supersession_state" CHECK (("quote_revisions"."status" = 'superseded') = ("quote_revisions"."superseded_by_revision_id" IS NOT NULL)),
	CONSTRAINT "quote_revisions_totals_scale" CHECK (("quote_revisions"."subtotal" IS NULL OR ("quote_revisions"."subtotal" = round("quote_revisions"."subtotal", "quote_revisions"."currency_scale") AND "quote_revisions"."subtotal" >= 0 AND "quote_revisions"."subtotal" < 1000000000000000000)) AND ("quote_revisions"."total" IS NULL OR ("quote_revisions"."total" = round("quote_revisions"."total", "quote_revisions"."currency_scale") AND "quote_revisions"."total" >= 0 AND "quote_revisions"."total" < 1000000000000000000)))
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"customer_party_id" uuid NOT NULL,
	"reference" varchar(80) NOT NULL,
	"status" "quote_status" DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"next_revision_number" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "quotes_org_reference_unique" UNIQUE("organization_id","reference"),
	CONSTRAINT "quotes_reference_not_blank" CHECK (char_length(btrim("quotes"."reference")) > 0),
	CONSTRAINT "quotes_version_positive" CHECK ("quotes"."version" > 0),
	CONSTRAINT "quotes_next_revision_positive" CHECK ("quotes"."next_revision_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "quote_line_adjustments" ADD CONSTRAINT "quote_line_adjustments_line_fk" FOREIGN KEY ("organization_id","revision_id","line_id") REFERENCES "public"."quote_revision_lines"("organization_id","revision_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line_adjustments" ADD CONSTRAINT "quote_line_adjustments_revision_scale_fk" FOREIGN KEY ("organization_id","revision_id","currency_scale") REFERENCES "public"."quote_revisions"("organization_id","id","currency_scale") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revision_adjustments" ADD CONSTRAINT "quote_revision_adjustments_revision_fk" FOREIGN KEY ("organization_id","revision_id","currency_scale") REFERENCES "public"."quote_revisions"("organization_id","id","currency_scale") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revision_lines" ADD CONSTRAINT "quote_revision_lines_revision_fk" FOREIGN KEY ("organization_id","revision_id","currency_scale") REFERENCES "public"."quote_revisions"("organization_id","id","currency_scale") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revision_lines" ADD CONSTRAINT "quote_revision_lines_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revision_lines" ADD CONSTRAINT "quote_revision_lines_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_quote_fk" FOREIGN KEY ("organization_id","quote_id") REFERENCES "public"."quotes"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_source_fk" FOREIGN KEY ("organization_id","quote_id","source_revision_id") REFERENCES "public"."quote_revisions"("organization_id","quote_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_superseded_by_fk" FOREIGN KEY ("organization_id","quote_id","superseded_by_revision_id") REFERENCES "public"."quote_revisions"("organization_id","quote_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_org_id_customer_unique" UNIQUE("organization_id","id","customer_party_id");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_request_fk" FOREIGN KEY ("organization_id","request_id","customer_party_id") REFERENCES "public"."service_requests"("organization_id","id","customer_party_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_revisions_one_draft_idx" ON "quote_revisions" USING btree ("organization_id","quote_id") WHERE "quote_revisions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "quote_revisions_one_offer_idx" ON "quote_revisions" USING btree ("organization_id","quote_id") WHERE "quote_revisions"."status" = 'offered';--> statement-breakpoint
CREATE INDEX "quote_revisions_org_quote_number_idx" ON "quote_revisions" USING btree ("organization_id","quote_id","revision_number" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "quotes_org_request_created_idx" ON "quotes" USING btree ("organization_id","request_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "quotes_org_status_created_idx" ON "quotes" USING btree ("organization_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
INSERT INTO permissions (code) VALUES ('quotations.read'), ('quotations.write');
--> statement-breakpoint
INSERT INTO organization_role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM organization_roles role CROSS JOIN permissions permission
WHERE permission.code IN ('quotations.read', 'quotations.write')
  AND (role.key IN ('owner', 'administrator', 'member')
       OR (role.key = 'viewer' AND permission.code = 'quotations.read'));
--> statement-breakpoint
REVOKE ALL ON TABLE quotes, quote_revisions, quote_revision_lines,
    quote_line_adjustments, quote_revision_adjustments FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE quotes, quote_revisions TO ardenfold_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE quote_revision_lines,
    quote_line_adjustments, quote_revision_adjustments TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_revisions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_revisions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_revision_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_revision_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_line_adjustments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_line_adjustments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_revision_adjustments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_revision_adjustments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY quotes_tenant_read ON quotes
FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY quotes_tenant_write ON quotes
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_revisions_tenant_read ON quote_revisions
FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_revisions_tenant_write ON quote_revisions
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_revision_lines_tenant_read ON quote_revision_lines
FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_revision_lines_tenant_write ON quote_revision_lines
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_line_adjustments_tenant_read ON quote_line_adjustments
FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_line_adjustments_tenant_write ON quote_line_adjustments
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_revision_adjustments_tenant_read ON quote_revision_adjustments
FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_revision_adjustments_tenant_write ON quote_revision_adjustments
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true');
--> statement-breakpoint
CREATE FUNCTION ardenfold_quote_write_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'open' OR NEW.version <> 1 OR NEW.next_revision_number <> 1
           OR NEW.created_by_user_id <> NEW.updated_by_user_id THEN
            RAISE EXCEPTION 'A quote must begin open at version 1' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
           OR NEW.request_id IS DISTINCT FROM OLD.request_id
           OR NEW.customer_party_id IS DISTINCT FROM OLD.customer_party_id
           OR NEW.reference IS DISTINCT FROM OLD.reference
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
            RAISE EXCEPTION 'Quote identity is immutable' USING ERRCODE = '23514';
        END IF;
        IF OLD.status = 'closed'
           OR (OLD.status = 'accepted' AND NEW.status NOT IN ('accepted', 'open'))
           OR (OLD.status = 'open' AND NEW.status NOT IN ('open', 'accepted', 'closed')) THEN
            RAISE EXCEPTION 'Invalid quote state transition' USING ERRCODE = '23514';
        END IF;
        IF NEW.version <> OLD.version + 1
           OR NEW.next_revision_number NOT IN (OLD.next_revision_number, OLD.next_revision_number + 1)
           OR (NEW.next_revision_number > OLD.next_revision_number AND NEW.status = 'closed') THEN
            RAISE EXCEPTION 'Quote version or revision counter is invalid' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER quote_write_guard
BEFORE INSERT OR UPDATE ON quotes
FOR EACH ROW EXECUTE FUNCTION ardenfold_quote_write_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_quote_revision_sequence_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    revision_count bigint;
    current_next_number integer;
BEGIN
    SELECT next_revision_number INTO current_next_number FROM quotes
    WHERE organization_id = NEW.organization_id AND id = NEW.id;
    SELECT count(*) INTO revision_count FROM quote_revisions
    WHERE organization_id = NEW.organization_id AND quote_id = NEW.id;
    IF revision_count <> current_next_number - 1 THEN
        RAISE EXCEPTION 'Quote revision sequence has a gap' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER quote_revision_sequence_guard
AFTER INSERT OR UPDATE ON quotes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ardenfold_quote_revision_sequence_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_quote_revision_content_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    parent_quote quotes%ROWTYPE;
    source_number integer;
    successor_number integer;
    line_row quote_revision_lines%ROWTYPE;
    line_adjustments numeric;
    revision_adjustments numeric;
    computed_subtotal numeric := 0;
    line_count integer := 0;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT * INTO parent_quote FROM quotes
        WHERE organization_id = NEW.organization_id AND id = NEW.quote_id FOR UPDATE;
        IF NOT FOUND OR parent_quote.status = 'closed' OR NEW.status <> 'draft'
           OR NEW.version <> 1 OR NEW.revision_number <> parent_quote.next_revision_number - 1 THEN
            RAISE EXCEPTION 'Invalid new quote revision' USING ERRCODE = '23514';
        END IF;
        IF NEW.revision_number = 1 AND NEW.source_revision_id IS NOT NULL
           OR NEW.revision_number > 1 AND NEW.source_revision_id IS NULL THEN
            RAISE EXCEPTION 'Revision source is invalid' USING ERRCODE = '23514';
        END IF;
        IF NEW.source_revision_id IS NOT NULL THEN
            SELECT revision_number INTO source_number FROM quote_revisions
            WHERE organization_id = NEW.organization_id AND quote_id = NEW.quote_id
              AND id = NEW.source_revision_id;
            IF source_number IS NULL OR source_number >= NEW.revision_number THEN
                RAISE EXCEPTION 'Revision source must precede the new revision' USING ERRCODE = '23514';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.quote_id IS DISTINCT FROM OLD.quote_id
       OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
       OR NEW.source_revision_id IS DISTINCT FROM OLD.source_revision_id
       OR NEW.source_request_version IS DISTINCT FROM OLD.source_request_version
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'Revision identity or version is invalid' USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'draft' THEN
        IF NEW.status NOT IN ('draft', 'offered', 'discarded') THEN
            RAISE EXCEPTION 'Invalid draft transition' USING ERRCODE = '23514';
        END IF;
    ELSIF OLD.status = 'offered' THEN
        IF NEW.status NOT IN ('accepted', 'rejected', 'expired', 'superseded', 'withdrawn')
           OR to_jsonb(NEW) - ARRAY['status','version','updated_at','superseded_by_revision_id']
              <> to_jsonb(OLD) - ARRAY['status','version','updated_at','superseded_by_revision_id'] THEN
            RAISE EXCEPTION 'Issued revision contents are immutable' USING ERRCODE = '23514';
        END IF;
    ELSE
        RAISE EXCEPTION 'Terminal revision is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'superseded' THEN
        SELECT revision_number INTO successor_number FROM quote_revisions
        WHERE organization_id = NEW.organization_id AND quote_id = NEW.quote_id
          AND id = NEW.superseded_by_revision_id;
        IF successor_number IS NULL OR successor_number <= NEW.revision_number THEN
            RAISE EXCEPTION 'Superseding revision must be newer' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF OLD.status = 'draft' AND NEW.status = 'offered' THEN
        IF NEW.issued_at IS NULL OR NEW.issue_channel IS NULL
           OR char_length(btrim(NEW.issue_channel)) = 0
           OR NEW.issued_by_user_id IS NULL OR NEW.customer_snapshot IS NULL
           OR NEW.valid_until IS NOT NULL AND NEW.valid_until <= NEW.issued_at THEN
            RAISE EXCEPTION 'Issued revision requires a complete offer snapshot' USING ERRCODE = '23514';
        END IF;
        FOR line_row IN SELECT * FROM quote_revision_lines
            WHERE organization_id = NEW.organization_id AND revision_id = NEW.id
        LOOP
            line_count := line_count + 1;
            SELECT coalesce(sum(amount), 0) INTO line_adjustments
            FROM quote_line_adjustments
            WHERE organization_id = NEW.organization_id AND revision_id = NEW.id
              AND line_id = line_row.id;
            IF line_row.rounded_base_amount IS DISTINCT FROM
                   round(line_row.quantity * line_row.unit_price, NEW.currency_scale)
               OR line_row.total_amount IS DISTINCT FROM
                   line_row.rounded_base_amount + line_adjustments
               OR line_row.total_amount < 0
               OR line_row.asset_id IS NOT NULL AND line_row.asset_snapshot IS NULL
               OR line_row.party_id IS NOT NULL AND line_row.party_snapshot IS NULL THEN
                RAISE EXCEPTION 'Issued line amount or reference snapshot is invalid'
                    USING ERRCODE = '23514';
            END IF;
            computed_subtotal := computed_subtotal + line_row.total_amount;
        END LOOP;
        SELECT coalesce(sum(amount), 0) INTO revision_adjustments
        FROM quote_revision_adjustments
        WHERE organization_id = NEW.organization_id AND revision_id = NEW.id;
        IF line_count = 0 OR NEW.subtotal IS DISTINCT FROM computed_subtotal
           OR NEW.total IS DISTINCT FROM computed_subtotal + revision_adjustments
           OR NEW.total < 0 THEN
            RAISE EXCEPTION 'Issued revision totals are invalid' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER quote_revision_content_guard
BEFORE INSERT OR UPDATE ON quote_revisions
FOR EACH ROW EXECUTE FUNCTION ardenfold_quote_revision_content_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_quote_draft_child_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target_organization_id uuid;
    target_revision_id uuid;
    revision_status quote_revision_status;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_organization_id := OLD.organization_id;
        target_revision_id := OLD.revision_id;
    ELSE
        target_organization_id := NEW.organization_id;
        target_revision_id := NEW.revision_id;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
           OR NEW.revision_id IS DISTINCT FROM OLD.revision_id
           OR NEW.currency_scale IS DISTINCT FROM OLD.currency_scale
           OR (TG_TABLE_NAME = 'quote_revision_lines'
               AND to_jsonb(NEW)->'created_at' IS DISTINCT FROM to_jsonb(OLD)->'created_at')
           OR (TG_TABLE_NAME = 'quote_line_adjustments'
               AND to_jsonb(NEW)->'line_id' IS DISTINCT FROM to_jsonb(OLD)->'line_id') THEN
            RAISE EXCEPTION 'Quote line or adjustment identity is immutable'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    SELECT status INTO revision_status FROM quote_revisions
    WHERE organization_id = target_organization_id AND id = target_revision_id FOR UPDATE;
    IF revision_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'Only draft revision contents may change' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER quote_revision_lines_draft_guard
BEFORE INSERT OR UPDATE OR DELETE ON quote_revision_lines
FOR EACH ROW EXECUTE FUNCTION ardenfold_quote_draft_child_guard();
--> statement-breakpoint
CREATE TRIGGER quote_line_adjustments_draft_guard
BEFORE INSERT OR UPDATE OR DELETE ON quote_line_adjustments
FOR EACH ROW EXECUTE FUNCTION ardenfold_quote_draft_child_guard();
--> statement-breakpoint
CREATE TRIGGER quote_revision_adjustments_draft_guard
BEFORE INSERT OR UPDATE OR DELETE ON quote_revision_adjustments
FOR EACH ROW EXECUTE FUNCTION ardenfold_quote_draft_child_guard();
