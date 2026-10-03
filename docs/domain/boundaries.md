# Module boundaries

Ardenfold starts as a modular monolith.

These are logical ownership boundaries, not a requirement to deploy independent
services or create a package for every module immediately.

## Ownership

| Module | Owns | Does not own |
| --- | --- | --- |
| Identity & Access | Users, external identities, sessions, organizations, sites, memberships, invitations, authorization assignments, and organization settings. | Customer records, technical results, or certificate content. |
| Parties | Organization-scoped counterparts, contacts, addresses, and commercial relationships. | Authentication identities or platform memberships. |
| Asset Registry | Asset identity records, identifiers, ownership, custody, location, and references used to assemble asset history. | Commercial terms, technical measurements, or certificate snapshots. |
| Service Management | Requests, pre-execution requested scope, quotes/revisions, acceptance/rejection/expiry, accepted commercial scope, work orders/items, receipts and operational readiness. | Counterpart identity, asset identity/ownership/custody/location authority, technical execution/results/evidence/review/approval, or certificate preparation/issuance. |
| Technical Operations | Stable executions, numbered technical revisions, method/performance context, typed results, contextual evidence, exact-revision reviews/approvals and approved technical packages. | Work Item/readiness authority, asset identity/relationships, membership assignments, commercial acceptance, private storage mechanics or issued certificate versions. |
| Certificates & Trust | Certificate preparation, issuance, immutable issued versions, replacement, revocation, and verification views. | Editing the source execution or granting organization membership. |
| Audit | Protected records of relevant actions across the platform. | Business authorization decisions or the primary state of other modules. |

## Allowed interactions

Identity & Access exposes the authenticated actor and validated authorization
context used by protected application operations.

Parties exposes references and authorized business information needed by
Service Management and Asset Registry.

Asset Registry exposes authorized asset references and explicit operations
for changes such as custody or location updates.

Service Management coordinates agreed work and requests asset-related changes
through Asset Registry operations. Its [implementation model](service-management.md)
defines immutable issued revisions, explicit acceptance, operational allocation
and the M4 boundary at readiness for Technical Operations. Customer agreement
does not grant an Ardenfold user permission to authorize work.

Technical Operations references work items and assets. Its
[implementation model](technical-operations.md) defines the M5 handoff from
eligible ready work, revision immutability, exact decimal/unit semantics,
private evidence and approval of one explicit revision. Service Management
owns transaction-composable readiness and consumed-work guards; Technical
Operations cannot directly edit operational records. Approved packages expose
one exact approval/revision through explicit read contracts, never whichever
content happens to be latest.

Certificates & Trust consumes the approved results and identifying information
needed to prepare an issued snapshot.

Audit receives relevant action records. Business modules do not depend on
querying audit records to reconstruct their normal current state.

## Interaction rules

1. Each module is authoritative for its own business state.
2. Cross-module writes use explicit application operations.
3. A module must not bypass another module by directly updating its tables.
4. Cross-module reads use declared query contracts or purpose-built read models.
5. Read models must preserve the same access boundaries as their source records.
6. Read models are not an alternative authority for business writes.
7. Cross-module operations that require atomicity use an explicit transaction
   boundary owned by the coordinating use case.
8. External side effects are not assumed to succeed inside a database transaction.
9. Reliable asynchronous delivery is introduced when a concrete workflow needs it.
10. Dependencies must not create circular business ownership.

A receipt may coordinate an Asset Registry custody change, but Service
Management does not become the owner of custody history. Receipt and required
custody/location changes use one authorized transaction through composable
Asset Registry operations, including each owner's history and audit effects.
Receipt never implies ownership transfer. Historical identifying snapshots
preserve agreements; current Party/Asset reads remain permission-filtered and
do not create alternate write authorities.

Certificate issuance may read approved technical results, but Certificates &
Trust cannot modify those results to make issuance succeed.

## Shared packages

The existing shared packages support these boundaries.

- `packages/core`: narrowly shared domain primitives that have demonstrated
  reuse. It is not a container for every business entity.
- `packages/contracts`: explicit transport contracts. It does not expose database
  rows or unrestricted internal domain objects.
- `packages/database`: database connectivity, schema infrastructure, and
  migrations. Shared infrastructure does not grant unrestricted table access.
- `packages/ui`: reusable presentation components without business authorization.
- `packages/config`: shared tooling and configuration conventions.
- `packages/observability`: operational logging and tracing conventions.
- `packages/test-utils`: reusable test support without production responsibilities.

Business rules must remain enforceable by server-side use cases, regardless
of which client initiates an operation.

## Infrastructure capabilities

File storage, email delivery, queues, and telemetry support business modules.
They do not decide who owns an asset, who may approve a result, or whether a
certificate may be issued.

Private file infrastructure owns finalized byte identity and safe transfer.
Technical Operations owns Evidence and authorizes its associations/downloads.
Uploading alone grants no technical meaning or access; immutable historical
references exclude objects from ordinary orphan cleanup. Public certificate
verification never implies public technical evidence.

Background jobs carry explicit execution scope and use an authorized execution
identity. A job payload containing an organization identifier is not sufficient
authorization.

## Deferred design

This issue does not define:

- Database tables or column names.
- Final endpoint paths or transport schemas.
- Detailed permission names.
- A complete technical-result schema for every discipline.
- Provider marketplace behavior.
- Automatic cross-organization asset matching.
- Independent service deployment.
- Full event sourcing.

Those decisions require their corresponding implementation use cases.
