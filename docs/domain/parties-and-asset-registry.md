# Parties and Asset Registry implementation model

This document turns the approved domain language into the implementation model
for M2. It defines ownership, invariants, API boundaries and lifecycle rules;
the database and transport issues choose the concrete schema and contracts.

## Module ownership

`Parties` owns organization-local counterpart records: parties, their roles,
identifiers, contacts, contact channels and addresses. `Asset Registry` owns
organization-local assets, their identifiers, and their ownership, custody,
location and business-history records. Neither module owns authenticated users,
memberships or permissions; those remain in Identity & Access.

Every registry aggregate is tenant-scoped. A reference to a party, contact or
asset is valid only after it has been resolved through the active authorized
organization transaction. UUIDs are opaque identifiers, not authorization
credentials.

| Aggregate          | Owned records                                            | Key invariant                                                                                     |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Party              | party, roles, identifiers, contacts, channels, addresses | A party is a private organization record, never a platform principal.                             |
| Asset              | asset, identifiers                                       | An asset is private to its recording organization; identifiers are evidence, not global identity. |
| Asset relationship | ownership, custody or location interval                  | Each relationship has independent temporal history.                                               |
| Registry history   | immutable business events                                | History explains business change and is not reconstructed from audit logs.                        |

## Parties

A party has a display name, a kind (`organization` or `individual`), optional
legal name, lifecycle state and an aggregate version. It may hold zero or more
active roles: `customer` and `provider`. A party can hold both roles; roles are
not separate records that duplicate the party's identity.

Party identifiers are typed, retain their original entered value and store a
comparison-normalized value. Identifier type determines normalization and
whether a value may be empty; no party identifier is globally unique. A
normalized identifier may be unique only within the organization and type when
that rule is explicitly selected by the database implementation. Duplicate
candidates are advisory, organization-local and must never merge records.

Contacts are people or operational points of contact associated with a party.
They are not users, identities, memberships or implicit invitation targets.
Contact channels (email, phone or other supported type) and addresses belong to
the party aggregate. An address is a business contact address, not evidence of
asset custody or physical location.

Archiving a party removes it from ordinary selection and mutation workflows but
does not erase it, its contacts or its historical references. Restore is an
explicit versioned transition. A party with historical references cannot be
hard-deleted by normal product operations.

## Assets and identity

An asset has a display name, optional manufacturer, model and classification,
lifecycle state and aggregate version. Asset identifiers are typed references:
an internal identifier, serial number, customer code or another controlled
type. Original and normalized values are preserved. Serial numbers, tax
identifiers and manufacturer/model combinations are never global uniqueness or
visibility mechanisms.

The identity schema uses `registered`, `in_service`, `out_of_service` and
`retired` as lifecycle values. Archival is independent of that lifecycle: it
marks whether the asset remains in ordinary registry workflows. Identifiers
may be retired but are not deleted, allowing a replacement to preserve the
previous value. Matching normalized identifiers, even within one
organization, remain advisory evidence rather than an automatic merge.

An asset may refer to a party only through an authorized party reference in the
same organization. The initial model deliberately has no direct reference to a
different organization's party, asset or private history. Future sharing uses a
new explicit, authorized sharing aggregate rather than weakening these foreign
key and tenant rules.

Archiving an asset hides it from ordinary active-registry workflows but keeps
its identifiers, relationships and history readable to authorized users.
Restoring is explicit and versioned. Normal operations do not delete an asset
with business history.

## Ownership, custody and location

Ownership, custody and location are separate relationship streams. A change in
one never implicitly changes either of the others or a user's authorization.

- Ownership associates an asset with an organization-local party over an
  effective interval. The owner may be unknown; unknown is not an inferred
  party.
- Custody associates an asset with an organization-local party over an
  effective interval. Physical receipt is a future Service Management event;
  it must request an Asset Registry custody operation rather than write this
  stream directly.
- Location records a structured free-form placement description and optional
  organization-local site reference over an effective interval. Location never
  grants access or establishes custody.

For each stream, normal transitions close the current open interval and create
a new one in one transaction. An effective timestamp cannot create overlapping
intervals for the same asset and relationship type. A correction creates a
new, linked correction event and adjusts the affected intervals transactionally;
it never silently overwrites the reason, actor, time or prior business context.
The implementation may restrict corrections to a safe supported interval shape
until richer temporal editing is explicitly designed.

## History and audit

The registry writes immutable, tenant-scoped business-history entries for
creation, archive/restore, identifier changes and relationship transitions or
corrections. Each entry records event type, aggregate reference, occurred time,
actor reference when available, version/correlation reference, and a safe
domain payload sufficient to explain the event.

Security-relevant attempts and successful mutations also write Audit records
through the existing audit module. Audit proves who attempted an operation;
registry history explains the evolving business record. Neither replaces the
other, and normal reads of current state never rebuild state from either log.

## Authorization and concurrency

The M2 permission catalog extends the existing organization context with:

| Permission                    | Allows                                                        |
| ----------------------------- | ------------------------------------------------------------- |
| `parties.read`                | Read parties, contacts, addresses and identifiers.            |
| `parties.write`               | Create and edit active party aggregates.                      |
| `parties.archive`             | Archive or restore parties.                                   |
| `assets.read`                 | Read assets, identifiers, relationships and registry history. |
| `assets.write`                | Create and edit active assets and identifiers.                |
| `assets.manage_relationships` | Change or correct ownership, custody and location.            |
| `assets.archive`              | Archive or restore assets.                                    |
| `registry.import`             | Preview and confirm registry import sessions.                 |

All permissions are enforced by the existing authorization guard and
`withAuthorizedTransaction`; UI visibility is only a usability control. New
write operations require an aggregate version supplied by the caller. The
database update compares that version and increments it in the same
transaction. A mismatch returns a stable conflict response without applying a
partial write. Relationship transitions, history and audit writes share the
same transaction boundary.

## API resource boundaries

The API exposes organization-scoped resources for parties and assets, nested
resources for their identifiers, contacts, channels and addresses, explicit
commands for archive/restore and relationship transitions, and read-only
history resources. It does not expose generic table CRUD or cross-tenant lookup
endpoints. Bulk import is a separate versioned session resource and executes
accepted rows through these same application commands.

Clients can request a duplicate-candidate signal, but receive only the
organization-local safe summary needed to avoid accidental duplication. A
candidate is not an equality claim and contains no cross-organization data.

## Failure semantics and non-goals

Missing membership, inactive membership, missing permission and cross-tenant
references fail without disclosing whether the target exists. Invalid versions
fail as conflicts; invalid temporal transitions fail without changing state.
Unexpected audit/history persistence failure rolls back the domain mutation.

M2 does not introduce service requests, quotes, work orders, receipts,
technical results, certificates, global master data, automatic matching,
cross-organization sharing, a provider marketplace, a customer portal or event
sourcing. Those capabilities must use explicit future contracts rather than
repurpose party, asset or registry-history records.
