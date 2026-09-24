# Ardenfold

Ardenfold is a multi-tenant platform for technical asset traceability. Its
implemented product surface is an organization-aware registry for parties and
assets, including temporal custody relationships and safe CSV imports.

## Current product stage

The completed M2 foundation provides:

- **Identity & Access:** authenticated users, organizations, sites,
  memberships, invitations, roles, and permissions.
- **Parties:** organization-local customers and providers, identifiers,
  contacts, channels, and addresses.
- **Asset Registry:** asset identity, typed identifiers, lifecycle and archive
  state, and independent ownership, custody, and location histories.
- **Registry Import:** bounded CSV preview, validation, explicit confirmation,
  resumable commit, and error export.

Service requests, quotations, work orders, technical execution, certificates,
documents, notifications, integrations, and a mobile application are future
concepts. They are not implemented modules or public product behavior today.

## Start here

[The living system map](docs/architecture/system-map.md) is the canonical
starting point for navigating the repository. It maps current ownership,
request flows, public contracts, database boundaries, and the tests that prove
important guarantees.

Supporting references:

- [Domain boundaries](docs/domain/boundaries.md)
- [Parties and Asset Registry model](docs/domain/parties-and-asset-registry.md)
- [Tenant isolation](docs/development/tenant-isolation.md)
- [Database and migration workflow](docs/development/migrations.md)
- [Architecture decisions](docs/adr/README.md)

## Repository

```text
apps/
  api/          NestJS API, authorization, domain application services
  web/          Next.js operational experience and server-side API adapters
  worker/       Worker process scaffold; no product jobs are implemented yet
packages/
  contracts/    API schemas, inferred types, and OpenAPI registration
  database/     Drizzle schema, reviewed migrations, RLS, and test factories
  observability/ Structured logging and correlation utilities
  test-utils/   Reusable test infrastructure
  ui/           Reusable presentational primitives
docs/           Architecture, domain, development, operations, and test guides
```

## Local development

```powershell
Copy-Item .env.example .env
pnpm db:up
pnpm dev
```

Verify the API and PostgreSQL connection with:

```powershell
Invoke-RestMethod http://localhost:3001/health/ready
```

See [the local database guide](docs/development/database.md) for configuration
and troubleshooting.

## Security

Never commit passwords, API keys, tokens, private certificates, or production
environment files. Commit only documented example values in `.env.example`.

## License

Copyright © 2026 Ardenfold. All rights reserved. This proprietary repository is
not licensed for public use, modification, or distribution.
