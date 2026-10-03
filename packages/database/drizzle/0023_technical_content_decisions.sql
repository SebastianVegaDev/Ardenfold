CREATE TYPE "public"."technical_conformity" AS ENUM('conforms', 'does_not_conform', 'undetermined');--> statement-breakpoint
CREATE TYPE "public"."technical_missing_reason" AS ENUM('not_observed', 'not_applicable', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."technical_result_kind" AS ENUM('quantitative', 'categorical', 'textual', 'missing');--> statement-breakpoint
CREATE TYPE "public"."technical_approval_outcome" AS ENUM('approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."technical_review_outcome" AS ENUM('accepted', 'changes_requested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."technical_evidence_kind" AS ENUM('file', 'observation');--> statement-breakpoint
CREATE TYPE "public"."technical_evidence_target" AS ENUM('revision', 'result', 'review', 'approval');--> statement-breakpoint
CREATE TABLE "technical_result_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" varchar(200) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_result_groups_org_execution_revision_id_unique" UNIQUE("organization_id","execution_id","revision_id","id"),
	CONSTRAINT "technical_result_groups_org_revision_position_unique" UNIQUE("organization_id","revision_id","position"),
	CONSTRAINT "technical_result_groups_position_positive" CHECK ("technical_result_groups"."position" > 0),
	CONSTRAINT "technical_result_groups_version_positive" CHECK ("technical_result_groups"."version" > 0),
	CONSTRAINT "technical_result_groups_label_not_blank" CHECK (char_length(btrim("technical_result_groups"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "technical_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"group_id" uuid,
	"position" integer NOT NULL,
	"characteristic" varchar(200) NOT NULL,
	"context_note" varchar(500),
	"kind" "technical_result_kind" NOT NULL,
	"decimal_value_text" varchar(80),
	"unit_code" varchar(40),
	"resolution_text" varchar(80),
	"significant_digits" integer,
	"uncertainty_text" varchar(80),
	"uncertainty_unit_code" varchar(40),
	"uncertainty_coverage" varchar(200),
	"tolerance_lower_text" varchar(80),
	"tolerance_upper_text" varchar(80),
	"tolerance_unit_code" varchar(40),
	"tolerance_rule" varchar(500),
	"category_code" varchar(80),
	"category_label" varchar(200),
	"category_meaning_snapshot" varchar(500),
	"text_value" text,
	"text_language" varchar(35),
	"missing_reason" "technical_missing_reason",
	"missing_explanation" varchar(500),
	"conformity" "technical_conformity",
	"conformity_rule" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_results_org_execution_revision_id_unique" UNIQUE("organization_id","execution_id","revision_id","id"),
	CONSTRAINT "technical_results_position_positive" CHECK ("technical_results"."position" > 0),
	CONSTRAINT "technical_results_version_positive" CHECK ("technical_results"."version" > 0),
	CONSTRAINT "technical_results_characteristic_not_blank" CHECK (char_length(btrim("technical_results"."characteristic")) > 0),
	CONSTRAINT "technical_results_context_bounded" CHECK ("technical_results"."context_note" IS NULL OR char_length("technical_results"."context_note") <= 500),
	CONSTRAINT "technical_results_decimal_syntax" CHECK (("technical_results"."decimal_value_text" IS NULL OR "technical_results"."decimal_value_text" ~ '^-?[0-9]{1,16}([.][0-9]{1,12})?$') AND ("technical_results"."resolution_text" IS NULL OR "technical_results"."resolution_text" ~ '^[0-9]{1,16}([.][0-9]{1,12})?$') AND ("technical_results"."uncertainty_text" IS NULL OR "technical_results"."uncertainty_text" ~ '^[0-9]{1,16}([.][0-9]{1,12})?$') AND ("technical_results"."tolerance_lower_text" IS NULL OR "technical_results"."tolerance_lower_text" ~ '^-?[0-9]{1,16}([.][0-9]{1,12})?$') AND ("technical_results"."tolerance_upper_text" IS NULL OR "technical_results"."tolerance_upper_text" ~ '^-?[0-9]{1,16}([.][0-9]{1,12})?$')),
	CONSTRAINT "technical_results_quantitative_fields" CHECK (("technical_results"."kind" = 'quantitative' AND "technical_results"."decimal_value_text" IS NOT NULL AND "technical_results"."unit_code" IS NOT NULL AND "technical_results"."category_code" IS NULL AND "technical_results"."category_label" IS NULL AND "technical_results"."category_meaning_snapshot" IS NULL AND "technical_results"."text_value" IS NULL AND "technical_results"."text_language" IS NULL AND "technical_results"."missing_reason" IS NULL AND "technical_results"."missing_explanation" IS NULL) OR ("technical_results"."kind" <> 'quantitative' AND "technical_results"."decimal_value_text" IS NULL AND "technical_results"."unit_code" IS NULL AND "technical_results"."resolution_text" IS NULL AND "technical_results"."significant_digits" IS NULL AND "technical_results"."uncertainty_text" IS NULL AND "technical_results"."uncertainty_unit_code" IS NULL AND "technical_results"."uncertainty_coverage" IS NULL AND "technical_results"."tolerance_lower_text" IS NULL AND "technical_results"."tolerance_upper_text" IS NULL AND "technical_results"."tolerance_unit_code" IS NULL AND "technical_results"."tolerance_rule" IS NULL)),
	CONSTRAINT "technical_results_nonquantitative_fields" CHECK (("technical_results"."kind" = 'categorical' AND "technical_results"."category_code" IS NOT NULL AND "technical_results"."category_label" IS NOT NULL AND "technical_results"."category_meaning_snapshot" IS NOT NULL AND "technical_results"."text_value" IS NULL AND "technical_results"."text_language" IS NULL AND "technical_results"."missing_reason" IS NULL AND "technical_results"."missing_explanation" IS NULL) OR ("technical_results"."kind" = 'textual' AND "technical_results"."category_code" IS NULL AND "technical_results"."category_label" IS NULL AND "technical_results"."category_meaning_snapshot" IS NULL AND "technical_results"."text_value" IS NOT NULL AND "technical_results"."missing_reason" IS NULL AND "technical_results"."missing_explanation" IS NULL) OR ("technical_results"."kind" = 'missing' AND "technical_results"."category_code" IS NULL AND "technical_results"."category_label" IS NULL AND "technical_results"."category_meaning_snapshot" IS NULL AND "technical_results"."text_value" IS NULL AND "technical_results"."text_language" IS NULL AND "technical_results"."missing_reason" IS NOT NULL AND "technical_results"."conformity" IS NULL AND "technical_results"."conformity_rule" IS NULL) OR "technical_results"."kind" = 'quantitative'),
	CONSTRAINT "technical_results_quantitative_context" CHECK ("technical_results"."kind" <> 'quantitative' OR ("technical_results"."unit_code" ~ '^[A-Za-z0-9][A-Za-z0-9./*^%_-]{0,39}$' AND ("technical_results"."resolution_text" IS NULL OR "technical_results"."resolution_text"::numeric > 0) AND ("technical_results"."significant_digits" IS NULL OR "technical_results"."significant_digits" BETWEEN 1 AND 28) AND ("technical_results"."uncertainty_text" IS NULL OR ("technical_results"."uncertainty_text"::numeric >= 0 AND "technical_results"."uncertainty_unit_code" IS NOT NULL AND "technical_results"."uncertainty_coverage" IS NOT NULL)) AND ("technical_results"."uncertainty_text" IS NOT NULL OR ("technical_results"."uncertainty_unit_code" IS NULL AND "technical_results"."uncertainty_coverage" IS NULL)) AND ("technical_results"."tolerance_lower_text" IS NOT NULL OR "technical_results"."tolerance_upper_text" IS NOT NULL OR ("technical_results"."tolerance_unit_code" IS NULL AND "technical_results"."tolerance_rule" IS NULL)) AND (("technical_results"."tolerance_lower_text" IS NULL AND "technical_results"."tolerance_upper_text" IS NULL) OR ("technical_results"."tolerance_unit_code" IS NOT NULL AND "technical_results"."tolerance_rule" IS NOT NULL)))),
	CONSTRAINT "technical_results_conformity_rule" CHECK (("technical_results"."conformity" IS NULL AND "technical_results"."conformity_rule" IS NULL) OR ("technical_results"."conformity" IS NOT NULL AND "technical_results"."conformity_rule" IS NOT NULL AND char_length(btrim("technical_results"."conformity_rule")) > 0)),
	CONSTRAINT "technical_results_text_bounds" CHECK (("technical_results"."text_value" IS NULL OR char_length("technical_results"."text_value") BETWEEN 1 AND 4000) AND ("technical_results"."missing_explanation" IS NULL OR char_length(btrim("technical_results"."missing_explanation")) > 0) AND ("technical_results"."category_code" IS NULL OR char_length(btrim("technical_results"."category_code")) > 0) AND ("technical_results"."category_label" IS NULL OR char_length(btrim("technical_results"."category_label")) > 0) AND ("technical_results"."category_meaning_snapshot" IS NULL OR char_length(btrim("technical_results"."category_meaning_snapshot")) > 0))
);
--> statement-breakpoint
CREATE TABLE "technical_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"outcome" "technical_approval_outcome" NOT NULL,
	"approver_membership_id" uuid NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"approver_name_snapshot" varchar(240) NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"notes" text,
	"policy_version" varchar(80) NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	CONSTRAINT "technical_approvals_org_execution_revision_id_unique" UNIQUE("organization_id","execution_id","revision_id","id"),
	CONSTRAINT "technical_approvals_org_revision_unique" UNIQUE("organization_id","revision_id"),
	CONSTRAINT "technical_approvals_org_command_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "technical_approvals_name_not_blank" CHECK (char_length(btrim("technical_approvals"."approver_name_snapshot")) > 0),
	CONSTRAINT "technical_approvals_policy_not_blank" CHECK (char_length(btrim("technical_approvals"."policy_version")) > 0),
	CONSTRAINT "technical_approvals_payload_hash" CHECK ("technical_approvals"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "technical_approvals_reason" CHECK (("technical_approvals"."outcome" = 'approved' AND ("technical_approvals"."reason" IS NULL OR char_length(btrim("technical_approvals"."reason")) > 0)) OR ("technical_approvals"."outcome" = 'declined' AND "technical_approvals"."reason" IS NOT NULL AND char_length(btrim("technical_approvals"."reason")) > 0)),
	CONSTRAINT "technical_approvals_notes_bounded" CHECK ("technical_approvals"."notes" IS NULL OR char_length("technical_approvals"."notes") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "technical_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"outcome" "technical_review_outcome" NOT NULL,
	"reviewer_membership_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"reviewer_name_snapshot" varchar(240) NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"notes" text,
	"policy_version" varchar(80) NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	CONSTRAINT "technical_reviews_org_execution_revision_id_unique" UNIQUE("organization_id","execution_id","revision_id","id"),
	CONSTRAINT "technical_reviews_org_revision_unique" UNIQUE("organization_id","revision_id"),
	CONSTRAINT "technical_reviews_org_command_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "technical_reviews_name_not_blank" CHECK (char_length(btrim("technical_reviews"."reviewer_name_snapshot")) > 0),
	CONSTRAINT "technical_reviews_policy_not_blank" CHECK (char_length(btrim("technical_reviews"."policy_version")) > 0),
	CONSTRAINT "technical_reviews_payload_hash" CHECK ("technical_reviews"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "technical_reviews_reason" CHECK (("technical_reviews"."outcome" = 'accepted' AND ("technical_reviews"."reason" IS NULL OR char_length(btrim("technical_reviews"."reason")) > 0)) OR ("technical_reviews"."outcome" <> 'accepted' AND "technical_reviews"."reason" IS NOT NULL AND char_length(btrim("technical_reviews"."reason")) > 0)),
	CONSTRAINT "technical_reviews_notes_bounded" CHECK ("technical_reviews"."notes" IS NULL OR char_length("technical_reviews"."notes") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "technical_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"target" "technical_evidence_target" NOT NULL,
	"result_id" uuid,
	"review_id" uuid,
	"approval_id" uuid,
	"kind" "technical_evidence_kind" NOT NULL,
	"evidence_type" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"stored_object_id" uuid,
	"observation_text" text,
	"attributed_membership_id" uuid NOT NULL,
	"attributed_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_evidence_id" uuid,
	"correction_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by_user_id" uuid,
	"removed_at" timestamp with time zone,
	CONSTRAINT "technical_evidence_org_execution_id_unique" UNIQUE("organization_id","execution_id","id"),
	CONSTRAINT "technical_evidence_org_revision_id_unique" UNIQUE("organization_id","revision_id","id"),
	CONSTRAINT "technical_evidence_target_fields" CHECK (("technical_evidence"."target" = 'revision' AND "technical_evidence"."result_id" IS NULL AND "technical_evidence"."review_id" IS NULL AND "technical_evidence"."approval_id" IS NULL) OR ("technical_evidence"."target" = 'result' AND "technical_evidence"."result_id" IS NOT NULL AND "technical_evidence"."review_id" IS NULL AND "technical_evidence"."approval_id" IS NULL) OR ("technical_evidence"."target" = 'review' AND "technical_evidence"."result_id" IS NULL AND "technical_evidence"."review_id" IS NOT NULL AND "technical_evidence"."approval_id" IS NULL) OR ("technical_evidence"."target" = 'approval' AND "technical_evidence"."result_id" IS NULL AND "technical_evidence"."review_id" IS NULL AND "technical_evidence"."approval_id" IS NOT NULL)),
	CONSTRAINT "technical_evidence_content_kind" CHECK (("technical_evidence"."kind" = 'file' AND "technical_evidence"."stored_object_id" IS NOT NULL AND "technical_evidence"."observation_text" IS NULL) OR ("technical_evidence"."kind" = 'observation' AND "technical_evidence"."stored_object_id" IS NULL AND "technical_evidence"."observation_text" IS NOT NULL AND char_length(btrim("technical_evidence"."observation_text")) BETWEEN 1 AND 4000)),
	CONSTRAINT "technical_evidence_type_code" CHECK ("technical_evidence"."evidence_type" ~ '^[a-z][a-z0-9_]{0,79}$'),
	CONSTRAINT "technical_evidence_description_bounded" CHECK (char_length(btrim("technical_evidence"."description")) BETWEEN 1 AND 2000),
	CONSTRAINT "technical_evidence_version_positive" CHECK ("technical_evidence"."version" > 0),
	CONSTRAINT "technical_evidence_correction" CHECK (("technical_evidence"."source_evidence_id" IS NULL AND "technical_evidence"."correction_reason" IS NULL) OR ("technical_evidence"."source_evidence_id" IS NOT NULL AND "technical_evidence"."source_evidence_id" <> "technical_evidence"."id" AND "technical_evidence"."correction_reason" IS NOT NULL AND char_length(btrim("technical_evidence"."correction_reason")) BETWEEN 1 AND 2000)),
	CONSTRAINT "technical_evidence_removal" CHECK (("technical_evidence"."removed_at" IS NULL AND "technical_evidence"."removed_by_user_id" IS NULL) OR ("technical_evidence"."removed_at" IS NOT NULL AND "technical_evidence"."removed_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "technical_evidence_history_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"evidence_version" integer NOT NULL,
	"kind" varchar(40) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_evidence_history_version_unique" UNIQUE("organization_id","evidence_id","evidence_version"),
	CONSTRAINT "technical_evidence_history_version_positive" CHECK ("technical_evidence_history_entries"."evidence_version" > 0),
	CONSTRAINT "technical_evidence_history_kind_not_blank" CHECK (char_length(btrim("technical_evidence_history_entries"."kind")) > 0),
	CONSTRAINT "technical_evidence_history_snapshot_object" CHECK (jsonb_typeof("technical_evidence_history_entries"."snapshot") = 'object')
);
--> statement-breakpoint
ALTER TABLE "technical_result_groups" ADD CONSTRAINT "technical_result_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_result_groups" ADD CONSTRAINT "technical_result_groups_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_result_groups" ADD CONSTRAINT "technical_result_groups_revision_fk" FOREIGN KEY ("organization_id","execution_id","revision_id") REFERENCES "public"."execution_revisions"("organization_id","execution_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_results" ADD CONSTRAINT "technical_results_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_results" ADD CONSTRAINT "technical_results_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_results" ADD CONSTRAINT "technical_results_revision_fk" FOREIGN KEY ("organization_id","execution_id","revision_id") REFERENCES "public"."execution_revisions"("organization_id","execution_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_results" ADD CONSTRAINT "technical_results_group_fk" FOREIGN KEY ("organization_id","execution_id","revision_id","group_id") REFERENCES "public"."technical_result_groups"("organization_id","execution_id","revision_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_approvals" ADD CONSTRAINT "technical_approvals_review_fk" FOREIGN KEY ("organization_id","execution_id","revision_id","review_id") REFERENCES "public"."technical_reviews"("organization_id","execution_id","revision_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_org_id_user_unique" UNIQUE("organization_id","id","user_id");--> statement-breakpoint
ALTER TABLE "technical_approvals" ADD CONSTRAINT "technical_approvals_actor_fk" FOREIGN KEY ("organization_id","approver_membership_id","approver_user_id") REFERENCES "public"."organization_memberships"("organization_id","id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_reviews" ADD CONSTRAINT "technical_reviews_revision_fk" FOREIGN KEY ("organization_id","execution_id","revision_id") REFERENCES "public"."execution_revisions"("organization_id","execution_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_reviews" ADD CONSTRAINT "technical_reviews_actor_fk" FOREIGN KEY ("organization_id","reviewer_membership_id","reviewer_user_id") REFERENCES "public"."organization_memberships"("organization_id","id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_revision_fk" FOREIGN KEY ("organization_id","execution_id","revision_id") REFERENCES "public"."execution_revisions"("organization_id","execution_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_result_fk" FOREIGN KEY ("organization_id","execution_id","revision_id","result_id") REFERENCES "public"."technical_results"("organization_id","execution_id","revision_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_review_fk" FOREIGN KEY ("organization_id","execution_id","revision_id","review_id") REFERENCES "public"."technical_reviews"("organization_id","execution_id","revision_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_approval_fk" FOREIGN KEY ("organization_id","execution_id","revision_id","approval_id") REFERENCES "public"."technical_approvals"("organization_id","execution_id","revision_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_stored_object_fk" FOREIGN KEY ("organization_id","stored_object_id") REFERENCES "public"."stored_objects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_actor_fk" FOREIGN KEY ("organization_id","attributed_membership_id","attributed_by_user_id") REFERENCES "public"."organization_memberships"("organization_id","id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_source_fk" FOREIGN KEY ("organization_id","execution_id","source_evidence_id") REFERENCES "public"."technical_evidence"("organization_id","execution_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence_history_entries" ADD CONSTRAINT "technical_evidence_history_entries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_evidence_history_entries" ADD CONSTRAINT "technical_evidence_history_parent_fk" FOREIGN KEY ("organization_id","revision_id","evidence_id") REFERENCES "public"."technical_evidence"("organization_id","revision_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "technical_results_group_position_unique" ON "technical_results" USING btree ("organization_id","revision_id","group_id","position") WHERE "technical_results"."group_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "technical_results_ungrouped_position_unique" ON "technical_results" USING btree ("organization_id","revision_id","position") WHERE "technical_results"."group_id" IS NULL;--> statement-breakpoint
CREATE INDEX "technical_results_org_revision_order_idx" ON "technical_results" USING btree ("organization_id","revision_id","position","id");--> statement-breakpoint
CREATE INDEX "technical_approvals_org_approver_decided_idx" ON "technical_approvals" USING btree ("organization_id","approver_user_id","decided_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "technical_reviews_org_reviewer_decided_idx" ON "technical_reviews" USING btree ("organization_id","reviewer_user_id","decided_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "technical_evidence_org_revision_target_idx" ON "technical_evidence" USING btree ("organization_id","revision_id","target","recorded_at");
