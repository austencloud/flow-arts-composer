# How It Works Proof Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized six-state Assembly Table with an immediately readable three-proof strip.

**Architecture:** Keep the existing Firestore sequence load and domain-derived pictograph data. Render one static pictograph, one `ChoreoCard`, and one visibility-gated `HowTkaAnimationCard` inside a shared compact shell; delete progression-only state and styles.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest contract tests, component-scoped CSS.

## Global Constraints

- No hand-rendered TKA visuals; reuse existing domain components.
- No step selector, auto-tour, or oversized 4K expansion.
- Keep all three proofs visible together at every supported width.
- Essential labels remain at least 14px.

---

### Task 1: Lock the compact architecture

**Files:**
- Modify: `tests/unit/landing/how-tka-assembly-contract.test.ts`

**Interfaces:**
- Consumes: Svelte component source.
- Produces: a regression contract for `.proof-strip`, three proof cells, and removal of ToggleGroup/rail behavior.

- [ ] Replace the Assembly Table assertions with proof-strip assertions.
- [ ] Run `pnpm exec vitest run tests/unit/landing/how-tka-assembly-contract.test.ts` and confirm failure against the current section.

### Task 2: Build the real proof strip

**Files:**
- Modify: `src/routes/landing/components/HowTkaWorksSection.svelte`
- Modify: `src/routes/landing/components/HowTkaAnimationCard.svelte`

**Interfaces:**
- Consumes: `motionData`, `sequence`, `PictographContainer`, `ChoreoCard`, and `HowTkaAnimationCard`.
- Produces: one `.proof-strip` containing `.proof-pictograph`, `.proof-sequence`, and `.proof-playback`.

- [ ] Remove progression state, ToggleGroup markup, auto-advance effects, and rail CSS.
- [ ] Render the three existing visual primitives in one shared shell.
- [ ] Gate playback with the existing intersection and document visibility logic.
- [ ] Add compact responsive and 4K-capped styles plus sticky-header scroll clearance.
- [ ] Run the focused contract test and confirm it passes.

### Task 3: Match the lazy placeholder and remove dead progression code

**Files:**
- Modify: `src/routes/landing/components/LazyHowTkaWorksSection.svelte`
- Delete: `src/routes/landing/components/how-tka-assembly-model.ts`
- Delete: `tests/unit/landing/how-tka-assembly-model.test.ts`

**Interfaces:**
- Consumes: proof-strip geometry from Task 2.
- Produces: a stable three-cell loading shell with no obsolete assembly state.

- [ ] Replace the stage-and-rail skeleton with three proof placeholders.
- [ ] Move the tiny playback gate into `HowTkaAnimationCard.svelte` and delete progression-only files.
- [ ] Run focused tests and incremental Svelte checking.

### Task 4: Present the actual browser preview

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: completed worktree implementation.
- Produces: a live `127.0.0.1:5174` visual for Austen's review.

- [ ] Start the worktree Vite server on port 5174 without touching port 5173.
- [ ] Inspect 390px and 1440px layouts for density and overflow.
- [ ] Leave the preview running for user review and report the exact URL.

