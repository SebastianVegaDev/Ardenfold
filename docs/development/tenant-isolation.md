# Tenant isolation

Ardenfold enforces tenant scope in both application authorization and PostgreSQL. RLS is
defense in depth: it limits the impact of a missing predicate or repository bug, but it
does not replace membership and permission checks.

## Database identities

The database has separate trust levels:

- the migration identity owns schema objects and is used only by controlled migration or
  maintenance jobs;
- `ardenfold_runtime` is a `NOLOGIN` capability role with explicit table privileges;
- the API login is a non-owner member of `ardenfold_runtime`, without `SUPERUSER`,
  `CREATEROLE`, `CREATEDB`, replication or `BYPASSRLS`.

Production secret delivery must ensure the API and workers cannot read
`DATABASE_MIGRATION_URL`. A health check made with the runtime URL proves connectivity,
not migration authority.

The initial RLS migration bootstraps the `ardenfold_runtime` capability role and therefore
needs role-management authority once. After bootstrap, the migration login should retain
only the ownership and grant capabilities required for forward migrations; permanent
cluster-wide administration is not an application requirement.

## Protected tables

RLS is enabled and forced on current tenant-owned tables:

- `organizations`, scoped by `id`;
- `organization_sites`, scoped by `organization_id`;
- `organization_memberships`, scoped by `organization_id`.

`users` and `external_identities` are global Identity & Access records and are not tenant
tables. Access to them remains inside that module. A provider identity or global user ID
does not authorize access to any organization.

Each new tenant table must add `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, a
policy for the runtime role and two-organization isolation tests in its introducing
migration. Runtime grants are explicit; no default privilege automatically exposes
future tables.

## Transaction context

Tenant operations use `withTenantTransaction` from `@ardenfold/database` (or the
`DatabaseService` wrapper). It validates canonical UUIDs and sets both values with
transaction-local PostgreSQL configuration:

```text
ardenfold.organization_id
ardenfold.user_id
```

The callback and context share one database transaction. PostgreSQL clears both settings
on commit or rollback before the pooled connection is reused. Code must not set these
values with session scope, concatenate them into SQL, or run tenant repositories through
the raw/global database handle.

Missing organization context produces no tenant reads and rejects tenant inserts. An
invalid UUID also fails closed. The organization ID is still trusted input from the
authorization layer: before a business operation runs, #25 must prove that the
authenticated local user has an active membership and the required Ardenfold permission
for that organization.

## Background jobs

A job payload containing an organization ID is not authorization. A worker must:

1. authenticate the job source and load the durable job record;
2. resolve the actor type and current authority required by the use case;
3. open a tenant transaction with the resolved organization and actor context;
4. execute all tenant persistence inside that callback;
5. fail rather than substituting a default organization when context is absent.

System actors need an explicit policy and auditable identity. They do not receive the
migration credential merely because work runs asynchronously.

## Privileged maintenance

Schema migrations, restore procedures and exceptional data repair use a separately
distributed privileged credential. Access is time-bounded and audited operationally.
Maintenance code should still select an explicit tenant context whenever possible.

Never solve an incident by granting `BYPASSRLS` to the runtime login, making it a table
owner, disabling `FORCE ROW LEVEL SECURITY`, or placing the migration URL in the normal
application environment. Cross-tenant repair requires reviewed SQL, a backup or recovery
point, dry-run selection, bounded targets and post-operation verification.

## Future cross-organization access

Legitimate sharing will use explicit grant records owned by the relevant domain. A grant
must identify grantor and grantee organizations, resource or bounded scope, capability,
lifecycle, validity window and audit reason. RLS policies may later admit rows through an
indexed `EXISTS` check against those grants.

Cross-organization access will not be implemented by disabling RLS, passing a list of
tenant IDs in a setting, or assigning a permanently privileged application role. The
policy and its two-sided authorization rules require a dedicated domain issue and
isolation tests before introduction.
