# Ardenfold brand system

The approved brand source files live in [`/ardenfold-brand-kit`](../../ardenfold-brand-kit). The
kit is versioned as a product dependency because UI tokens, public metadata, generated documents
and future verification surfaces all depend on the same identity rules.

Application code must consume semantic tokens from `apps/web/src/app/globals.css`; raw brand hex
values should only appear while defining those tokens. Product status colors remain separate from
brand accents, and state meaning must never rely on color alone.

The web app publishes only assets needed at runtime under `apps/web/public/brand`. Preserve SVG
aspect ratios and the clear-space/minimum-size rules from the full guidelines. Do not reconstruct
the wordmark using a runtime font.
