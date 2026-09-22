# Local PostgreSQL environment

Ardenfold uses PostgreSQL as its primary source of truth.

The local environment runs PostgreSQL through Docker Compose. Application data is stored in a named Docker volume and survives normal container recreation.

## Requirements

- Docker Desktop
- Node.js
- pnpm

## First-time setup

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

Replace both placeholder PostgreSQL passwords in `.env` with distinct development-only
passwords. The migration identity owns schema objects; the runtime identity used by the
API is deliberately non-owning and cannot bypass row-level security.

Start PostgreSQL:

```powershell
pnpm db:up
```

If the local named volume was created before migration and runtime identities were split,
the initialization script will not run again automatically. Export any data that matters
and recreate that development volume deliberately before continuing. Never remove a
shared or production volume to apply this setup change.

Inspect its status:

```powershell
pnpm db:status
```

The `postgres` service must report `healthy`.

## Verify PostgreSQL

Run a query inside the container:

```powershell
docker compose exec postgres sh -lc 'PGPASSWORD="$POSTGRES_RUNTIME_PASSWORD" psql -U "$POSTGRES_RUNTIME_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), current_user;"'
```

## Start the API

```powershell
pnpm --filter @ardenfold/api dev
```

Verify the API and database connection:

```powershell
Invoke-RestMethod http://localhost:3001/health/ready | ConvertTo-Json
```

Expected response:

```json
{
    "status": "ok",
    "service": "api",
    "database": "up"
}
```

## Commands

| Command          | Purpose                |
| ---------------- | ---------------------- |
| `pnpm db:up`     | Start PostgreSQL       |
| `pnpm db:down`   | Stop PostgreSQL        |
| `pnpm db:status` | Inspect service health |
| `pnpm db:logs`   | Follow PostgreSQL logs |

Apply migrations with the privileged migration URL, never through the API connection:

```powershell
pnpm db:migrate
```

The API process receives `DATABASE_URL`. Migration jobs receive
`DATABASE_MIGRATION_URL`. Do not expose the migration URL to the web, API or worker
runtime.

## Persistence

`pnpm db:down` removes the container and network but preserves the named volume:

```text
ardenfold-postgres-data
```

Do not run the following command unless local data should be permanently deleted:

```powershell
docker compose down --volumes
```

## Port conflicts

PostgreSQL uses host port `5432` by default.

If another PostgreSQL instance already uses that port, change this value in `.env`:

```dotenv
POSTGRES_PORT=5433
```

`DATABASE_URL` uses `POSTGRES_PORT`, so it will expand to the same port automatically.

## Security

- Never commit `.env`.
- Never reuse the local password in production.
- Production secrets will be supplied through the deployment platform.
- `.env.example` contains variable names and safe placeholders only.

## Identity and tenancy conventions

- PostgreSQL generates UUID primary keys with `gen_random_uuid()`; application code does
  not derive identifiers from names, emails or provider subjects.
- `users` are global Ardenfold profiles. A user can have multiple external identities
  and memberships in multiple organizations.
- `(provider, issuer, subject)` is the unique external identity key. Email addresses are
  mutable profile data and deliberately are not identity keys or unique account keys.
- Organization defaults and optional user preferences store locale and time zone
  separately. Application boundaries validate supported BCP 47 locale tags and IANA
  time zone identifiers before persistence.
- Memberships exist only after acceptance and have `active`, `suspended` or `removed`
  lifecycle states. Pending invitations are separate records introduced with the
  invitation workflow.
- A removed membership is retained and may be deliberately reactivated; the unique
  organization/user pair prevents parallel membership records and preserves continuity.
- `created_at` and `updated_at` are UTC instants. Inserts receive database defaults;
  update use cases must set `updated_at` explicitly in the same statement as the change.
- Development factories emit synthetic `example.test` data and are never a production
  seed mechanism.

See [Tenant isolation](./tenant-isolation.md) for the RLS contract, background-job rules
and privileged maintenance boundary.
