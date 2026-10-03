# Ardenfold architecture overview

## Status

Ardenfold is a modular multi-tenant monolith. The implemented system is an
asset and party registry and Service Management workflow with
organization-aware authorization, PostgreSQL RLS, auditing, and safe CSV imports.
The canonical description of the
current code is the [living system map](system-map.md).

## Architectural direction

- TypeScript is used across the monorepo.
- Next.js provides the browser experience and authenticated server routes.
- NestJS and Fastify provide the API and application boundaries.
- PostgreSQL is the source of truth; Drizzle supplies schema and migration
  tooling.
- Authorization is evaluated server-side for the active organization.
- Tenant isolation is defense in depth: application authorization and forced
  PostgreSQL RLS both apply.
- Protected writes keep domain state and audit effects in one authorized
  transaction.
- Business history is separate from the security/operational audit log.

Ardenfold deliberately does not use microservices, CQRS, an event bus, or a
generic repository framework. Those are not required by the implemented
registry capabilities.

## Implemented versus planned

The following are implemented: Identity & Access, Parties, Asset Registry,
Registry Import, authorization, audit, observability, shared contracts,
database migrations/RLS, UI primitives, test infrastructure and M4 Service
Management requests, quotations, work orders/items, receipts and operational reads.

Technical execution, certificates, private file
storage, notifications, external integrations, and mobile/offline workflows
remain product-direction concepts. They must not be represented as current
runtime modules until a scoped implementation exists.

The [Service Management model](../domain/service-management.md) now defines the
M4 request-to-work-order design, including optional receipt and readiness for
technical execution. The [Technical Operations model](../domain/technical-operations.md)
defines M5 execution revisions, results, evidence and exact review/approval.
That documented capability map adds no runtime modules; Technical Operations,
file storage and Certificates & Trust remain scoped implementation work.

## Related references

- [Living system map](system-map.md)
- [Domain boundaries](../domain/boundaries.md)
- [Tenant isolation](../development/tenant-isolation.md)
- [Architecture decision records](../adr/README.md)
