# Ardenfold

Multi-tenant platform for technical asset traceability, service operations, and verifiable certificates.

## Project status

Ardenfold is currently in its engineering foundation stage. The architecture, development workflow and technical foundations are being established before implementing the first product workflow.

## Product vision

Ardenfold connects organizations, technical service providers, physical assets, service operations, evidence and verifiable certificates.

The initial market is calibration, testing and technical inspection in Latin America. The long-term vision is to provide a persistent and trustworthy digital history for technical assets and the organizations that work with them.

## Architecture

Ardenfold begins as a modular multi-tenant monolith with an API-first and event-ready architecture.

The system is organized into three deployable processes:

- `web`: public experience, operational platform, customer portal and public verification.
- `api`: synchronous operations, authorization and business use cases.
- `worker`: documents, notifications, integrations and asynchronous processing.

PostgreSQL is the primary source of truth. Files and evidence will be stored in object storage.

Read the complete architecture document:

- [Architecture and technical stack](docs/architecture/overview.md)
- [Architecture Decision Records](docs/adr/README.md)

## Planned repository structure

```text
ardenfold/
├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   └── mobile/
├── packages/
│   ├── core/
│   ├── database/
│   ├── contracts/
│   ├── ui/
│   ├── observability/
│   ├── config/
│   └── test-utils/
├── infrastructure/
│   ├── terraform/
│   └── docker/
└── docs/
    ├── architecture/
    └── adr/
```

The `mobile` application is planned for a later stage and will only be implemented when field work and offline operation justify it.

## Technical stack

- TypeScript
- Node.js
- Next.js
- React
- NestJS
- Fastify
- PostgreSQL
- Drizzle ORM
- Amazon S3
- Amazon SQS
- Docker
- Terraform
- GitHub Actions

## Internationalization

Ardenfold is designed as a multilingual product.

The application will not hardcode user-facing text or treat one language as the permanent product language. Locale selection will be resolved from the user's preference, organization configuration or browser preference.

Translation catalogs will be loaded dynamically and validated to prevent incomplete releases.

## Local development

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

Start PostgreSQL:

```powershell
pnpm db:up
```

Start the applications:

```powershell
pnpm dev
```

Verify the API and PostgreSQL connection:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

See [Local PostgreSQL environment](docs/development/database.md) for troubleshooting and operational commands.

## Development workflow

All implementation follows this workflow:

1. Select a defined GitHub issue.
2. Move the issue to `In Progress`.
3. Create a branch from `main`.
4. Implement and verify the change.
5. Open a pull request linked to the issue.
6. Review the diff and automated checks.
7. Squash and merge into `main`.
8. Delete the completed branch.

See [CONTRIBUTING.md](/CONTRIBUTING.md) for the complete conventions.

## Security

Never commit passwords, API keys, access tokens, private certificates or production environment files.

Only documented example variables without real credentials may be committed.

## License

Copyright © 2026 Ardenfold. All rights reserved.

This repository contains proprietary software and is not licensed for public use, modification or distribution.