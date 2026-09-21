# Source Code Contract

This file applies under `src/`. The current user request and root `AGENTS.md`
remain higher priority.

- Search by behavior and user-facing meaning before creating a component,
  service, utility, state owner, renderer, or interaction. Reuse, extend, or
  compose the existing owner when one exists.
- Stateless transforms are plain modules. Stateful lifecycle, caching, or
  coordination belongs to a named service owner. Do not add barrel exports.
- Svelte code uses Svelte 5 runes and the repository's existing context/state
  patterns. Read `.agents/skills/code-style/SKILL.md` for TypeScript or Svelte
  implementation and `.agents/skills/state-management/SKILL.md` for shared
  reactive state.
- UI changes consume the existing design system. Do not introduce a second
  primitive, token family, motion system, or layout shell for an owned behavior.
- Classify dynamic geometry: prevent accidental movement by reserving space;
  animate intentional structural change through shared motion owners. Pointer
  dragging follows the pointer and reduced motion reaches the final state
  immediately.
- Test silent behavior, not implementation prose or obvious rendering. Read
  `.agents/skills/testing/SKILL.md` before adding or changing tests.
- Inspect visual output only when the change affects appearance. New surfaces
  and responsive recomposition use the full viewport matrix; local visual fixes
  use the affected tiers and both state endpoints.
- Use `.agents/skills/ui-bust/SKILL.md` for new surfaces, substantial restyles,
  or aesthetic reviews. Establish the composition before coding and report
  aesthetic readiness separately from functional verification.

Task routes:

| Work                          | Guidance                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Layout, motion, responsive UI | `docs/architecture/visual-design-canon.md`, `.claude/rules/no-layout-shift.md`, `.claude/rules/visual-verification-mandatory.md` |
| Shared UI primitive           | `.claude/rules/primitive-discovery.md`; search `docs/architecture/canonical-capabilities.md` with `rg`                           |
| Sequence viewer shell         | `.claude/rules/sequence-viewer-shell.md`                                                                                         |
| Effects                       | `.claude/rules/effects-earn-their-slot.md`                                                                                       |
| Firestore access              | `.claude/rules/firestore-cost-discipline.md`                                                                                     |

Read only guidance matching the task. Historical rationale is non-normative.
