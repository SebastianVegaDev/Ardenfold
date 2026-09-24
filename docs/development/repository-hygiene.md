# Repository hygiene

Ardenfold tracks source code, documentation, reviewed database migrations and
their metadata, the root `pnpm-lock.yaml`, and intentionally reviewed contract
artifacts. A generated file is not removed solely because a tool produced it:
it is versioned only when it is a reproducible, reviewed source of truth.

The root `pnpm-workspace.yaml` and root lockfile are the only workspace-level
dependency-resolution source of truth. Applications must not commit nested
pnpm lockfiles or workspace files unless they intentionally operate as an
independent workspace, which none currently do.

## Local output

The following are disposable and ignored by Git:

- Turbo and package-manager state: `.turbo/`, `.pnpm-store/`.
- framework/build state: `.next/`, `dist/`, `out/`, `.vitest/`, and
  `*.tsbuildinfo`;
- test diagnostics: `coverage/`, `playwright-report/`, and `test-results/`;
- dependency installs and editor state: `node_modules/`, `.vscode/`, `.idea/`;
- local environment files: `.env` and `.env.*`, except `.env.example`.

Builds and tests may recreate this output locally. It must remain ignored and
must not be added to a commit. Before opening a pull request, inspect
`git status --ignored` when generated files appear unexpectedly.

## Intentionally versioned generated artifacts

- `pnpm-lock.yaml` pins the workspace dependency graph.
- `packages/database/drizzle/` migrations and metadata are reviewed database
  changes and must be committed with their schema change.
- `docs/api/openapi.json` is a deterministic, reviewed contract artifact; keep
  it only when an API contract change intentionally updates it.

Never commit secret-bearing local configuration. Add safe placeholders only to
`.env.example`.
