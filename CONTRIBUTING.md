# Contributing to Ardenfold

This document defines the development workflow and repository conventions for Ardenfold.

## Issue-first workflow

Every meaningful implementation begins from a GitHub issue with:

- A clear objective.
- A defined scope.
- Acceptance criteria.
- Priority and size.
- Project and milestone assignment.

Small corrections may be included in an existing issue when they belong to the same objective.

## Branches

Create every working branch from an updated `main`.

```bash
git switch main
git pull --ff-only
git switch -c <type>/<issue-number>-<short-description>
```

Allowed branch types:

- `feat`
- `fix`
- `chore`
- `docs`
- `refactor`
- `test`
- `ci`

Examples:

```text
docs/1-repository-documentation
chore/2-bootstrap-monorepo
feat/18-create-organization
fix/42-prevent-cross-tenant-access
```

Branches must be short-lived and deleted after merging.

## Commits

Use Conventional Commit-style messages:

```text
<type>: <imperative description>
```

Examples:

```text
docs: establish repository documentation
chore: bootstrap monorepo
feat: create organization membership
fix: enforce tenant boundary in asset queries
test: cover unauthorized organization access
```

Keep commits focused. Do not mix unrelated changes in the same commit.

## Pull requests

Every change to `main` must pass through a pull request.

A pull request must:

- Explain the result of the change.
- Reference its issue using `Closes #number`.
- Describe how the change was verified.
- Include screenshots when the visual interface changes.
- Avoid unrelated modifications.
- Pass every automated quality check.

Pull requests are merged using squash merge.

## Code quality

Before opening a pull request, run the repository quality commands when available:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

These commands will become available during the engineering foundation milestone.

## Architecture

Business rules must remain independent from:

- HTTP.
- Next.js.
- NestJS.
- PostgreSQL access libraries.
- AWS services.
- Email and external integrations.

Changes to important architectural decisions require an ADR.

## Internationalization

Do not hardcode user-facing text inside components, controllers or business services.

Use translation keys and locale-aware formatting for:

- Interface text.
- Validation messages.
- Notifications.
- Dates and times.
- Numbers.
- Money.
- Measurement units.

Business identifiers, event names, database columns and source code remain in English.

## Database changes

Database changes must:

- Be introduced through migrations.
- Preserve existing data.
- Include appropriate constraints.
- Consider tenant isolation.
- Remain reviewable as SQL.
- Include tests for critical access boundaries.

Never edit a previously applied production migration.

## Security

Never commit:

- `.env` files containing real values.
- Passwords.
- API keys.
- Access tokens.
- Private keys.
- Production certificates.
- Customer information.

Use `.env.example` to document required variables without exposing secrets.

## Definition of done

An issue is done when:

- Its acceptance criteria are satisfied.
- Relevant tests pass.
- Documentation is updated.
- No known security boundary is weakened.
- The pull request is reviewed and merged.
- The issue is closed.