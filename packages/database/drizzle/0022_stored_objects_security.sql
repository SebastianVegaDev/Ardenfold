INSERT INTO permissions (code) VALUES ('files.upload'), ('files.read');
--> statement-breakpoint
INSERT INTO organization_role_permissions (role_id, permission_code)
SELECT role.id, permission.code FROM organization_roles role CROSS JOIN permissions permission
WHERE permission.code IN ('files.upload', 'files.read')
  AND role.key IN ('owner', 'administrator', 'member');
--> statement-breakpoint
REVOKE ALL ON TABLE stored_objects FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE stored_objects TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE stored_objects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stored_objects FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY stored_objects_read ON stored_objects FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND (current_setting('ardenfold.permission.files.read', true) = 'true'
            OR current_setting('ardenfold.permission.files.upload', true) = 'true'));
--> statement-breakpoint
CREATE POLICY stored_objects_insert ON stored_objects FOR INSERT TO ardenfold_runtime
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
            AND current_setting('ardenfold.permission.files.upload', true) = 'true'
            AND uploaded_by_user_id = nullif(current_setting('ardenfold.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY stored_objects_update ON stored_objects FOR UPDATE TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.files.upload', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
            AND current_setting('ardenfold.permission.files.upload', true) = 'true');
--> statement-breakpoint
CREATE FUNCTION ardenfold_stored_object_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Stored-object records cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'pending' THEN
            RAISE EXCEPTION 'Stored objects must start pending' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','media_type','byte_length','sha256','uploaded_at','finalized_at','retained_at','abandoned_at'])
       <> (to_jsonb(OLD) - ARRAY['status','media_type','byte_length','sha256','uploaded_at','finalized_at','retained_at','abandoned_at']) THEN
        RAISE EXCEPTION 'Stored-object identity and expected metadata are immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.retained_at IS NOT NULL AND NEW.retained_at IS DISTINCT FROM OLD.retained_at THEN
        RAISE EXCEPTION 'Retained objects cannot be released' USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'pending' AND NEW.status = 'uploaded' THEN
        RETURN NEW;
    ELSIF OLD.status = 'uploaded' AND NEW.status = 'finalized' THEN
        IF NEW.media_type <> OLD.media_type OR NEW.byte_length <> OLD.byte_length OR NEW.sha256 <> OLD.sha256
           OR NEW.uploaded_at <> OLD.uploaded_at THEN
            RAISE EXCEPTION 'Uploaded metadata is immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    ELSIF OLD.status = 'finalized' AND NEW.status = 'finalized'
          AND OLD.retained_at IS NULL AND NEW.retained_at IS NOT NULL THEN
        IF NEW.media_type <> OLD.media_type OR NEW.byte_length <> OLD.byte_length OR NEW.sha256 <> OLD.sha256
           OR NEW.uploaded_at <> OLD.uploaded_at OR NEW.finalized_at <> OLD.finalized_at THEN
            RAISE EXCEPTION 'Finalized metadata is immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    ELSIF OLD.status IN ('pending','uploaded','finalized') AND NEW.status = 'abandoned'
          AND OLD.retained_at IS NULL THEN
        IF NEW.media_type IS DISTINCT FROM OLD.media_type
           OR NEW.byte_length IS DISTINCT FROM OLD.byte_length
           OR NEW.sha256 IS DISTINCT FROM OLD.sha256
           OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
           OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at THEN
            RAISE EXCEPTION 'Abandoning an object cannot rewrite stored metadata' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Invalid stored-object lifecycle transition' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stored_objects_guard BEFORE INSERT OR UPDATE OR DELETE ON stored_objects
FOR EACH ROW EXECUTE FUNCTION ardenfold_stored_object_guard();
