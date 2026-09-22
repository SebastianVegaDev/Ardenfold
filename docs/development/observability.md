# Observability and correlation

Every API request and asynchronous job has a UUID correlation identifier. The API accepts
`x-request-id` only when it is a UUID; otherwise it creates one. The identifier is returned in
every response, appears in structured logs, and is the API error `traceId`.

The API emits one JSON `request.completed` event per response with the method, matched route,
HTTP status and duration. Server failures add a `request.failed` event using the same identifier.
The worker runs each future queue job inside the same correlation context, propagating the id
provided by the job payload or generating a new id for independently scheduled work.

## Data-handling rules

- Log stable identifiers, state transitions, request metadata and aggregate operational metrics.
- Do not log passwords, cookies, authorization headers, API keys, access tokens, refresh tokens,
  client secrets, document contents, raw request bodies, or unbounded personal data.
- Pino redaction is a defensive control, not permission to pass secrets to logs. New logging code
  must use allowlisted, purpose-specific fields.
- Use `correlationId` to join request logs, worker logs and future audit records. Do not use an
  email address, name or external provider subject as a correlation key.

Liveness (`/health/live`) only proves the API process can receive traffic. Readiness
(`/health/ready`) additionally verifies PostgreSQL and is the endpoint deployment orchestration
should use before routing traffic to an instance.
