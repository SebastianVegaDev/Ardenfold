# Ardenfold domain

This directory defines the shared language, module boundaries, and business
invariants used to build Ardenfold.

These documents describe intended behavior. They do not imply that the
corresponding features have already been implemented.

## Product scope

Ardenfold manages the traceable lifecycle of physical assets and technical
services.

The initial market is calibration, testing, and inspection.

The target operational lifecycle covers:

- Service requests and quotations.
- Asset identification, receipt, and custody.
- Work planning and technical execution.
- Evidence collection and technical review.
- Certificate issuance.
- Controlled delivery and public verification.
- Historical records and future service planning.

## M1 scope

M1 establishes the product platform needed to implement that lifecycle:

- Shared API conventions.
- Observability.
- Localization.
- A reusable visual system and application shell.
- Authentication and external identity integration.
- Organizations, memberships, and organization context.
- Tenant isolation and authorization.
- Organization onboarding.
- Security-relevant audit records.
- Automated verification of critical access boundaries.

M1 does not implement the complete commercial or technical lifecycle.

## Reading order

1. [Domain glossary](./glossary.md)
2. [Module boundaries](./boundaries.md)
3. [Workflow and invariants](./workflow-and-invariants.md)

## Modeling principles

- Use one explicit meaning for each domain term.
- Distinguish platform participation from commercial relationships.
- Distinguish asset ownership, custody, location, and access.
- Give each business concept one authoritative module.
- Keep organization boundaries explicit.
- Preserve the original meaning of technical records.
- Treat issued certificate versions as immutable.
- Introduce persistent models when a concrete use case requires them.

## Change policy

Update these documents when an implemented use case changes their assumptions.

Record significant architectural decisions in `docs/adr`.

Do not create database tables, public endpoints, or shared abstractions solely
because a concept appears in this glossary.