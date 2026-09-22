# ADR-0002: Use local RBAC and verified organization context

- Status: Accepted
- Date: 2026-09-22
- Decision owners: Ardenfold engineering

## Context

An authenticated WorkOS subject may belong to zero, one or many Ardenfold organizations.
An organization identifier supplied by a browser is a routing preference, not proof of access.
Authorization must also remain current when a membership is suspended or a role changes.

## Decision

Ardenfold owns a stable, language-neutral permission catalog and four initial system roles:
`owner`, `administrator`, `member` and `viewer`. Memberships reference roles by immutable UUID;
role labels and other visible copy remain in web translation catalogs. The normalized role and
permission tables allow permissions to evolve without changing membership rows. Organization-
defined custom roles are deliberately deferred; the role identity shape permits adding tenant
ownership later without replacing membership foreign keys.

The web stores the selected organization as an `HttpOnly`, `SameSite=Lax` preference cookie. It
sends an `x-ardenfold-organization-id` header only from server-side API calls. Neither the cookie
nor the header grants access.

For every organization-scoped API route:

1. Authentication resolves the local user.
2. A permission decorator declares the route's minimum permission contract.
3. The authorization guard validates the organization identifier and loads the active local
   membership, role and permissions.
4. Tenant work uses `withAuthorizedTransaction`, which revalidates membership and permissions
   inside the same transaction that establishes PostgreSQL RLS context and performs the operation.

The second check is intentional: a guard-only check would permit a role or membership change
between authorization and the domain write. Tenant services must not call the lower-level RLS
transaction helper directly.

Organization discovery uses a separate user-scoped transaction mode. RLS permits that mode to
read only the authenticated user's active membership rows and their active organizations. Tenant
mode remains restricted to one organization. Permission-derived transaction settings provide a
controlled path for operations such as member listing without broad cross-tenant reads.

WorkOS organization, role and permission claims remain ignored.

## Alternatives considered

- Trusting an organization header was rejected because it turns a routing value into an
  authorization credential.
- Storing the active organization in the WorkOS organization/session model was rejected because
  it couples the domain and revocation behavior to the identity provider.
- Encoding permissions only in application enums was rejected because membership and role
  persistence would lack referential integrity and safe migration semantics.
- Creating custom roles now was rejected because their naming, delegation and lifecycle product
  rules are not yet known. Stable role IDs preserve the migration seam without inventing UI and
  policy prematurely.

## Consequences

- Membership suspension and role changes take effect on the next organization operation without
  waiting for the authentication token to expire.
- New routes fail closed unless they explicitly declare permissions and use the authorized
  transaction boundary for tenant data.
- The API performs an additional small indexed authorization query for tenant operations. This is
  preferred over stale permission caches; caching may be introduced later with explicit
  invalidation and bounded staleness.
- System role catalog changes require a database migration and corresponding contract update.
- Organization creation needs a narrowly scoped bootstrap transaction because no membership
  exists until the owner row is created; issue #26 owns that atomic use case.
