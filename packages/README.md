# Ardenfold packages

This directory contains reusable modules shared by Ardenfold applications.

- `config`: shared development and build configuration.
- `contracts`: API schemas and shared data contracts.
- `core`: framework-independent domain logic.
- `database`: database schema, migrations and repositories.
- `observability`: logging, tracing and monitoring utilities.
- `test-utils`: shared testing helpers and fixtures.
- `ui`: reusable user-interface components.

Packages must not depend directly on deployable applications.