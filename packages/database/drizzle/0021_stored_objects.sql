CREATE TYPE "public"."stored_object_status" AS ENUM('pending', 'uploaded', 'finalized', 'abandoned');--> statement-breakpoint
CREATE TABLE "stored_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"storage_key" varchar(160) NOT NULL,
	"status" "stored_object_status" DEFAULT 'pending' NOT NULL,
	"original_filename" varchar(240) NOT NULL,
	"declared_media_type" varchar(100) NOT NULL,
	"media_type" varchar(100),
	"expected_byte_length" integer NOT NULL,
	"expected_sha256" varchar(64) NOT NULL,
	"byte_length" integer,
	"sha256" varchar(64),
	"idempotency_key" uuid NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"retained_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	CONSTRAINT "stored_objects_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "stored_objects_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "stored_objects_org_command_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "stored_objects_filename_not_blank" CHECK (char_length(btrim("stored_objects"."original_filename")) > 0),
	CONSTRAINT "stored_objects_declared_type_not_blank" CHECK (char_length(btrim("stored_objects"."declared_media_type")) > 0),
	CONSTRAINT "stored_objects_expected_length" CHECK ("stored_objects"."expected_byte_length" BETWEEN 1 AND 10485760),
	CONSTRAINT "stored_objects_expected_sha256" CHECK ("stored_objects"."expected_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "stored_objects_request_hash" CHECK ("stored_objects"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "stored_objects_sha256" CHECK ("stored_objects"."sha256" IS NULL OR "stored_objects"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "stored_objects_byte_length" CHECK ("stored_objects"."byte_length" IS NULL OR "stored_objects"."byte_length" BETWEEN 1 AND 10485760),
	CONSTRAINT "stored_objects_lifecycle_fields" CHECK (("stored_objects"."status" = 'pending' AND "stored_objects"."byte_length" IS NULL AND "stored_objects"."sha256" IS NULL AND "stored_objects"."media_type" IS NULL AND "stored_objects"."uploaded_at" IS NULL AND "stored_objects"."finalized_at" IS NULL AND "stored_objects"."abandoned_at" IS NULL AND "stored_objects"."retained_at" IS NULL)
             OR ("stored_objects"."status" = 'uploaded' AND "stored_objects"."byte_length" IS NOT NULL AND "stored_objects"."sha256" IS NOT NULL AND "stored_objects"."media_type" IS NOT NULL AND "stored_objects"."uploaded_at" IS NOT NULL AND "stored_objects"."finalized_at" IS NULL AND "stored_objects"."abandoned_at" IS NULL AND "stored_objects"."retained_at" IS NULL)
             OR ("stored_objects"."status" = 'finalized' AND "stored_objects"."byte_length" IS NOT NULL AND "stored_objects"."sha256" IS NOT NULL AND "stored_objects"."media_type" IS NOT NULL AND "stored_objects"."uploaded_at" IS NOT NULL AND "stored_objects"."finalized_at" IS NOT NULL AND "stored_objects"."abandoned_at" IS NULL)
             OR ("stored_objects"."status" = 'abandoned' AND "stored_objects"."abandoned_at" IS NOT NULL AND "stored_objects"."retained_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stored_objects_cleanup_idx" ON "stored_objects" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "stored_objects_org_uploader_created_idx" ON "stored_objects" USING btree ("organization_id","uploaded_by_user_id","created_at" DESC NULLS LAST);