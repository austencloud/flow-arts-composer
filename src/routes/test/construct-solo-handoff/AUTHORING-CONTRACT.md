# Single-hand authoring review

This route is a functional, in-memory UX test. It does not replace Construct or
write to its saved workspace. The existing eight-step blue fixture demonstrates
the Choreo Card entry; New solo builds either hand from an empty start.

## Ownership

Searched: solo continuation, turn palettes, starting placement, history, fusion,
and pictograph rendering in the capability index and shared/Create/Fuse code.

- Compose `motionQueryHandler` catalog projection, `applyTurnToMotion`, and
  `calculateEndOrientation` for legal single-hand continuations. The existing
  paired OptionPicker requires two endpoints; it cannot own this presentation yet.
- Compose `getPlacementGridPoints` and `PictographContainer` for visual start
  choices. `PropPlacementGrid` currently requires ordered placement of both hands.
- Extend `createStartPlacementData` to preserve its supplied grid mode; pass the
  solo's grid through `soloPropToSequence`. Box starts must not default to Diamond.
- Reuse `SegmentedControl`, `PanelButton`, `Crossfade`, `StepGrid`, and the
  standalone `InlineAnimationPlayer`; no alternative renderer or turn rules.
- Reuse `CommandStack` for reversible draft changes. The test-only state factory
  owns which hand is active and distributes state through context.
- Compose the canonical solo decomposer/adapter and Fuse service. Pairing requires
  equal, nonempty step counts and durations. It never truncates or repeats drafts.
- Reuse `deriveLettersForSequence` after combining; solo choices have no TKA letter.

## Boundaries

This iteration supports the Diamond/Box catalog, levels 1–4, starting orientation,
appending, undo/redo, and authoring a matching second path. It does not implement
arbitrary interior-step replacement, skewed/centric placement, saved-path browsing,
generation, or production handoff. Older steps can be inspected but editing
proceeds at the tail. Undo works across New solo and Add partner as well as motions.

The active path uses paged production notation; small screens switch between
authoring and path inspection. During partner authoring, the fixed hand's matching
pictograph remains beside the current decision. Turn settings occupy the decision
region when opened, and apply only to the active hand.

The entry is `/test/construct-solo-handoff`. The original fixed-fixture walkthrough
remains at `/test/construct-solo-handoff/proposal`. Both inherit the current test
route guard. Authoring supplies explicit turn settings; the fixture keeps its
eight-option catalog limit. Current Fuse owns motion fidelity and reversal flags.
