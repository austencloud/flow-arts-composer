---
status: active
value: null
effort: null
work_state: unverified
remaining: Verify ratio reduction, Farey-9 catalog, closure, animation seams, and Shape Matrix integration.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Rational Ratio Theory Atlas

**Status:** Approved for implementation  
**Date:** 2026-09-02  
**Surface:** `/notation/shape-matrix`

## Outcome

Add a clearly separated Theory mode to Shape Matrix that can calculate and
animate every reduced prop-to-hand rotation ratio from `0:1` through `1:1`
whose hand-cycle denominator is at most 9, plus the stationary-hand endpoint
`1:0`.

The existing Level 4 matrix remains the canonical TKA surface. Theory mode is a
continuous-geometry atlas. It must not manufacture TKA letters, pictographs, or
orientation claims for ratios that the eight-point Kinetic Alphabet cannot
represent exactly.

## Domain Model

`SpinRatio` is the exact owner of a prop-to-hand rotation ratio:

```ts
interface SpinRatio {
  propRotations: number;
  handCycles: number;
}
```

Both fields are non-negative safe integers and cannot both be zero. Ratios are
always stored in reduced form. The static endpoint `1:0` is valid and is not
converted to a finite TKA turn value.

For a ratio `P:Q` with positive `P` and `Q`, the diagnostic TKA-equivalent turn
value is:

```text
(P / Q - 1) / 2 = (P - Q) / (2Q)
```

This conversion describes rotational rate relative to the current TKA
baseline. It does not imply that a TKA letter exists at that value. `0:1`
preserves the TKA concept Float rather than exposing algebraic `-0.5`, and
`1:0` has no finite TKA turn equivalent.

## Atlas Catalog

The bounded catalog is generated rather than hand-authored:

- generate the Farey sequence of order 9 from `0/1` through `1/1`;
- express each fraction as `propRotations:handCycles`;
- append `1:0` as the stationary-hand endpoint.

The result contains 30 unique states: 29 finite ratios and one static endpoint.
The current `0:1`, `1:2`, and `1:1` states therefore appear in the theory atlas
without being duplicated in domain code.

## Animation Model

The animator consumes the exact ratio integers. For normalized cycle progress
`u` from 0 through 1:

```text
hand angle = hand phase + 2π × Q × u
prop angle = prop phase ± 2π × P × u
```

`Q` is zero only for `1:0`, which leaves the hand stationary while the prop
rotates once. Finite ratios close exactly after `Q` hand cycles. This model
extends the existing QFT geometry owner instead of routing theoretical ratios
through the TKA sequence and mandala realization pipeline.

For two independently selected ratios played at a shared hand tempo, the joint
closure is the least common multiple of their non-zero denominators. The domain
owner exposes this calculation now; the first UI release animates one ratio at
a time so the atlas stays legible.

## Shape Matrix Integration

The route gains one exactly-one mode control:

- **Level 4** preserves the current Shape Matrix, URL behavior, turn selectors,
  drill, flower rendering, and TKA semantics.
- **Theory** replaces the matrix body with the rational atlas while keeping the
  route header and prop context.

The mode swap uses the shared `DualSourceCrossfade` owner because the workspace
is fixed-height and the existing matrix is a heavy, stateful surface that must
stay mounted. The atlas is a responsive grid of ratio buttons. Selecting a
ratio updates one large continuous-geometry stage and its exact facts. Ratio
controls use the existing single-select primitive or an existing selection-list
primitive; no local chip system is introduced.

Theory mode URL state uses `theory=1` and `ratio=P:Q`. Existing URLs without
those parameters remain Level 4 URLs. Invalid or out-of-range ratio values fall
back to `1:3` without affecting the rest of the query string.

## Presentation Rules

- Ratio notation is always `P:Q`, including `0:1`, `1:2`, and `1:0`.
- The stage is the visual focus; controls are quiet and theme-aware.
- The selected state is communicated by a full surface treatment and
  `aria-pressed`, not color alone.
- Changing the selected ratio crossfades the stage content without shifting
  surrounding controls.
- Numeric values use tabular numerals.
- Essential labels remain at least 14px and supplemental metadata at least 12px.
- Wide screens add useful atlas columns and stage room; they do not magnify
  ordinary controls. Mobile retains the complete catalog.

## Ownership and Files

- `packages/vtg-domain/src/reference/spin-ratio.ts`: exact ratio arithmetic,
  catalog generation, conversion, closure, and petal counts.
- `src/lib/shared/notation/qft/qft-model.ts`: exact rational pose and trace
  geometry, sharing the existing QFT coordinate primitives.
- `src/lib/shared/shape-matrix/`: Theory mode state and presentation.
- focused unit tests under `tests/unit/` and existing Shape Matrix/QFT suites.

## Risks and Guards

1. **Float drift:** never use a decimal as the ratio source of truth; derive
   decimal diagnostics only at display boundaries.
2. **False TKA authority:** theory ratios never enter letter lookup,
   `SequenceData`, or mandala realization.
3. **Static ambiguity:** `1:0` is rendered through its zero hand winding, not by
   inventing an infinite turn value.
4. **Long closure cycles:** traces sample exact integer windings with a density
   derived from total windings, capped by the bounded denominator-9 catalog.
5. **Level 4 regression:** Level 4 remains the default and its query contract is
   unchanged.

## Verification

- Unit tests prove reduction, Farey-9 ordering/count, `1:0`, conversion,
  closure, joint closure, petal counts, and exact animation seams.
- Existing Shape Matrix and QFT focused suites remain green.
- Svelte/TypeScript checks are filtered to touched paths after one captured run.
- Visual verification covers the route in both modes at 375×667, 960×412,
  820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160, including one real
  mode transition and one ratio-selection transition.
