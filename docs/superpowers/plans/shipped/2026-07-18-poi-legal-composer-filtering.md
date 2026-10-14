# Poi-Legal Composer Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When a hand's prop is poi, the composer's option picker offers only moves that hand can legally do with poi; unchanged for non-poi props; dark-gated in production.

**Architecture:** Refactor the existing (orphaned) `PoiOptionFilterDecorator` to evaluate legality per hand from the active prop types. Inject a gated composer wrapper into the option-picker state factory's `filteredOptions` (the single display chokepoint), defaulting to identity so nothing changes unless poi is selected and the gate is on.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest. Spec: `docs/superpowers/specs/active/2026-07-17-poi-legal-composer-filtering-design.md`.

## Global Constraints

- Scope: filtering only. No terminology, no trail renderer, no `poi.svg` art, no public exposure.
- Illegal moves are **hidden**, not disabled.
- Gate: active only when `import.meta.env.DEV || isAdmin()`. Off → composer byte-identical to today.
- Per-hand: a hand is constrained only when its active prop type is `PropType.POI`. Absent motion imposes no constraint. Neither hand poi → identity.
- Do not modify the rule engine (`poi-constraint-validator.ts`) or its 5 rules.

---

### Task 1: Refactor `PoiOptionFilterDecorator` to per-hand + active prop types

**Files:**
- Modify: `src/lib/features/levels/poi-lab/services/poi-option-filter-decorator.ts`
- Test: `tests/unit/poi-lab/poi-option-filter-decorator.test.ts` (create)

**Interfaces:**
- Produces: `interface ActivePropTypes { bluePropType: PropType; redPropType: PropType }` and
  `PoiOptionFilterDecorator.filterPoiLegalOptions(options: readonly PictographData[], previous: PictographData | null, activeProps: ActivePropTypes): PictographData[]`.

- [ ] **Step 1: Write the failing test** — `tests/unit/poi-lab/poi-option-filter-decorator.test.ts` (see full source in the executed diff). Covers: no-poi identity, blue-poi hides illegal blue, red unconstrained when only blue poi (and removed when both poi), absent-motion, transition reversal, PRO-0-IN, DASH<0.5.
- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run tests/unit/poi-lab/poi-option-filter-decorator.test.ts` (old 2-arg signature).
- [ ] **Step 3: Refactor the decorator** — add `ActivePropTypes`, evaluate per hand from `activeProps`, `isHandLegal` private helper (absent motion → true), neither-poi → `[...options]`.
- [ ] **Step 4: Run it, expect PASS.**

### Task 2: Gated composer wrapper

**Files:**
- Create: `src/lib/features/levels/poi-lab/services/apply-poi-legal-filter.ts`

**Interfaces:**
- Consumes: `getPoiOptionFilterDecorator()`, `getSettings()`, `isAdmin()`.
- Produces: `applyPoiLegalComposerFilter(options: readonly PictographData[], previous: PictographData | null): PictographData[]` and `isPoiComposerFilterEnabled(): boolean`.

- [ ] **Step 1:** Write the wrapper: gate (`import.meta.env.DEV || isAdmin()`) → if off, `[...options]`; else read `getSettings().bluePropType/redPropType` and call the decorator.

### Task 3: Inject into the option-picker state factory

**Files:**
- Modify: `src/lib/features/create/construct/option-picker/state/option-picker-state.svelte.ts`

**Interfaces:**
- Consumes: optional `poiFilter?: (options: readonly PictographData[], previous: PictographData | null) => PictographData[]` on `OptionPickerStateConfig`.

- [ ] **Step 1:** Add `poiFilter?` to `OptionPickerStateConfig`; default `const poiFilter = config.poiFilter ?? ((o) => [...o])`.
- [ ] **Step 2:** In both `filteredOptions` (derived) and `getFilteredOptions()`, after the continuity filter and before sorting, apply `filteredResults = poiFilter(filteredResults, currentSequence.length ? currentSequence[currentSequence.length - 1] : null)`.

### Task 4: Wire the wrapper at construction

**Files:**
- Modify: `src/lib/features/create/construct/option-picker/components/OptionPicker.svelte`

- [ ] **Step 1:** Import `applyPoiLegalComposerFilter`; pass `poiFilter: applyPoiLegalComposerFilter` in the `createOptionPickerState({...})` config (`:335-339`).

### Task 5: Verify

- [ ] `npx vitest run tests/unit/poi-lab/poi-option-filter-decorator.test.ts` → all pass.
- [ ] `npx svelte-check --tsconfig ./tsconfig.json` on the touched files → 0 new errors.
- [ ] Commit with explicit pathspec (spec + plan + all 5 files).
