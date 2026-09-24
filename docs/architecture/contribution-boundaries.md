# Contribution boundaries

Start with the [living system map](system-map.md), then change the narrowest
owning capability. The repository tree is part of Ardenfold's architecture.

## Placement rules

- API controllers own HTTP translation and route composition; application
  services own authorized business behavior.
- Next.js route files own framework boundaries and screen composition; product
  behavior, API adapters, forms, and feature-specific UI belong under
  `apps/web/src/features/<domain>`.
- Put a capability beside its domain owner. Promote code to a package only after
  genuine reuse across owners exists.
- `@ardenfold/contracts` exposes its public package API from the root entry
  point. Domain code must not rely on unsupported deep imports into another
  package or feature.
- Tests live next to the invariant or capability they prove. Keep real
  PostgreSQL/RLS setup visible where tenant isolation is the assertion.

## Dependency direction

Product domains may depend on shared contracts, database, observability, UI,
and test utilities. They may not bypass another domain's protected application
behavior by writing directly to its persistence tables. API and web code may
consume public contracts but must not duplicate them.

## Cohesion rules

File size is a signal, not a CI rule. Split when responsibilities have
independent reasons to change or when a domain capability cannot be found from
the tree. Do not create `utils`, `helpers`, `services`, `components`, or
`shared` as default dumping grounds; use an explicit domain/capability name and
keep a shared folder narrow when one is warranted.

## Hygiene

Follow [repository hygiene](../development/repository-hygiene.md). Local caches
and build output remain ignored; reviewed migrations, the root lockfile, and
intentional API artifacts remain versioned.

## Before opening a PR

- Keep public route and contract compatibility unless the issue explicitly
  changes it.
- Preserve server authorization, transaction boundaries, audit behavior, and
  PostgreSQL RLS.
- Run the relevant lint, typecheck, tests, build, OpenAPI, and security suites.
- Use the current PR template and link the issue with `Closes #<number>`.
