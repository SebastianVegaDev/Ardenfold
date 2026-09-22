# API contracts

Ardenfold business endpoints use `/api/v1`.

Operational probes remain outside business versioning: `GET /health/live`
confirms process liveness, while `GET /health/ready` also verifies PostgreSQL.

## Resources and methods

- Use plural resource names.
- Use lowercase kebab-case for multiword path segments.
- Use opaque identifiers in resource paths.
- Keep JSON property names in camelCase.
- Use GET for reads without business side effects.
- Use POST for creation and explicitly named business actions.
- Use PATCH for partial updates with endpoint-specific validation.
- Use PUT only when full replacement semantics are implemented.
- Use DELETE only when the resource's documented deletion policy permits it.

Do not expose database table names or internal persistence models as the
public contract.

## Success responses

A single-resource response contains the resource representation directly.

A paginated response contains:

- `data`: the returned items.
- `pageInfo.page`: the requested page.
- `pageInfo.limit`: the effective page size.
- `pageInfo.hasNextPage`: whether another page exists.

Use 201 for successful creation and a Location header when the created
resource has an address.

Use 204 when an operation intentionally returns no response body.

## Request validation

Each endpoint validates its body, query, and path parameters using explicit
schemas.

Use ContractValidationPipe with the corresponding shared schema.

Reject unknown input properties unless a specific contract deliberately
supports them.

Required fields, allowed values, lengths, and numeric bounds belong in the
endpoint's schema.

Transport validation does not replace authorization or business rules.

## Errors

Errors use the ApiError contract from @ardenfold/contracts.

Every error includes:

- A stable machine-readable code.
- The HTTP status, matching the response status.
- A traceId matching the x-request-id response header.
- An issues array.
- A metadata object.

Validation issues contain:

- source: body, query, or params.
- path: a JSON Pointer relative to that source; an empty string means its root.
- code: an Ardenfold-owned validation code.

The API does not send translated interface messages.

Clients map error codes to localized text. Clients must also have a generic
fallback for codes they do not yet recognize.

Do not expose rejected values, stack traces, SQL errors, tokens, credentials,
or arbitrary exception messages.

Metadata is explicitly selected by server code. It is not a place for copying
request bodies or third-party error objects.

Unexpected server errors use INTERNAL_ERROR.

## Pagination

The initial convention uses page and limit query parameters.

- page defaults to 1.
- page must be between 1 and 1000000.
- limit defaults to 25.
- limit must be between 1 and 100.
- Query values are validated before conversion to numbers.
- hasNextPage must be derived from actual query results.
- A total count is not required.

Each list endpoint must define a deterministic ordering with a unique
tie-breaker.

Pagination does not promise a consistent snapshot across concurrent writes.

Introduce cursor pagination for a concrete endpoint when its access pattern
requires it. Do not silently change an existing endpoint's pagination contract.

## Filtering and sorting

Each list endpoint declares its supported filters explicitly.

Extend the pagination query schema with the endpoint's allowed filter fields.

Use sortBy and sortDirection when client-selected sorting is supported.

- sortBy must come from an endpoint-specific allowlist.
- sortDirection accepts asc or desc.
- Unsupported filters and sort fields are rejected.
- API field names map to server-owned query expressions.
- Never interpolate a client-supplied field into SQL.

## Serialization

- Identifiers use UUID strings unless a resource explicitly documents another
  identifier format.
- Instants use UTC ISO 8601 strings with three fractional digits and Z.
- Calendar dates use YYYY-MM-DD and carry no implied timezone.
- Exact decimal values use strings with a decimal point.
- Decimal strings preserve relevant trailing zeroes.
- Exponential notation and localized decimal separators are not accepted by
  the shared decimal contract.
- Money includes an explicit currency in the relevant resource contract.
- Display formatting belongs to the consuming interface.
- User-entered content retains its original language.
- null and an omitted property have distinct meanings that each contract defines.

Never convert authoritative decimal strings to JavaScript numbers merely
to perform financial or precision-sensitive calculations.

## OpenAPI

docs/api/openapi.json is a generated, versioned artifact.

Build the API and its workspace dependencies before generating it:

    pnpm exec turbo run build --filter=@ardenfold/api...
    pnpm --filter @ardenfold/api openapi:generate

Verify the committed artifact:

    pnpm --filter @ardenfold/api openapi:check

Generation uses the actual application module with its database provider
replaced. It does not require a running PostgreSQL instance.

The generator uses fixed tooling-only environment values and writes no .env file.

Operation IDs must be explicit and stable.

New endpoints must document their request schemas, successful responses,
and relevant error statuses. The shared default response describes the
common error envelope.

When generating schemas for requests, represent their wire input rather than
only their post-validation output.

The OpenAPI artifact must not contain timestamps, environment-specific hosts,
real credentials, or private examples.

Do not edit the generated artifact manually.

CI rebuilds the API and compares the generated contract with the committed
artifact. Missing or outdated artifacts fail the Tests job.

This check detects artifact drift. It does not determine whether a contract
change is backward compatible.

## Compatibility

Within v1:

- Do not remove or rename existing fields without a migration strategy.
- Do not narrow previously accepted input silently.
- Do not change established field meanings.
- Review new enum values for client compatibility.
- Treat breaking changes as explicit versioning decisions.

API versioning and OpenAPI document version metadata are separate concerns.
