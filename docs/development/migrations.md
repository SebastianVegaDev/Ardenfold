# Database migrations

Ardenfold uses PostgreSQL, Drizzle ORM and Drizzle Kit.

The TypeScript schema in `packages/database/src/schema` is the source of
truth for database structures. Generated SQL migrations are committed to
the repository and reviewed as code.

## Commands

Run these commands from the repository root:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:migrate
pnpm db:check
```

## Workflow

1. Modify the TypeScript schema.
2. Generate a migration with a descriptive snake_case name.
3. Inspect the generated SQL.
4. Validate the migration metadata.
5. Apply the migration locally.
6. Run the migration command a second time to verify that it is safe to
   re-run.
7. Commit the schema, SQL migration and generated metadata together.

Schema integration tests apply all committed migrations to an empty PostgreSQL database,
run the migration runner a second time, and exercise database constraints. Set
`DATABASE_TEST_URL` to a disposable database whose name ends in `_test` to run them
locally:

```bash
DATABASE_TEST_URL=postgresql://user:password@localhost:5432/ardenfold_test \
  pnpm --filter @ardenfold/database test
```

The test suite refuses to reset databases without the `_test` suffix. CI provisions a
dedicated PostgreSQL service and always executes these tests.

## Rules

- Use one logical database change per migration.
- Use descriptive snake_case migration names.
- Generated SQL must always be reviewed before it is applied.
- Never edit a migration that has already been applied to a shared
  environment.
- Correct an applied migration by creating a new forward migration.
- Never use schema push commands in shared or production environments.
- Migrations are executed explicitly and never during API startup.
- Business tables must be introduced by their corresponding domain issue.
- Custom SQL migrations are allowed for PostgreSQL extensions, indexes,
  constraints and other infrastructure that cannot be expressed cleanly
  in the TypeScript schema.

## Initial migration

The initial migration enables the PostgreSQL `pgcrypto` extension.

No business tables are created during the infrastructure milestone.
