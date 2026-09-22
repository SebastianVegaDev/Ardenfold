# Audit log operations

Ardenfold's audit log is the append-only security history for organization and identity changes.
Runtime database credentials can insert and permission-gated read events; PostgreSQL grants no
runtime capability to update or delete them. Events are written in the same transaction as the
operation they describe, so rollback cannot leave a false success record.

## Data discipline

Each event contains an organization, actor class and optional local actor user, stable action,
resource type and identifier, request trace ID, occurrence time, and bounded structured metadata.
Metadata is limited to an 8 KiB JSON object with scalar values. Keys suggesting tokens, secrets,
passwords, document bodies, content, or email addresses are rejected by the application. Raw
credentials, invitation tokens and complete business documents must never enter this table.

## Retention

No automatic deletion is enabled in M1. Before production launch, commercial, legal and security
owners must set the retention period by customer tier and jurisdiction. Until then, production
operators should treat events as indefinitely retained security records. Any future retention job
must run under a dedicated maintenance role outside the application runtime, delete only events
older than the approved policy, emit operational metrics, and record its own administrative audit
evidence outside the rows being removed.

## Export and scale

The API uses a stable `(occurred_at, id)` keyset cursor rather than offsets. This keeps tenant
queries predictable as history grows. The table is indexed by organization and descending event
order. At larger scale, use time partitioning only after measured table/index growth justifies the
operational cost.

Future customer export should stream an organization-scoped, permission-checked format from a
consistent snapshot to encrypted object storage, with short-lived download authorization. Export
jobs must preserve stable action identifiers and trace IDs, localize labels only at presentation,
and must not bypass tenant scope. Forwarding to a SIEM should use an outbox/checkpoint so external
delivery failures never roll back the domain transaction and duplicates remain detectable by event
ID.

## Monitoring

Alert on audit insert failures, rejected oversized/sensitive metadata, sustained query failures,
and unexpected permission errors. An audit write failure intentionally fails the protected domain
operation; operators must not disable auditing to restore writes.
