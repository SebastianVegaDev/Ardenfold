CREATE INDEX "service_requests_org_created_id_idx" ON "service_requests" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
INSERT INTO permissions (code) VALUES
    ('service_requests.read'), ('service_requests.write');
--> statement-breakpoint
INSERT INTO organization_role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM organization_roles role CROSS JOIN permissions permission
WHERE permission.code IN ('service_requests.read', 'service_requests.write')
  AND (role.key IN ('owner', 'administrator', 'member')
       OR (role.key = 'viewer' AND permission.code = 'service_requests.read'));
--> statement-breakpoint
DROP POLICY service_requests_tenant ON service_requests;
--> statement-breakpoint
DROP POLICY service_request_scope_items_tenant ON service_request_scope_items;
--> statement-breakpoint
DROP POLICY service_request_history_entries_tenant ON service_request_history_entries;
--> statement-breakpoint
CREATE POLICY service_requests_tenant_read ON service_requests
FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.service_requests.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY service_requests_tenant_write ON service_requests
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.service_requests.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.service_requests.write', true) = 'true');
--> statement-breakpoint
CREATE POLICY service_request_scope_items_tenant_read ON service_request_scope_items
FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.service_requests.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY service_request_scope_items_tenant_write ON service_request_scope_items
FOR ALL TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.service_requests.write', true) = 'true')
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.service_requests.write', true) = 'true');
--> statement-breakpoint
CREATE POLICY service_request_history_entries_tenant_read ON service_request_history_entries
FOR SELECT TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.service_requests.read', true) = 'true');
--> statement-breakpoint
CREATE POLICY service_request_history_entries_tenant_write ON service_request_history_entries
FOR INSERT TO ardenfold_runtime
WITH CHECK (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.service_requests.write', true) = 'true');
