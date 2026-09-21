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

Replace the placeholder PostgreSQL password in `.env` with a development-only password.

Start PostgreSQL:

```powershell
pnpm db:up
```

Inspect its status:

```powershell
pnpm db:status
```

The `postgres` service must report `healthy`.

## Verify PostgreSQL

Run a query inside the container:

```powershell
docker compose exec postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), current_user;"'
```

## Start the API

```powershell
pnpm --filter @ardenfold/api dev
```

Verify the API and database connection:

```powershell
Invoke-RestMethod http://localhost:3001/health | ConvertTo-Json
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

| Command | Purpose |
| --- | --- |
| `pnpm db:up` | Start PostgreSQL |
| `pnpm db:down` | Stop PostgreSQL |
| `pnpm db:status` | Inspect service health |
| `pnpm db:logs` | Follow PostgreSQL logs |

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