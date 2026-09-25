# Service Management implementation model

This is the authoritative request-to-work-order model for M4, defined by
[#89](https://github.com/SebastianVegaDev/Ardenfold/issues/89). It specifies
business behavior for M4 implementation. Request persistence is implemented in
#90 and the request API in #91; web workflows are still planned. M4 ends at
readiness for technical execution. M5 Technical Operations owns execution,
results, evidence, review and approval.

Read this with the [glossary](glossary.md), [boundaries](boundaries.md),
[workflow invariants](workflow-and-invariants.md), and existing
[registry model](parties-and-asset-registry.md). This document owns the detailed
Service Management rules; the other documents summarize and link to them.

## Ownership and relationships

Service Management owns requests, pre-execution requested scope, quotations,
revisions, commercial decisions, accepted scope, work orders, work items,
physical intake records and operational readiness. It owns their business
history, separately from protected Audit records.

| Other owner | Referenced authority; never duplicated as Service Management authority |
| --- | --- |
| Parties | Customer/provider identity and roles, contacts and addresses. A customer need not have an Ardenfold account. |
| Asset Registry | Asset identity, identifiers, ownership, custody, location and asset business history. |
| Identity & Access | Users, organizations, sites, memberships and authorization assignments. |
| Audit | Protected action records; not the source of commercial or operational history. |
| Technical Operations | Future execution, measurements, results, evidence, review and approval. |
| Certificates & Trust | Future certificate preparation, issuance, immutable versions, replacement, revocation and verification. |

```text
Service Request -> Quote -> Quote Revision -> Acceptance
       |                       |                  |
       +-----------------------+------------> Work Order
                                                  |
                                              Work Items
                                                  |
                                     optional Receipt references
                                                  |
                                  ready for technical execution
```

Arrows denote references/derivation, never conversion or deletion. All records
are organization-owned. A request may have several quotes; each quote belongs
to one request and has numbered revisions. Each acceptance names exactly one
revision. M4 accepts a whole revision, not selected lines. One acceptance may
authorize at most one work order, including a subsequently cancelled order.
A work order has one or more work items. Each item maps to one revision line;
a line may map to several items. Several items may reference the same asset.
Separate quotes on a request represent explicitly distinct scopes, not an
automatic means of replacing an existing agreement.

The aggregate boundaries are Request; Quote with its revisions and commercial
decisions; Work Order with its items and scope allocations; and Receipt with
its correction history. Each has its own optimistic version. Mutating a child
also advances its owning aggregate's version. Cross-aggregate guards must be
checked atomically as described below; a UUID reference alone proves nothing.

## Service Request

A request durably records what a customer asked for, independently of whether
any offer is made. It contains:

- an organization-local customer Party reference, an optional contact belonging
  to that party, and requester attribution as supplied when no contact exists;
- requested scope and free-form customer context, recorded time and actor;
- zero or more known asset references and/or descriptions of unidentified
  assets, without creating placeholder Asset Registry records;
- an optional operational site in the organization; the site may remain unknown
  until work authorization;
- its lifecycle, version and business history.

An active request permits scoped corrections and additions. Preserve prior
values, actor, time and reason when requested scope, customer context or asset
references change. Downstream revisions retain the request version/context
used to prepare them. They do not live-bind their scope to later request edits.
Once a quote exists, changing the customer requires a new request; correcting
the customer's identity data belongs to Parties. Terminal requests are
read-only apart from appended explanatory history.

| State | Allowed transition and guard | Authority |
| --- | --- | --- |
| `active` | Created by recording a customer need; may be edited. | Request management |
| `active` -> `cancelled` | Withdraw the request with a reason, after open quotes are explicitly closed and any acceptance/work authorization has been resolved. | Request management |
| `active` -> `closed` | Administrative completion after every quote is terminal and no nonterminal work order remains. Record the outcome/reason. | Request management |
| `cancelled`, `closed` | Terminal; no reopening or creation of new quotes/orders. A renewed need is a new linked request. | Read/history only |

Request cancellation never cascades silently to quotes or work orders. An
accepted quote can be terminal commercially while its work order remains
operationally active; that prevents closing the request. An accepted revision
without an order must first be explicitly withdrawn before request termination.

## Quote and Quote Revision

A Quote is the stable commercial identity within a request: organization-local
reference number, customer/request references, version and commercial history.
The request/customer references cannot be reassigned. A Quote Revision owns
the proposed scope, prices and terms. Revision numbers are strictly increasing
positive integers allocated within the quote, never reused even for abandoned
drafts. Revision identity and mutable aggregate version are different values.

At most one draft and one currently offered revision exist per quote. A draft
may be edited with the quote version. Creating a draft copies a specified prior
revision's content into a new identity; it does not withdraw the current offer.
Issuing that draft atomically supersedes any still-offered earlier revision.
An abandoned draft is retained as `discarded`.

Issuing means an authorized user makes the revision an external offer and
records issue time/channel; it does not promise email delivery. All issued
content, including superseded, rejected and expired revisions, is immutable.
Subsequent decisions change lifecycle metadata and append business facts, not
the issued document. A draft cannot be accepted directly.
Any draft preview must be identified as a draft; external offer recording goes
through issue so no externally meaningful agreement depends on mutable content.

Each revision contains ordered lines with stable identities within that
revision, scope/description, positive quantity and explicit unit, unit price,
line adjustments and totals. Optional Party/Asset references supplement
human-readable scope; asset identification may be incomplete. A copied line
can retain a predecessor reference, but gets a distinct revision-line identity.
Commercial terms include payment/delivery conditions as applicable, service
location/intake expectations, exclusions, currency and validity. A revision
must contain at least one line before issue.

### Amounts and deterministic rounding

These are calculation policy M4 version 1, not a tax/accounting engine:

- Each revision uses one explicit supported currency code and a frozen currency
  minor-unit scale (0 through 4). No implicit currency, mixed-currency totals or
  exchange conversion. Currency configuration must select the appropriate
  scale before issue; later configuration changes cannot recalculate history.
- Quantity and nonnegative unit price accept up to 12 integral and 6 fractional
  decimal digits. Money amounts accept up to 18 integral digits and the
  revision's currency scale. Reject excess precision and overflow explicitly;
  never truncate inputs or round them through a JavaScript `number`.
- API values are canonical base-10 decimal strings; persistence uses exact
  decimals or scaled integers. Arithmetic uses exact decimal intermediates
  with enough precision for the full product (24 integral/12 fractional digits
  for quantity times unit price), plus checked sums.
- A line base is quantity times unit price, rounded once to the currency scale
  using round-half-up (ties away from zero). Line adjustments are explicitly
  labelled signed fixed amounts in that currency, already at its scale. Line
  total is rounded base plus those adjustments. Require a nonnegative result.
- Revision subtotal is the sum of line totals. Explicitly labelled fixed
  revision adjustments, such as discounts or quoted tax amounts, are added to
  that subtotal to produce the nonnegative grand total. No percentage rules,
  tax inference, hidden residual allocation or further total rounding is
  introduced in M4. Zero-price work is allowed with explicit commercial terms.
- Service Management calculates and validates totals server-side. Persist
  inputs, calculated amounts, currency scale and calculation-policy version
  on the issued revision. A client total is never authoritative. Formatting
  and localization cannot change these values.

For example, with scale 2, quantity `3` at unit price `0.335` produces base
`1.01`; a line adjustment `-0.01` produces `1.00`. Two such lines total `2.00`.
Rounding each unit price first would incorrectly produce `2.04` and is invalid.

### Commercial lifecycles

Quote lifecycle is independent of revision lifecycle and all operational
states. A quote is `open`, `accepted` or `closed`:

| Transition | Guard and effect | Authority |
| --- | --- | --- |
| Create -> `open` | Active request and valid customer. | Quote preparation |
| `open` -> `accepted` | Record acceptance of the currently eligible offered revision. | Commercial decision recording |
| `accepted` -> `open` | Explicitly withdraw/invalidate the active acceptance under the rules below. | Commercial correction |
| `open` -> `closed` | Record reason; withdraw any offer and discard any draft atomically. | Quote issue/withdrawal |
| `closed` | Terminal; a new commercial proposal requires a new quote. | Read/history only |

Rejecting/expiring one revision leaves the quote open for another proposal.
`accepted` prevents another active acceptance, but is reversible only by an
explicit commercial fact; it is not evidence that work has been performed.

| Revision transition | Meaning and authority |
| --- | --- |
| Create -> `draft` | Quote preparation may edit content with the quote version. |
| `draft` -> `offered` | Quote issue authority validates complete terms, amounts and snapshots, freezes content, and supersedes any previous offer. |
| `draft` -> `discarded` | Quote preparation abandons the retained draft. |
| `offered` -> `accepted` | Commercial decision authority records the exact acceptance. |
| `offered` -> `rejected` | Commercial decision authority records customer rejection, attribution/time and reason when known. |
| `offered` -> `expired` | The validity deadline is reached; see time semantics below. |
| `offered` -> `superseded` | Quote issue authority issues a newer revision. |
| `offered` -> `withdrawn` | Quote issue/withdrawal authority explicitly removes the offer with a reason. |

`discarded`, `accepted`, `rejected`, `expired`, `superseded` and `withdrawn`
are terminal revision states. No terminal revision returns to draft/offered.
Acceptance withdrawal does not erase the revision's historical `accepted`
decision. A new offer needs a new revision.

Validity is either an explicit UTC deadline or explicitly no expiry. For a
deadline, acceptance is eligible only while server transaction decision time
is strictly earlier than that instant. Equality means expired. Convert any
user-entered local deadline with an explicit timezone before issue; there is
no implicit end-of-day rule. Expiry is effective even before a write has
materialized its state: reads can derive it and every mutation must check it.
If persisted, expiry and its history/audit are written in an authorized
transaction; no expiry worker or user-visible audit claim is invented here.
An expired offer cannot be retroactively accepted by backdating customer time.

A draft may be prepared after acceptance, but cannot be issued or accepted
while that acceptance is active. M4 does not implement amendments to active
authorized work. First resolve the existing acceptance and work order as below;
then issue a new revision. Never replace an accepted-revision pointer or
recalculate old work from the newest revision.

## Acceptance is a business fact

An acceptance records organization, quote and exact revision identity, the
customer agreement time when known, server recording time, recording user,
and the person/contact who supplied agreement when known. Keep supplied
attribution distinct from the authenticated actor; unknown attribution remains
explicitly unknown. A simple channel such as phone, email or in-person plus
an optional external reference/context is sufficient. No signature system,
mailbox integration or customer authentication is required.

The authorized mutation validates an active request/customer and the currently
offered, unexpired revision in the same transaction. It freezes no new prices:
the issued revision is already immutable. Partial acceptance is unsupported;
negotiate another revision when the customer agrees to only part of the offer.
Recording agreement does not itself authorize or create a work order.

The fact is never edited or deleted. Nonmaterial attribution/context corrections
append a linked correction with actor, time, reason and prior/corrected values.
Wrong revision, customer, scope or agreement validity requires explicit
invalidation/withdrawal, not an annotation that silently changes the agreement.

M4 permits withdrawal/invalidation only before an order exists or after its
pre-execution cancellation. Record the reason and supplied withdrawal time,
retaining the original acceptance. Withdrawal cannot occur while an order is
active, and cancelling an order does not itself withdraw acceptance. A new
acceptance may explicitly replace a withdrawn one, but must name a newly
offered revision. After technical execution begins, commercial amendment and
cancellation policy require a later scoped design; M4 supplies no bypass.

Acceptance commands carry an organization/operation-scoped idempotency key and
an expected quote version. In the authorized transaction:

1. Resolve an existing successful key before applying a fresh version check.
   The same canonical payload (including expected version) returns the original
   acceptance/result without another fact, audit success or work order. This
   remains a replay if the acceptance has since been withdrawn; expose its
   current disposition separately rather than reactivating it.
2. Reuse of the key with a different payload conflicts. Retain successful key
   association for the business record's lifetime. Failed transactions consume
   no key.
3. For a new key, compare the quote version, lock/serialize the decision, check
   eligibility, and atomically persist acceptance, version, history, audit and
   replay result. Enforce one active acceptance per quote independently of keys.

A second key is a new command, not an implicit duplicate success. Concurrent
acceptance, rejection, issue or withdrawal cannot each win; stale versions fail
explicitly. Replay still requires current tenant access and permission. Customer
agreement is a commercial fact, never a grant of Ardenfold mutation authority.

## Work Order and Work Item

A Work Order is operational authorization against one active acceptance and
its exact revision, linked to the originating request/customer. It has an
immutable organization-local reference number, organization, required operating
site, creator/authorizer and times, lifecycle, version, and item allocations.
References are display/navigation aids, not credentials; numbering need not
be gapless. Quote references follow the same uniqueness/non-reuse rule.

Creation requires work authorization permission, current expected quote and
request versions, an active request, active acceptance, active customer/site,
and a complete initial allocation. In one transaction, check the basis, create
the order/items and history/audit, and reserve the acceptance-to-order link.
Creation and withdrawal serialize on the same quote guard. An idempotency key
uses the acceptance rules above, with durable uniqueness on acceptance even
under different keys. A cancelled order does not release that uniqueness.

The accepted revision is the commercial source; store its identifier and
acceptance identifier, never an editable duplicate agreement on the order.
Snapshot the initial operational scope and line mappings so their derivation
remains explainable. Scheduling notes, responsible staff, operating site,
asset resolution and intake arrangements may evolve with versioned history
if they remain within agreed terms. Prices, customer, accepted scope and
commercial exclusions cannot change through an operational edit.

Work without a quote is unsupported in M4. A future dedicated authorization
basis could support a contract or another justified arrangement, but must
define its own permissions and durable commercial source. Do not add a nullable
acceptance bypass, free-form basis switch or generic authorization engine now.

### Operational allocation and readiness

Each item has a parent order, identity/reference within it, scope/description,
one accepted revision-line reference, allocated quantity/unit, optional asset,
relevant Party references, and a service mode of physical intake or no intake.
The customer is inherited from the order; other counterpart references never
change who accepted the agreement. Unknown asset information stays descriptive
until resolved through Asset Registry. One item targets at most one asset;
split work for several assets into separate items. Different services for one
asset may be separate items. Work genuinely without an asset must state that
in its scope; it must not masquerade as an unresolved asset.

Initial item quantities must exactly partition each accepted line quantity in
the same unit; no unallocated scope or over-allocation. Splitting a service
bundle uses explicit fractional allocation, not duplicated full quantities.
No per-item price distribution is authoritative. Cancelling/excluding an item
retains its allocation and reason, so accepted, planned and excluded scope can
be compared. It does not reduce the historical quote total. Restructuring
unstarted items must preserve prior mappings and quantities, with a versioned
replacement relationship preventing double counting; it cannot add scope.

An item is ready only if its order is active, its agreed scope is unambiguous,
its required asset is resolved and active, the site and necessary counterpart
references are valid, and its intake prerequisites are satisfied. Physical
intake needs a valid receipt for that same asset/order; no-intake/on-site work
does not. Any required custody/location change must already have succeeded
through Asset Registry. The receipt alone is not proof of current custody.

| Work Item transition | Guard and authority |
| --- | --- |
| Create -> `planned` | Work authorization establishes an in-scope allocation. |
| `planned` -> `ready` | Work management validates all readiness prerequisites. |
| `ready` -> `planned` | Work management changes preparation or records a blocker before execution; retain reason. |
| `planned` or `ready` -> `cancelled` | Work cancellation/exclusion authority records reason; retain original scope. |
| `cancelled` | Terminal; never delete, reopen or mark as technically completed. |

| Work Order transition | Guard and authority |
| --- | --- |
| Create -> `planned` | Work authorization validates the accepted basis and creates planned items. |
| `planned` -> `ready` | Work management confirms at least one noncancelled item and all noncancelled items ready. |
| `ready` -> `planned` | An item loses readiness or operational preparation changes; update order and items atomically. |
| `planned` or `ready` -> `cancelled` | Work cancellation authority records reason and cancels remaining items atomically, before execution. |
| `cancelled` | Terminal; preserves commercial basis, items and receipts. |

Cancelling the last noncancelled item must also cancel the order in the same
transaction. Marking readiness is an explicit checked transition, not proof of
execution. No `completed`/successful `closed` order transition is available in
M4: it would assert work outside this milestone. Future closure must reconcile
item outcomes via Technical Operations, keep cancellation distinct from success,
and preserve commercial history. Cancellation never returns an asset or undoes
intake/custody automatically.

Ready items are the future Technical Operations handoff: item/order identity,
organization/site, accepted revision and line, operational scope, resolved
asset where required, current version and readiness prerequisites. The future
start operation must revalidate readiness and serialize against cancellation,
correction and preparation changes; a stale ready badge is insufficient.
External archival or changed asset relationships can invalidate eligibility
even if stored state still says `ready`. No technical measurements, results,
evidence, review or approval fields belong on the item.

## Receipt and Asset Registry coordination

A Receipt records one physical unit's intake into an order. It has an immutable
identity, optional resolved asset, intake description, observed condition,
accessories/components, actual received timestamp, server recorded timestamp,
responsible actor and recording user, and related item references within the
order. An order may have multiple receipts; a receipt may support multiple
items for the same asset. All known asset/item references must agree. An
unidentified receipt can be recorded against unresolved planned work, but
cannot satisfy readiness until explicitly reconciled with an Asset Registry
identity. Reconciliation is a versioned, historically visible correction.

Receipt creation requires an active order and receipt-recording authority.
No-intake work requires no receipt and need not change custody. A repeat
physical intake is a new fact with a new command identity; retry of the same
command uses the acceptance replay rules to return the existing receipt.

The lifecycle is deliberately just recorded facts with append-only corrections.
There is no arrival/inspection/return workflow engine. Correction authority
appends the reason, actor/time, prior/corrected information and expected receipt
version. Erroneous intake may be explicitly voided by such a correction; it
remains visible but cannot satisfy readiness. Receipts on cancelled orders
remain correctable historical facts and cannot reactivate work. If a correction
invalidates readiness, affected items/order return to `planned` atomically.
Corrections after technical handoff need the future consuming domain's policy;
M4 does not silently change evidence already consumed by execution.

When intake changes custody/location, the receipt use case must invoke explicit
Asset Registry application operations in the **same authorized database
transaction**. They own target validation, expected asset version, temporal
interval rules, registry history and audit. Pass the receiving organization or
local custodian and location/site explicitly; never infer ownership transfer
from customer identity or receipt. A receipt can require both relationship
changes; either both and the receipt commit, or none do.

The existing `AssetRelationshipsService` public mutations currently open their
own authorized transactions. Subsequent receipt implementation must expose a
composable Asset Registry operation using the caller's transaction with the
same authorization/invariants. Calling separately committed mutations is not
atomic; direct updates to registry tables are forbidden. This is a future
bounded prerequisite, not an implementation change in #89.

When identity is unknown, custody cannot yet be recorded against an asset.
Record that coordination is unresolved; on reconciliation apply required
relationships atomically using the actual intake/effective time. Do not claim
custody succeeded or mark ready meanwhile. If the time conflicts with registry
history, fail explicitly; do not replace it with the current time.

Corrections affecting custody/location must likewise go through Asset Registry
in the receipt transaction. Respect its current-open-interval correction
restriction. If a later relationship prevents a safe correction/void, reject
the operation until an explicit registry resolution is supported; do not erase
or fabricate history. Observational corrections alone need no registry write.
Return/release is a separate future operational action, not receipt deletion.

## References, snapshots and retention

Store foreign identities as organization-scoped references; verify contact and
address belong to the selected Party, item belongs to the order, and every
revision/acceptance belongs to the selected quote/request. Asset ownership
need not match the purchasing customer, and purchasing service proves neither
ownership nor custody. Referencing a provider does not introduce subcontracting.

On issue, snapshot only identifying context actually used in the offer:
customer display/legal name and relevant identifier, chosen contact/address
when part of the agreement, and quoted asset labels/identifiers or unresolved
descriptions. Retain source IDs and snapshot time. Alongside immutable scope,
terms and calculation data, this makes the offer recoverable after Party/Asset
edits. A work order's initial scope and a receipt's observed intake context are
also historical facts. They are not alternate editable Party/Asset profiles.

Use live permission-filtered reads for current contacts, asset profile,
custody/location and active site information; clearly distinguish these from
historical snapshots. New references require active records. Archival does not
delete or invalidate historical references, cancel agreements or cascade into
orders. It can block new authorization/readiness until restored or explicitly
resolved. Normal deletion must be restricted when foreign records are used;
retain historical contact/address references or their necessary immutable
snapshot context. Service Management never unarchives or rewrites another
domain to make a workflow pass.

## Authorization, transactions and history

Follow [tenant isolation](../development/tenant-isolation.md) and
[audit discipline](../operations/audit-log.md). Every tenant-scoped row,
including lines, decisions, corrections, history and replay records, requires
organization ownership, forced PostgreSQL RLS and explicit runtime grants.
Use tenant-qualified foreign keys/constraints as well as application checks.
Missing context fails closed; cross-tenant IDs behave like unavailable local
IDs without revealing existence. Query composition confers no write authority.

Conceptual capabilities are Service Management read, request management, quote
preparation, quote issue/withdrawal, commercial decision recording, commercial
correction, work authorization, work management, work cancellation, receipt
recording and receipt correction. Subsequent authorization contracts assign
codes within existing local RBAC; this model does not invent roles or grant
customers mutation access. Related reads require the corresponding Party/Asset
permissions; relationship changes additionally require Asset Registry's
relationship-management authority. Do not assume receipt permission grants it.

All protected commands use verified active organization membership and
server-side permissions, revalidated with `withAuthorizedTransaction` inside
the authoritative transaction. Transport guards and future UI visibility are
insufficient. Replay uses the same access validation. Mutations of existing
aggregates require expected versions, compare-and-increment atomically and
return an explicit conflict without partial effects when stale. Server-driven
effects such as persisted expiry must also serialize on the quote version.

| Atomic use case | Effects/guards that share the transaction |
| --- | --- |
| Request terminal transition | Request version and eligibility against downstream quote/order creation; history and audit. |
| Issue/reject/accept/withdraw | Quote version, request eligibility, immutable revision/decision facts, acceptance uniqueness, history, audit and replay result where applicable. |
| Authorize work | Request/quote guards against termination/withdrawal, active acceptance and unique order, order/items/allocations, history, audit and replay result. |
| Prepare/cancel work | Order version, item allocations/readiness, affected item and parent states, history and audit; never an implicit commercial change. |
| Record/reconcile/correct intake | Receipt and order versions/readiness guards, Asset Registry versions/operations if needed, each owner's history/audit, and replay result where applicable. |

Serialize shared guards with deterministic aggregate locking/version checks;
checking foreign state outside the transaction is insufficient. Validate
reference activity against concurrent archival within that boundary. This
requirement includes request closure versus new quotes, acceptance withdrawal
versus order creation, and receipt correction versus readiness. The schema
issues must enforce uniqueness and tenant association below the application.

Every lifecycle transition in this model, including draft discard, correction,
acceptance disposition and materialized expiry, writes durable domain history
and transactional Audit effects. Creation and mutable scope/operational edits
likewise record actor, time, prior/new context, reason where required and
aggregate version. Automatic consequential transitions retain the initiating
actor/correlation. Audit stores safe identifiers, action and bounded metadata,
not full commercial documents, free-form customer notes or contact payloads.
Domain snapshots/history retain the business facts. Neither logs nor Audit
must be queried to reconstruct an agreement. Failure to persist required
history/audit rolls back the complete mutation.

Transitions not explicitly allowed above are rejected, including acceptance of
a superseded/expired revision, reopening terminal records, creating work from
a draft, or marking unidentified asset work ready. Permission does not waive
these business guards. No cross-domain write requires asynchronous coordination
in M4. Future notifications or external delivery may use reliable asynchronous
delivery only when a concrete issue requires it, outside the atomic business
mutation; no brokers, queues, event sourcing or command bus are introduced.

## Intended repository placement

This capability map is a target for scoped implementation, not an instruction
to create empty folders. Follow the [contribution boundaries](../architecture/contribution-boundaries.md).

```text
apps/api/src/service-management/
  requests/
  quotations/
    revisions/
    acceptance/
  work-orders/
    work-items/
  receipts/
  queries/
  http/
  service-management.module.ts

apps/web/src/features/service-management/
  requests/
  quotations/
  work-orders/
  receipts/

packages/contracts/src/service-management/
packages/database/src/schema/service-management/
packages/database/src/service-management/   # invariant/persistence tests
```

The schema path follows current database ownership under `src/schema`; migrations
remain in `packages/database/drizzle`. Contracts expose schemas/types and
OpenAPI registration through the package's supported public exports. API
capabilities own business commands; `http` owns transport, `queries` composes
permission-filtered reads, and the NestJS module is only the composition root.
No broad `ServiceManagementService` or generic utility/service folder collects
the workflows. Web routes stay in `apps/web/src/app` and compose feature-owned
forms/adapters/UI. Tests stay beside their capability/invariant, with real
PostgreSQL tests for constraints, RLS and transactional behavior.

## Implementation review scenarios

Subsequent implementation issues must prove these behaviors in their scope:

1. An unknown asset can be requested, quoted and planned; asset-specific work
   cannot become ready until identity and applicable intake are resolved.
2. Editing the request or customer's legal name preserves issued/accepted
   terms; issuing revision 2 preserves revision 1 and prevents its acceptance.
3. Acceptance at the expiry boundary fails. Replaying a successful acceptance
   returns the original fact even after later withdrawal; another payload or
   competing commercial decision conflicts.
4. Parallel authorization creates one order per acceptance. Concurrent
   withdrawal or request cancellation cannot leave unauthorized active work.
5. Several items for one asset and several items from one quote line preserve
   exact scope allocation without duplicating commercial totals.
6. On-site work reaches readiness without receipt or custody transfer. Intake
   does not change ownership; failure of either registry change or audit rolls
   back the receipt and all coordinated writes.
7. Receipt correction preserves original observations, invalidates affected
   readiness atomically and cannot rewrite a superseded registry interval.
8. Cross-tenant references, revoked membership, insufficient related-domain
   permissions and stale versions fail without disclosure or partial changes.
9. Decimal examples above round identically across API, persistence and display;
   excess precision, unsupported currency and overflow fail explicitly.
10. Cancellation retains accepted history, excluded allocations and receipts;
    it neither issues a refund nor asserts technical completion.

Database tables, migrations, endpoints, UI, technical execution, certificates,
portals, signatures, invoicing/SUNAT, dispatch optimization and generic CRM or
workflow infrastructure remain outside #89.
