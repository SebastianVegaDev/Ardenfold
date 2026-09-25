# Workflow and invariants

This document describes the target operational lifecycle.

It does not define a single status field shared by every entity. Requests,
quotes, work orders, executions, and certificate versions have separate
lifecycles.

The [Service Management implementation model](service-management.md) defines
the detailed M4 states, transition guards, decimal rules and transaction
boundaries for steps 1 through 3. M4 ends when work is ready for technical
execution; steps 4 onward describe later capabilities.

## Reference workflow

### 1. Establish the commercial context

An authorized member records or selects a customer party within the operating
organization.

The customer does not need an Ardenfold account.

A service request describes the required work. Asset details may initially
be incomplete.

### 2. Agree on the scope

A quote groups numbered revisions of proposed scope, amounts, currency and
terms. Issuing a revision freezes its content; a new draft does not withdraw
an existing offer until it is issued.

Acceptance identifies the exact agreed revision. Subsequent changes must not
silently alter that accepted agreement.

A separately authorized work order references the acceptance and exact revision,
with work items allocating the agreed scope. Acceptance does not itself create
an order. M4 does not amend active accepted work through later revisions.

If a later use case permits work without a quote, that path must define its own
explicit authorization and commercial basis.

### 3. Identify and receive assets

Assets are identified or registered as sufficient information becomes available.

Receipt records observed condition and relevant accessories.
Unidentified intake remains unresolved until linked to an authoritative asset;
corrections preserve the original observations.

When physical custody changes, the responsible use case records that change
through Asset Registry in the same transaction as the receipt and required
location changes, history and audit. Receipt is never ownership transfer.

Physical receipt is not mandatory for every service. On-site work may leave
custody with the customer.

### 4. Perform technical work

Authorized personnel execute the work items and record results and evidence.

Technical records retain the context needed to interpret them, including units,
methods, and relevant conditions.

Changes remain traceable according to the applicable workflow.

### 5. Review and approve

An authorized reviewer assesses the applicable execution revision and evidence.

Approval identifies what was reviewed and by whom.

Changes to approved technical content require a new review before certificate
issuance.

Any required separation between performer and reviewer is enforced by explicit
policy rather than assumed from a role name.

### 6. Issue the certificate

An authorized operation checks approval and required information.

Issuance captures an immutable snapshot of the certificate content, including
the issuer and the approved results represented by that version.

Issued content must remain reproducible without depending on later edits to
customer names, asset descriptions, or technical source records.

Failures in PDF rendering or delivery must be represented explicitly. They must
not result in an untracked duplicate issuance.

### 7. Deliver and verify

Authorized recipients receive access to the issued version through a controlled
delivery mechanism.

Public verification exposes only an explicitly selected subset of information.

A verification view identifies the issuer, the referenced version, and its
current recorded status. It does not expose private execution data or the
customer's complete asset history.

### 8. Handle later changes

Replacement creates a new issued version and an explicit relationship to the
superseded version.

Revocation records a withdrawal without deleting the issued content.

Asset return, custody changes, and work-order closure are tracked separately
from certificate issuance.

Future-service dates are scheduling information unless a specific policy gives
them another meaning. An overdue service date does not automatically revoke a
certificate.

## Invariants

### Organization isolation

- Every protected operation has an explicit, validated access scope.
- An organization identifier supplied by a client is a selection request,
  not proof of authorization.
- A user may belong to multiple organizations without sharing their data.
- Organization-owned records cannot reference another organization's private
  records unless an explicit authorized relationship supports that operation.
- Tenant protections cover reads, writes, exports, attachments, and jobs.
- Application authorization and database isolation provide complementary
  controls. Neither is treated as a replacement for the other.
- Missing or invalid scope must not fall back to unrestricted access.

### Identity and authorization

- Authentication establishes who is acting.
- Membership and permissions determine what that actor may do in an organization.
- Business rules determine whether the requested transition is currently valid.
- Hiding a UI control does not enforce authorization.
- Email equality alone does not authorize linking external identities.
- A contact or customer record does not automatically grant platform access.
- Membership removal or suspension must be respected by protected operations,
  even when the user still has an authenticated session.

### Asset relationships

- Ownership, custody, location, and visibility are independent concepts.
- Receiving an asset does not transfer ownership.
- Knowing an asset identifier does not grant access to its history.
- Matching serial numbers do not establish that two records represent the
  same physical asset.
- Corrections to asset relationships must preserve relevant historical context.
- Cross-organization sharing is explicit, scoped, and auditable.

### Commercial and technical integrity

- Requests, quotes, revisions, acceptances, orders, items and receipts remain
  distinct durable concepts with separate lifecycle rules.
- Issued revisions are immutable, including rejected, expired and superseded
  offers. Acceptance names an exact revision, not mutable quote contents.
- Accepted commercial terms remain identifiable after later revisions.
- Withdrawal/correction preserves acceptance history and cannot silently
  invalidate active authorized work. Quote and order lifecycles are independent.
- A work order references its accepted basis; operational edits cannot change
  the agreement. Item allocation does not force one item per commercial line.
- Work items stop at operational readiness and contain no execution results.
- Monetary values carry an explicit currency.
- M4 quotes use exact decimal strings/arithmetic, frozen currency scale,
  round-half-up line bases and explicit fixed adjustments as defined in the
  Service Management model. Client totals and display rounding are not authority.
- Decimal values use representations and arithmetic appropriate to their
  required precision.
- Uncontrolled binary floating-point rounding must not alter authoritative
  financial or technical values.
- Units, uncertainty, resolution, and significant digits are preserved when
  required to interpret a technical result.
- Missing results are not silently converted to zero.
- Display formatting is distinct from authoritative stored values.

### Evidence and approvals

- Evidence retains its relationship to the action, result, or decision it supports.
- File access follows the authorization of the associated domain record.
- An approval refers to a specific reviewed revision.
- Editing reviewed content cannot silently preserve an approval for the old content.
- Authorized corrections retain the history required to explain the change.

### Certificate integrity

- Issued version content is immutable.
- Later issuer, customer, asset, or execution changes do not rewrite that content.
- Replacement and revocation are explicit recorded actions.
- The current status may change through those actions without modifying the
  original issued snapshot.
- Old verification references continue to identify their original version and
  disclose its current status.
- A replaced version is not silently redirected as though it were the new version.
- Revocation does not delete the historical issued version.
- Public verification does not imply accreditation or guarantee the technical
  correctness of the issuer's work.
- A QR code is an access mechanism, not proof of technical validity.
- Retries of issuance and related delivery operations must not create unintended
  duplicate certificates.

### Localization

- User-facing interface text is resolved through translation keys and catalogs.
- Code identifiers do not determine the user's interface language.
- Locale selection follows an explicit preference-resolution policy.
- A technical fallback does not establish a permanent primary product language.
- User-entered content retains its original language.
- Authoritative values are separate from localized display formatting.
- Display timezone conversion does not change the recorded instant.
- A date-only business value is not silently treated as a timestamp.
- An issued document's language is part of that version's recorded presentation
  and does not change when the viewer changes interface language.

### Audit and history

- Relevant actions retain an identifiable actor, scope, target, time, and outcome.
- Audit records are protected against ordinary application editing.
- Secrets, session tokens, and unnecessary sensitive payloads are not recorded
  in audit or operational logs.
- Critical state changes must not silently succeed without their required
  durable audit record.
- Operational logging is not a substitute for business history.
- The initial architecture does not require reconstructing all state from events.
- Mutable commercial/operational aggregates use optimistic versions; stale
  commands conflict without partial writes. Acceptance, work authorization and
  intake retries preserve durable replay identity and cannot duplicate facts.

## Review scenarios

The model must support the following cases without contradicting these rules:

1. A laboratory records a customer that has no Ardenfold account.
2. One user belongs to two laboratories and switches organization context.
3. Two organizations record the same manufacturer serial number without
   receiving access to each other's records.
4. A laboratory receives an instrument while the customer remains its owner.
5. A technician performs on-site work without transferring asset custody.
6. An approved result changes and must be reviewed again before issuance.
7. A customer changes its legal name after a certificate was issued.
8. An issued version is replaced and its original QR still reports that status.
9. A public visitor verifies a certificate without seeing private measurements
   or customer contact information.
10. A removed member attempts access using an existing authenticated session.
11. A user changes interface language without changing original technical notes
    or previously issued documents.
12. A delivery retry sends the existing issued version without issuing another one.
13. A new quote revision preserves the old offer; an expired or superseded offer
    cannot be accepted, and a replay cannot create a second acceptance/order.
14. A receipt plus custody/location change fails atomically if any required
    registry, business-history or audit write fails.
15. A customer name change leaves accepted commercial snapshots understandable;
    an on-site item becomes ready without artificial intake records.
