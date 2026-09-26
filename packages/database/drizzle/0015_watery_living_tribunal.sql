CREATE TYPE "public"."work_item_asset_requirement" AS ENUM('required', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."work_item_service_mode" AS ENUM('physical_intake', 'no_intake');--> statement-breakpoint
CREATE TYPE "public"."work_item_status" AS ENUM('planned', 'ready', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('planned', 'ready', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."receipt_correction_kind" AS ENUM('corrected', 'reconciled', 'voided');--> statement-breakpoint
CREATE TYPE "public"."receipt_custody_status" AS ENUM('not_required', 'pending', 'applied');--> statement-breakpoint
CREATE TABLE "work_item_history_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" varchar(80) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_history_org_item_version_unique" UNIQUE("organization_id","work_item_id","version"),
	CONSTRAINT "work_item_history_version_positive" CHECK ("work_item_history_entries"."version" > 0),
	CONSTRAINT "work_item_history_snapshot_object" CHECK (jsonb_typeof("work_item_history_entries"."snapshot") = 'object'),
	CONSTRAINT "work_item_history_kind_not_blank" CHECK (char_length(btrim("work_item_history_entries"."kind")) > 0)
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"accepted_revision_id" uuid NOT NULL,
	"source_revision_line_id" uuid NOT NULL,
	"item_number" integer NOT NULL,
	"replaces_item_id" uuid,
	"scope_description" text NOT NULL,
	"allocated_quantity" numeric NOT NULL,
	"allocated_unit" varchar(40) NOT NULL,
	"party_id" uuid,
	"asset_requirement" "work_item_asset_requirement" NOT NULL,
	"asset_id" uuid,
	"unresolved_asset_description" text,
	"service_mode" "work_item_service_mode" NOT NULL,
	"status" "work_item_status" DEFAULT 'planned' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"preparation_notes" text,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"cancelled_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	CONSTRAINT "work_items_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "work_items_org_order_id_unique" UNIQUE("organization_id","work_order_id","id"),
	CONSTRAINT "work_items_org_order_number_unique" UNIQUE("organization_id","work_order_id","item_number"),
	CONSTRAINT "work_items_number_positive" CHECK ("work_items"."item_number" > 0),
	CONSTRAINT "work_items_version_positive" CHECK ("work_items"."version" > 0),
	CONSTRAINT "work_items_scope_not_blank" CHECK (char_length(btrim("work_items"."scope_description")) > 0),
	CONSTRAINT "work_items_unit_not_blank" CHECK (char_length(btrim("work_items"."allocated_unit")) > 0),
	CONSTRAINT "work_items_quantity_precision" CHECK ("work_items"."allocated_quantity" > 0 AND "work_items"."allocated_quantity" < 1000000000000 AND "work_items"."allocated_quantity" = round("work_items"."allocated_quantity", 6)),
	CONSTRAINT "work_items_asset_state" CHECK (("work_items"."asset_requirement" = 'not_applicable' AND "work_items"."asset_id" IS NULL AND "work_items"."unresolved_asset_description" IS NULL AND "work_items"."service_mode" = 'no_intake') OR ("work_items"."asset_requirement" = 'required' AND ("work_items"."asset_id" IS NOT NULL OR ("work_items"."unresolved_asset_description" IS NOT NULL AND char_length(btrim("work_items"."unresolved_asset_description")) > 0)))),
	CONSTRAINT "work_items_unresolved_not_blank" CHECK ("work_items"."unresolved_asset_description" IS NULL OR char_length(btrim("work_items"."unresolved_asset_description")) > 0),
	CONSTRAINT "work_items_cancellation_state" CHECK (("work_items"."status" = 'cancelled' AND "work_items"."cancelled_at" IS NOT NULL AND "work_items"."cancelled_by_user_id" IS NOT NULL AND "work_items"."cancellation_reason" IS NOT NULL AND char_length(btrim("work_items"."cancellation_reason")) > 0) OR ("work_items"."status" <> 'cancelled' AND "work_items"."cancelled_at" IS NULL AND "work_items"."cancelled_by_user_id" IS NULL AND "work_items"."cancellation_reason" IS NULL)),
	CONSTRAINT "work_items_no_self_replacement" CHECK ("work_items"."replaces_item_id" IS NULL OR "work_items"."replaces_item_id" <> "work_items"."id")
);
--> statement-breakpoint
CREATE TABLE "work_order_history_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" varchar(80) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_order_history_org_order_version_unique" UNIQUE("organization_id","work_order_id","version"),
	CONSTRAINT "work_order_history_version_positive" CHECK ("work_order_history_entries"."version" > 0),
	CONSTRAINT "work_order_history_snapshot_object" CHECK (jsonb_typeof("work_order_history_entries"."snapshot") = 'object'),
	CONSTRAINT "work_order_history_kind_not_blank" CHECK (char_length(btrim("work_order_history_entries"."kind")) > 0)
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"customer_party_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"acceptance_id" uuid NOT NULL,
	"accepted_revision_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"reference" varchar(80) NOT NULL,
	"status" "work_order_status" DEFAULT 'planned' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"next_item_number" integer DEFAULT 1 NOT NULL,
	"initial_allocation_snapshot" jsonb NOT NULL,
	"preparation_notes" text,
	"idempotency_key" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"authorized_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"cancelled_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	CONSTRAINT "work_orders_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "work_orders_org_id_revision_unique" UNIQUE("organization_id","id","accepted_revision_id"),
	CONSTRAINT "work_orders_org_reference_unique" UNIQUE("organization_id","reference"),
	CONSTRAINT "work_orders_org_acceptance_unique" UNIQUE("organization_id","acceptance_id"),
	CONSTRAINT "work_orders_org_idempotency_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "work_orders_reference_not_blank" CHECK (char_length(btrim("work_orders"."reference")) > 0),
	CONSTRAINT "work_orders_version_positive" CHECK ("work_orders"."version" > 0),
	CONSTRAINT "work_orders_next_item_positive" CHECK ("work_orders"."next_item_number" > 0),
	CONSTRAINT "work_orders_payload_hash" CHECK ("work_orders"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "work_orders_allocation_snapshot_object" CHECK (jsonb_typeof("work_orders"."initial_allocation_snapshot") = 'object'),
	CONSTRAINT "work_orders_cancellation_state" CHECK (("work_orders"."status" = 'cancelled' AND "work_orders"."cancelled_at" IS NOT NULL AND "work_orders"."cancelled_by_user_id" IS NOT NULL AND "work_orders"."cancellation_reason" IS NOT NULL AND char_length(btrim("work_orders"."cancellation_reason")) > 0) OR ("work_orders"."status" <> 'cancelled' AND "work_orders"."cancelled_at" IS NULL AND "work_orders"."cancelled_by_user_id" IS NULL AND "work_orders"."cancellation_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "receipt_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" "receipt_correction_kind" NOT NULL,
	"before_snapshot" jsonb NOT NULL,
	"after_snapshot" jsonb NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"corrected_by_user_id" uuid NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_corrections_org_receipt_version_unique" UNIQUE("organization_id","receipt_id","version"),
	CONSTRAINT "receipt_corrections_org_idempotency_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "receipt_corrections_version" CHECK ("receipt_corrections"."version" > 1),
	CONSTRAINT "receipt_corrections_reason_not_blank" CHECK (char_length(btrim("receipt_corrections"."reason")) > 0),
	CONSTRAINT "receipt_corrections_hash" CHECK ("receipt_corrections"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "receipt_corrections_snapshots_object" CHECK (jsonb_typeof("receipt_corrections"."before_snapshot") = 'object' AND jsonb_typeof("receipt_corrections"."after_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "receipt_items" (
	"organization_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	CONSTRAINT "receipt_items_pk" PRIMARY KEY("organization_id","receipt_id","work_item_id")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"asset_id" uuid,
	"intake_description" text NOT NULL,
	"observed_condition" text NOT NULL,
	"accessories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"responsible_actor_name" varchar(200) NOT NULL,
	"responsible_party_id" uuid,
	"custody_status" "receipt_custody_status" DEFAULT 'not_required' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason" text,
	CONSTRAINT "receipts_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "receipts_org_order_id_unique" UNIQUE("organization_id","work_order_id","id"),
	CONSTRAINT "receipts_org_idempotency_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "receipts_version_positive" CHECK ("receipts"."version" > 0),
	CONSTRAINT "receipts_payload_hash" CHECK ("receipts"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "receipts_description_not_blank" CHECK (char_length(btrim("receipts"."intake_description")) > 0),
	CONSTRAINT "receipts_condition_not_blank" CHECK (char_length(btrim("receipts"."observed_condition")) > 0),
	CONSTRAINT "receipts_actor_not_blank" CHECK (char_length(btrim("receipts"."responsible_actor_name")) > 0),
	CONSTRAINT "receipts_accessories_array" CHECK (jsonb_typeof("receipts"."accessories") = 'array'),
	CONSTRAINT "receipts_custody_resolution" CHECK ("receipts"."custody_status" <> 'applied' OR "receipts"."asset_id" IS NOT NULL),
	CONSTRAINT "receipts_void_state" CHECK (("receipts"."voided_at" IS NULL AND "receipts"."voided_by_user_id" IS NULL AND "receipts"."void_reason" IS NULL) OR ("receipts"."voided_at" IS NOT NULL AND "receipts"."voided_by_user_id" IS NOT NULL AND "receipts"."void_reason" IS NOT NULL AND char_length(btrim("receipts"."void_reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "quote_acceptances" ADD CONSTRAINT "quote_acceptances_org_basis_unique" UNIQUE("organization_id","quote_id","id","revision_id");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_org_basis_unique" UNIQUE("organization_id","id","request_id","customer_party_id");--> statement-breakpoint
ALTER TABLE "work_item_history_entries" ADD CONSTRAINT "work_item_history_entries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_history_entries" ADD CONSTRAINT "work_item_history_item_fk" FOREIGN KEY ("organization_id","work_order_id","work_item_id") REFERENCES "public"."work_items"("organization_id","work_order_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_order_revision_fk" FOREIGN KEY ("organization_id","work_order_id","accepted_revision_id") REFERENCES "public"."work_orders"("organization_id","id","accepted_revision_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_accepted_line_fk" FOREIGN KEY ("organization_id","accepted_revision_id","source_revision_line_id") REFERENCES "public"."quote_revision_lines"("organization_id","revision_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_replaces_fk" FOREIGN KEY ("organization_id","work_order_id","replaces_item_id") REFERENCES "public"."work_items"("organization_id","work_order_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_party_fk" FOREIGN KEY ("organization_id","party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_history_entries" ADD CONSTRAINT "work_order_history_entries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_history_entries" ADD CONSTRAINT "work_order_history_order_fk" FOREIGN KEY ("organization_id","work_order_id") REFERENCES "public"."work_orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_authorized_by_user_id_users_id_fk" FOREIGN KEY ("authorized_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_request_fk" FOREIGN KEY ("organization_id","request_id","customer_party_id") REFERENCES "public"."service_requests"("organization_id","id","customer_party_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_quote_basis_fk" FOREIGN KEY ("organization_id","quote_id","request_id","customer_party_id") REFERENCES "public"."quotes"("organization_id","id","request_id","customer_party_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_acceptance_basis_fk" FOREIGN KEY ("organization_id","quote_id","acceptance_id","accepted_revision_id") REFERENCES "public"."quote_acceptances"("organization_id","quote_id","id","revision_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_revision_fk" FOREIGN KEY ("organization_id","quote_id","accepted_revision_id") REFERENCES "public"."quote_revisions"("organization_id","quote_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_site_fk" FOREIGN KEY ("organization_id","site_id") REFERENCES "public"."organization_sites"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_corrections" ADD CONSTRAINT "receipt_corrections_corrected_by_user_id_users_id_fk" FOREIGN KEY ("corrected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_corrections" ADD CONSTRAINT "receipt_corrections_receipt_fk" FOREIGN KEY ("organization_id","work_order_id","receipt_id") REFERENCES "public"."receipts"("organization_id","work_order_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_fk" FOREIGN KEY ("organization_id","work_order_id","receipt_id") REFERENCES "public"."receipts"("organization_id","work_order_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_work_item_fk" FOREIGN KEY ("organization_id","work_order_id","work_item_id") REFERENCES "public"."work_items"("organization_id","work_order_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_fk" FOREIGN KEY ("organization_id","work_order_id") REFERENCES "public"."work_orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_responsible_party_fk" FOREIGN KEY ("organization_id","responsible_party_id") REFERENCES "public"."parties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_items_org_order_status_number_idx" ON "work_items" USING btree ("organization_id","work_order_id","status","item_number");--> statement-breakpoint
CREATE INDEX "work_items_org_asset_status_idx" ON "work_items" USING btree ("organization_id","asset_id","status");--> statement-breakpoint
CREATE INDEX "work_orders_org_status_created_idx" ON "work_orders" USING btree ("organization_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_orders_org_request_created_idx" ON "work_orders" USING btree ("organization_id","request_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_orders_org_site_status_idx" ON "work_orders" USING btree ("organization_id","site_id","status");--> statement-breakpoint
CREATE INDEX "receipt_items_org_item_idx" ON "receipt_items" USING btree ("organization_id","work_item_id");--> statement-breakpoint
CREATE INDEX "receipts_org_order_received_idx" ON "receipts" USING btree ("organization_id","work_order_id","received_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "receipts_org_asset_received_idx" ON "receipts" USING btree ("organization_id","asset_id","received_at" DESC NULLS LAST);--> statement-breakpoint

--> statement-breakpoint
REVOKE ALL ON TABLE work_orders, work_items, work_order_history_entries, work_item_history_entries, receipts, receipt_items, receipt_corrections FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE work_orders TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE work_orders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY work_orders_tenant_read ON work_orders FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.work_orders.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY work_orders_tenant_write ON work_orders FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.work_orders.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.work_orders.write', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE work_items TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE work_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY work_items_tenant_read ON work_items FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.work_orders.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY work_items_tenant_write ON work_items FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.work_orders.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.work_orders.write', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE work_order_history_entries TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE work_order_history_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE work_order_history_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY work_order_history_entries_tenant_read ON work_order_history_entries FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.work_orders.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY work_order_history_entries_tenant_write ON work_order_history_entries FOR INSERT TO ardenfold_runtime
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.work_orders.write', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE work_item_history_entries TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE work_item_history_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE work_item_history_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY work_item_history_entries_tenant_read ON work_item_history_entries FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.work_orders.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY work_item_history_entries_tenant_write ON work_item_history_entries FOR INSERT TO ardenfold_runtime
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.work_orders.write', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE receipts TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE receipts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY receipts_tenant_read ON receipts FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.receipts.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY receipts_tenant_write ON receipts FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.receipts.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.receipts.write', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE receipt_items TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE receipt_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY receipt_items_tenant_read ON receipt_items FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.receipts.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY receipt_items_tenant_write ON receipt_items FOR INSERT TO ardenfold_runtime
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.receipts.write', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE receipt_corrections TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE receipt_corrections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE receipt_corrections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY receipt_corrections_tenant_read ON receipt_corrections FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.receipts.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY receipt_corrections_tenant_write ON receipt_corrections FOR INSERT TO ardenfold_runtime
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.receipts.write', true) = 'true');
--> statement-breakpoint
CREATE FUNCTION ardenfold_work_order_basis_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    basis_valid boolean;
BEGIN
    SELECT q.status = 'accepted' AND a.withdrawn_at IS NULL
           AND r.status = 'accepted' AND sr.status = 'active'
           AND s.is_active AND p.archived_at IS NULL
      INTO basis_valid
      FROM quotes q
      JOIN quote_acceptances a ON a.organization_id = q.organization_id
                              AND a.quote_id = q.id AND a.id = NEW.acceptance_id
      JOIN quote_revisions r ON r.organization_id = q.organization_id
                            AND r.quote_id = q.id AND r.id = NEW.accepted_revision_id
      JOIN service_requests sr ON sr.organization_id = q.organization_id AND sr.id = q.request_id
      JOIN organization_sites s ON s.organization_id = q.organization_id AND s.id = NEW.site_id
      JOIN parties p ON p.organization_id = q.organization_id AND p.id = q.customer_party_id
     WHERE q.organization_id = NEW.organization_id AND q.id = NEW.quote_id
       AND q.request_id = NEW.request_id AND q.customer_party_id = NEW.customer_party_id
       AND a.revision_id = NEW.accepted_revision_id;
    IF basis_valid IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Work authorization requires an active accepted commercial basis'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_orders_basis_guard BEFORE INSERT ON work_orders
FOR EACH ROW EXECUTE FUNCTION ardenfold_work_order_basis_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_work_order_history_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Operational records cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'cancelled' OR NEW.version <> OLD.version + 1
           OR (to_jsonb(NEW) - ARRAY['status','version','next_item_number','preparation_notes',
                                      'updated_by_user_id','updated_at','cancelled_by_user_id',
                                      'cancelled_at','cancellation_reason'])
              <> (to_jsonb(OLD) - ARRAY['status','version','next_item_number','preparation_notes',
                                      'updated_by_user_id','updated_at','cancelled_by_user_id',
                                      'cancelled_at','cancellation_reason']) THEN
            RAISE EXCEPTION 'Work order basis is immutable and updates require the next version'
                USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.version <> 1 OR NEW.status <> 'planned' THEN
        RAISE EXCEPTION 'Work order must start planned at version one' USING ERRCODE = '23514';
    END IF;
    INSERT INTO work_order_history_entries
        (organization_id, work_order_id, version, kind, snapshot, reason, recorded_by_user_id)
    VALUES (NEW.organization_id, NEW.id, NEW.version,
            CASE WHEN TG_OP = 'INSERT' THEN 'authorized'
                 WHEN NEW.status = 'cancelled' THEN 'cancelled' ELSE 'prepared' END,
            to_jsonb(NEW), NEW.cancellation_reason, NEW.updated_by_user_id);
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_orders_history AFTER INSERT OR UPDATE OR DELETE ON work_orders
FOR EACH ROW EXECUTE FUNCTION ardenfold_work_order_history_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_work_item_history_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Operational records cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'cancelled' OR NEW.version <> OLD.version + 1
           OR (to_jsonb(NEW) - ARRAY['status','version','scope_description',
                                      'allocated_quantity','allocated_unit','party_id','asset_id',
                                      'unresolved_asset_description','service_mode','preparation_notes',
                                      'updated_by_user_id','updated_at','cancelled_by_user_id',
                                      'cancelled_at','cancellation_reason'])
              <> (to_jsonb(OLD) - ARRAY['status','version','scope_description',
                                      'allocated_quantity','allocated_unit','party_id','asset_id',
                                      'unresolved_asset_description','service_mode','preparation_notes',
                                      'updated_by_user_id','updated_at','cancelled_by_user_id',
                                      'cancelled_at','cancellation_reason']) THEN
            RAISE EXCEPTION 'Work item source is immutable and updates require the next version'
                USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.version <> 1 OR NEW.status <> 'planned' THEN
        RAISE EXCEPTION 'Work item must start planned at version one' USING ERRCODE = '23514';
    END IF;
    INSERT INTO work_item_history_entries
        (organization_id, work_order_id, work_item_id, version, kind, snapshot, reason, recorded_by_user_id)
    VALUES (NEW.organization_id, NEW.work_order_id, NEW.id, NEW.version,
            CASE WHEN TG_OP = 'INSERT' THEN 'allocated'
                 WHEN NEW.status = 'cancelled' THEN 'cancelled' ELSE 'prepared' END,
            to_jsonb(NEW), NEW.cancellation_reason, NEW.updated_by_user_id);
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_items_history AFTER INSERT OR UPDATE OR DELETE ON work_items
FOR EACH ROW EXECUTE FUNCTION ardenfold_work_item_history_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_operational_history_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Operational history is append-only' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_order_history_append_only BEFORE UPDATE OR DELETE ON work_order_history_entries
FOR EACH ROW EXECUTE FUNCTION ardenfold_operational_history_append_only();
--> statement-breakpoint
CREATE TRIGGER work_item_history_append_only BEFORE UPDATE OR DELETE ON work_item_history_entries
FOR EACH ROW EXECUTE FUNCTION ardenfold_operational_history_append_only();
--> statement-breakpoint
CREATE TRIGGER receipt_corrections_append_only BEFORE UPDATE OR DELETE ON receipt_corrections
FOR EACH ROW EXECUTE FUNCTION ardenfold_operational_history_append_only();
--> statement-breakpoint
CREATE TRIGGER receipt_items_append_only BEFORE UPDATE OR DELETE ON receipt_items
FOR EACH ROW EXECUTE FUNCTION ardenfold_operational_history_append_only();
--> statement-breakpoint
CREATE FUNCTION ardenfold_receipt_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Receipts cannot be deleted' USING ERRCODE = '23514';
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.version <> 1 OR NEW.voided_at IS NOT NULL OR NOT EXISTS (
            SELECT 1 FROM work_orders w
            WHERE w.organization_id = NEW.organization_id AND w.id = NEW.work_order_id
              AND w.status <> 'cancelled'
        ) THEN
            RAISE EXCEPTION 'Receipt requires an active order and version one'
                USING ERRCODE = '23514';
        END IF;
    ELSIF OLD.voided_at IS NOT NULL OR NEW.version <> OLD.version + 1
       OR (to_jsonb(NEW) - ARRAY['asset_id','intake_description','observed_condition',
                                  'accessories','received_at','responsible_actor_name',
                                  'responsible_party_id','custody_status','version',
                                  'updated_by_user_id','updated_at','voided_at',
                                  'voided_by_user_id','void_reason'])
          <> (to_jsonb(OLD) - ARRAY['asset_id','intake_description','observed_condition',
                                  'accessories','received_at','responsible_actor_name',
                                  'responsible_party_id','custody_status','version',
                                  'updated_by_user_id','updated_at','voided_at',
                                  'voided_by_user_id','void_reason']) THEN
        RAISE EXCEPTION 'Receipt identity is immutable and updates require the next version'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER receipts_guard BEFORE INSERT OR UPDATE OR DELETE ON receipts
FOR EACH ROW EXECUTE FUNCTION ardenfold_receipt_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_receipt_correction_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    correction receipt_corrections%ROWTYPE;
    receipt_row receipts%ROWTYPE;
BEGIN
    IF TG_TABLE_NAME = 'receipts' THEN
        SELECT * INTO correction FROM receipt_corrections
         WHERE organization_id = NEW.organization_id AND receipt_id = NEW.id
           AND version = NEW.version;
        IF NOT FOUND OR correction.before_snapshot <> to_jsonb(OLD)
           OR correction.after_snapshot <> to_jsonb(NEW)
           OR correction.corrected_by_user_id <> NEW.updated_by_user_id
           OR ((NEW.voided_at IS NOT NULL) <> (correction.kind = 'voided')) THEN
            RAISE EXCEPTION 'Receipt update requires a matching durable correction'
                USING ERRCODE = '23514';
        END IF;
    ELSE
        SELECT * INTO receipt_row FROM receipts
         WHERE organization_id = NEW.organization_id AND id = NEW.receipt_id;
        IF NOT FOUND OR receipt_row.version <> NEW.version
           OR NEW.after_snapshot <> to_jsonb(receipt_row) THEN
            RAISE EXCEPTION 'Receipt correction does not match the current receipt'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER receipts_correction_required
AFTER UPDATE ON receipts DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ardenfold_receipt_correction_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER receipt_correction_matches_current
AFTER INSERT ON receipt_corrections DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ardenfold_receipt_correction_integrity();
--> statement-breakpoint
CREATE FUNCTION ardenfold_receipt_item_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    receipt_asset uuid;
    item_asset uuid;
    item_mode work_item_service_mode;
    item_status work_item_status;
BEGIN
    SELECT asset_id INTO receipt_asset FROM receipts
     WHERE organization_id = NEW.organization_id AND work_order_id = NEW.work_order_id
       AND id = NEW.receipt_id;
    SELECT asset_id, service_mode, status INTO item_asset, item_mode, item_status FROM work_items
     WHERE organization_id = NEW.organization_id AND work_order_id = NEW.work_order_id
       AND id = NEW.work_item_id;
    IF item_mode IS DISTINCT FROM 'physical_intake' OR item_status = 'cancelled'
       OR (receipt_asset IS NULL AND item_asset IS NOT NULL)
       OR (receipt_asset IS NOT NULL AND item_asset IS NOT NULL AND receipt_asset <> item_asset) THEN
        RAISE EXCEPTION 'Receipt item must be physical intake for the same asset'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER receipt_items_scope_guard BEFORE INSERT ON receipt_items
FOR EACH ROW EXECUTE FUNCTION ardenfold_receipt_item_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_receipt_has_items()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM receipt_items ri
                   WHERE ri.organization_id = NEW.organization_id AND ri.receipt_id = NEW.id) THEN
        RAISE EXCEPTION 'Receipt requires a related work item' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER receipts_items_required
AFTER INSERT ON receipts DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ardenfold_receipt_has_items();
