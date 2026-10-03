GRANT DELETE ON TABLE execution_conditions, execution_supporting_assets TO ardenfold_runtime;
--> statement-breakpoint
CREATE POLICY execution_conditions_delete ON execution_conditions FOR DELETE TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.technical_executions.write', true) = 'true');
--> statement-breakpoint
CREATE POLICY execution_supporting_assets_delete ON execution_supporting_assets FOR DELETE TO ardenfold_runtime
USING (ardenfold_service_request_tenant_allowed(organization_id)
       AND current_setting('ardenfold.permission.technical_executions.write', true) = 'true');
