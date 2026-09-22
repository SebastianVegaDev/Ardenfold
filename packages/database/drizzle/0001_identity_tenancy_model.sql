CREATE TYPE "public"."membership_status" AS ENUM('active', 'suspended', 'removed');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('active', 'suspended', 'archived');--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"last_authenticated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_identities_provider_not_blank" CHECK (char_length(btrim("external_identities"."provider")) > 0),
	CONSTRAINT "external_identities_issuer_not_blank" CHECK (char_length(btrim("external_identities"."issuer")) > 0),
	CONSTRAINT "external_identities_subject_not_blank" CHECK (char_length(btrim("external_identities"."subject")) > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_lifecycle_check" CHECK (
                ("organization_memberships"."status" = 'active' AND "organization_memberships"."suspended_at" IS NULL AND "organization_memberships"."removed_at" IS NULL)
                OR ("organization_memberships"."status" = 'suspended' AND "organization_memberships"."suspended_at" IS NOT NULL AND "organization_memberships"."removed_at" IS NULL)
                OR ("organization_memberships"."status" = 'removed' AND "organization_memberships"."removed_at" IS NOT NULL)
            )
);
--> statement-breakpoint
CREATE TABLE "organization_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"code" varchar(64),
	"time_zone" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_sites_name_not_blank" CHECK (char_length(btrim("organization_sites"."name")) > 0),
	CONSTRAINT "organization_sites_code_not_blank" CHECK ("organization_sites"."code" IS NULL OR char_length(btrim("organization_sites"."code")) > 0),
	CONSTRAINT "organization_sites_time_zone_not_blank" CHECK ("organization_sites"."time_zone" IS NULL OR char_length(btrim("organization_sites"."time_zone")) > 0)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" "organization_status" DEFAULT 'active' NOT NULL,
	"default_locale" varchar(35) DEFAULT 'en' NOT NULL,
	"default_time_zone" varchar(255) DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_not_blank" CHECK (char_length(btrim("organizations"."name")) > 0),
	CONSTRAINT "organizations_default_locale_not_blank" CHECK (char_length(btrim("organizations"."default_locale")) > 0),
	CONSTRAINT "organizations_default_time_zone_not_blank" CHECK (char_length(btrim("organizations"."default_time_zone")) > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_email" varchar(320) NOT NULL,
	"display_name" varchar(200),
	"preferred_locale" varchar(35),
	"preferred_time_zone" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_primary_email_not_blank" CHECK (char_length(btrim("users"."primary_email")) > 0),
	CONSTRAINT "users_display_name_not_blank" CHECK ("users"."display_name" IS NULL OR char_length(btrim("users"."display_name")) > 0),
	CONSTRAINT "users_preferred_locale_not_blank" CHECK ("users"."preferred_locale" IS NULL OR char_length(btrim("users"."preferred_locale")) > 0),
	CONSTRAINT "users_preferred_time_zone_not_blank" CHECK ("users"."preferred_time_zone" IS NULL OR char_length(btrim("users"."preferred_time_zone")) > 0)
);
--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_sites" ADD CONSTRAINT "organization_sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_provider_issuer_subject_uidx" ON "external_identities" USING btree ("provider","issuer","subject");--> statement-breakpoint
CREATE INDEX "external_identities_user_id_idx" ON "external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_uidx" ON "organization_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_organization_id_status_idx" ON "organization_memberships" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_id_status_idx" ON "organization_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "organization_sites_organization_id_idx" ON "organization_sites" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_sites_organization_id_code_uidx" ON "organization_sites" USING btree ("organization_id","code") WHERE "organization_sites"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "organizations_status_idx" ON "organizations" USING btree ("status");