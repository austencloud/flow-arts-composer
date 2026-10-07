---
status: active
value: 5
effort: XL
remaining: "Deliver source-generation parity in four user-verified phases"
depends_on: ""
plan_path: ""
tags: [create, tunnel, composition]
last_triaged: 2026-10-07
work_state: unverified
---

# Tunnel Creator Design

**Date:** 2026-08-21  
**Status:** Approved  
**Authors:** Austen + Codex

## Outcome

Create gains a dedicated **Tunnel** tab beside Fuse. The first release exposes
two performers, but every domain and persistence boundary supports a cast of
one through eight performers from its first version.

Fuse keeps its current name and responsibility:

```text
one-hand path + one-hand path -> Fuse -> one complete performer
complete performer + complete performer -> Tunnel -> ensemble composition
```

Tunnel authoring never flattens multiple performers into `SequenceData`.
`SequenceData` remains one performer's two-prop choreography. A
`TunnelComposition` owns the cast, relationships, timing, formation, and look.

## Product Contract

### First release

- A large live tunnel preview remains the center of the workspace.
- The performer roster begins with **Lead** and **Performer 2**.
- **Separate** gives Performer 2 an independent complete sequence.
- **Linked** derives Performer 2 from Lead through a transform recipe.
- The shared sequence picker supplies complete hydrated sequences.
- Save produces a Tunnel Composition in the tunnel collection.
- Open in Viewer reproduces the authored cast and all viewer tunnel controls.

### Eight-performer evolution

The UI grows by extending the performer roster, not by changing the artifact:

- A cast contains one through eight authored performers.
- Each performer is independent or derived from another performer.
- Derived relationships may rotate, mirror, flip, invert, rewind, offset, and
  change speed.
- Stable performer IDs preserve selection, ordering, lineage, and future 3D
  assignment.
- Relationship resolution rejects cycles.
- Removing a source performer also removes or reassigns dependants explicitly.

### Authored versus resolved performers

An authored performer is a cast member saved in the composition. A resolved
performer is an on-screen instance after the tunnel formation has been applied.
Renderer budgets apply to the resolved result.

For example, four authored performers mirrored once produce eight resolved
performers. Nothing multiplies outside the budget calculation.

## Canonical Data Model

```ts
interface TunnelComposition {
  version: 1;
  id: string;
  name: string;
  performers: TunnelPerformer[]; // 1..8
  formation: TunnelConfig;
  createdAt: number;
  updatedAt: number;
}

interface TunnelPerformer {
  id: string;
  label: string;
  source: IndependentTunnelSource | DerivedTunnelSource;
  timing: {
    stepOffset: number;
    speed: number;
  };
}
```

Independent sources retain a complete `SequenceData` during the live session
and a JSON-safe sequence snapshot at persistence boundaries. Derived sources
retain the source performer ID and an ordered `CopyOp[]` transform stack. The
existing tunnel transform vocabulary remains canonical.

The composition loop is the least common multiple of independent source step
counts and the denominators implied by performer speed. A safety ceiling must
produce a visible authoring error, never truncation or a hidden fallback.

## Capability Ownership

### Discovery evidence

Search vocabulary: `tunnel`, `performer`, `duet`, `layer`, `primarySequence`,
`secondarySequence`, `SequencePickerModal`, `Separate`, `Linked`, `transformStack`.

Closest implementations:

- `shared/sequence-viewer/tunnel/tunnel-view-controller.svelte.ts` owns the live
  tunnel view, spatial copy generation, timing modulators, selection, and
  performance budget.
- `shared/sequence-viewer/tunnel/tunnel-config.ts` owns the closed transform and
  formation vocabulary.
- `features/compose/.../compose-types.ts` contains a multi-sequence layer model.
- `features/compose/.../TunnelRenderer.svelte` contains an older dual-sequence
  renderer.
- `shared/3d/domain/duet-sequence.ts` contains a 3D-only two-sequence reference.
- `features/fuse` owns one-hand path fusion and its Separate/Linked presentation.
- `shared/components/sequence-picker/SequencePickerModal.svelte` owns complete
  sequence selection and hydration.

### Ownership decisions

- **Extend** the shared tunnel controller and layer builder to resolve an
  authored cast instead of copies of one sequence only.
- **Reuse** `TunnelConfig`, `CopyOp`, canonical sequence transforms, the shared
  sequence picker, `SegmentedControl`, and existing panel button primitives.
- **Compose** those owners in the new Create Tunnel presentation.
- **Create** `TunnelComposition` as the canonical ensemble artifact. Existing
  models differ because Compose owns arbitrary media cells and 3D Duet owns
  avatar staging, while Tunnel Composition owns a resolved tunnel cast.
- **Keep separate** Fuse's one-hand path state. Its output is a normal
  `SequenceData`; Tunnel's output is an ensemble artifact.

No new top-level application module is created. Tunnel Creator is a lazy Create
subfeature registered through the existing Create tab router.

## Rendering

The controller resolves every authored performer into a concrete sequence:

1. Resolve independent sources.
2. Resolve derived sources in topological order.
3. Apply ordered `CopyOp` transforms through canonical sequence transforms.
4. Sample each performer with its own offset and speed.
5. Apply the global tunnel formation without exceeding the resolved-performer
   ceiling.

The first authored performer remains the base pair passed to `AnimatorCanvas`.
Every remaining resolved performer uses the existing `additionalLayers` path.
This preserves trails, effects, export, selection, and prop rendering.

Current one-source tunnels migrate to one independent performer plus derived
performers generated by their saved `TunnelConfig`.

## Persistence

`CollectedTunnel` gains an optional `composition` field and advances its local
schema version. Existing fields remain readable for version-one entries.

- New saves persist both the ensemble composition and the existing poster/look
  snapshot.
- Legacy entries reconstruct a one-source composition from their stored steps.
- Reopening passes the composition into the viewer explicitly.
- Source sequence IDs and embedded steps both survive, so reopening does not
  depend on a library record still existing.

## Create Workspace

The feature follows the factory plus context pattern:

```text
TunnelTab.svelte
  -> createTunnelCreatorState(...dependencies)
  -> setTunnelCreatorContext({ state })
  -> TunnelLayout and descendants consume context
```

The initial two-performer surface uses an expandable roster. It must not encode
the cast as left/right component props. Performer cards remain at least 44 px
interactive, use component-scoped theme variables, and recompose at laptop,
tablet, short-landscape, phone, and all three 4K tiers.

### Workspace ownership correction (2026-09-04)

Tunnel is not a Generate recipe. Its workspace must not present performer
sources, cast structure, stage formation, and playback as one row of peer
setting cards. Each control stays beside the artifact region it changes:

- The page header owns the current tunnel's identity and the saved **Tunnels**
  library entrance.
- The choreography roster owns the Separate / Linked sequence decision and
  direct add, remove, select, and reorder actions.
- A performer card owns Generate, generation recipe, Browse, Shape Matrix,
  Previous, and relationship editing for that performer.
- The preview owns formation, look, effects, timing, playback, and its single
  **Stage settings** entrance.
- Composition cycle length is status, not a setting. It appears once with the
  preview as an N-step loop.

The same ownership remains visible at every breakpoint. Responsive layouts may
compact labels, focus one performer card, or move an existing inspector into a
drawer, but they may not make a second settings entrance or hide a capability
because an arbitrary width was crossed.

### Responsive clarity correction (2026-09-04)

Tunnel keeps one capability hierarchy across every measured Create slot. Screen
size changes arrangement, never the number or meaning of visible controls:

- The roster shows one selected performer at a time at every width. P1, P2, and
  later performer tabs switch the card in place without expanding the page.
- Every performer card exposes the same primary **Generate** action and one
  labelled **More** menu. Recipe, Browse, Shape Matrix, Previous, relationship,
  reorder, and removal actions live in that menu when available; wide screens
  do not promote them into a second toolbar.
- The four measured workspace modes are stack, portrait, short landscape, and
  split. Portrait stacks a full-width choreography workspace above the stage;
  short landscape keeps both artifacts side by side; split gives the stage the
  remaining width after a capped choreography rail.
- Stage, pairing, and generation inspectors appear inline only when the split
  workspace has enough width and height. The same panels use the canonical
  Create drawer everywhere else.
- Responsive transitions preserve the selected performer, source sequences,
  Previous history, open task, and animation time. A breakpoint may not swap in
  a reduced feature set or create a second control inventory.

## Migration and Compatibility

- Viewer-created single-source tunnels continue to work unchanged.
- The old Compose tunnel renderer remains until its consumers are migrated;
  new behavior does not import from it.
- 3D Duet remains a separate adapter until the 3D workflow adopts the ensemble
  contract.
- No saved tunnel silently changes performer count or timing.

## Risks

1. **Relationship cycles:** validate before resolution and report the exact
   performer chain.
2. **Timing explosion:** compute and expose the composition cycle before
   playback; reject cycles beyond the supported ceiling.
3. **Render cost:** clamp on resolved performers and preserve the reduced-motion
   budget.
4. **Persistence drift:** test legacy migration and new round trips.
5. **Concurrent work:** preserve the in-flight Create shell, Fuse, Tunnel
   collection, and ArtPane changes already present in the shared checkout.

## Verification

Silent-behavior tests cover:

- one through eight performer validation;
- independent and derived resolution;
- transform order;
- relationship-cycle rejection;
- least-common-multiple timing;
- resolved-performer budgets;
- legacy collection migration;
- new composition serialization and reopening;
- export-layer sampling at offsets and speed boundaries.

Runtime verification covers:

- two independent performers;
- one linked pair using every relationship control;
- save, close, reopen, and video export;
- an eight-performer mixed cast created through the domain API;
- no console errors or visible loop seam.

Visual verification covers 1920x1080, 2560x1440, 3840x2160, 1440x900,
820x1180, 960x412, and 375x667.

## Source-Generation Parity

Tunnel must let each independent performer acquire a complete two-prop
sequence through the same routes available elsewhere in Create. The Generate
feature remains the behavior owner for generation recipes and execution;
Tunnel hosts it against a performer-scoped sequence state and adopts the
result as that performer's independent source.

This work ships behind four manual acceptance gates. No later phase begins
until Austen has exercised the current phase in the running app.

### Phase 1: Generate a performer

- Replace the creator's hard-coded lead/partner storage with an ordered,
  stable-ID performer collection while retaining the two-performer surface.
- An independent performer may choose an existing sequence or open the full
  Generate recipe. The hosted recipe includes the same level, length, grid,
  turns, continuity, LOOP, style, rhythm, start/end, word, and saved-setup
  capabilities as Generate.
- A generated result is adopted by the selected performer without changing the
  Generate tab's own workbench sequence.
- Generated and picked replacements retain a bounded Previous history per
  performer. Generate/Regenerate and Previous are performer actions, not global
  tunnel actions.
- Active sequences and Previous history survive HMR through the Tunnel draft.
- Linked mode regenerates Performer 2 from Performer 1 after Performer 1 changes.

Acceptance: generate Performer 1 from a visibly changed recipe, generate or
pick Performer 2, restore Previous, switch Linked/Separate, and reload without
losing the active sources.

### Phase 2: Shape Matrix and source tools

- Add a full two-hand Shape Matrix route. The whole matrix is visible; the user
  chooses the matrix result and hand-path mode, making the resulting two-hand
  shape equation explicit before generation.
- Reuse the interactive Shape Matrix capability and canonical transforms.
- Add Build, Adjust, Inspect, and Save routes with the same source-provenance
  treatment as Generate and Fuse.
- Keep both the selected performer's Choreo Card and the tunnel animation in
  view while a source editor is open on a large display.

Acceptance: create a sequence from an exact Shape Matrix choice, adjust it,
inspect it, save it, and confirm both visual previews update together.

### Phase 3: One through eight performers

- Expose roster add/remove/reorder up to eight authored performers.
- Every non-root performer can be independent or derived from any earlier
  performer. Relationships are stored by stable performer ID and reject cycles.
- Generation, picker, Shape Matrix, Build, Adjust, Inspect, Save, Previous, and
  Regenerate target the selected performer rather than numbered component code.

Acceptance: author a mixed eight-person cast, including independent and linked
sources, reorder it, reload it, and verify relationship lineage remains intact.

#### Roster and hand-color contract

- The source rail renders one choreography card for every authored performer.
  It never creates cards for formation-generated instances. A legacy formation
  copy may remain visible only when it is explicitly labelled as not authored.
- All cards remain present from one through eight performers. One selected card
  expands to the complete source workbench while the other cards stay compact;
  the roster scrolls independently instead of shrinking eight full editors into
  the available height.
- Performer source mode belongs to the performer card, not to a global two-person
  switch. The first performer is independent. Every later performer is either
  independent or follows an earlier stable performer ID with its own ordered
  transform recipe and timing.
- Reordering preserves stable IDs and may not place a derived performer before
  its source. Removing a source with dependants is blocked until those
  relationships are reassigned or removed explicitly.
- The live summary reports authored performers separately from rendered
  instances. Selecting a card spotlights every rendered instance driven by that
  authored performer; generated copies never gain authored identity.
- New creator sessions use the canonical pictograph hand palette: blue is Left
  and red is Right. Cards and the preview show both a color swatch and the words
  `Left` / `Right`, so hand identity never relies on color alone.
- Existing saved spectrum choices remain exact on reopen because color mode is
  performed presentation state. Spectrum is labelled as instance coloring and
  offers an explicit return to pictograph hand colors; it is never silently
  migrated.

### Phase 4: Result and recovery parity

- Bring result actions, playback state, errors/retry, save/share/open-viewer,
  mobile recomposition, and full draft recovery to parity with Fuse and the
  sequence viewer.
- Persist global playback/formation/look state alongside every performer source
  and recipe reference.
- Validate the final responsive matrix and every legacy draft migration.

Acceptance: finish, save, reopen, share, and view a tunnel at every required
viewport with no obscured animation, lost recipe, stale card, or console error.

#### Tunnel discovery inside the creator

- The Tunnel workspace header exposes **Tunnels** without making Browse a
  required detour. Its Mine source opens saved work; its Explore source lists
  the current public Tunnel artifact index. Browse remains the management
  destination for rename, publication, connected footage, and deletion.
- This library reads the existing tunnel collection singleton. It does not own
  another cache, query, migration, or saved-artifact shape.
- Explore reads public envelopes first, then hydrates their exact immutable
  current revisions through a bounded worker pool. Choosing public work opens
  the existing Browse public-detail route; it does not silently fork the work,
  discard creator attribution, or make public choreography look locally
  authored.
- Choosing a card replaces the complete editor document. It never inserts a
  tunnel into one performer card or conflates artifact selection with the
  sequence and Shape Matrix source pickers.
- Browse and the in-tab library resolve a collection entry through the same
  migration and truthful legacy-reconstruction function. Loading preserves the
  saved artifact ID as the edit/save target and does not mint a revision.
- A keyed editor session owns one artifact's composition, presentation stores,
  draft, and save target. Switching artifacts remounts that session so effects,
  props, playback, and identity cannot leak across tunnels.
- A successful viewer save acknowledges the exact saved target, composition,
  and presentation back to that session. This makes the first save the edit
  target and advances the dirty baseline without matching by name or time.
- Replacing a workspace with uncommitted content requires an explicit warning.
  Empty or unchanged sessions open immediately; selecting the already-active
  tunnel simply closes the library.
- Each card's prop names, recipe origin/modified state, formation transforms,
  authored count, rendered-instance count, effect, and BPM are derived from the
  canonical artifact. Search covers those facts and sorting supports recency,
  name, authored performers, and rendered instances; none of this metadata is
  denormalized into a second persistence contract.
- An old or unknown poster is automatically rebuilt with the canonical
  complete-figure renderer while its current image remains visible. Backfills
  are serialized, deduplicated per artifact revision, and recheck the revision
  before writing. They use the presentation-only update path, so refreshing a
  poster never changes choreography, mints a revision, or mutates dedupe
  identity. Only the active rebuild reports progress; failures preserve the old
  image and offer an explicit retry instead of putting a permanent uncertainty
  warning on every card.
- The library offers New tunnel and a button-styled Manage in Browse exit
  without embedding the full collection management interface in Create.
