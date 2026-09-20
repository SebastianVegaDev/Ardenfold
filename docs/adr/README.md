# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for Ardenfold.

An ADR records an important technical decision, its context, the alternatives considered and its consequences.

## When to create an ADR

Create an ADR when a decision:

- Changes a system boundary.
- Introduces a major dependency.
- Changes the persistence or multi-tenancy strategy.
- Affects security, authorization or compliance.
- Establishes a convention that future modules must follow.
- Is difficult or expensive to reverse.

Do not create an ADR for:

- Small implementation details.
- Routine dependency updates.
- Formatting changes.
- Decisions already covered by an existing ADR.

## Naming convention

```text
NNNN-short-decision-title.md
```

Examples:

```text
0001-use-modular-monolith.md
0002-use-postgresql-row-level-security.md
0003-use-transactional-outbox.md
```

## Statuses

An ADR may have one of these statuses:

- Proposed
- Accepted
- Superseded
- Rejected
- Deprecated

Accepted ADRs are not edited to change their original decision. If the decision changes, create a new ADR and mark the previous one as superseded.

## Template

```markdown
# ADR-NNNN: Decision title

- Status: Proposed
- Date: YYYY-MM-DD
- Decision owners: Name or team

## Context

What problem or architectural question requires a decision?

## Decision

What was decided?

## Alternatives considered

What other approaches were evaluated?

## Consequences

What benefits, limitations and future obligations result from this decision?
```

## Initial decisions

The approved architectural baseline is currently documented in:

- [`docs/architecture/overview.md`](../architecture/overview.md)

Individual ADRs will be created when implementation begins to depend on those decisions.