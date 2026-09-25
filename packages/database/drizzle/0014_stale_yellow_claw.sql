CREATE TABLE "quote_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"agreement_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"supplied_by_name" varchar(120),
	"supplied_by_contact_id" uuid,
	"channel" varchar(120) NOT NULL,
	"external_reference" varchar(120),
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by_user_id" uuid,
	"withdrawal_reason" text,
	CONSTRAINT "quote_acceptances_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "quote_acceptances_org_quote_id_unique" UNIQUE("organization_id","quote_id","id"),
	CONSTRAINT "quote_acceptances_idempotency_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "quote_acceptances_hash" CHECK ("quote_acceptances"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "quote_acceptances_channel" CHECK (char_length(btrim("quote_acceptances"."channel")) > 0),
	CONSTRAINT "quote_acceptances_withdrawal_complete" CHECK (("quote_acceptances"."withdrawn_at" IS NULL AND "quote_acceptances"."withdrawn_by_user_id" IS NULL AND "quote_acceptances"."withdrawal_reason" IS NULL) OR ("quote_acceptances"."withdrawn_at" IS NOT NULL AND "quote_acceptances"."withdrawn_by_user_id" IS NOT NULL AND char_length(btrim("quote_acceptances"."withdrawal_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "quote_history_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"kind" varchar(80) NOT NULL,
	"revision_id" uuid,
	"acceptance_id" uuid,
	"reason" text,
	"context" jsonb,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	CONSTRAINT "quote_history_entries_org_quote_version_unique" UNIQUE("organization_id","quote_id","version"),
	CONSTRAINT "quote_history_entries_version_positive" CHECK ("quote_history_entries"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "quote_acceptances" ADD CONSTRAINT "quote_acceptances_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_acceptances" ADD CONSTRAINT "quote_acceptances_withdrawn_by_user_id_users_id_fk" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_acceptances" ADD CONSTRAINT "quote_acceptances_revision_fk" FOREIGN KEY ("organization_id","quote_id","revision_id") REFERENCES "public"."quote_revisions"("organization_id","quote_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_acceptances" ADD CONSTRAINT "quote_acceptances_contact_fk" FOREIGN KEY ("organization_id","supplied_by_contact_id") REFERENCES "public"."party_contacts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_history_entries" ADD CONSTRAINT "quote_history_entries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_history_entries" ADD CONSTRAINT "quote_history_entries_quote_fk" FOREIGN KEY ("organization_id","quote_id") REFERENCES "public"."quotes"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_history_entries" ADD CONSTRAINT "quote_history_entries_revision_fk" FOREIGN KEY ("organization_id","quote_id","revision_id") REFERENCES "public"."quote_revisions"("organization_id","quote_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_history_entries" ADD CONSTRAINT "quote_history_entries_acceptance_fk" FOREIGN KEY ("organization_id","quote_id","acceptance_id") REFERENCES "public"."quote_acceptances"("organization_id","quote_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_acceptances_one_active_idx" ON "quote_acceptances" USING btree ("organization_id","quote_id") WHERE "quote_acceptances"."withdrawn_at" IS NULL;
--> statement-breakpoint
REVOKE ALL ON TABLE quote_acceptances, quote_history_entries FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE quote_acceptances TO ardenfold_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE quote_history_entries TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE quote_acceptances ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_acceptances FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_history_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_history_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY quote_acceptances_tenant_read ON quote_acceptances
FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_acceptances_tenant_write ON quote_acceptances
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_history_entries_tenant_read ON quote_history_entries
FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY quote_history_entries_tenant_write ON quote_history_entries
FOR INSERT TO ardenfold_runtime
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.quotations.write', true) = 'true');
--> statement-breakpoint
CREATE FUNCTION ardenfold_acceptance_history_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Commercial facts cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'quote_history_entries' THEN
        IF TG_OP = 'UPDATE' THEN
            RAISE EXCEPTION 'Commercial history is append-only' USING ERRCODE = '23514';
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL
           OR (to_jsonb(NEW) - ARRAY['withdrawn_at','withdrawn_by_user_id','withdrawal_reason'])
              <> (to_jsonb(OLD) - ARRAY['withdrawn_at','withdrawn_by_user_id','withdrawal_reason']) THEN
            RAISE EXCEPTION 'Acceptance facts are immutable' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER quote_acceptances_history_guard
BEFORE UPDATE OR DELETE ON quote_acceptances
FOR EACH ROW EXECUTE FUNCTION ardenfold_acceptance_history_guard();
--> statement-breakpoint
CREATE TRIGGER quote_history_entries_guard
BEFORE UPDATE OR DELETE ON quote_history_entries
FOR EACH ROW EXECUTE FUNCTION ardenfold_acceptance_history_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_quote_acceptance_insert_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    quote_state quote_status;
    revision_state quote_revision_status;
BEGIN
    SELECT q.status, r.status INTO quote_state, revision_state
    FROM quotes q
    JOIN quote_revisions r ON r.organization_id = q.organization_id
                          AND r.quote_id = q.id AND r.id = NEW.revision_id
    WHERE q.organization_id = NEW.organization_id AND q.id = NEW.quote_id;
    IF quote_state IS DISTINCT FROM 'open' OR revision_state IS DISTINCT FROM 'offered' THEN
        RAISE EXCEPTION 'Acceptance requires the currently offered revision'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER quote_acceptance_insert_guard
BEFORE INSERT ON quote_acceptances
FOR EACH ROW EXECUTE FUNCTION ardenfold_quote_acceptance_insert_guard();
--> statement-breakpoint
ALTER TABLE quote_history_entries ADD CONSTRAINT quote_history_entries_context_object
CHECK (context IS NULL OR jsonb_typeof(context) = 'object');
