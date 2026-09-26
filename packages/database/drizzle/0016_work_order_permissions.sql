-- Custom SQL migration file, put your code below! --
INSERT INTO permissions (code) VALUES ('work_orders.read'), ('work_orders.write');
--> statement-breakpoint
INSERT INTO organization_role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM organization_roles role CROSS JOIN permissions permission
WHERE permission.code IN ('work_orders.read', 'work_orders.write')
  AND (role.key IN ('owner', 'administrator', 'member')
       OR (role.key = 'viewer' AND permission.code = 'work_orders.read'));
--> statement-breakpoint
CREATE FUNCTION ardenfold_work_history_reason()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.reason := COALESCE(NULLIF(current_setting('ardenfold.change_reason', true), ''), NEW.reason);
    RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_order_history_reason BEFORE INSERT ON work_order_history_entries
FOR EACH ROW EXECUTE FUNCTION ardenfold_work_history_reason();
--> statement-breakpoint
CREATE TRIGGER work_item_history_reason BEFORE INSERT ON work_item_history_entries
FOR EACH ROW EXECUTE FUNCTION ardenfold_work_history_reason();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ardenfold_work_order_history_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Operational records cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'cancelled' OR NEW.version <> OLD.version + 1
           OR (to_jsonb(NEW) - ARRAY['status','version','site_id','next_item_number',
                                      'preparation_notes','updated_by_user_id','updated_at',
                                      'cancelled_by_user_id','cancelled_at','cancellation_reason'])
              <> (to_jsonb(OLD) - ARRAY['status','version','site_id','next_item_number',
                                      'preparation_notes','updated_by_user_id','updated_at',
                                      'cancelled_by_user_id','cancelled_at','cancellation_reason']) THEN
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
