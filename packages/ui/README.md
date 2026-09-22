# `@ardenfold/ui`

Ardenfold's framework-light product primitives. Components follow the shadcn composition model:
Radix supplies behavior and accessibility, Tailwind classes consume semantic tokens, and consumers
own all product copy and translated accessible labels.

## Conventions

- Import public components only from `@ardenfold/ui`; internal files are not API surface.
- Use `cn` and `class-variance-authority` for controlled variants instead of ad hoc boolean class
  branches.
- Components may define structure and ARIA behavior, but must not embed visible product text.
- Icon-only controls and loading indicators require a translated label from the consumer.
- Prefer native controls and Radix primitives; preserve visible focus, keyboard interaction and
  reduced-motion behavior.
- Consume semantic colors such as `primary`, `surface`, `destructive` and `muted-foreground`.
  Brand hex values belong only in the application token definition.
- Add a component test when introducing interaction, focus management, labeling or state behavior.

The initial public surface contains button, input, label, card, badge, alert, spinner, skeleton and
dialog primitives. Domain-specific components stay in their owning module until reuse is proven.
