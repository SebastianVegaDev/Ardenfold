#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_RUNTIME_USER:?POSTGRES_RUNTIME_USER is required}"
: "${POSTGRES_RUNTIME_PASSWORD:?POSTGRES_RUNTIME_PASSWORD is required}"

if [[ ! "$POSTGRES_RUNTIME_USER" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "POSTGRES_RUNTIME_USER must be a lowercase PostgreSQL identifier." >&2
    exit 1
fi

if [[ "$POSTGRES_RUNTIME_USER" == "ardenfold_runtime" || "$POSTGRES_RUNTIME_USER" == "$POSTGRES_USER" ]]; then
    echo "The runtime login must differ from the capability and migration roles." >&2
    exit 1
fi

psql \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set=ON_ERROR_STOP=1 <<'SQL'
\getenv runtime_user POSTGRES_RUNTIME_USER
\getenv runtime_password POSTGRES_RUNTIME_PASSWORD

SELECT 'CREATE ROLE ardenfold_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ardenfold_runtime') \gexec

SELECT format(
    'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    :'runtime_user',
    :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_user') \gexec

SELECT format(
    'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    :'runtime_user',
    :'runtime_password'
) \gexec

SELECT format('GRANT ardenfold_runtime TO %I', :'runtime_user') \gexec
SQL
