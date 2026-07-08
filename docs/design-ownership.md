# Design Ownership

## Rule

Codex is responsible for infrastructure, data logic, Supabase, sync, import, validation, CRUD, tests, and deployment.

Claude is responsible for visual design, design system, layout refinement, responsive UI, animation, typography, spacing, color usage, and component aesthetics.

## Codex must not

- Redesign the visual system.
- Change color tokens without explicit instruction.
- Replace the design language.
- Add new UI libraries for styling.
- Modify spacing, typography, border radius, shadows, or card hierarchy unless required for functionality.
- Make subjective visual improvements.
- Change product name or navigation labels without instruction.

## Codex may

- Add unstyled or minimally styled functional components.
- Add loading, error, empty, and sync states using existing tokens.
- Add data hooks and service layers.
- Connect existing UI to Supabase.
- Add accessibility attributes.
- Fix layout-breaking bugs only when necessary.

## Visual source of truth

The visual source of truth is the Claude design handoff, not Codex-generated UI.