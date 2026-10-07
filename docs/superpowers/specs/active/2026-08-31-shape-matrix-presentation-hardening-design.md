---
status: active
value: null
effort: null
work_state: verification
remaining: Presentation code exists; capture shape-matrix geometry at required viewports and verify performance and motion acceptance.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Shape Matrix Presentation Hardening

**Queue evidence, 2026-10-07:** Shape Matrix presentation components and services exist, but the required geometry and performance browser proof is not recorded here. Keep this in verification until those checks are captured.

**Date:** 2026-08-31  
**Status:** Implemented presentation work; geometry and performance verification pending
**Branch:** `codex/shape-matrix-presentation-hardening`

## Objective

Raise the full Shape Matrix experience from the adversarial audit's B grade to a release-ready standard, with special attention to large-display clarity, compact-view focus continuity, recoverable animation loading, frame pacing, and consistent use of the shared design and motion systems.

The mandala geometry and SVG rendering are already resolution-independent and visually crisp at a native 3840 × 2160 viewport. This work therefore targets the presentation system around those drawings rather than replacing the shape renderer.

## Audit Findings in Scope

1. Remove the rotation-style module's seven double type assertions.
2. Expose selected matrix cells to assistive technology.
3. Increase the prop relationship controls to the 44px interaction minimum.
4. Preserve focus when compact mode moves from the matrix to the detail pane.
5. Make view-toggle accessible names match their visible labels.
6. Make relationship-chip accessible names follow the visible word order.
7. Raise meaningful action, retry, and status text to the project typography minimums.
8. Add visible, retryable failure states for lazily loaded animation and pictograph content.
9. Replace feature-local presentation colors with existing semantic/theme tokens where the audit found duplication.
10. Route the overflow menu through the canonical motion timing/easing system.
11. Restore an obvious overflow affordance when Level 4 turn options exceed the 1440px control width.
12. Remove the 18px application-chrome backdrop blur.
13. Reduce warm matrix-cell switch work so the transition remains responsive and does not visibly stall.

## Capability Ownership

No parallel framework or replacement renderer will be introduced.

- `createShapeMatrixAppState()` continues to own selection and compact-view state.
- `ShapeMatrixAppShell` continues to own the responsive matrix/detail composition and its focus handoff.
- `PanelGroup` continues to own structural panel movement.
- `DualSourceCrossfade` continues to own overlap, settlement, reduced-motion behavior, and outgoing-content retirement during drill changes.
- `LazyMount` continues to own dynamic-import loading, error capture, and retry. The drill supplies feature-specific placeholder and error snippets through that existing interface.
- Existing segmented-control components continue to own difficulty, notation, scope, turn, and detail-view selection.
- Existing global theme, semantic, motion, typography, and themed-scrollbar tokens remain the style source of truth.
- `ShapeMatrixGrid` remains the sole owner of matrix-cell selection semantics and visual selection state.

## Behavioral Requirements

### Matrix and compact navigation

- A selected matrix cell exposes a programmatic selected state without changing its existing button interaction.
- In compact mode, activating a matrix cell moves focus into the revealed detail pane after the structural transition begins, never to `body` or hidden content.
- Returning to the matrix restores focus to the selected cell when it still exists.
- Focus movement is scoped to explicit compact-view navigation; desktop selection must not steal focus.

### Controls and overflow

- Repeated relationship controls meet the 44px minimum target without destabilizing the grid.
- Accessible names use the same words and order as the visible control content.
- The Level 4 turn chooser provides a visible horizontal-overflow affordance at 1440px and remains operable by keyboard and touch.

### Loading and failure recovery

- Animation-player and pictograph-rail imports retain footprint-preserving placeholders.
- Import failures produce visible status text and a clear retry action in the affected region.
- Retrying uses `LazyMount`'s existing recovery path; no duplicate loader or error-boundary abstraction is added.

### Animation and frame pacing

- `DualSourceCrossfade` remains the only settlement authority. The drill must not keep a competing timer-based retirement path.
- A cell switch keeps the current realization visible until the incoming one is ready.
- Work that does not affect the selected frame is deferred or broken out of the critical interaction path.
- Warm repeated cell switches should avoid main-thread long tasks over 50ms and should not produce visible gaps.
- Reduced motion collapses presentation transitions to their accessible final state.

### Visual system

- Application chrome uses existing theme/semantic tokens and avoids content-obscuring blur.
- Menu motion uses the canonical duration/easing values.
- Essential actions and failure text are at least 14px; metadata is at least 12px.
- This pass does not alter domain geometry, turn semantics, letter data, or realization correctness.

## Implementation Scope

Primary files:

- `src/lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte.ts`
- `src/lib/shared/shape-matrix/app/components/ShapeMatrixAppShell.svelte`
- `src/lib/shared/shape-matrix/app/components/ShapeMatrixDetailPane.svelte`
- `src/lib/shared/shape-matrix/app/components/ShapeMatrixOverflowMenu.svelte`
- `src/lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte`
- `src/lib/shared/shape-matrix/components/PropRelationshipChipRow.svelte`
- `src/lib/shared/shape-matrix/components/RelationshipChoiceChip.svelte`
- `src/lib/shared/shape-matrix/components/ShapeMatrixDrill.svelte`
- `src/lib/shared/shape-matrix/domain/rotation-style.ts`

Focused tests may be added alongside existing Shape Matrix state/component/domain tests when they protect silent state, focus, recovery, or type-mapping behavior. Unrelated style cleanup and domain changes are out of scope.

## Risks and Controls

- **Focus races with panel motion:** schedule focus after Svelte state flush and target only an element in the newly active, non-inert pane.
- **Animation regression:** preserve the existing crossfade primitive and validate the transition midpoint, settlement, and reduced-motion final state.
- **Performance work changes output:** keep realization generation and cache keys intact; move only non-critical scheduling and redundant settlement work.
- **4K fixes harm compact layouts:** verify every required viewport rather than optimizing from the supplied 4K screenshot alone.
- **Shared-work collision:** edits stay inside the task worktree and commits use explicit pathspecs.

## Verification Contract

Before delivery:

1. Run focused unit/component tests for every silent state or mapping change.
2. Run scoped format/lint/type diagnostics during iteration, then the repository's full pre-commit verification once.
3. Verify the exact Shape Matrix route at 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160.
4. Capture the default matrix, a mid-transition cell switch, compact matrix-to-detail navigation, and Level 4 controls at 1440px.
5. Confirm selected-state accessibility, focus destination, 44px targets, visible overflow affordance, lazy-load retry UI, and reduced-motion behavior.
6. Re-run the warm cell-switch frame-pacing measurement, record animation continuity, inspect console output, and run Lighthouse accessibility/best-practices checks.
7. Run a fresh adversarial audit on the completed implementation and record the result.
