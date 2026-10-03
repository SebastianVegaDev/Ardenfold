# Technical Operations implementation model

This is the authoritative execution-to-approval model for M5, defined by
[#115](https://github.com/SebastianVegaDev/Ardenfold/issues/115). It specifies
the behavior subsequent persistence, application, web and security issues must
implement. Documentation does not imply those capabilities already exist.

Read it with the [glossary](glossary.md), [module boundaries](boundaries.md),
[workflow invariants](workflow-and-invariants.md),
[Service Management model](service-management.md), and
[contribution boundaries](../architecture/contribution-boundaries.md).
M4 ends at operational readiness. M5 ends at an approved exact technical
revision; Certificates & Trust remains responsible for future issuance.

## Ownership and handoff

Technical Operations owns executions, revisions, method and performance
context, structured results, contextual evidence, performer attribution,
review decisions, approval decisions and their business history. File
infrastructure owns private bytes and transfer/integrity metadata, not their
technical meaning. Audit owns separate protected accountability records.

| Referenced owner | Authoritative information and permitted interaction |
| --- | --- |
| Service Management | Work Order, Work Item, accepted commercial basis, allocation, intake and readiness. Start uses its transaction-composable eligibility operation; no direct operational writes. |
| Asset Registry | Asset identity, identifiers, current ownership/custody/location and asset history. Technical Operations uses authorized references and reads; it cannot repair registry state to make work eligible. |
| Parties | Current customer/counterpart identity and contact details. Historical identifying context is retained only where needed to interpret the work. |
| Identity & Access | Local users, organizations, Sites, active memberships, permissions and organization policy. Provider claims are not domain authority. |
| Audit | Safe protected action records written in the domain transaction. It is not the execution timeline or source of technical results. |
| Certificates & Trust | Future preparation, issuance, immutable issued versions, replacement, revocation and verification. It consumes an exact approved package and cannot edit its source. |

Start requires an explicit `ready` Work Item, an uncancelled Work Order,
current expected item/order versions, and revalidation of the existing M4
readiness conditions in one authorized transaction. A parent order may still
be `planned` because other items are not ready; eligibility belongs to the
selected item. Verify its active Site, required resolved active Asset, relevant
Parties and any same-item/Asset receipt and current custody/location
prerequisites. No-intake work requires no artificial receipt; explicitly
asset-independent work requires no placeholder Asset.

The existing readiness implementation is
`apps/api/src/service-management/work-orders/readiness/work-item-readiness.ts`.
It validates prerequisites but does not itself require the persisted item
state to be `ready`. The future Service Management handoff must do both. It
must serialize with preparation, cancellation, restructuring, receipt
correction and relevant reference changes using the caller's transaction.
Separate already-committed Service Management calls are insufficient.

M5 must also provide an explicit Technical Operations query guard to the
Service Management operations that can invalidate consumed work. Once an
execution exists, operational scope, Asset/site reassignment, restructuring,
readiness reversal, pre-execution cancellation and receipt corrections that
invalidate consumed intake are blocked. Observational corrections that do not
change consumed authorization may remain allowed with their own history.
External registry archival remains an Asset Registry action; it neither
rewrites nor deletes an execution's historical context. Start and later new
reference selection validate current reference eligibility. A cancelled
execution does not release the consumed-work guard. Post-start commercial or
operational amendments need a separately scoped design.

These are declared application/query boundaries with explicit shared
transactions, not circular NestJS module imports or unrestricted cross-domain
table access. The implementation must keep the eligibility/consumption guards
discoverable beside their owners.

## Execution identity and cardinality

One Work Item has zero or one Technical Execution in M5, including after
cancellation. Enforce durable uniqueness on organization and Work Item, not
just on a request key. The execution references its organization, Work Item,
Work Order, accepted revision/line and resolved target Asset when applicable.
Those source identities cannot be reassigned. One item represents one
authorized scope; genuinely new work needs a separately authorized Work Item.

Execution is the stable identity; revision is one version of its technical
content. An execution has one or more revisions and at most one actionable
latest revision. Start atomically creates the execution and revision 1. There
are no parallel technical attempts within one item in M5. Corrections and
repeated observations within the authorized scope are successive revisions,
with an explicit reason and predecessor, not duplicate executions.

Revision numbers are strictly increasing positive integers allocated while
locking the execution, never reused, including for discarded drafts. UUID,
revision number, execution optimistic version and revision optimistic version
have distinct meanings. A successor gets fresh revision and child identities;
copied results/evidence retain explicit predecessor references. Numbering need
not be gapless. Every aggregate starts at optimistic version 1.

Execution keeps creator, server start time, source eligibility versions and a
minimal immutable handoff snapshot. It has only `active` and `cancelled`
lifecycle states. Approved, awaiting review and changes requested are
revision/decision projections, not mutable execution approval flags. An
approved execution stays active so an explicit successor can correct content.

| Execution transition | Guard and effects |
| --- | --- |
| Create -> `active` | Execution-start capability, eligible Work Item and versions, unique item link; create first draft, source snapshot, history, Audit and replay result atomically. |
| `active` -> `cancelled` | Cancellation capability, expected execution version, reason, and no approval anywhere in this execution. Close any actionable draft/submission as below; preserve every historical record. |
| `cancelled` | Terminal; no edits, review, approval, successor or implicit restart. Authorized reads remain available. |

Cancellation never cancels the Work Item/Order, withdraws acceptance, releases
custody or deletes evidence. Cancellation after any approval is rejected;
approval withdrawal, certificate consequences and new-work authorization are
outside M5. Discarding a draft is a separate action and does not cancel the
execution. Transitions not explicitly defined here fail.

## Revision content and lifecycle

Each revision retains its exact technical scope, method/context, performer
set, performance timestamps, ordered results, supporting Assets and evidence.
The recording user is distinct from the people who performed the work.
At least one local performer must be explicitly attributed before submission;
all contributing performer IDs used by separation policy remain recoverable.
M5 does not add competence, accreditation or external-technician management.

Method context requires a nonempty name or stable external procedure reference,
and may include procedure version, description and relevant bounded notes.
An external reference is descriptive data, never an automatically fetched URL
or executable instruction. Store observed performance start/end UTC instants
separately from server recording/submission instants; end cannot precede start
or claim a future performance instant at submission.

Conditions are ordered typed observations with name/code, quantitative or
qualitative value, unit where applicable, observed time and optional location.
Use the result value rules below. Supporting/reference Assets carry an
explicit role, local Asset ID and identifying snapshot. Performed-at context
records the local Site when applicable and the actual placement description;
it may differ from the operational Site without changing the Work Order.
Required Asset/Site references must be same-tenant and eligible when selected.
Explicit absence of environmental conditions is allowed for work where none
are relevant; no implicit default temperature, unit, instrument or method.

Technician notes retain their original language. They supplement structured
facts and cannot substitute for a quantitative result or missing-value state.
All free text, arrays and result counts have documented contract limits in
the implementation; reject oversized input rather than silently truncate it.

| Revision transition | Guard, meaning and capability |
| --- | --- |
| Create -> `draft` | Start or successor-creation capability; only the latest draft may be edited. |
| `draft` -> `submitted` | Submission capability, expected execution/revision versions, complete interpretable context, at least one valid result and finalized associated files. Freeze the complete reviewable content atomically. |
| `draft` -> `discarded` | Execution editing capability, versions and reason. Freeze and retain the abandoned draft; no review/approval. |
| `submitted` -> `reviewed` | Review capability records one accepted review of this exact frozen revision. |
| `submitted` -> `changes_requested` | Review capability records actionable reasons; preserve the submitted content. Correction needs a successor. |
| `submitted` -> `rejected` | Review capability records technical rejection and reasons. The rejected revision cannot become approved. |
| `reviewed` -> `approved` | Approval capability and explicit policy eligibility; record one decision referencing this revision and its accepted review. |
| `submitted` or `reviewed` -> `withdrawn` | Execution editing capability withdraws the current submission with a reason, or execution cancellation does so atomically. Retain submitted content and any review; it becomes ineligible for approval. |

`changes_requested`, `rejected`, `discarded`, `withdrawn` and `approved` are
terminal for that revision. `reviewed` is not yet approved. Reviews and
approvals are immutable facts; advancing lifecycle metadata does not make
submitted content mutable. There is no transition back to draft, decision
editing, second competing review, or approval of a draft.

Create a successor only from the latest `changes_requested`, `rejected`,
`discarded`, `withdrawn` or `approved` revision of an active execution. Name
the source revision and expected execution version and provide a correction
reason. Copy deliberately selected content into a new draft, including fresh
result/evidence identities and same-tenant finalized file references where
allowed. Results omitted from the successor remain in the predecessor.
No review, approval, submission timestamp or policy evaluation is copied.
A pending submitted/reviewed revision must first be explicitly withdrawn;
an existing draft must first be discarded. A historical predecessor cannot
fork a parallel revision branch.

Every technical child write compares the expected draft revision version,
locks its owning execution/revision, verifies latest-draft eligibility and
increments both owning versions. Submission takes the same locks and freezes
results, context, performers, supporting Assets and evidence associations in
one transaction. A result/evidence write racing submission either commits
first and is included, or fails explicitly; it cannot alter submitted content.
Persistence must protect frozen children independently of UI behavior.

## Structured results

A result belongs to one exact revision. It has a stable revision-local ID,
measurement/observation name or code, explicit type, positive display order,
and optional group ID/name/order and predecessor result ID. Order is unique
within the revision (groups add presentation organization); serialize results
by order then ID. A group is not a separate approval boundary.
Repeated measurements are separate named/ordered results, not opaque arrays
inside an unvalidated payload. No universal pass/fail field is inferred.

| Type | Required value and mutually exclusive fields |
| --- | --- |
| `quantitative` | Exact decimal string and explicit unit; optional interpretation metadata below. No categorical/textual/missing value. |
| `qualitative` | Nonempty stable category code and original human-readable label/context; no decimal, unit or missing state. |
| `textual` | Nonempty original observation text; no decimal/category/missing state. |
| `missing` | Exactly one reason code: `not_observed`, `not_applicable` or `unavailable`; explanatory original note required for `unavailable`. No value of any other type. |

Absence of a result row is an incomplete draft, not an implicit zero or
not-applicable result. Quantitative `0` is a valid observed value. A missing
observation may retain the intended quantity and unit as context, but cannot
carry numeric value, numeric precision, uncertainty or conformity. If a result
changes type while draft, validate the entire new typed state and clear/reject
incompatible fields. Submission requires each expected observation recorded
in the draft to have an explicit valid value or missing state; M5 has no
procedure-template engine that invents unentered observations.

### Decimal and unit contract

Technical decimal policy version 1 uses finite base-10 strings with at most
24 integral and 18 fractional digits. Input grammar is an optional minus,
integral digits and optional decimal point followed by fractional digits.
No exponent, plus sign, grouping separators, localized comma, NaN or infinity
enters authoritative contracts. Normalize redundant leading integral zeros
and negative zero; retain meaningful entered fractional scale and an optional
original entered representation for traceability. Reject overflow/excess
precision rather than truncate or round. The generic limits cover M5, not
every future discipline; widening them requires an explicit contract change.

Persistence uses exact decimal representation sufficient for this policy
(for example `numeric(42,18)`) plus entered scale where a fixed-scale column
pads zeros. Drivers and API serializers return strings, never JavaScript
`number`. Reconstruct the entered scale without changing value. Do not
misinterpret fixed database padding as significant digits. Metadata must not
depend on recovering significance from a formatted value.

M5 stores technical facts and explicit interpretation metadata; it does not
derive uncertainty, unit conversions, conformity or rounded measurements.
Any validation arithmetic uses a bounded exact decimal implementation and
checked intermediates. The commercial currency-scale/round-half-up policy
does not apply to technical results. User-provided excessive precision is
an error, not a request for automatic rounding.

Every quantitative value identifies a unit system/code and original symbol
or label. Use UCUM-compatible codes where supported, with `1` for explicitly
dimensionless quantities. A documented custom unit uses a stable code,
nonempty original label and quantity context; M5 is not a universal unit
registry or conversion engine. Never infer units from language or asset type.
Uncertainty, resolution and limits use the result's unit; different-unit
comparisons are unsupported without a separately defined exact conversion.

Optional metadata is explicit rather than inferred:

- Resolution is a strictly positive exact decimal in the same unit.
- Significant digits is a positive integer (maximum 42); recorded decimal
  places is an integer from 0 through 18. These describe reporting intent,
  not permission to rewrite the value. Reject mutually inconsistent supplied
  metadata; do not fill in unknown precision from database padding.
- Uncertainty has a nonnegative exact magnitude and kind `standard` or
  `expanded`. Expanded uncertainty requires a positive exact coverage factor;
  standard uncertainty cannot claim one. An optional confidence level is an
  exact fraction strictly between `0` and `1`. Preserve explanatory context;
  no accreditation or uncertainty-calculation claim follows from storing it.
- Limits name the criterion and optional lower/upper exact bounds with explicit
  inclusive flags. At least one bound is required, lower cannot exceed upper,
  and equal bounds require both inclusive. M5 stores the criterion, not a
  tolerance engine.
- Conformity, when supplied, is `conforming`, `nonconforming` or
  `indeterminate` with a nonempty decision-rule reference/context. It is an
  attributed recorded assertion, not automatically calculated from limits.
  Missing results cannot claim conformity; services without such a decision
  omit it explicitly.

Presentation may localize separators and unit labels without passing exact
values through binary floating point. Parsing localized input must produce
an unambiguous canonical string or an error. User notes remain untranslated.
For example, canonical `0.0100`, unit `V`, scale 4 and significant digits 3
remain those facts in both locales; Spanish may display `0,0100 V`. A missing
voltage remains missing, never `0 V`. Deterministic package serialization
includes the type, decimal string, entered scale, unit and supplied metadata;
it cannot reduce a result to a formatted display string.

## Evidence and private attachments

Evidence is a Technical Operations business record with organization,
revision, kind, explicit supporting context, recording actor/time and original
description. It supports exactly one target: the revision as a whole, a
result within that revision, a review of that revision, or an approval of it.
Target identifiers must agree on organization, execution and revision;
arbitrary polymorphic IDs are not sufficient referential integrity.

M5 supports file-backed evidence and non-file original observations/references.
A non-file reference is descriptive text and is not fetched or treated as an
authenticated external source. A file association names one finalized opaque
stored-object ID; filename, MIME suggestion and provider key are not authority.
Uploading alone creates no Evidence. Same-tenant finalized files may be reused
in explicitly authorized successor associations; each association has its
own identity and target. Access to one association grants no other domain access.

File infrastructure records uploader/local scope, original display filename,
trusted media classification, actual size, SHA-256 digest, opaque private
storage key/version, lifecycle and timestamps. Finalization verifies actual
stored bytes and transfer metadata before marking an object referenceable.
A mutable object key is insufficient: reference an immutable provider version
or enforce write-once keys and no overwrite after finalization. The association
pins that exact object identity and integrity metadata. Digest proves byte
identity against a trusted reference, not technical correctness or malware safety.

Private upload lifecycle is `pending` -> `finalized` or `abandoned`, followed
by explicit cleanup of eligible unreferenced objects. Failed/incomplete upload
is never referenceable. Finalization retries return the same verified durable
object; changed bytes/metadata conflict. #116 selects bounded transfer limits,
media rules, expiry and provider/local mechanics and must document them.
No public bucket, persistent browser credential or filename-derived key.

Before submission, evidence edits/removal compare the owning draft version
and retain business-history attribution. Detaching does not authorize immediate
blob deletion. Submission freezes the technical evidence set. Later corrections
use successor associations and preserve predecessor evidence/files. Evidence
supporting a review/approval is an immutable decision attachment: finalize
and associate it in the same decision transaction, then never append it to
the already-submitted technical result set. Failed decisions cannot leave
apparently durable decision evidence. No free-form post-decision attachment
editing is available in M5.

Downloads revalidate active membership, Evidence/domain-read capability,
target scope and tenant in the API; an opaque file ID alone grants nothing.
The future files integration delegates domain association authorization to
the owner before issuing a download. Pending unassociated uploads are visible
only through their upload-management path with current authority. Controlled
download responses use safe filenames/headers and bounded private caching;
provider keys/URLs are not public resource identifiers. If signed transfer is
selected in #116, expiry and the unavoidable validity window after issuance
must be documented; permission loss prevents new capabilities but cannot
retroactively invalidate an already-issued provider URL. Never claim otherwise.

Cleanup may reclaim expired pending/abandoned uploads and finalized objects
with no retained domain references after a documented grace interval. Reference
creation and deletion eligibility must serialize on the stored-object record;
claim deletion atomically, disallow new associations to a claimed object,
and retry provider deletion explicitly. External deletion is not a PostgreSQL
transaction. Draft detach, successor correction, cancellation, user removal
and archival cannot delete historically protected bytes. No automatic purging
of referenced technical records is enabled in M5; future retention requires
explicit policy and recovery/maintenance design. A reference in immutable
history always excludes the object from ordinary orphan cleanup.

## Review, approval and policy

Review is one immutable fact naming organization, execution, exact submitted
revision, frozen revision identity/version, reviewer local User ID, server
decision time, original notes/reasons, outcome and policy version/evaluation.
There is at most one decisive review per revision in M5. Outcomes are
`accepted`, `changes_requested` and `rejected`. The latter two require reasons
and permit successor correction; neither edits or reopens the reviewed revision.
Review is invalid for draft/discarded/withdrawn/cancelled targets.

Approval is always a separate explicit command/fact, even when the same user
is allowed to review and approve. It names the exact revision and accepted
review ID, approver local User ID, server time and evaluated policy version.
There is at most one approval per revision; it has disposition `recorded` and
is immutable. There is no boolean, implicit approval during review, mutable
approval status or revocation action in M5. Approval requires the latest
eligible `reviewed` revision of an active execution, current permissions and
policy eligibility. A successor never inherits an accepted review or approval.

Organization technical decision policy version 1 records three explicit
booleans: performer/reviewer separation, performer/approver separation and
reviewer/approver separation. All default to false; deployments requiring
separation must enable the applicable rules through the Identity & Access
organization-policy boundary, with policy-management permission, optimistic
version, history and Audit. No role name supplies an unstated exception.
Policy updates serialize with protected decisions. Each decision stores its
evaluated policy version and rule values. Approval evaluates the then-current
policy against the recorded performer and accepted reviewer identities; a
policy change may therefore block a previously reviewed target from approval.
Resolving it needs a successor/new review, not editing an old reviewer ID.

Review/approval permission and business-policy eligibility are separate checks.
An actor who has a capability may still fail separation or lifecycle rules.
Performer separation checks all attributed contributors, including the person
recording performance if also attributed as a performer. New performer
selection requires a valid local user and active membership; historical
attribution remains after suspension/removal. Removing a historical performer
or reviewer does not erase an existing business fact. A previously accepted
review does not require that its reviewer remain an active member at the later
approval; approval revalidates the current approver and separation policy.
Reviewers/approvers losing authority cannot record new protected decisions.

Review and approval commands require explicit revision and expected owning
versions. Never implement `review latest` or resolve approval to whichever
revision is newest at commit. Multiple competing reviewers serialize; one
fact wins and the other conflicts. Withdrawal versus approval and successor
creation versus stale decisions use the same execution/revision locks.
The UI identifies the exact target, shows immutable content, and confirms
approval against that target; hiding buttons does not enforce these rules.

## Tenancy, authorization and transactional effects

All technical records, result groups/rows, performers, evidence associations,
decisions, history, file metadata and replay records are organization-owned.
Use tenant-qualified references and forced PostgreSQL RLS plus explicit
runtime grants. Missing tenant context fails closed. Composite association
constraints reject same-tenant wrong-parent IDs as well as foreign-tenant IDs.
Search, counts, queues, histories and file retrieval preserve those boundaries;
foreign IDs behave like unavailable local IDs without useful existence hints.

Capabilities are technical read, execution start/edit/cancel, submission,
result capture, evidence capture/read, review, approval and technical-policy
management. #119-#121 assign stable permission codes through existing local
RBAC; this model adds no implicit role grants or customer mutation access.
Related live reads require the corresponding Work Order, Party, Asset and Site
permissions. File transport grants no technical mutation/decision authority.

Every mutation and replay uses `withAuthorizedTransaction`; guards/session
claims alone are insufficient. Membership, role/permission and policy changes
must not race a protected commit. #119/#121 must coordinate locks or an
equivalent serialization guard with Identity & Access mutations, and verify
current authority within the transaction. A revocation that commits first
prevents the decision; a decision serialized first is an attributable fact
preceding revocation. Checking once under ordinary read-committed isolation
without coordinating writes cannot claim this guarantee.

| Atomic operation | Shared guards and durable effects |
| --- | --- |
| Start | Local authority, Service Management readiness/source versions, consumed-work uniqueness, source snapshot, execution/draft, history, Audit and replay identity. |
| Draft/context/result/evidence mutation | Local authority, active/latest-draft eligibility, execution/revision versions, reference validity, child changes and owning version increments, history and Audit. |
| Submit | Same draft locks, complete typed content, finalized pinned files, frozen context/child set, submission time, versions, history, Audit and replay result. |
| Review | Current authority and policy, exact frozen target/versions, unique review, optional decision evidence, disposition, history, Audit and replay result. |
| Approve | Current authority and policy, exact accepted review/revision and versions, unique approval, optional decision evidence, disposition, history, Audit and replay result. |
| Successor/withdraw/discard/cancel | Applicable versions, reasons and lifecycle guard, preserved predecessor references, new draft or disposition, history, Audit and replay result. |

Failed required history/Audit writes roll back the entire mutation. Business
history records exact target IDs, actors/times, before/after versions,
transition and original reason where necessary. Technical content stays in
its domain; security Audit uses safe IDs and bounded allowlisted metadata,
never raw results, customer datasets, filenames, notes, credentials, digests
as content substitutes, signed URLs or file bytes. Observability uses existing
correlation conventions and redaction. No event sourcing is required.

Start, submission, review, approval, successor creation and destructive
dispositions carry an organization/operation-scoped durable idempotency key.
Inside the currently authorized transaction, resolve a successful key before
fresh version/lifecycle checks: the same canonical payload, including exact
target and expected versions, returns the original fact without new history
or Audit success. Include current disposition separately; replay cannot
reactivate cancelled work or move approval to a successor. Same key/different
payload conflicts. Failed transactions consume no key. Retain successful key
associations for the business record lifetime. Different keys are new commands
and remain subject to fact uniqueness/version checks. Child edits use expected
versions; after uncertain response, refresh rather than silently overwrite.

## Reads, queues and Approved Technical Package

Purpose-built tenant-authorized queries expose eligible ready work without an
execution, active drafts/in-progress work, submitted/awaiting-review revisions,
changes-requested/rejected corrections, reviewed/awaiting-approval revisions,
approved revisions and cancelled/discarded history. Queue membership derives
from explicit lifecycle facts. Latest-revision work queues and historical
approved facts are distinguishable; an execution may have an earlier approval
and a newer pending correction. Filters, pagination and counts are bounded,
deterministic and permission-scoped. A rejection is shown explicitly, not
mislabelled as accepted or generic completion.

History follows Work Item -> Execution -> numbered Revisions -> typed
Results/Evidence -> exact Review -> exact Approval. Current Party/Asset/Site
labels are read-only enrichment and visibly separate from frozen context.
Snapshot the necessary source scope, Asset label/identifiers, Site/placement,
performer attribution and method/context at handoff/submission so renaming,
archival or membership changes cannot make the record uninterpretable.
Retain source IDs and snapshot times. Do not snapshot entire customer profiles
or create alternate editable identities. No historical source deletion cascades
through technical records; normal deletion is restricted where referenced.

An Approved Technical Package is a versioned read contract resolved by an
explicit approval ID and exact revision ID. It contains:

- organization, execution, revision ID/number, submission time and content
  format/policy version;
- source Work Item/Order and accepted commercial revision/line IDs plus the
  minimal frozen authorized scope and identifying context;
- original method, conditions, performance times and performer attribution;
- deterministically ordered typed results with exact decimal/unit/precision
  and interpretation metadata;
- exact evidence associations and finalized size/media/digest metadata,
  without storage keys, provider URLs or embedded attachment bytes;
- accepted review ID/outcome/actor/time and approval ID/actor/time with their
  evaluated policy versions.

The source package is immutable/recoverable. Current contextual enrichment and
newer-revision/disposition indicators are separate envelope fields, not changes
to its authoritative content. A historical approval read continues to identify
the same revision after a successor exists. A list may show newer approval
facts, but cannot silently substitute one in an exact package read. A newer
unapproved revision is never shown as approved because its predecessor was.

Future Certificates & Trust must explicitly select the approval/revision and
apply its own current eligibility policy, including handling pending
corrections. M5 exposes that condition; it does not promise a historical
approval is automatically safe to issue. Certificates & Trust cannot rewrite
the package to satisfy issuance or create public evidence access.

## Intended repository placement

This is a capability navigation map for subsequent issues; create no empty
folders or generic workflow/approval/media frameworks to mirror it.

```text
apps/api/src/technical-operations/
    executions/
        revisions/
        context/
    results/
    evidence/
    reviews/
    approvals/
    queries/
    http/
    technical-operations.module.ts

apps/api/src/files/
    storage/
    uploads/
    downloads/
    files.module.ts

apps/web/src/features/technical-operations/
    executions/
    results/
    evidence/
    reviews/

packages/contracts/src/technical-operations/
packages/contracts/src/files/
packages/database/src/schema/technical-operations/
packages/database/src/technical-operations/
```

NestJS modules are composition roots; HTTP owns transport and capabilities own
business behavior. Next.js routes compose feature-owned screens/forms/adapters.
Contracts use supported root package exports; schema/migrations and real
PostgreSQL invariant tests retain their existing database ownership. File
provider adapters are isolated from technical business rules. No broad
`TechnicalOperationsService`, `shared`, `common` or `utils` collects unrelated
responsibilities. Extend the living system map only as each capability becomes
implemented.

## Implementation review scenarios and boundary

1. An eligible no-intake item starts once without a receipt; a physical-intake
   item with stale custody, a planned/cancelled item or a foreign ID cannot.
2. Parallel starts create one execution. A preparation/cancellation race cannot
   leave unauthorized work, and later M4 edits cannot invalidate consumed scope.
3. Two draft edits conflict explicitly; submission racing a result/evidence
   edit freezes one complete version without a partial or late child write.
4. `0.0100 V` preserves exact value and entered scale through persistence,
   contracts and both locales; missing voltage remains missing. Contradictory
   typed fields, excess precision and unlabelled units fail.
5. File finalization verifies bytes; pending, replaced or foreign objects cannot
   become Evidence. Download checks the domain record; orphan cleanup excludes
   retained predecessor/decision references and races association safely.
6. Review names revision 1. Changes requested creates draft revision 2 with
   fresh children, original reasons and no inherited review/approval.
7. Policy may forbid self-review/self-approval independently of permissions.
   Concurrent conflicting decisions produce one fact; serialized revocation
   prevents unauthorized later commits and replay still checks authority.
8. Approving revision 2 and then creating draft revision 3 leaves the exact
   revision-2 package unchanged and reports the newer unapproved correction.
9. User/Party/Asset/Site changes preserve historical meaning without exposing
   unauthorized live context or granting new mutation/file authority.
10. Cancellation retains meaningful submitted work and evidence, cannot bypass
    an existing approval, and does not cancel commercial/registry records.

M5 finishes only after the complete ready-work -> execution -> revision ->
results/evidence -> review -> approval workflow and the #125 quality/security
gate pass, including exact values, immutable history, storage integrity,
tenant isolation, policy, concurrency/replay, and representative English and
Spanish journeys. Build, lint, typecheck, unit/integration/storage tests and
existing platform, M2 and M4 gates remain required.

#115 changes documentation only. It introduces no schema, migrations,
endpoints or UI. M5 does not prepare/render/issue/deliver certificates, expose
public verification, replace/revoke issued versions, build a customer portal,
implement a calibration/uncertainty engine, procedure/competence library,
scheduling optimizer, LIMS, generic document management, event sourcing, CQRS
or microservices.
