# M4 Service Management security and lifecycle gate

`pnpm test:m4` is the dedicated M4 gate. Start the isolated PostgreSQL service
first with `docker compose -f apps/e2e/compose.yaml up -d --wait` and install
Playwright Chromium if needed. The command builds the API, runs the Service
Management PostgreSQL integration suites, and then runs the scoped Playwright
API and browser scenarios. CI exposes it as `M4 Service Management
security/lifecycle` after the unit and integration `Tests` check.

The integrated scenario in `apps/e2e/tests/service-management-security.spec.ts`
creates its own two organizations and gives a second user a different role. It
follows Request → Quote Revisions → exact Acceptance → Work Order → same-Asset
Work Items → optional Receipt → readiness. It checks simultaneous draft edits
and acceptance replay, cross-tenant reads and identifiers, authoritative Asset
Registry custody and location, rollback after a rejected coordination attempt,
and English and Spanish operational views. The existing focused Playwright
scenarios in this gate cover the remaining lifecycle, commercial decision,
Receipt correction and browser paths. The PostgreSQL suites verify constraints,
forced RLS and concurrent authorization of one acceptance.

The Playwright harness resets only a local database whose name ends in `_e2e`.
Each scenario creates its own synthetic organizations and records. Tokens and
invitation credentials stay in uninstrumented Node requests; assertions report
statuses and invariant names instead of full payloads. Playwright keeps traces
and screenshots only for failures and disables video. The M4 CI job does not
upload raw browser artifacts because they can contain customer names and
commercial terms.
