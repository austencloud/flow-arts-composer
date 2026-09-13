---
status: active
value: 2
effort: XS
remaining: "The workspace shipped in 3519cd6b2 - do NOT rebuild it. Two acceptance clauses are unresolved and need a product decision, not code first: (1) 'Every editable source exposes these actions without an overflow-menu step' - 57e911b78 moved five source actions behind a More menu and fuse-actions-contract.test.ts:68 now asserts that shape; decide whether the overflow is wanted and amend the clause, or treat the test as encoding a regression and change both. (2) 'Until Apply Relationship is selected, the current result remains unchanged' - FuseRelationshipComposer.svelte:52-61 previews every draft onto the combined canvas; only the persisted relationship is untouched. No spec, plan or handoff records a decision to change either; 57e911b78 has an empty commit body and touches no docs. Also unrecorded: the seven-viewport sweep of the workspace."
depends_on: ""
plan_path: ""
tags: [fuse, workspace, unresolved-acceptance, needs-product-decision]
last_triaged: 2026-09-13
---

# Fuse 4K Workspace Redesign

**Status:** Implemented, with two acceptance clauses UNRESOLVED. Stays in
`active/` — see the open items at the end of this header. Corrected 2026-09-13
during spec reconciliation.

**Reconciliation evidence (2026-09-13):** `3519cd6b2` (_feat(fuse): build a 4K
one-hand LOOP workspace_) landed the workspace, the relationship composer, the
solo-loop generator and the tests; `57e911b78` and `33ab2c0d2` reshaped it
afterwards. Verified present: the canonical shared transform actions behind
`Adjust path` with no parallel implementation, First Beat as the only action that
expands into the larger chooser, atomic symmetry application at the state layer,
the 1,400 CSS px wide-tier cap (`FuseLayout.svelte:74`), the pointer +
double-click + keyboard resize seam, and live SVG transform motion rather than a
raster crossfade. `fuse-actions-contract.test.ts` (6) and
`fuse-workspace-split.test.ts` (16) pass.

**UNRESOLVED acceptance items (2026-09-13).** Two clauses of this approved
design are not met by the shipped code, and **no accepted supersession for
either could be found**: `57e911b78` (_feat(fuse): clarify responsive workspace
hierarchy_, 2026-09-03) has an empty commit body and touches no documentation at
all — no spec, no plan, no handoff records a decision to change them. Until
someone who owns the product call says otherwise, these are open, not closed.

1. _"Every editable source exposes these actions without an overflow-menu
   step."_ This held at `3519cd6b2`: `git show 3519cd6b2:…/FuseSourceCard.svelte`
   has visible `Save LOOP` / `Saved LOOP` / `Shape path` buttons. `57e911b78`
   moved Choose saved LOOP, Choose a shape, Build a custom path, View Choreo
   Card and Save to library behind a `More` overflow menu
   (`FuseSourceCard.svelte:344-374,596-606`).

   `fuse-actions-contract.test.ts:68` ("gives desktop sources one primary action
   and discloses rare actions") now asserts the overflow shape. **A test records
   what the implementation does; it is not evidence that the product decision
   was accepted.** If the overflow menu is the wanted behaviour, amend this
   clause and say so here; if not, the test encodes a regression and both need
   changing together. Either way it needs a decision, not a silent close.

2. _"Until Apply Relationship is selected, the current Independent or Symmetry
   result remains unchanged."_ `FuseRelationshipComposer.svelte:52-61` calls
   `previewRelationship` on every draft change, which publishes onto the
   combined canvas (`fuse-state.svelte.ts:1903`). Only the **persisted**
   relationship is untouched, and `cancelRelationshipPreview` restores the
   baseline from `relationshipPreviewBaseline`. That is a defensible design, but
   it is not what this clause says, and nothing records the change of mind.

**Lower-confidence drift in the same area, listed so it is discoverable rather
than as a work item:** the commit control reads "Use this relationship" not
"Apply Relationship"; modes are presented as Separate/Linked rather than
Independent/Symmetry; the result footer reads "Share"; there is no "Edit
Relationship" string. `OptionChipRow` is named as the owner of transformation
selection but Fuse never adopted it — `FuseTransformPicker.svelte` composes
`SegmentedControl` + `FilterChipBase` + `FuseRotationDial` instead. These read
as ordinary naming evolution; confirm with the owner before treating any of them
as a defect.

**Approved:** 2026-08-12  
**Route:** `/create/fuse`

## Outcome

Fuse must read as one causal workspace at every desktop scale:

1. Blue and Red each provide one closed single-hand LOOP.
2. Independent mode lets either source change without changing the other.
3. Symmetry mode chooses one driver and derives the other source through one
   explicit transformation relationship.
4. The combined preview is the result, not a third unrelated panel.

The 4K tier recomposes the workspace. It does not stretch laptop controls to
fill the extra width.

## Interaction contract

### Source controls

Every editable source exposes these actions without an overflow-menu step:

- Previous
- Regenerate
- Save LOOP
- Saved LOOP
- Shape path
- Adjust path

`Adjust path` opens the canonical shared sequence transformation actions for
Mirror, Flip, Invert, 90-degree rotation, First Beat, and Reset in a compact
popover anchored to the source card. Only First Beat expands into the larger
right-side chooser.

Transforms update persistent SVG pictographs in place. Arrows and props travel
to their new geometry through the canonical CSS transitions; the notation grid
does not crossfade raster cells.

Regenerate creates a fresh one-hand LOOP. Save LOOP persists the current source
as a reusable solo-prop artifact, and Saved LOOP retrieves those artifacts.

### Result actions

The result footer is one aligned action cluster:

- Share result opens the canonical sequence viewer with its Share sheet open.
- Save result persists the combined sequence to the library.
- Open viewer opens the full combined sequence viewer.

Share is the visual primary. No result action floats alone under the canvas.

### Shape paths and prop geometry

The VTG path picker uses the selected side's current prop geometry. A staff-like
two-ended prop previews both traced ends; a club-like one-ended prop previews
one tip. The picker tile and the selected source mandala therefore show the
same path family.

### Independent mode

Both paths remain editable. The relationship summary says that each source can
be changed separately.

### Symmetry mode

Entering Symmetry opens a relationship composer before changing the result.
The composer asks for:

1. the driver source;
2. the transformation used to generate the follower.

The relationship is applied atomically. Until Apply Relationship is selected,
the current Independent or Symmetry result remains unchanged. After applying,
the controls collapse to an equation such as `Blue path → Mirror → Red path`
with an Edit Relationship action. The follower card is read-only and explains
which path generates it.

### Resize seam

The desktop source/result seam supports pointer dragging, double-click reset,
and keyboard resizing with Arrow keys, Home, and End. At the widest tier the
source workbench is capped so the combined result receives the additional 4K
space.

## Responsive composition

- **Below 600px:** keep the existing compact source pair and settings drawer.
- **600px to desktop:** keep the current stacked/tablet arrangements.
- **Desktop:** stacked source cards beside the combined result.
- **Wide desktop:** source workbench capped at 1,400 CSS px; typography and
  targets step up; the preview frame becomes a centered square inside the
  remaining result pane.

Mode controls size to their content and never span the workspace. Source action
buttons wrap at bounded widths instead of absorbing a flexible track.

## Capability ownership

- `fuse-state.svelte.ts` owns source generation and atomic relationship
  application.
- `SegmentedControl` owns mode and driver selection.
- `OptionChipRow` owns transformation selection.
- `SequenceTransformActions` owns individual source transformations.
- `PictographContainer`, `ArrowSvg`, and `PropSvg` own live pictograph motion.
- `Popover` owns the immediate action palette. `CreatePanelDrawer` is reserved
  for First Beat's larger spatial chooser.
- `LibrarySaveService` and `SoloPropSaveOrchestrator` own combined and one-hand
  persistence.
- `SequenceViewerShell` owns sharing; Fuse enters it with a share-on-open intent.
- `SequenceMandala` and the prop-tip registry own prop-aware path geometry.

No parallel transformation or selector implementation is introduced.

## Verification

Functional:

- Relationship draft does not mutate the applied result.
- Applying a relationship commits mode, driver, and transform together.
- Independent mode restores the original two-source result.
- Pointer and keyboard seam changes preserve the canvas floor.

Visual:

- 1920 × 1080
- 2560 × 1440
- 3840 × 2160
- 1440 × 900
- 820 × 1180
- 960 × 412
- 375 × 667

Verify Independent, relationship composer, applied Symmetry summary, source
actions, anchored transformation palette, live transform motion, First Beat
drawer, result actions, prop-aware VTG tiles, 8 steps, and 32 steps.
