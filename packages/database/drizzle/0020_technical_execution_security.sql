INSERT INTO permissions (code) VALUES ('technical_executions.read'), ('technical_executions.write');
--> statement-breakpoint
INSERT INTO organization_role_permissions (role_id, permission_code)
SELECT role.id, permission.code FROM organization_roles role CROSS JOIN permissions permission
WHERE permission.code IN ('technical_executions.read', 'technical_executions.write')
  AND (role.key IN ('owner', 'administrator', 'member')
       OR (role.key = 'viewer' AND permission.code = 'technical_executions.read'));
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['technical_executions', 'execution_revisions',
                              'execution_conditions', 'execution_supporting_assets',
                              'execution_history_entries'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
        IF t = 'execution_history_entries' THEN
            EXECUTE format('GRANT SELECT, INSERT ON TABLE %I TO ardenfold_runtime', t);
        ELSE
            EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE %I TO ardenfold_runtime', t);
        END IF;
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT TO ardenfold_runtime USING (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_executions.read'', true) = ''true'')',
            t || '_read', t
        );
        IF t = 'execution_history_entries' THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR INSERT TO ardenfold_runtime WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_executions.write'', true) = ''true'')',
                t || '_write', t
            );
        ELSE
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR ALL TO ardenfold_runtime USING (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_executions.write'', true) = ''true'') WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_executions.write'', true) = ''true'')',
                t || '_write', t
            );
        END IF;
    END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION ardenfold_execution_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_attempt integer;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Technical executions cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'active' OR NEW.version <> 1
           OR NEW.next_revision_number <> 1 OR NEW.attempt_number < 1 THEN
            RAISE EXCEPTION 'Technical execution must start active at version one'
                USING ERRCODE = '23514';
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(
            NEW.organization_id::text || ':' || NEW.work_item_id::text, 0));
        SELECT COALESCE(max(attempt_number), 0) INTO previous_attempt
        FROM technical_executions
        WHERE organization_id = NEW.organization_id AND work_item_id = NEW.work_item_id;
        IF NEW.attempt_number <> previous_attempt + 1 THEN
            RAISE EXCEPTION 'Technical execution attempt number is invalid'
                USING ERRCODE = '23514';
        END IF;
    ELSIF OLD.status <> 'active' OR NEW.version <> OLD.version + 1
          OR (to_jsonb(NEW) - ARRAY['status','version','next_revision_number',
                                    'abandoned_by_user_id','abandoned_at','abandonment_reason'])
             <> (to_jsonb(OLD) - ARRAY['status','version','next_revision_number',
                                    'abandoned_by_user_id','abandoned_at','abandonment_reason'])
          OR NEW.next_revision_number NOT IN (OLD.next_revision_number,
                                              OLD.next_revision_number + 1) THEN
        RAISE EXCEPTION 'Technical execution basis is immutable and updates require the next version'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER technical_executions_guard BEFORE INSERT OR UPDATE OR DELETE ON technical_executions
FOR EACH ROW EXECUTE FUNCTION ardenfold_execution_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_execution_revision_sequence_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_count bigint;
BEGIN
    SELECT count(*) INTO revision_count FROM execution_revisions
    WHERE organization_id = NEW.organization_id AND execution_id = NEW.id;
    IF revision_count <> NEW.next_revision_number - 1 THEN
        RAISE EXCEPTION 'Execution revision sequence has a gap' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER technical_execution_revision_sequence_guard
AFTER INSERT OR UPDATE ON technical_executions DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ardenfold_execution_revision_sequence_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_execution_revision_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor_number integer;
        parent_execution technical_executions%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Execution revisions cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft' OR NEW.version <> 1 THEN
            RAISE EXCEPTION 'Execution revision must start draft at version one'
                USING ERRCODE = '23514';
        END IF;
        SELECT * INTO parent_execution FROM technical_executions
        WHERE organization_id = NEW.organization_id AND id = NEW.execution_id FOR UPDATE;
        IF NOT FOUND OR parent_execution.status <> 'active'
           OR NEW.revision_number <> parent_execution.next_revision_number - 1 THEN
            RAISE EXCEPTION 'Execution revision number or parent state is invalid'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.predecessor_revision_id IS NOT NULL THEN
            SELECT revision_number INTO predecessor_number FROM execution_revisions
            WHERE organization_id = NEW.organization_id
              AND execution_id = NEW.execution_id AND id = NEW.predecessor_revision_id;
            IF predecessor_number IS DISTINCT FROM NEW.revision_number - 1 THEN
                RAISE EXCEPTION 'Execution revision predecessor must be immediately prior'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    ELSIF OLD.status <> 'draft' OR NEW.version <> OLD.version + 1
          OR (to_jsonb(NEW) - ARRAY['status','version','performer_user_id',
                                    'performer_name_snapshot','method_name','method_identifier',
                                    'method_version','performed_started_at','performed_ended_at',
                                    'performed_at_site_id','performed_location_snapshot',
                                    'technician_notes','require_performer_reviewer_separation',
                                    'require_reviewer_approver_separation','updated_by_user_id',
                                    'updated_at','submitted_by_user_id','submitted_at',
                                    'discarded_by_user_id','discarded_at','discard_reason'])
             <> (to_jsonb(OLD) - ARRAY['status','version','performer_user_id',
                                    'performer_name_snapshot','method_name','method_identifier',
                                    'method_version','performed_started_at','performed_ended_at',
                                    'performed_at_site_id','performed_location_snapshot',
                                    'technician_notes','require_performer_reviewer_separation',
                                    'require_reviewer_approver_separation','updated_by_user_id',
                                    'updated_at','submitted_by_user_id','submitted_at',
                                    'discarded_by_user_id','discarded_at','discard_reason']) THEN
        RAISE EXCEPTION 'Submitted revisions are immutable; draft edits require the next version'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER execution_revisions_guard BEFORE INSERT OR UPDATE OR DELETE ON execution_revisions
FOR EACH ROW EXECUTE FUNCTION ardenfold_execution_revision_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_execution_context_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_revision_id uuid;
        target_organization_id uuid;
        target_status execution_revision_status;
        previous_status execution_revision_status;
BEGIN
    target_revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
    target_organization_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
    SELECT status INTO target_status FROM execution_revisions
    WHERE organization_id = target_organization_id AND id = target_revision_id FOR UPDATE;
    IF target_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'Submitted revision context is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        SELECT status INTO previous_status FROM execution_revisions
        WHERE organization_id = OLD.organization_id AND id = OLD.revision_id FOR UPDATE;
        IF previous_status IS DISTINCT FROM 'draft'
           OR NEW.organization_id <> OLD.organization_id
           OR NEW.execution_id <> OLD.execution_id
           OR NEW.revision_id <> OLD.revision_id THEN
            RAISE EXCEPTION 'Revision context cannot be moved or detached' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER execution_conditions_guard BEFORE INSERT OR UPDATE OR DELETE ON execution_conditions
FOR EACH ROW EXECUTE FUNCTION ardenfold_execution_context_guard();
--> statement-breakpoint
CREATE TRIGGER execution_supporting_assets_guard BEFORE INSERT OR UPDATE OR DELETE ON execution_supporting_assets
FOR EACH ROW EXECUTE FUNCTION ardenfold_execution_context_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_execution_history_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Execution history is append-only' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER execution_history_guard BEFORE UPDATE OR DELETE ON execution_history_entries
FOR EACH ROW EXECUTE FUNCTION ardenfold_execution_history_guard();
