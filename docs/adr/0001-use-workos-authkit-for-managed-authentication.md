# ADR-0001: Use WorkOS AuthKit for managed authentication

- Status: Accepted
- Date: 2026-09-22
- Decision owners: Ardenfold engineering

## Context

Ardenfold needs password, social and enterprise authentication without building an
identity provider. The product is multi-organization, but authentication and domain
authorization are different responsibilities:

- a managed provider proves who is interacting with Ardenfold and manages its
  authentication session;
- Ardenfold decides which organizations, sites and resources that actor may access.

Conflating those responsibilities would couple the domain model and tenant isolation to
a vendor's organization and role model. That would make provider migration difficult and
could turn stale identity-provider data into an authorization vulnerability.

The decision compares the documented product capabilities and public pricing available
on 2026-09-22. Commercial terms and provider behavior must be checked again before a
material production commitment.

## Decision

Use [WorkOS AuthKit](https://workos.com/docs/authkit/overview) as Ardenfold's managed
authentication provider.

Use the hosted authentication UI first. Integrate the official Next.js SDK at the web
edge for Authorization Code flow, PKCE, callback handling and sealed sessions. The
NestJS API validates bearer access tokens independently against the WorkOS JWKS; it does
not trust identity headers supplied by the web application.

WorkOS is selected because Ardenfold is a B2B product whose likely path includes
enterprise SSO, MFA, invitations, directory provisioning and customer-managed identity
connections. AuthKit provides that path in one product while preserving a conventional
JWT verification boundary and a strong local-development environment. Its current
pricing also allows early authentication usage to grow before MAU pricing becomes
material, while charging enterprise connections when they create corresponding product
value.

This is a provider decision, not permission to adopt every WorkOS product. In
particular, WorkOS roles, permissions and organization selection are not Ardenfold's
authorization model.

## Responsibility boundary

### WorkOS owns

- Primary credentials, social identities, email verification and account recovery.
- Authentication challenges and future authentication policies such as MFA.
- Enterprise SAML/OIDC connections and authentication against those connections.
- WorkOS sessions, access-token signing keys, refresh-token rotation and provider-side
  session revocation.
- Authentication signals such as the external subject, verified email and authentication
  method.

### Ardenfold owns

- The canonical user record used by the product.
- Organizations and sites.
- Membership lifecycle, including Ardenfold invitation state and acceptance.
- Roles, permissions and all authorization policy.
- Selection and validation of the active Ardenfold organization.
- Resource grants, cross-organization relationships, audit records and RLS context.
- The mapping from an external identity to an Ardenfold user.

The Identity & Access module stores an external identity using at least
`provider`, `issuer` and `subject`. Email is profile data and a discovery aid, not the
stable identity key. A verified email may support a controlled account-linking flow, but
must never silently merge identities on an API request.

WorkOS `org_id`, `role`, `roles` and `permissions` claims are ignored for Ardenfold
authorization. If an enterprise connection requires a WorkOS Organization, its ID is
integration metadata only. An authenticated subject with no active local user or local
membership receives no tenant access.

## Token contract

The API accepts only an access token obtained by the server-side web session and sent as
`Authorization: Bearer <token>`. ID tokens, provider API keys, raw session cookies and
arbitrary identity headers are not API credentials.

For every request, the authentication adapter must:

1. Allow only the configured asymmetric signing algorithm.
2. Resolve keys from the configured issuer's HTTPS JWKS and honor key rotation.
3. Validate the signature, `iss`, `exp` and `iat` claims, with only a small bounded clock
   tolerance.
4. Require non-empty string claims `sub`, `sid` and `client_id`.
5. Require `client_id` to equal the environment's `WORKOS_CLIENT_ID`.
6. Reject malformed, expired, unknown-issuer or wrong-application tokens with `401`
   before any domain operation begins.
7. Map `(provider = workos, issuer, sub)` to one local identity and expose only a
   provider-neutral authenticated principal to application code.

The [documented first-party AuthKit access-token claims](https://workos.com/docs/authkit/sessions)
currently do not include the standard OAuth `aud` claim. Therefore `client_id` is the
required application binding for the first web application; it is not treated as a
domain permission. We will not add a fake `aud` claim or merely decode tokens without
verification.

Before adding a mobile client, third-party client, M2M access or another API, this
contract must be revisited. Each client surface gets a distinct WorkOS application and
client ID. If AuthKit supports a resource-server audience for first-party user tokens at
that point, the API must require that exact `aud` in addition to issuer validation. If it
does not, use a server-side token exchange or an Ardenfold-issued, short-lived internal
token with an explicit API audience rather than accepting tokens minted for unrelated
clients.

The provider-neutral principal passed inward contains only:

```text
externalIdentity: { provider, issuer, subject }
sessionId
authenticatedAt? / authenticationMethod? (when verified and needed)
```

Organization, membership, role and permission context is loaded from Ardenfold and added
by the authorization layer after authentication. Provider tokens are never passed into
domain services.

## Session, refresh and logout

- The web application uses the official server-side Next.js integration and a sealed,
  `HttpOnly`, `Secure` in production, `SameSite=Lax` cookie. Tokens are not stored in
  `localStorage`, exposed to client components or logged.
- `WORKOS_COOKIE_PASSWORD` is a high-entropy secret of at least 32 characters. It is
  distinct per deployment environment and supports an intentional rotation runbook.
- Access tokens are short lived. The initial production target is 15 minutes, subject to
  validation against real user latency and provider limits.
- The provider refresh token stays inside the sealed server session. The SDK performs
  rotation and atomically replaces the sealed session. A terminal `invalid_grant`
  clears the local session; transient timeouts, `429` and `5xx` failures preserve it and
  use bounded retry behavior.
- Logout clears the Ardenfold session cookie and invokes the WorkOS logout endpoint so
  the provider session is terminated. Redirect targets are allowlisted and configured;
  request input cannot supply an arbitrary post-logout URL.
- Sensitive operations may later require recent authentication or step-up MFA. That is
  an explicit policy decision and is not inferred from a long-lived application session.
- API responses and personalized pages that depend on the session are private and not
  shared-cacheable.

The API performs stateless token verification for normal requests. Immediate provider
revocation may lag until a short-lived access token expires; high-risk actions can add
introspection or a local revoked-session check if the threat model requires it. Local
membership removal takes effect immediately because authorization is loaded from
Ardenfold for each protected operation, independently of token lifetime.

## Invitations, MFA and enterprise SSO

Ardenfold invitation records are canonical. An invitation carries the target
organization, intended role, inviter, expiry, status and audit trail. WorkOS may deliver
or bootstrap an authentication invitation, but its acceptance does not itself create an
authorized Ardenfold membership. Membership is activated only by an idempotent Ardenfold
use case after the authenticated subject and invitation constraints are validated.

MFA is implemented first through AuthKit policy and its hosted flow. Ardenfold records
only security-relevant evidence needed for audit or policy decisions; it never stores
factor secrets. Enterprise SSO is enabled per customer through WorkOS SAML/OIDC
connections. An SSO assertion authenticates a person but does not grant a local
membership unless an explicit invitation or deliberately configured JIT/SCIM policy
allows it.

Directory Sync and WorkOS webhooks are optional future inputs to the Identity & Access
module. They do not write domain tables directly. Event consumers verify the raw-body
signature, store the provider event ID, process idempotently, tolerate duplicates and
out-of-order delivery, and reconcile through the API/Events API. WorkOS documents
exponential-backoff webhook retries in production, but delivery remains at-least-once,
not transactional with Ardenfold.

## Provider abstraction

Provider-specific code is allowed only in composition and infrastructure edges:

- Next.js authentication routes, middleware and session adapter;
- the API access-token verifier;
- identity lifecycle event ingestion;
- administrative integration code.

Application and domain code depend on small Ardenfold-owned ports such as token
verification and external-identity lookup, not on WorkOS SDK types. We will not create a
large lowest-common-denominator identity framework before a second provider exists. The
stable abstraction is the local external-identity mapping and authenticated-principal
contract; SDK calls remain thin adapters around it.

Provider user IDs are never foreign keys outside Identity & Access. Business and audit
records reference the local user ID. This is the principal migration seam.

## Environment and secret requirements

The repository documents names and non-secret placeholders in `.env.example`:

| Variable                          | Exposure            | Purpose                                                              |
| --------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `WORKOS_CLIENT_ID`                | Server              | Expected application/client binding and SDK configuration.           |
| `WORKOS_API_KEY`                  | Secret, server only | WorkOS management and token exchange API calls.                      |
| `WORKOS_COOKIE_PASSWORD`          | Secret, server only | Encrypts and authenticates the sealed web session.                   |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | Public              | Exact registered callback URL.                                       |
| `WORKOS_ISSUER`                   | Server              | Exact accepted issuer; allows a production custom auth domain.       |
| `WORKOS_WEBHOOK_SECRET`           | Secret, server only | Verifies lifecycle event signatures when event ingestion is enabled. |

Local development uses the WorkOS staging environment, localhost HTTP redirect URI and
test identities. Preview deployments use staging, an HTTPS preview callback allowlist
and isolated application configuration; previews never receive production secrets or
production user data. Production uses the WorkOS production environment, HTTPS-only
callbacks, a custom authentication domain when available, and secrets stored in AWS
Secrets Manager or SSM Parameter Store. Staging and production credentials, cookie keys
and webhook secrets are never shared.

Configuration fails closed at startup when authentication is enabled and a required
value is missing or malformed. Secrets must be redacted from logs, error metadata,
telemetry and build output. Browser code may access only the redirect URI; the `WORKOS_*`
server variables must not use a `NEXT_PUBLIC_` prefix.

## Alternatives considered

| Criterion                      | WorkOS AuthKit                                                                                                           | Auth0                                                                                             | Clerk                                                                          | Amazon Cognito                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Standards and API verification | Hosted OAuth/OIDC-style flow, JWT/JWKS; first-party token uses `client_id` rather than documented `aud`                  | Most mature general OIDC/OAuth surface and extensibility                                          | OAuth/OIDC discovery and JWT sessions; polished framework abstractions         | Standards-based managed login, OIDC/SAML federation and JWTs                                   |
| Next.js / NestJS fit           | Official Next.js SDK; API uses ordinary JWKS verification                                                                | Strong Next.js support; API middleware/standard JWT verification                                  | Excellent Next.js developer experience; API verification available             | Generic Amplify/OIDC libraries; more integration assembly                                      |
| Sessions                       | Server-sealed cookie, refresh rotation and documented transient-failure behavior                                         | Mature configurable sessions/tokens                                                               | Turnkey session model, strongly coupled to Clerk SDKs                          | Access/ID/refresh tokens; application owns more edge cases                                     |
| B2B path                       | MFA, invitations, enterprise SSO, directory sync and admin portal are core strengths                                     | Broad and powerful, but B2B organization/enterprise features add plan complexity                  | Good organizations and enterprise connections, optimized for frontend DX       | Enterprise federation exists but customer onboarding/admin workflows require more product work |
| Development and operations     | Dedicated staging, test identities and free staging enterprise connections                                               | Tenants and mature tooling, with more dashboard/rule/action surface                               | Very fast local setup and UI components                                        | Deep AWS fit and scale; comparatively high configuration and operational complexity            |
| Pricing shape at decision date | Authentication free to 1M MAU; production enterprise connections priced separately                                       | Lower free MAU allowance and tier/organization limits; enterprise pricing can be less predictable | Attractive early MAU allowance; several B2B/security capabilities vary by plan | Low usage-based infrastructure price, including separate enterprise-federation MAUs            |
| Portability                    | Users are accessible through APIs; local identity mapping limits blast radius; password/session migration remains costly | Export APIs and standards support, but Actions/rules/org model can create significant lock-in     | Export APIs, but UI/session/organization SDK adoption increases lock-in        | Standard tokens and AWS APIs; user password hashes are a known migration constraint            |

### Auth0

Auth0 is the strongest alternative when protocol flexibility, custom authentication
pipelines or a very broad integration catalog dominate. It was rejected for the current
stage because Ardenfold's primary need is a focused B2B identity path, while Auth0 adds
more tenant, Action, rule and plan complexity. Choosing Auth0 later remains feasible
because Ardenfold authorization stays local.

### Clerk

Clerk offers excellent Next.js ergonomics and prebuilt account/organization UI. It was
rejected because those conveniences make it especially easy to couple product identity,
organization selection and authorization to Clerk's frontend and organization models.
Ardenfold needs a stricter server-side domain boundary, and WorkOS has the clearer
enterprise identity focus for the expected market.

### Amazon Cognito

Cognito is economical at scale, integrates naturally with the planned AWS platform and
supports OIDC/SAML federation, MFA and managed login. It was rejected because customer
enterprise-connection onboarding, invitation experience, operational configuration and
framework integration would require materially more Ardenfold-owned work. Its cost
advantage does not currently offset that product and operational burden.

### Build authentication internally

Rejected. Credential storage, recovery, MFA, session security and enterprise federation
are high-risk undifferentiated infrastructure. Ardenfold still owns authorization because
that is domain-specific and security-critical.

## Consequences

### Positive

- The initial authentication implementation is small and based on maintained SDKs and
  standard JWT verification.
- MFA and enterprise SSO can be introduced without replacing the identity layer.
- Local authorization and external-identity mapping preserve tenant isolation and make a
  later provider migration tractable.
- A managed hosted flow reduces credential-handling scope and ongoing security work.

### Costs and risks

- Authentication availability and some onboarding flows depend on WorkOS.
- Enterprise connections create a recurring per-customer cost that pricing and packaging
  must cover.
- Password hashes, active sessions, MFA enrollment and enterprise connection setup are
  not assumed to be portable. A provider migration requires progressive account linking
  or reauthentication even when profile data can be exported through APIs.
- The absence of a documented standard `aud` claim on first-party AuthKit access tokens
  requires exact `client_id` validation and review before multiple client surfaces.
- Provider events are eventually consistent. Security-sensitive local authorization
  cannot depend solely on webhook arrival.

### Operational obligations

- Monitor login/callback failures, refresh failures by terminal/transient class, token
  verification failures by safe reason, webhook lag and reconciliation drift without
  logging tokens or personal secrets.
- Alert on sustained provider failures and retain a public status/runbook path; do not
  weaken verification during an outage.
- Pin and regularly update the provider SDK, review security advisories and test key
  rotation, logout, cookie rotation and account recovery.
- Periodically export or reconcile external identity metadata needed for recovery, while
  keeping Ardenfold's local user and membership data authoritative.
- Re-evaluate this ADR if WorkOS pricing changes materially, required regions/compliance
  are unavailable, the API needs multiple independent audiences, or measured provider
  reliability fails the product's objectives.

## Primary references

- [WorkOS AuthKit overview](https://workos.com/docs/authkit/overview)
- [WorkOS Next.js SDK](https://workos.com/docs/sdks/authkit-nextjs)
- [WorkOS sessions and claims](https://workos.com/docs/authkit/sessions)
- [WorkOS session resilience](https://workos.com/docs/authkit/session-resilience)
- [WorkOS environments](https://workos.com/docs/authkit/environments)
- [WorkOS webhook delivery semantics](https://workos.com/docs/events/data-syncing/webhooks)
- [WorkOS pricing](https://workos.com/pricing)
- [Auth0 pricing](https://auth0.com/pricing)
- [Clerk pricing](https://clerk.com/pricing)
- [Clerk enterprise connections](https://clerk.com/docs/guides/configure/auth-strategies/enterprise-connections/overview)
- [Amazon Cognito pricing](https://aws.amazon.com/cognito/pricing/)
- [Amazon Cognito authentication](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-how-to-authenticate.html)
