# Domain glossary

The canonical terms below are used in code, contracts, and architecture
discussions.

User-facing labels are localized independently.

An owning module is authoritative for a concept. Other modules may reference
that concept through explicit identifiers and contracts.

## Identity and access

| Term | Definition | Owning module |
| --- | --- | --- |
| Organization | A workspace participating in Ardenfold, with its own members, settings, and protected operational records. | Identity & Access |
| Tenant | The logical isolation boundary associated with an organization. It is not a separate business entity in the initial model. | Identity & Access |
| Site | An operational subdivision of an organization, such as a laboratory or branch. A site is not a separate tenant. | Identity & Access |
| User | A person represented in Ardenfold who may participate in multiple organizations. | Identity & Access |
| Identity | An authentication identity linked to a user. For an external provider, identity is determined by its issuer and subject, not by email alone. | Identity & Access |
| Membership | A user's participation in one organization, including its lifecycle and authorization assignments. | Identity & Access |
| Invitation | A time-limited offer to join an organization. An invitation does not grant operational access before valid acceptance. | Identity & Access |
| Role | A named collection of permissions assigned within an explicit scope. An organization role is not automatically global. | Identity & Access |
| Permission | Authority to perform a specific action, subject to resource scope and business rules. | Identity & Access |
| Session | An authenticated interaction context. A session does not independently grant access to every organization associated with a user. | Identity & Access |
| Organization context | The organization against which an operation is evaluated, after server-side access validation. | Identity & Access |

## Parties and commercial relationships

| Term | Definition | Owning module |
| --- | --- | --- |
| Party | A business counterpart recorded by an organization, such as a company or individual. A party does not need an Ardenfold account. | Parties |
| Customer | A role a party fulfills when requesting or purchasing services from the recording organization. | Parties |
| Provider | A role a party fulfills when supplying services or goods to the recording organization. | Parties |
| Contact | A person or contact channel associated with a party for business communication. A contact is not necessarily an authenticated user. | Parties |
| Commercial relationship | The organization-scoped relationship that describes how a party interacts with that organization. | Parties |

A party may be both a customer and a provider.

Different organizations may hold independent records about the same real-world
company. Those records are not automatically merged or shared.

A future link between a party and a participating organization must be explicit.
That link must not expose either organization's private records.

## Assets

| Term | Definition | Owning module |
| --- | --- | --- |
| Asset | A physical item whose identity and relevant technical history are tracked, such as an instrument or piece of equipment. | Asset Registry |
| Asset identifier | A reference used to identify an asset, such as an internal identifier, manufacturer serial number, or customer code. | Asset Registry |
| Ownership | A recorded relationship describing who owns an asset, including its applicable period when known. | Asset Registry |
| Custody | A recorded relationship describing who has possession or operational responsibility for an asset during a period. | Asset Registry |
| Location | The recorded physical placement of an asset. Location does not establish ownership or access rights. | Asset Registry |
| Asset history | A permission-filtered view of relevant asset events and references to records owned by other modules. | Asset Registry |

A manufacturer serial number is not assumed to be globally unique.

An asset's real-world identity may persist across organizations, but Ardenfold
must not infer shared visibility from matching identifiers.

Cross-organization identity linking and history sharing require explicit,
authorized workflows. The initial implementation does not promise automatic
global deduplication.

## Service delivery

| Term | Definition | Owning module |
| --- | --- | --- |
| Service request | A customer's expressed need for technical work, including the requested scope and relevant assets when known. | Service Management |
| Quote | The stable commercial identity grouping numbered proposals for one service request. | Service Management |
| Quote revision | A particular proposal's scope, amounts, currency and terms; editable while draft and immutable once issued. | Service Management |
| Acceptance | A durable customer-agreement fact identifying one exact issued quote revision, its attribution and time, separate from user authorization. | Service Management |
| Work order | The distinct operational authorization and coordination record derived from an explicit commercial basis; in M4, one accepted quote revision. | Service Management |
| Work item | An independently tracked allocation of agreed scope within a work order, forming the readiness boundary for future technical execution. | Service Management |
| Receipt | A historical physical-intake record with observed condition, accessories, time and actor; it neither establishes asset identity nor owns custody/location. | Service Management |
| Technical execution | A stable attempt to perform and record technical work for one ready Work Item. | Technical Operations |
| Execution revision | A numbered technical-content version of one execution; submission makes its context, results and evidence immutable. | Technical Operations |
| Technical result | A typed, ordered output of one exact execution revision, with the units, precision and context required to interpret it. | Technical Operations |
| Technical review | An immutable assessment of one submitted execution revision by an authorized reviewer. | Technical Operations |
| Approval | An explicit decision permitting one exactly reviewed execution revision to advance, subject to the applicable policy. | Technical Operations |
| Approved technical package | A read projection of the exact approved revision and its historical technical context, with current applicability stated separately. | Technical Operations |

A service request is not a draft quote. A quote is not its revision, and neither
is a work order. Acceptance permanently identifies its revision even after
withdrawal or later proposals.

Receipt does not transfer ownership and is not required for on-site work.
Detailed lifecycles and commercial-history rules belong in the
[Service Management model](service-management.md).

A work order is not a certificate.

A technical execution is not itself an approval.
The [Technical Operations model](technical-operations.md) defines attempt,
revision, result, review and approval semantics.

## Evidence and certificates

| Term | Definition | Owning module |
| --- | --- | --- |
| Evidence | A contextual record supporting a technical action, result, review, or decision. | Technical Operations |
| Attachment | A stored file linked to a domain record. Its business meaning and access rules come from that record. | The module owning the linked record |
| Certificate | The logical issued document record representing an identified technical scope and its results. | Certificates & Trust |
| Certificate version | A specific snapshot of certificate content. Once issued, its content cannot be overwritten. | Certificates & Trust |
| Issuance | The authorized act that turns approved certificate content into an immutable issued version. | Certificates & Trust |
| Replacement | An explicit relationship identifying a later issued version that supersedes an earlier one. | Certificates & Trust |
| Revocation | A recorded withdrawal of an issued version, including the reason, actor, and time. | Certificates & Trust |
| Verification | A controlled lookup of an issued version's current recorded status and disclosed identifying information. | Certificates & Trust |
| Public verification reference | An opaque reference granting access only to the deliberately public verification view. | Certificates & Trust |

An attachment is not automatically evidence merely because it was uploaded.

A PDF is a representation of an issued certificate version. It is not the
complete domain model of a certificate.

A hash can help detect changes relative to a trusted reference. It does not,
by itself, establish issuer identity, accreditation, or technical correctness.

## Audit

| Term | Definition | Owning module |
| --- | --- | --- |
| Audit record | A protected record of a relevant action, its actor, scope, target, time, and outcome. | Audit |
| Business history | Domain-specific history explaining changes to business records. | The relevant business module |
| Operational log | Diagnostic information used to operate and troubleshoot the software. | Observability infrastructure |

Audit records, business history, and operational logs serve different purposes.
They must not be treated as interchangeable records.
