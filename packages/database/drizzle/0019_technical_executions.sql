CREATE TYPE "public"."execution_revision_status" AS ENUM('draft', 'submitted', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."technical_execution_status" AS ENUM('active', 'abandoned');--> statement-breakpoint
CREATE TABLE "execution_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"decimal_value" numeric,
	"unit_code" varchar(40),
	"text_value" text,
	"observed_at" timestamp with time zone,
	CONSTRAINT "execution_conditions_org_revision_position_unique" UNIQUE("organization_id","revision_id","position"),
	CONSTRAINT "execution_conditions_position_positive" CHECK ("execution_conditions"."position" > 0),
	CONSTRAINT "execution_conditions_name_not_blank" CHECK (char_length(btrim("execution_conditions"."name")) > 0),
	CONSTRAINT "execution_conditions_value_kind" CHECK (("execution_conditions"."decimal_value" IS NOT NULL AND "execution_conditions"."unit_code" IS NOT NULL AND char_length(btrim("execution_conditions"."unit_code")) > 0 AND "execution_conditions"."text_value" IS NULL) OR ("execution_conditions"."decimal_value" IS NULL AND "execution_conditions"."unit_code" IS NULL AND "execution_conditions"."text_value" IS NOT NULL AND char_length(btrim("execution_conditions"."text_value")) > 0))
);
--> statement-breakpoint
CREATE TABLE "execution_history_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"execution_version" integer NOT NULL,
	"revision_id" uuid,
	"kind" varchar(80) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execution_history_org_execution_version_unique" UNIQUE("organization_id","execution_id","execution_version"),
	CONSTRAINT "execution_history_version_positive" CHECK ("execution_history_entries"."execution_version" > 0),
	CONSTRAINT "execution_history_kind_not_blank" CHECK (char_length(btrim("execution_history_entries"."kind")) > 0),
	CONSTRAINT "execution_history_snapshot_object" CHECK (jsonb_typeof("execution_history_entries"."snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "execution_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"predecessor_revision_id" uuid,
	"status" "execution_revision_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"performer_user_id" uuid,
	"performer_name_snapshot" varchar(240),
	"method_name" varchar(240),
	"method_identifier" varchar(120),
	"method_version" varchar(120),
	"performed_started_at" timestamp with time zone,
	"performed_ended_at" timestamp with time zone,
	"performed_at_site_id" uuid,
	"performed_location_snapshot" varchar(240),
	"technician_notes" text,
	"correction_reason" text,
	"require_performer_reviewer_separation" boolean,
	"require_reviewer_approver_separation" boolean,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"discarded_by_user_id" uuid,
	"discarded_at" timestamp with time zone,
	"discard_reason" text,
	CONSTRAINT "execution_revisions_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "execution_revisions_org_execution_id_unique" UNIQUE("organization_id","execution_id","id"),
	CONSTRAINT "execution_revisions_org_execution_number_unique" UNIQUE("organization_id","execution_id","revision_number"),
	CONSTRAINT "execution_revisions_number_positive" CHECK ("execution_revisions"."revision_number" > 0),
	CONSTRAINT "execution_revisions_version_positive" CHECK ("execution_revisions"."version" > 0),
	CONSTRAINT "execution_revisions_predecessor_number" CHECK (("execution_revisions"."revision_number" = 1 AND "execution_revisions"."predecessor_revision_id" IS NULL) OR ("execution_revisions"."revision_number" > 1 AND "execution_revisions"."predecessor_revision_id" IS NOT NULL AND "execution_revisions"."predecessor_revision_id" <> "execution_revisions"."id")),
	CONSTRAINT "execution_revisions_performed_interval" CHECK ("execution_revisions"."performed_ended_at" IS NULL OR ("execution_revisions"."performed_started_at" IS NOT NULL AND "execution_revisions"."performed_ended_at" >= "execution_revisions"."performed_started_at")),
	CONSTRAINT "execution_revisions_performer_snapshot" CHECK (("execution_revisions"."performer_user_id" IS NULL AND "execution_revisions"."performer_name_snapshot" IS NULL) OR ("execution_revisions"."performer_user_id" IS NOT NULL AND "execution_revisions"."performer_name_snapshot" IS NOT NULL AND char_length(btrim("execution_revisions"."performer_name_snapshot")) > 0)),
	CONSTRAINT "execution_revisions_method_not_blank" CHECK ("execution_revisions"."method_name" IS NULL OR char_length(btrim("execution_revisions"."method_name")) > 0),
	CONSTRAINT "execution_revisions_correction_reason" CHECK (("execution_revisions"."predecessor_revision_id" IS NULL AND "execution_revisions"."correction_reason" IS NULL) OR ("execution_revisions"."predecessor_revision_id" IS NOT NULL AND "execution_revisions"."correction_reason" IS NOT NULL AND char_length(btrim("execution_revisions"."correction_reason")) > 0)),
	CONSTRAINT "execution_revisions_status_fields" CHECK (("execution_revisions"."status" = 'draft' AND "execution_revisions"."submitted_at" IS NULL AND "execution_revisions"."submitted_by_user_id" IS NULL AND "execution_revisions"."discarded_at" IS NULL AND "execution_revisions"."discarded_by_user_id" IS NULL AND "execution_revisions"."discard_reason" IS NULL) OR ("execution_revisions"."status" = 'submitted' AND "execution_revisions"."submitted_at" IS NOT NULL AND "execution_revisions"."submitted_by_user_id" IS NOT NULL AND "execution_revisions"."discarded_at" IS NULL AND "execution_revisions"."discarded_by_user_id" IS NULL AND "execution_revisions"."discard_reason" IS NULL AND "execution_revisions"."performer_user_id" IS NOT NULL AND "execution_revisions"."method_name" IS NOT NULL AND "execution_revisions"."require_performer_reviewer_separation" IS NOT NULL AND "execution_revisions"."require_reviewer_approver_separation" IS NOT NULL) OR ("execution_revisions"."status" = 'discarded' AND "execution_revisions"."submitted_at" IS NULL AND "execution_revisions"."submitted_by_user_id" IS NULL AND "execution_revisions"."discarded_at" IS NOT NULL AND "execution_revisions"."discarded_by_user_id" IS NOT NULL AND "execution_revisions"."discard_reason" IS NOT NULL AND char_length(btrim("execution_revisions"."discard_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "execution_supporting_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"use" varchar(160) NOT NULL,
	"asset_label_snapshot" varchar(240) NOT NULL,
	CONSTRAINT "execution_supporting_assets_org_revision_asset_unique" UNIQUE("organization_id","revision_id","asset_id"),
	CONSTRAINT "execution_supporting_assets_org_revision_position_unique" UNIQUE("organization_id","revision_id","position"),
	CONSTRAINT "execution_supporting_assets_position_positive" CHECK ("execution_supporting_assets"."position" > 0),
	CONSTRAINT "execution_supporting_assets_use_not_blank" CHECK (char_length(btrim("execution_supporting_assets"."use")) > 0),
	CONSTRAINT "execution_supporting_assets_label_not_blank" CHECK (char_length(btrim("execution_supporting_assets"."asset_label_snapshot")) > 0)
);
--> statement-breakpoint
CREATE TABLE "technical_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "technical_execution_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"next_revision_number" integer DEFAULT 1 NOT NULL,
	"work_item_version_at_start" integer NOT NULL,
	"accepted_revision_id_at_start" uuid NOT NULL,
	"source_revision_line_id_at_start" uuid NOT NULL,
	"item_number_at_start" integer NOT NULL,
	"scope_description_at_start" text NOT NULL,
	"allocated_quantity_at_start" numeric NOT NULL,
	"allocated_unit_at_start" varchar(40) NOT NULL,
	"site_id_at_start" uuid NOT NULL,
	"site_name_at_start" varchar(200) NOT NULL,
	"target_asset_id_at_start" uuid,
	"target_asset_label_at_start" varchar(240),
	"idempotency_key" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"started_by_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"abandoned_by_user_id" uuid,
	"abandoned_at" timestamp with time zone,
	"abandonment_reason" text,
	CONSTRAINT "technical_executions_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "technical_executions_org_item_attempt_unique" UNIQUE("organization_id","work_item_id","attempt_number"),
	CONSTRAINT "technical_executions_org_command_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "technical_executions_attempt_positive" CHECK ("technical_executions"."attempt_number" > 0),
	CONSTRAINT "technical_executions_version_positive" CHECK ("technical_executions"."version" > 0),
	CONSTRAINT "technical_executions_next_revision" CHECK ("technical_executions"."next_revision_number" > 0),
	CONSTRAINT "technical_executions_source_version" CHECK ("technical_executions"."work_item_version_at_start" > 0),
	CONSTRAINT "technical_executions_item_number" CHECK ("technical_executions"."item_number_at_start" > 0),
	CONSTRAINT "technical_executions_scope_not_blank" CHECK (char_length(btrim("technical_executions"."scope_description_at_start")) > 0),
	CONSTRAINT "technical_executions_unit_not_blank" CHECK (char_length(btrim("technical_executions"."allocated_unit_at_start")) > 0),
	CONSTRAINT "technical_executions_site_name_not_blank" CHECK (char_length(btrim("technical_executions"."site_name_at_start")) > 0),
	CONSTRAINT "technical_executions_target_asset_snapshot" CHECK (("technical_executions"."target_asset_id_at_start" IS NULL AND "technical_executions"."target_asset_label_at_start" IS NULL) OR ("technical_executions"."target_asset_id_at_start" IS NOT NULL AND "technical_executions"."target_asset_label_at_start" IS NOT NULL AND char_length(btrim("technical_executions"."target_asset_label_at_start")) > 0)),
	CONSTRAINT "technical_executions_payload_hash" CHECK ("technical_executions"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "technical_executions_abandonment_state" CHECK (("technical_executions"."status" = 'abandoned' AND "technical_executions"."abandoned_by_user_id" IS NOT NULL AND "technical_executions"."abandoned_at" IS NOT NULL AND "technical_executions"."abandonment_reason" IS NOT NULL AND char_length(btrim("technical_executions"."abandonment_reason")) > 0) OR ("technical_executions"."status" = 'active' AND "technical_executions"."abandoned_by_user_id" IS NULL AND "technical_executions"."abandoned_at" IS NULL AND "technical_executions"."abandonment_reason" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "execution_conditions" ADD CONSTRAINT "execution_conditions_revision_fk" FOREIGN KEY ("organization_id","execution_id","revision_id") REFERENCES "public"."execution_revisions"("organization_id","execution_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_history_entries" ADD CONSTRAINT "execution_history_entries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_history_entries" ADD CONSTRAINT "execution_history_execution_fk" FOREIGN KEY ("organization_id","execution_id") REFERENCES "public"."technical_executions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_history_entries" ADD CONSTRAINT "execution_history_revision_fk" FOREIGN KEY ("organization_id","execution_id","revision_id") REFERENCES "public"."execution_revisions"("organization_id","execution_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_revisions" ADD CONSTRAINT "execution_revisions_performer_user_id_users_id_fk" FOREIGN KEY ("performer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_revisions" ADD CONSTRAINT "execution_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_revisions" ADD CONSTRAINT "execution_revisions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_revisions" ADD CONSTRAINT "execution_revisions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_revisions" ADD CONSTRAINT "execution_revisions_discarded_by_user_id_users_id_fk" FOREIGN KEY ("discarded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_revisions" ADD CONSTRAINT "execution_revisions_execution_fk" FOREIGN KEY ("organization_id","execution_id") REFERENCES "public"."technical_executions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_revisions" ADD CONSTRAINT "execution_revisions_predecessor_fk" FOREIGN KEY ("organization_id","execution_id","predecessor_revision_id") REFERENCES "public"."execution_revisions"("organization_id","execution_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_revisions" ADD CONSTRAINT "execution_revisions_performed_site_fk" FOREIGN KEY ("organization_id","performed_at_site_id") REFERENCES "public"."organization_sites"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_supporting_assets" ADD CONSTRAINT "execution_supporting_assets_revision_fk" FOREIGN KEY ("organization_id","execution_id","revision_id") REFERENCES "public"."execution_revisions"("organization_id","execution_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_supporting_assets" ADD CONSTRAINT "execution_supporting_assets_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_executions" ADD CONSTRAINT "technical_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_executions" ADD CONSTRAINT "technical_executions_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_executions" ADD CONSTRAINT "technical_executions_abandoned_by_user_id_users_id_fk" FOREIGN KEY ("abandoned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_executions" ADD CONSTRAINT "technical_executions_work_item_fk" FOREIGN KEY ("organization_id","work_order_id","work_item_id") REFERENCES "public"."work_items"("organization_id","work_order_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_executions" ADD CONSTRAINT "technical_executions_site_fk" FOREIGN KEY ("organization_id","site_id_at_start") REFERENCES "public"."organization_sites"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_executions" ADD CONSTRAINT "technical_executions_target_asset_fk" FOREIGN KEY ("organization_id","target_asset_id_at_start") REFERENCES "public"."assets"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_revisions_one_draft_idx" ON "execution_revisions" USING btree ("organization_id","execution_id") WHERE "execution_revisions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "execution_revisions_org_performer_created_idx" ON "execution_revisions" USING btree ("organization_id","performer_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "execution_revisions_org_status_created_idx" ON "execution_revisions" USING btree ("organization_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "technical_executions_one_active_item_idx" ON "technical_executions" USING btree ("organization_id","work_item_id") WHERE "technical_executions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "technical_executions_org_item_idx" ON "technical_executions" USING btree ("organization_id","work_item_id","attempt_number" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "technical_executions_org_asset_started_idx" ON "technical_executions" USING btree ("organization_id","target_asset_id_at_start","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "technical_executions_org_site_status_idx" ON "technical_executions" USING btree ("organization_id","site_id_at_start","status");