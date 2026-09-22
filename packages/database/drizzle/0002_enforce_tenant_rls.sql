DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ardenfold_runtime') THEN
        CREATE ROLE ardenfold_runtime
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOREPLICATION
            NOBYPASSRLS;
    ELSE
        ALTER ROLE ardenfold_runtime
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOREPLICATION
            NOBYPASSRLS;
    END IF;
END
$$;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO ardenfold_runtime;
--> statement-breakpoint
REVOKE ALL ON TABLE
    external_identities,
    organization_memberships,
    organization_sites,
    organizations,
    users
FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    external_identities,
    organization_memberships,
    organization_sites,
    organizations,
    users
TO ardenfold_runtime;
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organizations_tenant_isolation ON organizations
    FOR ALL
    TO ardenfold_runtime
    USING (
        id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    )
    WITH CHECK (
        id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    );
--> statement-breakpoint
ALTER TABLE organization_sites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organization_sites FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organization_sites_tenant_isolation ON organization_sites
    FOR ALL
    TO ardenfold_runtime
    USING (
        organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    )
    WITH CHECK (
        organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    );
--> statement-breakpoint
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organization_memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organization_memberships_tenant_isolation ON organization_memberships
    FOR ALL
    TO ardenfold_runtime
    USING (
        organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    )
    WITH CHECK (
        organization_id = NULLIF(current_setting('ardenfold.organization_id', true), '')::uuid
    );
