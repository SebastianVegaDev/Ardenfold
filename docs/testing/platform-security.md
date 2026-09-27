# Platform security end-to-end tests

The platform security suite exercises the M1 browser, API, identity and PostgreSQL boundaries together. It uses the normal WorkOS redirect, PKCE, sealed-session and JWT/JWKS paths against a local deterministic identity provider; the application contains no authentication bypass for tests.

`pnpm test:security` runs the complete Playwright suite, including later product
scenarios. The dedicated [M4 gate](service-management.md) also runs the Service
Management PostgreSQL integration tests and its scoped browser/API scenarios.

## Run locally

Docker, Node.js 24, pnpm 12 and the Playwright Chromium browser are required.

```sh
docker compose -f apps/e2e/compose.yaml up -d --wait
pnpm --filter @ardenfold/e2e exec playwright install chromium
pnpm test:security
docker compose -f apps/e2e/compose.yaml down --volumes
```

The harness refuses to reset any database unless it is local and its name ends in `_e2e`. It drops and recreates the test schema before every run, then applies the real migrations. The dedicated Compose database uses an in-memory filesystem and should be stopped with `--volumes` after a run.

## Determinism and diagnostics

The suite owns fixed identities for an owner, member and short-lived session. Product records are created through Ardenfold's real HTTP flows. Tests run serially with one worker because later checks intentionally exercise the membership lifecycle created earlier in the same isolated database.

Screenshots and traces are retained only when a test fails; video is disabled. One-time invitation credentials and access tokens are handled by uninstrumented Node requests, are never logged or attached, and do not enter Playwright traces. Failure messages report only status and invariant names.

CI exposes the suite as the independent `Platform security` status check. Failure traces stay on the ephemeral runner because this suite now includes M4 commercial journeys. Branch protection should require that check before merging the M1 milestone.
