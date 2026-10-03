INSERT INTO permissions (code) VALUES
    ('technical_evidence.read'), ('technical_reviews.decide'), ('technical_approvals.decide');
--> statement-breakpoint
INSERT INTO organization_role_permissions (role_id, permission_code)
SELECT role.id, permission.code FROM organization_roles role CROSS JOIN permissions permission
WHERE (permission.code IN ('technical_evidence.read', 'technical_reviews.decide')
       AND role.key IN ('owner', 'administrator', 'member'))
   OR (permission.code = 'technical_approvals.decide'
       AND role.key IN ('owner', 'administrator'));
--> statement-breakpoint
DO $$
DECLARE t text;
        read_setting text;
BEGIN
    FOREACH t IN ARRAY ARRAY['technical_result_groups','technical_results',
                              'technical_evidence','technical_evidence_history_entries',
                              'technical_reviews','technical_approvals'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
        IF t IN ('technical_reviews','technical_approvals','technical_evidence_history_entries') THEN
            EXECUTE format('GRANT SELECT, INSERT ON TABLE %I TO ardenfold_runtime', t);
        ELSE
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO ardenfold_runtime', t);
        END IF;
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        read_setting := CASE WHEN t LIKE 'technical_evidence%' THEN
            'ardenfold.permission.technical_evidence.read' ELSE
            'ardenfold.permission.technical_executions.read' END;
        IF t LIKE 'technical_evidence%' THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR SELECT TO ardenfold_runtime USING (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(%L, true) = ''true'')',
                t || '_read', t, read_setting
            );
        ELSE
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR SELECT TO ardenfold_runtime USING (ardenfold_service_request_tenant_allowed(organization_id) AND (current_setting(%L, true) = ''true'' OR current_setting(''ardenfold.permission.technical_executions.write'', true) = ''true''))',
                t || '_read', t, read_setting
            );
        END IF;
        IF t = 'technical_reviews' THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR INSERT TO ardenfold_runtime WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_reviews.decide'', true) = ''true'')',
                t || '_write', t
            );
        ELSIF t = 'technical_approvals' THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR INSERT TO ardenfold_runtime WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_approvals.decide'', true) = ''true'')',
                t || '_write', t
            );
        ELSIF t LIKE 'technical_evidence%' THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR INSERT TO ardenfold_runtime WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_executions.write'', true) = ''true'')',
                t || '_insert', t
            );
            IF t = 'technical_evidence' THEN
                EXECUTE format(
                    'CREATE POLICY %I ON %I FOR UPDATE TO ardenfold_runtime USING (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_executions.write'', true) = ''true'') WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_executions.write'', true) = ''true'')',
                    t || '_update', t
                );
                EXECUTE format(
                    'CREATE POLICY %I ON %I FOR DELETE TO ardenfold_runtime USING (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_executions.write'', true) = ''true'')',
                    t || '_delete', t
                );
            END IF;
        ELSE
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR ALL TO ardenfold_runtime USING (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_executions.write'', true) = ''true'') WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id) AND current_setting(''ardenfold.permission.technical_executions.write'', true) = ''true'')',
                t || '_write', t
            );
        END IF;
    END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION ardenfold_result_content_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status execution_revision_status;
        org_id uuid;
        v_execution_id uuid;
        revision_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        org_id := OLD.organization_id;
        v_execution_id := OLD.execution_id;
        revision_id := OLD.revision_id;
    ELSE
        org_id := NEW.organization_id;
        v_execution_id := NEW.execution_id;
        revision_id := NEW.revision_id;
    END IF;
    SELECT status INTO parent_status FROM execution_revisions
    WHERE organization_id = org_id AND execution_id = v_execution_id AND id = revision_id FOR UPDATE;
    IF parent_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'Technical result content requires a draft revision' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.version <> 1 THEN
            RAISE EXCEPTION 'Technical result content must start at version one' USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.version <> OLD.version + 1
          OR NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id
          OR NEW.execution_id <> OLD.execution_id OR NEW.revision_id <> OLD.revision_id
          OR NEW.created_by_user_id <> OLD.created_by_user_id OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Technical result edits require the next version and stable identity' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER technical_result_groups_guard BEFORE INSERT OR UPDATE OR DELETE ON technical_result_groups
FOR EACH ROW EXECUTE FUNCTION ardenfold_result_content_guard();
--> statement-breakpoint
CREATE TRIGGER technical_results_guard BEFORE INSERT OR UPDATE OR DELETE ON technical_results
FOR EACH ROW EXECUTE FUNCTION ardenfold_result_content_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_technical_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status execution_revision_status;
        review_outcome technical_review_outcome;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Technical decisions are immutable' USING ERRCODE = '23514';
    END IF;
    SELECT status INTO parent_status FROM execution_revisions
    WHERE organization_id = NEW.organization_id AND execution_id = NEW.execution_id
      AND id = NEW.revision_id FOR UPDATE;
    IF parent_status IS DISTINCT FROM 'submitted' THEN
        RAISE EXCEPTION 'Technical decisions require an exact submitted revision' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'technical_approvals' THEN
        SELECT outcome INTO review_outcome FROM technical_reviews
        WHERE organization_id = NEW.organization_id AND execution_id = NEW.execution_id
          AND revision_id = NEW.revision_id AND id = NEW.review_id;
        IF review_outcome IS DISTINCT FROM 'accepted' THEN
            RAISE EXCEPTION 'Approval requires an accepted review of the same revision' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER technical_reviews_guard BEFORE INSERT OR UPDATE OR DELETE ON technical_reviews
FOR EACH ROW EXECUTE FUNCTION ardenfold_technical_decision_guard();
--> statement-breakpoint
CREATE TRIGGER technical_approvals_guard BEFORE INSERT OR UPDATE OR DELETE ON technical_approvals
FOR EACH ROW EXECUTE FUNCTION ardenfold_technical_decision_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_technical_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status execution_revision_status;
        object_status stored_object_status;
        object_retained_at timestamptz;
        object_uploader uuid;
        source_revision_id uuid;
        v_predecessor_revision_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Technical evidence cannot be deleted' USING ERRCODE = '23514';
    END IF;
    SELECT status INTO parent_status FROM execution_revisions
    WHERE organization_id = NEW.organization_id AND execution_id = NEW.execution_id
      AND id = NEW.revision_id FOR UPDATE;
    IF (NEW.target IN ('revision','result') AND parent_status IS DISTINCT FROM 'draft')
       OR (NEW.target IN ('review','approval') AND parent_status IS DISTINCT FROM 'submitted') THEN
        RAISE EXCEPTION 'Evidence target is not editable in this revision state' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.version <> 1 OR NEW.removed_at IS NOT NULL THEN
            RAISE EXCEPTION 'Evidence must start active at version one' USING ERRCODE = '23514';
        END IF;
    ELSIF (OLD.target IN ('revision','result') AND parent_status IS DISTINCT FROM 'draft')
          OR OLD.target IN ('review','approval') OR OLD.removed_at IS NOT NULL
          OR NEW.version <> OLD.version + 1
          OR NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id
          OR NEW.execution_id <> OLD.execution_id OR NEW.revision_id <> OLD.revision_id
          OR NEW.source_evidence_id IS DISTINCT FROM OLD.source_evidence_id
          OR NEW.attributed_membership_id <> OLD.attributed_membership_id
          OR NEW.attributed_by_user_id <> OLD.attributed_by_user_id
          OR NEW.recorded_at <> OLD.recorded_at THEN
        RAISE EXCEPTION 'Evidence history or immutable identity cannot be rewritten' USING ERRCODE = '23514';
    END IF;
    IF NEW.source_evidence_id IS NOT NULL THEN
        SELECT revision_id INTO source_revision_id FROM technical_evidence
        WHERE organization_id = NEW.organization_id AND execution_id = NEW.execution_id
          AND id = NEW.source_evidence_id;
        SELECT predecessor_revision_id INTO v_predecessor_revision_id FROM execution_revisions
        WHERE organization_id = NEW.organization_id AND execution_id = NEW.execution_id
          AND id = NEW.revision_id;
        IF source_revision_id IS DISTINCT FROM v_predecessor_revision_id THEN
            RAISE EXCEPTION 'Evidence correction must reference the predecessor revision' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.kind = 'file' THEN
        SELECT status, retained_at, uploaded_by_user_id
          INTO object_status, object_retained_at, object_uploader FROM stored_objects
        WHERE organization_id = NEW.organization_id AND id = NEW.stored_object_id FOR KEY SHARE;
        IF object_status IS DISTINCT FROM 'finalized' OR object_retained_at IS NULL
           OR object_uploader IS DISTINCT FROM NEW.attributed_by_user_id THEN
            RAISE EXCEPTION 'Evidence requires a retained finalized file from its author' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER technical_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON technical_evidence
FOR EACH ROW EXECUTE FUNCTION ardenfold_technical_evidence_guard();
--> statement-breakpoint
CREATE FUNCTION ardenfold_technical_evidence_history_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO technical_evidence_history_entries
        (organization_id, revision_id, evidence_id, evidence_version, kind, snapshot, recorded_by_user_id)
    VALUES (NEW.organization_id, NEW.revision_id, NEW.id, NEW.version,
            CASE WHEN TG_OP = 'INSERT' THEN 'created'
                 WHEN NEW.removed_at IS NOT NULL THEN 'removed' ELSE 'corrected' END,
            to_jsonb(NEW), NEW.updated_by_user_id);
    RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER technical_evidence_history_write AFTER INSERT OR UPDATE ON technical_evidence
FOR EACH ROW EXECUTE FUNCTION ardenfold_technical_evidence_history_write();
--> statement-breakpoint
CREATE FUNCTION ardenfold_technical_evidence_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Technical evidence history is append-only' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER technical_evidence_history_guard BEFORE UPDATE OR DELETE ON technical_evidence_history_entries
FOR EACH ROW EXECUTE FUNCTION ardenfold_technical_evidence_history_guard();
