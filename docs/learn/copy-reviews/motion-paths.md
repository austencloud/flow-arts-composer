# Motion paths

Review state: IMPLEMENTED under delegated editorial approval, September 8, 2026.

Austen requested the AI-bust review and instructed the agent to finish the explanation page without further questions while he was at the park. This supersedes the earlier exact-copy approval checkpoint. It does not claim that Austen personally reviewed the final wording.

## AI-bust review

Applied [.agents/skills/ai-bust/SKILL.md](../../../.agents/skills/ai-bust/SKILL.md) to the page, explorer labels, and new navigation/help links. Result: Clean after tightening indirect phrasing in the third-order section. No banned openers, blacklisted words, em dashes, promotional claims, negative-to-positive flips, or uniform sentence rhythm remain in the delivered copy. Existing code comments were excluded.

The prior draft's per-hand reset description was corrected from inheriting the sequence setting to returning to the current default, matching Composer's implementation.

## Delivered page copy

### Motion paths

The same sequence can draw a different mandala. Pick a path and watch how the hands travel.

The interactive comparison loads in your browser.

### What changes?

A path sets how a hand travels between its positions. The sequence keeps its letters and turns.

**Arc**

The hand follows the circle around the grid center.

**Linear**

The hand takes a straight line between the endpoints.

**Concave**

The hand curves inward between the endpoints.

**Hybrid**

Pro motions use Arc. Anti motions use Concave.

Dashes stay straight. Static hands stay at their grid point, even when the prop rotates. Float uses the underlying fixed path when Hybrid is on.

Pick a matrix cell, then compare Arc with Hybrid. When one hand is pro and the other anti, they follow different kinds of paths. Switch the trace between Hands and Prop tips to see what the prop’s rotation adds.

### Where the setting applies

In the sequence viewer, open Motion on desktop or Playback on a phone. You can also right-click the animation canvas and open Motion Paths. Choose Arc to turn Hybrid off.

**Preview**

A path choice applies to the sequence you’re viewing. It also overrides any saved step exceptions while you compare.

**Restore saved paths**

Returns to the sequence’s saved choices, including its step exceptions.

**Save paths**

Keeps the preview on a sequence already saved in your library that you own.

**Make default**

Sets your starting choice for sequences without a saved path setting. Saved step exceptions still take precedence.

In Composer, select a step to set a different path for either hand. The reset arrow clears that hand’s exception and returns it to the current default.

Path lines are the drawn guides. You can hide them while keeping the same movement.

### The connection to third order

The hand’s path can be a motion of its own. In Third Order, a moving grid carries another sequence. The outer motion moves the grid; the inner sequence moves within it.

Explore extension and antispin by starting with circular travel, then trying a flower as the carrier path. A flower can be built from two rotations before the prop adds its own rotation.

The current Concave option bends an arc inward. It is not an exact four-petal antispin construction. Use the flower carrier in Third Order when you want to work with the constructed path and its spin ratio.

Open Third Order

Spin ratios and petals

Third Order requires sign-in.

### When the drawing works but the motion doesn’t

A mandala shows the whole trace at once. It can hide a sharp change where two steps meet.

Watch those joins in the animation, including the return to the first step. Compare Arc with Concave, then try a per-hand exception in Composer. Keep the path that suits the movement you want to perform.

Open Composer

## Explorer copy and interaction

- Sequence selection uses the Shape Engine matrix and hand timing/direction choices. The community/library picker remains available as a secondary choice.
- Arc, Linear, Concave, Hybrid use the shared PathShapePanel and canonical SequenceMandala renderer.
- Hands traces the hand centers. Prop tips includes the staff rotation.
- Changes here stay in this explorer. Your saved paths and defaults stay as they were.
- Play/Pause and Path lines operate only in this explorer. Reduced-motion preference starts playback paused.
- Loading animation… / Loading sequence picker… / The sequence picker could not load. / Close.

## September 13 sequence-selection revision

Austen reviewed the page and requested replacing the Pro / Anti / Pro + anti example toggles with selection through the Shape Engine matrix, with hand timing and direction available. This is a new selection preference and one observed substantial correction round. The revised experience is pending user review.

The lead applied the Teacher briefing; Terra owns the bounded implementation. Existing delegated editorial authorization covers the wording revision, which removes instructions naming the old toggle. The AI-bust review still applies.

| Capability                     | Evidence / current consumer                                 | Owner and decision                                                                                                 |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Inspectable pair selection     | `matrix`, `selectedPair`, `onselect`; ShapeMatrixMatrixPane | Reuse ShapeMatrixGrid, including its full selection perimeter, native buttons, lazy artwork, and minimum tile size |
| Hand timing and direction      | ShapeMatrixDrill                                            | Reuse ElementChipRow and the canonical mode definitions                                                            |
| Shape-to-sequence construction | ShapeMatrixDrill                                            | Compose the existing realization builder and static TnD sequence source; no local motion construction              |
| Path comparison and playback   | Existing motion-path guide                                  | Keep PathShapePanel, SequenceMandala, scoped visibility, and InlineAnimationPlayer                                 |
| Word and notation              | Motion-path guide and ShapeMatrixDrill                      | Keep TKAWordGlyph; use the shared timeline StepStrip carousel directly beneath the animation                       |
| Secondary sequence selection   | Existing motion-path guide                                  | Keep SequencePickerModal                                                                                           |

Matrix choices remain visible before selection. The matrix shows Arc reference shapes; changing the comparison path does not change the selection grid. Phones stack the matrix and comparison, while wider hosts allocate a bounded matrix alongside the comparison where space permits. Shared selection treatments replace the rejected three-example toggle row. No decorative edge accents or duplicate artifact frames are introduced.

### Playback continuity follow-up

Austen's next review requested continuous playback when changing timing and direction: keep an unchanged prop moving and fade the other into its new relationship, following the Shape Engine experience. This is a second observed interaction correction round, with the resulting behavior pending user review. Page explanation copy remains unchanged.

The transition composes `DualSourceCrossfade` and `InlineAnimationPlayer`, using the Shape Engine's `resolveRealizationEntryStep` as the fallback phase owner. A motion-path adapter matches complete cyclic hand motions to preserve a reference hand when the sequences share one. It uses authored motion data rather than introducing another position interpolator. The animation stage keeps its existing dimensions and playback controls.

Seventeen focused tests passed, including real matrix realizations: SS → TS retains the right hand's full loop, and SS → SO retains the left hand's full loop at the same fractional beat. Negative cases reject reversed motion and a matching beat followed by a different curve. Svelte check reported zero errors and warnings.

### Response time and attached carousel

Austen's subsequent screenshot and review reported a delay before the fade began and requested a carousel attached to the animation. This is a third observed interaction correction round. The replacement composes the shared timeline `StepStrip` used in ShapeMatrixDrill, with active-step tracking and seeking beneath the canvas. The detached `GuideStepStrip` is removed. Animation and notation use the displayed sequence during a pending handoff.

The latency work reuses the canonical players instead of rebuilding their canvases for every selection, and caches matrix relationship realizations. The baseline browser click-to-handoff samples were 476, 735, and 642 ms; these include automation round-trip time and the latter two overlap the preceding fade, so they are comparison measurements rather than isolated browser event timings. The revised experience remains pending user review.

Nineteen focused tests passed across explorer state, whole-loop anchor matching, and canonical phase mapping, including prewarmed selection reuse and retry after a null build. Svelte check reported zero errors and warnings. The rail reserves its height before loading and excludes the static start pose from the continuous loop.

## Evidence and teaching boundaries

### Focus and wrapping revision, September 13

Austen rejected the simultaneous four-demo layout as overwhelming and pointed out the introduction's unnecessary second line. The introduction now uses the available article width. The lower section presents one topic at a time through the shared SegmentedControl: Hand travel, Step joins, Motion layers, Apply paths. A visited topic retains its settings when hidden, while its playback becomes inactive. The selected topic has one short instruction; duplicate headings and the extra staff-rotation sentence were removed. Carrier and Inner labels replace longer labels that wrapped on phones. The detailed reference remains optional.

This revision applies the existing delegated editorial authorization. AI-bust review found no banned patterns in the revised labels and instructions. The top matrix explorer is unchanged. User review of the new layout remains pending.

### Interactive reference revision, September 13

Austen requested interactive pictures, animations, and integrated components below the matrix, then approved implementation with “do it.” The four examples cover single-hand travel, synchronized step joins, third-order composition layers, and sequence-versus-step settings. The existing prose remains available in a collapsed Motion path reference. The upper matrix explorer is unchanged.

The lead applied the Teacher briefing inline and reviewed the new labels with AI-bust. The concise instructions name controls and observable movement; no banned writing patterns were found. Existing delegated editorial authorization applies. User review of the resulting experience is pending.

| Capability                                          | Existing owner reused                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Playback, scrubbing, and matching comparison frames | InlineAnimationPlayer and its canonical seek/external-step interface                         |
| Notation and step selection                         | StepStrip                                                                                    |
| Path choice and explicit per-step paths             | PathShapePanel and applySequencePathPreview                                                  |
| Layered motion                                      | ThirdOrderCompositionSampler, ThirdOrderFlowerOverlay, AnimatorCanvas, TrajectoryMandala     |
| Offscreen activity and lazy mounting                | RenderActivityGate and LazyMount                                                             |
| Full viewer handoff                                 | saveSequenceRouteHandoff and generateSequenceRoutePath, as used by standalone sequence pages |

Each example owns ephemeral state. Save and Restore affect only the example; the real viewer is reached through an explicit button. The examples reuse frozen motion data and canonical sampling, without inventing a flower formula or equating Concave with an exact four-petal antispin construction. No performer footage was available for this revision.

Focused tests cover selected-step isolation, source preservation, local save/restore/reset, and single-hand visibility. Type checking reported zero errors and warnings before browser verification.

Browser verification covered 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160. The new sections had no horizontal overflow. Keyboard scrubbing, Circle/Flower, layer switching, and per-step Save/Restore were exercised. Save/Restore returned the selected Concave control and announced the restored example. No console errors were reported. Browser inspection also prompted explicit effect-map isolation for the settings example and visible path lines with a fractional initial pose for the single-hand example.

The final viewer-button check exposed that the public guide does not host the application drawer or configure its short-code manager. The lesson now uses the established standalone sequence route and one-time route handoff, which carries the complete edited sequence and the return label without opening the application drawer or minting a short code from the guide.

- Hand paths and Hybrid mapping: src/lib/shared/animation-engine/services/prop-interpolator.ts. Concave uses 2 \* straightPoint - circlePoint; it is not the exact flower construction.
- Preview/save/default and authored exception behavior: src/lib/shared/sequence-viewer/services/sequence-path-policy.ts, animation-visibility-state.svelte.ts, and their tests.
- Per-hand reset: PropTurnsControl.svelte and path-shape-handler.ts.
- Path-line visibility is separate from movement policy.
- Third Order: third-order-composition.ts, third-order-flower-path.ts, and ThirdOrderCompositionSampler.ts. Links lead to the toy and existing ratios reference rather than duplicating petal formulas.
- Fresh Flow Arts MCP glossary checks covered pro, anti, dash, static, and float. Concave and third order were absent from the glossary; the copy describes verified application behavior.
- AAAA, BBBB, and CCCC examples are the unedited data returned by Flow Arts MCP on September 8 with smooth constraints, adapted through the canonical factories. Closure is tested.
- This is a public reference and comparison tool, not a new mastery lesson or a change to the concept progression. Inline lead applied the Teacher briefing. User review of the completed experience is pending; no learning outcome or satisfaction claim is inferred.

## September 8 verification

- Fifteen focused tests passed across the explorer, sequence path preview, and mandala path policy suites. They cover source preservation, scoped state, Hybrid float behavior, render identity changes, and closure of the example sequences.
- Svelte check reported zero errors and warnings. A separate full TypeScript run reported two existing option-type errors in the unchanged `an-slice.test.ts` and ten external scene/camera diagnostics; none referenced this task's changed files.
- Direct browser inspection covered 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160 for the new page, viewer help entry, and Learn navigation. No horizontal overflow was observed. Path controls and navigation links meet the 44px target minimum, allowing subpixel measurement rounding.
- Verified Hybrid → Arc, hand versus tip traces, playback, path lines, and reduced-motion startup. A real AABB gallery selection loaded into the explorer after registering the canonical loop detector on the public route.
- Checked equivalent 200% reflow at 720×450 CSS pixels. This was viewport emulation, not a native browser zoom measurement.
- Third Order is sign-in gated; the page states that requirement. No authenticated save or account mutation was performed.
- Screenshots are stored outside the repository in `C:/Users/Austen/.codex/visualizations/2026/09/08/motion-path-guide`.

## September 13 verification

- Ten focused tests passed across the explorer and canonical mixed-turn realization suites. They cover asynchronous selection ordering, retained path policy, source preservation, scoped state, and generated sequence behavior.
- Svelte check reported zero errors and warnings. Updated interface wording passed the AI-bust review.
- Direct browser inspection covered 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160. The matrix showed all 16 cells without horizontal document overflow. A tablet spacing issue was corrected and inspected again at tablet and landscape widths.
- Verified 0-, 1-, and 2-turn selections, timing/direction changes, keyboard activation, retained Hybrid selection, switching back to Arc, and paused startup with reduced motion. A real AABB gallery selection loaded its word and notation into the explorer.
- Checked equivalent 200% reflow at 720×450 CSS pixels through viewport emulation; native browser zoom was not measured.
- Screenshots are stored outside the repository in `C:/Users/Austen/.codex/visualizations/2026/09/13/motion-path-matrix`. User review of the revised selection experience remains pending.
