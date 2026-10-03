# Technical Operations implementation model

This is the authoritative execution-to-approval model for M5, defined by
[#115](https://github.com/SebastianVegaDev/Ardenfold/issues/115). Read it with
the [Service Management model](service-management.md),
[glossary](glossary.md), [boundaries](boundaries.md), and
[workflow invariants](workflow-and-invariants.md). M4 ends at operational
readiness; this model begins with an eligible Work Item and ends with an exact
approved technical package. It defines business rules for later scoped issues,
not database tables or endpoints.

## Ownership and handoff

Technical Operations owns Technical Executions, their revisions, results,
technical context, evidence associations, reviews, approvals and technical
business history. It may read but never change Service Management's Work Items,
orders or accepted scope; Asset Registry's asset identity and relationships;
Parties' counterpart records; or Identity & Access's users, memberships, sites
and permissions. Private object storage holds bytes and integrity metadata,
not evidence meaning. Audit holds protected-action accountability, not the
technical record. Certificates & Trust may later consume an approved package;
it cannot amend its source.

```text
Accepted Quote Revision -> Work Order -> ready Work Item (Service Management)
                                            |
                                            v
                            Technical Execution (stable attempt identity)
                                            |
                              numbered Execution Revisions
                                            |
                         Results + contextual Evidence
                                            |
                         submission -> Review -> Approval
                                            |
                            exact Approved Technical Package
```

An execution has exactly one authorizing Work Item. A Work Item may have
multiple **sequential attempts** only when an earlier execution was abandoned
without approval. An attempt has a stable identity and an item-local attempt
number starting at 1. At most one attempt is active; starting another while an
active or approved attempt exists conflicts. Corrections to submitted or
approved work create revisions within the same execution, not another attempt.
Abandoned attempts, their revisions and decisions remain readable. A new
attempt must revalidate current readiness; abandonment grants no authorization.
An approval on an earlier attempt precludes a replacement attempt in M5.

Starting an execution requires an explicit Service Management eligibility
operation inside the **same authorized database transaction** as creation. It
locks/revalidates the Work Item and order, their current versions, accepted
scope, site, asset and intake prerequisites, and serializes with cancellation
or preparation changes. Asset Registry's current identity/activity is checked
through its authoritative boundary where relevant. Service Management must in
turn guard preparation/cancellation after technical start through an explicit
Technical Operations handoff query under that transaction; it cannot silently
withdraw operational authorization already consumed. Neither module directly
writes the other's tables. Lock ordering and the cross-domain coordination
point must be fixed consistently by the implementing issues. A stale `ready`
badge, a client-supplied item ID or a foreign-key match is insufficient.

An execution snapshots the authorizing Work Item/order/accepted-revision and
line IDs, item allocation/scope description, site and target asset identity
used at start, with source versions and time. These are historical context,
not editable copies of commercial or registry authority. Current Party, Asset,
work-order and site details can be composed through permission-filtered reads
and labelled **current**. Later changes to those source records cannot alter
the execution's captured basis or an immutable revision. The item may have no
asset only when its authorized scope explicitly allows asset-free work.

## Execution and revision lifecycle

An execution is `active` or `abandoned`. Abandonment is an explicit terminal
decision with actor, time and reason; it is allowed only without an approval.
It preserves any submitted, reviewed or rejected revisions and does not change
the Work Item or undo a receipt. A submitted revision is never deleted by
abandonment. Starting a later attempt requires renewed readiness and cannot
reuse the old attempt's review or approval.

Each execution has revisions numbered 1, 2, ... without reuse or gaps after
committed creation. A revision has its own stable ID, number, predecessor ID
(except revision 1), creator and creation time. One draft at most may exist per
execution. A draft has an optimistic version; changing its context, results,
evidence, performer or supporting assets advances that version atomically.
Every update requires the expected version and conflicts when stale. The
execution also has a version for attempt-level transitions and successor
creation. Child mutations advance the owning draft/execution versions so a
concurrent submit cannot miss a result or evidence change.

| Revision state | Meaning and permitted transition |
| --- | --- |
| `draft` | Editable by authorized personnel with expected version. May be explicitly discarded with reason, retaining its identity and business history, or submitted after validation. |
| `submitted` | Immutable reviewable content. Submission records actor/time and freezes context, results, evidence associations and attribution in one transaction. No transition back to draft. |
| `discarded` | Terminal unsubmitted draft with actor/time/reason. Cannot be reviewed or reused. |

Review and approval are separate facts; `reviewed` and `approved` are not
mutable revision states. The current operational queue state is derived from
the latest nondiscarded revision and its exact decisions. Submission validates
required method, performer, work context and typed result/evidence integrity;
an empty technical package cannot be submitted. The submitted revision is
immutable even if review later requests changes. If a draft is discarded,
creating the next draft uses the next number and retains the discarded record.

A successor draft requires an explicit correction reason and predecessor
revision. It is permitted after a `changes_requested` or `rejected` review,
after a declined approval, or as an authorized post-approval correction. It
copies selected prior context/results/evidence into **new revision-owned
records** where appropriate, recording their source IDs; it never reuses
mutable child rows or assumes old evidence remains correct. A submitted
revision awaiting review, or an accepted review awaiting approval, cannot be
silently superseded by a draft. A post-approval correction immediately makes
the prior approval historical rather than applicable to current advancement.
Creating a successor never edits the predecessor or its decisions.

Submission and successor creation carry a client command identity scoped to
organization, actor, operation and target. Identical retries return the same
durable result after authorization revalidation; reuse with different input
conflicts. Expected versions prevent stale but otherwise new commands from
creating extra revisions. A duplicate start follows the same replay rule, while
an independent start against an active attempt conflicts. Abandonment and
discard use expected versions and explicit reasons; retries return the prior
fact only for the same command.

## Performer, method and conditions

Every revision records the actual performer user ID, organization membership
attribution and a bounded display-name snapshot, plus performed start/end
instants when known. Creator, editor and submitter are separate attribution
fields and need not equal the performer; a delegated entry must not pretend the
editor did the work. Historical attribution remains available after membership
removal, while current permission is checked anew for every action.

The revision freezes a human-readable method/procedure name and optional
identifier/version as used, rather than a live-only link to a future method
library. It also records relevant operating/environmental conditions as
named observations with exact typed value, unit when numeric, time when
relevant and original note; a bounded free-form note may explain context but
cannot replace structured results. Performed-at site ID and a descriptive
location snapshot are optional where work is on-site or outside an Ardenfold
site. Supporting/reference equipment is an explicitly typed, ordered set of
same-organization Asset references with identifying snapshots and stated use.
Referencing an Asset neither transfers custody nor implies calibration status.
Missing reference information must be recorded as such rather than fabricated.

## Structured technical results

Results belong to one exact revision and have stable IDs, an optional group
identity/label, group order and result order, a measured characteristic or
observation label, and the context needed to interpret that value. Ordering is
unique within the revision/group and changes only while draft. A group is a
presentation/interpretation boundary, not a schema-less technical payload.
Each result has exactly one of these value forms:

| Form | Required value and interpretation |
| --- | --- |
| Quantitative | Exact signed decimal string, unit code, and measured characteristic. Use unit `1` for a genuinely dimensionless quantity. Optional decimal resolution, significant-digit count and nonnegative uncertainty retain their own exact decimal strings and unit/coverage description where needed. |
| Categorical | A stable category code and original human label or explanation; the code's meaning is retained with the revision. It is not an implicit pass/fail result. |
| Textual | Original observation text, with language when known; it is not machine translated into a new technical fact. |
| Missing | Explicit reason `not_observed`, `not_applicable` or `unavailable`, and explanatory text where needed. No numeric zero or categorical placeholder is stored as its value. |

The result may also record bounded structured conditions, a lower/upper
tolerance with exact decimals and units, or a distinct conformity outcome
`conforms`, `does_not_conform` or `undetermined` when a documented rule supports
it. Tolerance and conformity are optional and never inferred from a value
without its rule. A missing result cannot carry a numeric value, uncertainty,
tolerance calculation or asserted conformity. A quantitative result must have
its unit and interpretation metadata; nonquantitative forms cannot carry
numeric value fields. Persist these forms in explicit typed fields with
database/application constraints, not an opaque JSON document.

Authoritative decimals are base-10 strings with bounded precision/scale;
database `numeric` and decimal arithmetic may validate or calculate them, but
JavaScript `number` is never their authoritative representation. Do not round
on write to match a display locale. Retain the submitted decimal spelling or
an explicitly recorded scale/significant-digit interpretation where trailing
zeros convey precision. Resolution and uncertainty have separate semantics;
neither is inferred from display digits. Reject unsupported precision or
invalid unit identifiers rather than truncating. Contracts serialize decimal
values as strings, timestamps as UTC instants, missing reasons as explicit
codes, and ordered results by stored order then stable ID. UI formatting may
localize a copy without changing the authoritative value or original notes.

## Evidence and private attachments

Evidence is a Technical Operations record that states what it supports. It
belongs to the same organization and exact execution revision and can target
the revision as a whole, one result, or an exact review/approval action. Its
type, description, author, time and target are explicit. Revision/result
evidence is frozen at submission. Decision evidence is attached atomically to
the review or approval it supports and is immutable from that decision onward;
it does not retroactively change the submitted revision's evidence set. A
file-backed record references one **finalized** private stored object; a
non-file observation can
carry bounded text with no object. Merely uploading an object creates no
Evidence. A result or decision target must belong to that same revision.

Storage infrastructure owns upload/finalization, private bytes, size, media
type and strong digest (such as SHA-256). Technical Operations owns evidence
association, meaning and access policy. Finalization verifies size/digest and
does not authorize technical association. Association checks finalized state,
organization, owner and current permission in a protected transaction.
Download/preview revalidates authorization against the Evidence and revision;
possession of an object ID or storage key grants nothing. Public certificate
verification will not make source evidence public.

Draft evidence can be corrected or removed with optimistic version and history.
Once its revision is submitted, its target, description and object association
are immutable. A correction adds evidence to a successor revision with a
source link and explanation. Submitted/reviewed evidence cannot be detached or
deleted because a later revision no longer uses it. Object cleanup may remove
abandoned unreferenced uploads only after verifying no durable Evidence
reference; retention of referenced objects follows the business history.
Audit and logs contain safe IDs and bounded action metadata, not file bytes,
signed URLs, storage credentials or unnecessary private notes.

## Technical review and approval

A Technical Review is an immutable decision on **one submitted revision ID**.
The outcomes are `accepted`, `changes_requested` and `rejected`. It records
reviewer user/membership attribution, display-name snapshot, decision time,
reason or notes, and the policy version applied. Changes requested requires a
reason and permits a successor; rejection requires a reason and closes the
current review path, with correction possible only as an explicit successor.
Acceptance means this exact revision passed technical review; it is not
approval. One authoritative review decision is allowed per submitted revision.
A competing decision conflicts; replay of the same command returns the same
decision after authorization revalidation. A successor has no inherited review.

Approval is a separate immutable positive decision on one accepted, submitted
revision. It records approver identity/snapshot, time, review ID and exact
revision ID. A policy denial or technical refusal records no approval and may
be represented by an explicit declined decision with reason; a decline permits
a successor correction but cannot be overwritten. One authoritative approval
decision per reviewed revision; competing or repeated decisions use the same
conflict/replay rules as review. No `approved` boolean on execution or pointer
to “latest” is authority. A draft, changed successor, rejected revision or
revision without accepted review is ineligible.

Identity & Access owns organization policy configuration. M5 needs only two
explicit separation switches: performer differs from reviewer, and reviewer
differs from approver. The former defaults to **required** and the latter to
**optional** for new organizations; organizations may change them through an
authorized settings operation. At
decision time, enforce the current configured policy **and** any stricter
policy recorded when the target revision was submitted, so weakening settings
cannot retroactively make an old submission eligible. Compare stable user IDs,
not role labels or mutable display names. A user may possess a permission and
still be ineligible under this policy. Later permission/membership changes do
not erase historic decisions, but suspended/removed members cannot make new
ones. The policy snapshot and decision attribution make old decisions
explainable without granting historic actors continuing authority.

Review and approval transactions revalidate active membership, permission,
policy and exact revision eligibility, and serialize with successor creation
and competing decisions. A review cannot race into a draft correction; an
approval cannot race a new successor or conflicting review. The required
expected execution/revision version and command identity produce either one
durable decision or an explicit conflict. A stale page never silently applies
the decision to the current revision. Protected action, technical business
history and safe Audit effect commit or roll back together.

## Approved technical package and history

The approved package is a read projection rooted in the exact approval and
revision, not a second editable technical document. It includes source IDs
and revision number, approval/review attribution and times, the historical
Work Item/accepted-scope and target-Asset context, performer, method,
conditions, ordered structured results and permitted Evidence references.
It also reports whether this approval remains **applicable for advancement**:
the execution is active, no successor nondiscarded revision exists, and no
later explicit invalidating decision exists. A later unapproved draft or
submitted revision does not inherit or replace the old approval. The old
approved package stays queryable as historical fact, with `applicable=false`.
Certificate preparation in M6 must require an applicable exact package and
snapshot what it consumes; M5 issues nothing.

Technical business history records execution start/abandonment, draft edits,
submission, review, successor creation and approval with actor, time, reason
and source/target IDs. It can be assembled from durable domain records and
bounded history entries; event sourcing is not required. Audit is a separate
tenant-isolated security record. Neither current read models nor Audit may be
the only source needed to reconstruct a previously approved revision.

## Authorization, tenancy and transaction rules

Conceptual capabilities are technical read, execution start/manage,
result/evidence manage, evidence access, technical review and technical
approval. Implementation assigns explicit permission codes using existing
local RBAC; review and approval are separate permissions. Every protected
operation derives organization from verified active membership, revalidates
authorization in its authoritative transaction and uses forced PostgreSQL RLS
on all organization-owned execution, revision, result, evidence, decision,
history and replay rows. Tenant-qualified references and application checks
prevent cross-organization Work Item, Asset, Site, object or child IDs. Missing
tenant context fails closed; foreign IDs behave like unavailable local IDs,
including through queues, counts and validation errors. Related-domain reads
retain their own permission boundaries.

All mutable technical commands require expected versions; retries of start,
submission, review and approval use stable command IDs with payload identity.
Replay never bypasses current authorization. The database enforces durable
uniqueness for attempt numbers, active attempt/cardinality, revision numbers,
one authoritative review/approval per target and tenant-consistent references.
Application transactions enforce lifecycle, policy and cross-domain
eligibility. Use deterministic lock order across Work Item, execution,
revision and decision rows. Failure of required technical history or Audit
rolls back the mutation. Keep technical decimals, notes and file contents out
of Audit/log metadata.

## Intended repository placement

Create these owners only as scoped implementation issues need them:

```text
apps/api/src/technical-operations/
  executions/       # start, revisions, context and handoff
  results/          # typed results and validation
  evidence/         # technical association and access
  reviews/          # review decisions
  approvals/        # approval decisions
  queries/          # queues, history and approved package
  http/             # transport only
  technical-operations.module.ts

apps/web/src/features/technical-operations/
  executions/
  results/
  evidence/
  reviews/

packages/contracts/src/technical-operations/
packages/database/src/schema/technical-operations/
packages/database/src/technical-operations/  # persistence/invariant tests
```

The module is a composition root; it is not a broad workflow service. HTTP
controllers translate contracts and call authoritative capabilities. Web routes
compose feature UI and do not authorize actions. No certificate, PDF, public
verification, customer portal, specialized calculation engine, generic file
manager or workflow engine is introduced by M5.

## Implementation review scenarios

1. A ready on-site Work Item starts execution without a Receipt; concurrent
   cancellation or preparation cannot leave an unauthorized active execution.
2. A cancelled/ineligible item, foreign Work Item, archived required Asset or
   stale version cannot start work. The same start command replays one attempt.
3. Two draft editors conflict explicitly. Submission racing a result/evidence
   edit freezes exactly one complete version; later edits fail.
4. A quantitative `0.0100` with unit/resolution/uncertainty survives storage
   and localization unchanged; missing `not_observed` never becomes `0`.
5. A finalized private object becomes Evidence only after a same-tenant,
   authorized contextual association. A guessed object ID cannot download it.
6. Changes requested leaves revision 1 intact. Revision 2 copies only selected
   content as new records and requires its own review and approval.
7. An approval of revision 1 remains historical after revision 2 is created;
   the approved projection marks it inapplicable to current advancement.
8. A reviewer or approver with permission can still fail separation policy;
   revoked membership before commit prevents the decision.
9. Concurrent conflicting reviews or approvals produce one fact or an explicit
   conflict. Replaying the same command returns its original fact without
   duplicate history or Audit effects.
10. Abandoning an unapproved attempt retains its revisions and allows only an
    explicitly revalidated new attempt; no certificate is created.
