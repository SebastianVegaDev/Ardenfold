ALTER TABLE "receipts" ADD COLUMN "coordination" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_coordination_object" CHECK (jsonb_typeof("receipts"."coordination") = 'object');
--> statement-breakpoint
INSERT INTO permissions (code) VALUES ('receipts.read'), ('receipts.write');
--> statement-breakpoint
INSERT INTO organization_role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM organization_roles role CROSS JOIN permissions permission
WHERE permission.code IN ('receipts.read', 'receipts.write')
  AND (role.key IN ('owner', 'administrator', 'member')
       OR (role.key = 'viewer' AND permission.code = 'receipts.read'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ardenfold_receipt_guard()
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
                                  'responsible_party_id','coordination','custody_status','version',
                                  'updated_by_user_id','updated_at','voided_at',
                                  'voided_by_user_id','void_reason'])
          <> (to_jsonb(OLD) - ARRAY['asset_id','intake_description','observed_condition',
                                  'accessories','received_at','responsible_actor_name',
                                  'responsible_party_id','coordination','custody_status','version',
                                  'updated_by_user_id','updated_at','voided_at',
                                  'voided_by_user_id','void_reason']) THEN
        RAISE EXCEPTION 'Receipt identity is immutable and updates require the next version'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
