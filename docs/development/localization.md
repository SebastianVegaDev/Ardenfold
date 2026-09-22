# Localization and regional preferences

Ardenfold supports English and Spanish as equal product locales. Every user-facing route contains
its locale (`/en/...`, `/es/...`), and visible product copy belongs in the corresponding catalog.
Components receive translated labels from their caller; reusable UI packages do not select a
language or contain product copy.

## Resolution and persistence

Locale selection is resolved in this order: authenticated user preference, active organization
preference, locale cookie, browser preference, then the technical fallback configured by
`NEXT_PUBLIC_ARDENFOLD_FALLBACK_LOCALE` (or the deterministic `en` build default). Until
authentication exists, the web edge can only use the cookie, browser and fallback inputs. The
resolver is deliberately independent of Next.js so the identity layer can supply verified user
and organization preferences later.

`language`, `formattingLocale`, and `timeZone` are distinct values. Language controls copy;
formatting locale controls numbers, currency and lists; timezone controls presentation of an
instant. The API and database will persist these values independently. User-entered content is
not machine-translated.

## Catalog and interface rules

- English and Spanish catalogs must have exactly the same keys; the parity test runs in CI.
- Product components must use typed `next-intl` keys for visible copy, metadata and accessible
  labels. A missing message must fail during development or CI rather than silently fall back.
- API error codes are stable transport contracts. The web maps them to `errors.*` keys and never
  displays a server exception message.
- Form errors, page metadata, dialogs and ARIA labels are catalog content, not literals in a
  component.

## Async and issued content

Jobs, emails, notifications and PDFs must receive an explicit locale, formatting locale and
timezone snapshot in their command payload. A job must not infer these from a worker process
default. Issued PDFs retain their recorded presentation language even if a viewer later changes
their interface language.
