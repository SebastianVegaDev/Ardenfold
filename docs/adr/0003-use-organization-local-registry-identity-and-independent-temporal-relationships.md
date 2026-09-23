# ADR-0003: Use organization-local registry identity and independent temporal relationships

- Status: Accepted
- Date: 2026-09-23
- Decision owners: Ardenfold engineering

## Context

Organizations need to record business counterparts and physical assets before
Ardenfold has an explicit cross-organization sharing product. Tax identifiers
and serial numbers are useful duplicate evidence but are often absent, reused,
incorrect or private. Ownership, custody and location can change independently
and must be explainable over time.

## Decision

Parties and assets are organization-scoped aggregates protected by the existing
verified organization context and PostgreSQL RLS. Typed identifiers preserve
original and normalized values but are not global identity keys. Duplicate
signals are limited to safe organization-local candidates and never merge data.

Ownership, custody and location are separate effective-dated relationship
streams. Transitions close the open interval and create the next interval in
one authorized transaction; corrections are explicit, historically visible
business events. Registry history is an immutable domain record and is written
alongside security audit records, which remain a distinct concern.

## Alternatives considered

- A global party or asset catalog was rejected because a matching identifier is
  insufficient authority to expose another tenant's private business data.
- One generic asset-status/history stream was rejected because it conflates
  legal ownership, physical responsibility and physical placement.
- Reconstructing business history from audit records was rejected because audit
  captures security actions rather than complete business semantics.
- Mutable in-place relationship rows were rejected because they cannot explain
  prior state or safe correction intent.

## Consequences

- M2 uses tenant-local uniqueness and RLS for defense in depth; no public
  identifier lookup is added.
- Relationship writes require temporal exclusion/validation and transactional
  history plus audit persistence.
- Future sharing needs a new explicit aggregate and authorization policy.
- The initial model has more focused tables and commands, but avoids a costly
  future split of one ambiguous ownership/custody/location record.
