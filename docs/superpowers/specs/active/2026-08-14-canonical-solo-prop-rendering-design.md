---
status: active
value: null
effort: null
remaining: "Verify solo arrow placement for invisible and absent partners, and one-hand staff beta offset, against canonical prop code."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Canonical Solo-Prop Rendering

## Status

Approved for implementation on 2026-08-14.

## Problem

Fuse generates one-hand paths as `SoloPropData`, but two boundaries can make a source behave like half of a paired sequence again:

1. Injected, restored, and imported paths are length-matched by copying the combined preview steps back into the source sequence.
2. Pictograph preparation treats invisible placeholder motions as real relationship partners when deriving beta offsets and arrow placement keys.

This produces misleading source cards: props retain a beta offset even though only one prop exists, and some static or antispin arrows fall through to the unadjusted `(0, 0)` placement.

## Invariants

- A Fuse source is a genuine one-hand sequence from generation through save, restore, transform, and display.
- Its `steps` contain one visible motion and one invisible structural placeholder because `StepData` still requires both color keys.
- Its canonical compositional data contains only the selected side's `SoloPropData`; paired step data is reserved for the combined preview.
- A motion with `isVisible: false` never participates in alpha/beta/gamma classification, beta collision offsets, arrow placement keys, or prop relationship geometry.
- `visibleHand` is a preparation input, not only a final SVG filter. Masking one hand from a paired pictograph must prepare the remaining prop and arrow as a solo path.
- The combined Fuse preview remains genuinely paired and keeps its paired geometry.

## Design

### Source projection

The existing `soloPropToSequence` adapter remains the single owner of solo-to-sequence conversion. Length matching selects the appropriate tiled `SoloPropData` from the fused preview, projects it through that adapter, then reapplies only source identity and descriptive metadata. It does not copy combined steps or opposite-side compositional fields.

The symmetry follower card uses the same projection before rendering. The animator continues to receive the combined symmetry preview.

### Presence-aware pictograph preparation

`PictographContainer` folds `visibleHand` into the blue/red preparation flags and includes those flags in its preparation key.

`PictographPreparer` builds a non-mutating presentation projection in which motions hidden by those flags are marked invisible. Arrow and prop placement run against that projection. The returned pictograph keeps its original domain data; only `_prepared` geometry reflects the requested presentation.

Arrow layer detection and beta detection both use `isVisibleMotion`. A structural placeholder therefore behaves exactly like an absent partner.

## Verification

- Unit tests prove invisible placeholders and absent partners resolve the same solo arrow placement key.
- Unit tests prove a one-hand or explicitly masked staff receives no beta offset, while a genuine two-hand beta pictograph still does.
- Fuse state tests prove injected paths remain one-hand after length matching.
- Focused TypeScript/Svelte checks cover changed files.
- Visual verification covers desktop, 4K, tablet, and phone Fuse layouts and checks source-card prop/arrow placement without changing the combined preview.
