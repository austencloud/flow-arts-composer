---
status: backlog
value: 3
effort: L
remaining: 'Phases 1, 2, 4 open. Phase 3 is PARTLY shipped and the 2026-07-25 ledger was wrong to call it absent: eslint.config.js:142 enforces the shared/ -> features/ one-way boundary. What is still missing is a feature<->feature restriction. Re-scope Phase 3 to that gap.'
depends_on: ''
plan_path: ''
tags:
- architecture
- tech-debt
last_triaged: '2026-10-07'
work_state: in-progress
---

# Cross-Feature Decoupling — Design Spec

> **DRIFT WARNING — 2026-08-02.** Verified 2026-08-02. CORRECTION to the 2026-07-25 ledger, which recorded "no ESLint rule": `eslint.config.js:142` DOES enforce the `shared/` -> `features/` boundary. The remaining gap is feature<->feature coupling only. The detector counts 87 topical commits with ZERO on this spec's named files — that is broad-path noise, not progress here.
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state.


**Date:** 2026-05-23
**Status:** In progress; Phase 3 partly implemented, remaining phases need the scoped work described above
**Original design status:** Draft

## Problem

193 cross-feature import statements span 48 feature modules. Files in `src/lib/features/X/` directly import from `src/lib/features/Y/` instead of going through `src/lib/shared/`. This creates a tangled dependency graph where features cannot be loaded, tested, or removed independently.

### Verified violation counts (source -> target)

| Source Feature | Target Feature | Import Count |
|---|---|---|
| themes-lab | lab | 16 |
| lab | poi | 14 |
| themes-lab | background-builder | 10 |
| tika | learn | 9 |
| museum | village | 9 |
| lab | voice-sessions | 8 |
| create | assemble-lab | 8 |
| lab | learn | 7 |
| choreo-card | browse | 7 |
| admin | train | 5 |
| create | library | 5 |
| compose | lab | 5 |
| create | hall-of-shame | 4 |
| compose | create | 4 |
| lab | create | 4 |
| landing | create | 4 |
| library | moderation | 4 |
| loop-labeler | create | 3 |
| choreo-card | loop-labeler | 3 |
| retro | create | 3 |
| assemble-lab | create | 3 |
| create | moderation | 3 |
| lab | landing | 3 |
| skel2tka | train | 3 |

Plus 30 additional edges at 1-2 imports each.

### Most-imported cross-boundary modules

These modules are consumed by 3+ distinct feature modules, making them the strongest promotion candidates:

| Import Path | Consumer Features | Count |
|---|---|---|
| `features/loop-labeler/services/loop-display-resolver` | create, compose, choreo-card, library | 6 |
| `features/browse/.../FilterChipBase.svelte` | choreo-card, retro | 4 |
| `features/moderation/domain/models/content-moderation-models` | create, library, hall-of-shame | 3 |
| `features/create/generate/circular/.../strict-loop-position-maps` | loop-labeler, landing, choreo-card | 3 |
| `features/create/shared/.../SequenceTransformer` | compose (2 files) | 3 |
| `features/library/state/library-state.svelte` | create, lab, poi | 3 |
| `features/choreo-card/services/deck-loader` | learn, lab, sticker-lab | 3 |
| `features/choreo-card/domain/models/Deck` | learn, lab, sticker-lab | 3 |

### Partially migrated state

Some modules already have shared facades but features still import the old location:

- **FilterChipBase**: exists at `src/lib/shared/browse/components/filter-chips/FilterChipBase.svelte` (identical copy) but `choreo-card` and `retro` still import from `features/browse/`.
- **FilterChipRow**: exists only at `features/browse/` — no shared copy yet. Used by `choreo-card`.
- **LoopDisplayResolver**: shared facade at `src/lib/shared/loop-labeler/getLoopDisplayResolver.ts` using registration pattern, but 4 features still import `resolveLoopDisplay` directly from `features/loop-labeler/`.
- **ModalHeader/ModalActions**: shared version at `src/lib/shared/foundation/ui/modal/ModalHeader.svelte` but `compose` still imports from `features/create/generate/components/modals/`.

## Boundary Rule

**Features can import from `shared/` and from themselves, but never from other features.**

The one-way dependency: `features/X/ -> shared/ -> foundation/`. The ESLint config already enforces `shared/ -> features/` is blocked (line 137-155 of `eslint.config.js`). The missing rule is `features/X/ -> features/Y/`.

Exceptions:
- `src/lib/shared/composition-root/` can import anything (already exempted in ESLint).
- Route-level pages (`src/routes/`) can import from any feature (they are composition roots).

## Migration Plan

### Phase 1: Promote high-value shared modules (14 violations eliminated)

These modules are already generic and used across 3+ features. Promotion = move or rewire to `shared/`.

#### 1a. FilterChipRow -> shared (7 violations)

Move `FilterChipRow.svelte` to `src/lib/shared/browse/components/filter-chips/FilterChipRow.svelte`. It has zero feature-specific dependencies (only imports `Snippet` from svelte and `t` from `$lib/shared/i18n`).

Rewire all imports in `choreo-card/` (4 files) from:
```
$lib/features/browse/sequences/filtering/components/inline-filter/FilterChipRow.svelte
```
to:
```
$lib/shared/browse/components/filter-chips/FilterChipRow.svelte
```

#### 1b. FilterChipBase import rewire (5 violations)

`FilterChipBase.svelte` already exists in `shared/`. Rewire `choreo-card/` (3 files) and `retro/` (1 file) to import from `$lib/shared/browse/components/filter-chips/FilterChipBase.svelte`.

#### 1c. GridModeFilterChip -> shared (1 violation)

Move `GridModeFilterChip.svelte` to `src/lib/shared/browse/components/filter-chips/GridModeFilterChip.svelte`. Rewire `choreo-card/filters/DeckListFilterPanel.svelte`.

#### 1d. resolveLoopDisplay rewire (6 violations)

The shared facade `getLoopDisplayResolver.ts` already exists at `src/lib/shared/loop-labeler/`. All 4 consumer features (create, compose, choreo-card, library) should import from the shared getter instead of directly from `features/loop-labeler/services/loop-display-resolver`. The resolver registers itself at bootstrap via `registerLoopDisplayResolver()`.

### Phase 2: Promote domain models and data constants (15 violations eliminated)

#### 2a. ContentModerationModels -> shared (3 violations)

Move `content-moderation-models.ts` types to `src/lib/shared/moderation/domain/models/`. These are pure type definitions with no feature logic: `ContentModerationResult`, `FlaggedTerm`. Consumers: create, library, hall-of-shame.

#### 2b. strict-loop-position-maps -> shared (3 violations)

Move position maps (`VERTICAL_MIRROR_POSITION_MAP`, etc.) to `src/lib/shared/create/domain/constants/`. These are pure data — static `Map` objects mapping position strings. Consumers: loop-labeler, landing, choreo-card.

#### 2c. Deck model + deck-loader -> shared (6 violations)

Move `Deck` type definition to `src/lib/shared/choreo-card/domain/models/Deck.ts`. Create a shared `getDeckLoader` facade (registration pattern, same as loop-display-resolver). Consumers: learn, lab, sticker-lab.

#### 2d. library-state -> shared facade (3 violations)

`libraryState` is a global singleton. Create `src/lib/shared/library/getLibraryState.ts` with a getter facade. Register at bootstrap. Consumers: create, lab, poi.

### Phase 3: ESLint enforcement rule

Add a `no-restricted-imports` rule for feature files:

```javascript
// In eslint.config.js — new block after the shared/ boundary block
{
  files: ["src/lib/features/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["$lib/features/*", "$lib/features/**"],
            message:
              "Features must not import from other features. Extract shared code to shared/ or use the registration pattern.",
          },
        ],
      },
    ],
  },
},
```

This cannot be turned on until Phases 1-2 are complete (or the remaining violations are marked with `// eslint-disable-next-line`). Recommended approach:

1. Add the rule as `"warn"` immediately after Phase 1.
2. Upgrade to `"error"` after Phase 4.

Note: Svelte files are currently in the ESLint `ignores` list (`"**/*.svelte"`). The rule will only catch `.ts` violations until Svelte linting is enabled. This still covers the majority of cross-boundary service/domain imports. Component-level violations in `.svelte` files will be caught by code review until `eslint-plugin-svelte` file coverage is broadened.

### Phase 4: Deep coupling rewires (~160 remaining violations)

These are structurally harder because they involve component-level or tightly-coupled dependencies:

#### Tier A: Parent-child feature pairs (should merge or formalize the relationship)

| Pair | Violations | Recommendation |
|---|---|---|
| themes-lab -> lab (scene-lab) | 16 | `themes-lab` is effectively a sub-feature of `lab`. Merge `themes-lab` into `lab/tabs/themes-lab/`, or extract scene-lab controls to `shared/3d/scene-controls/`. |
| themes-lab -> background-builder | 10 | Same as above. Background builder labs are theme-lab content. Merge or extract shared scene builder components. |
| lab -> poi | 14 | `PovPatternLab` is a lab tab that embeds the entire poi module. Extract poi components to `shared/poi/` or make poi a sub-module of lab. |
| museum -> village | 9 | Village is embedded in museum. Either merge village into museum or extract shared village rendering to `shared/village/`. |
| lab -> voice-sessions | 8 | `VoiceControlLab` embeds voice-sessions components. Same pattern as poi. |

#### Tier B: Service coupling (needs facade/registration pattern)

| Pair | Violations | Approach |
|---|---|---|
| tika -> learn | 9 | Tika depends on learn's quiz history, concept progress, and mastery types. Extract learn's public API types to `shared/learn/domain/` and use a registered facade for services. |
| create -> assemble-lab | 8 | Create's assemble tab is a thin wrapper around assemble-lab components. Either merge assemble-lab into create or extract shared builder components. |
| admin -> train | 5 | Admin manages train challenges. Extract `TrainChallenge` types and `SEED_CHALLENGES` data to `shared/train/`. |
| compose -> create | 4 | Compose uses `SequenceTransformer` and modal primitives from create. Move `SequenceTransformer` to `shared/create/services/` and rewire modal imports to `shared/foundation/ui/modal/`. |
| create -> library | 5 | Save-to-library panel and state. Extract library save service interface and `SaveProgressOverlay` to shared. |
| create -> hall-of-shame + moderation | 7 | All concentrated in `SaveToLibraryPanel.svelte`. Extract moderation gate/appeal components to `shared/moderation/components/`. |

#### Tier C: Circular dependencies (requires careful unwinding)

| Cycle | Violations | |
|---|---|---|
| loop-labeler -> choreo-card -> loop-labeler | 1 + 3 | `loop-display-resolver` imports `sequence-to-entry-converter` from choreo-card, while choreo-card imports `resolveLoopDisplay` from loop-labeler. Fix: move `sequence-to-entry-converter` to `shared/loop-labeler/services/` (it only depends on shared types). |
| create <-> assemble-lab | 8 + 3 | Bidirectional dependency. Merge or extract the shared interface. |

## Execution Order

1. **Phase 1** (1-2 hours, zero risk): Rewire filter chips and loop-display-resolver to existing shared locations. No logic changes, only import paths.
2. **Phase 2** (2-3 hours, low risk): Move pure type/data files to shared. Slightly more files touched but still mechanical.
3. **Phase 3** (30 min): Add ESLint rule as warning.
4. **Phase 4** (spread across future work): Tackle tier A/B/C as part of related feature work. Each sub-task is self-contained.

After Phases 1-2, cross-feature violations drop from 193 to ~164. After Phase 4 Tier A (parent-child merges), another ~57 eliminated. Full cleanup reaches zero violations with the ESLint rule enforcing the boundary going forward.

## Non-Goals

- Svelte component ESLint coverage (separate effort to remove `"**/*.svelte"` from ignores).
- Runtime module isolation (dynamic imports, lazy loading). This spec is about static import hygiene only.
- Changing the feature directory structure beyond what's needed for boundary compliance.
