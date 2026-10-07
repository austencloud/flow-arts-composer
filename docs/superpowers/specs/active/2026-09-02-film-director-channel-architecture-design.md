---
status: active
value: null
effort: null
work_state: in-progress
remaining: Complete Phase 4 editorial clip instancing and retire scene.extends; then verify phases 1-3 against their gates.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Film Director Channel Architecture Design

**Queue evidence, 2026-10-07:** Phase 1–3 landing notes below record implementation; `expand-scene-inheritance.ts` and `resolve-film-director-spec.ts` still use `scene.extends`, so the Phase 4 retirement condition is unmet.

Date: 2026-09-02
Status: **In progress** as of 2026-10-07. Phases 1–3 have landing notes below; Phase 4 editorial is open. The prior camera model was the shipped baseline when this design was proposed.

Research backing every decision here:
`docs/architecture/film-director-research-canon.md`. Read it first. This
document does not restate the evidence, only the decisions.

## Goal

Replace the Film Director's fused camera keyframe with per-channel curves under
a layer stack, so that the directive language and hand editing can both write
the same film without destroying each other, and so that every animatable value
becomes an addressable, visible, editable timeline.

## Why

Austen, 2026-09-02, looking at the capability panel:

> "I wonder if this is granular enough or if this is essentially trying to make
> something dynamic out of legos without having legos that are detailed enough
> ... I kind of expected everything would be on an actual timeline like any
> given value we can modify such as the zoom the pan the tilt the yaw could be
> its own variable with its own individual timeline."

He is right, and the code is worse than the suspicion. `ResolvedDirectorCameraKeyframe`
is one fused nine-value tuple with a single shared `easing`, so no channel is
independently addressable, easing is welded across position, target and lens,
and yaw, pitch and pan are not stored at all. They are emergent from a
position-to-target vector, which is why an authored `pan` cannot be selected
after it compiles.

Four production systems converge on a three-layer split that TKA has collapsed
into one. The canon documents that convergence. This design applies it.

## What survives untouched

Naming this first, because "obliterate" must not become collateral damage.

- **The pure sampler contract.** `f(keyframes, t) -> frame` is correct and is
  what makes the whole migration provable. Preserve purity, determinism, and
  scrubbability.
- **`interpolateScalar`.** `interpolateVector` already maps over axes and
  delegates to a per-axis scalar interpolator. The channel model needs
  per-channel *keys*, not per-channel *math*. The math is written and covered.
- **The v4 authored schema, its Zod validation, and its refusal messages.**
  Rejections phrased in the director's own vocabulary are rare and good.
- **The directive vocabulary.** Moves, shot sizes, framing grammar, cues, bars,
  the capability matrix, the Proving Grounds catalog. This design demotes the
  language from *the* writer to *a* writer. It does not shrink what it can say.
- **All 848 tests, and especially `film-resolution-snapshot.test.ts`.** The
  snapshot suite is the migration's safety net, not an obstacle to it.

## Decisions

Each decision states the alternatives considered and why they lost. Any of
these can be overturned in one line; they are written down so that overturning
one is a decision rather than a drift.

### D1. Aim is stored as yaw, pitch and distance. The aim space is chosen per segment.

`camera.aim.yaw`, `camera.aim.pitch`, and `camera.aim.distance` become real
channels. The look-at target is computed from position plus that spherical aim
whenever the renderer or a framing behavior needs it.

This is the decision that literally answers the question. Pan becomes yaw over
time. Tilt becomes pitch over time. Both become rows you can see and drag.

- *Rejected: keep cartesian `target.x/y/z` as the stored form.* It is the
  status quo, and under it pan and tilt continue not to exist as variables.
- *Rejected: store both, and sync them.* Two representations of one truth with
  no defined winner. This is how conflicting-state bugs are born.

Cost: framing grammar computes a target point (a performer's chest, a prop tip)
and must now convert that point to yaw and pitch. That is one inverse
trigonometric step, and it makes tracking a correction on aim rather than a
displacement of a target point, which is more correct.

**Prior art, added 2026-09-02 after re-verification.** The New York Times ships
a three.js `CameraRig` in
[three-story-controls](https://nytimes.github.io/three-story-controls/) that
decomposes camera motion into six independently named axes with rotation stored
separately from translation: pan rotates Y, tilt rotates X, roll rotates Z,
pedestal translates Y, truck translates X, dolly translates Z. A production
newsroom reached the same conclusion this decision reaches. Take the axis model
as validation; do not take the dependency, because that rig has no layering, no
corrections, and no per-axis curves.

**Consequence to schedule, not to defer silently.** That table is the film
vocabulary and TKA's move set does not match it: TKA has `pan` but no `tilt`,
says `push-in` / `pull-back` where the industry says `dolly`, and has no
`pedestal`. `tilt` is the one that matters, because it is unsayable today for
exactly the reason this decision fixes. [CinemaTraj](https://arxiv.org/abs/2607.26910v1)
(2026-07-29) also lists tilt among its seven atomic movements. Adding `tilt` to
`DirectorCameraMove` belongs in the phase that lands D1, not in a later cleanup.

**Amended 2026-09-03, during implementation.** As written above, this decision
was wrong in a way that only showed up against the library: *derive the target
always* breaks the most common shot in the product.

Interpolating yaw, pitch and distance independently reproduces a fixed aim
point only when the camera is also fixed. Whenever the rig travels while
holding a subject -- a push-in, a crane, a truck, an orbit, which between them
account for nearly every keyframe in the nine films -- the aim's spherical
coordinates all change, and interpolating them separately makes the aim point
wander off the subject it was supposed to be locked to. The cartesian target
was not merely the status quo. For those moves it is correct, and the spherical
form is not.

The distinction that survives is not which representation is true. It is what
the move MEANS:

- **Turning in place** (pan, tilt) is angular. Interpolating the point chords
  across the arc: the framing distance dips through the middle of the move and
  the angular rate does not match the turn that was asked for. Measured on the
  library, Nine Planes scene 1 sagged from 15.357 m to 14.806 m mid-pan.
- **Holding or carrying an aim point** (hold, push-in, pull-back, crane, truck,
  orbit, zoom, roll) is positional. Interpolating angles drifts off the subject.

So the aim space belongs to the segment, exactly as `interpolation` already
does: a keyframe governs how the camera travels from it to the next one.
`ResolvedDirectorCameraKeyframe` gains `aimSpace?: "angles"`, set only by a
move that turns the rig in place, plus `aimYawDeg` / `aimPitchDeg` stated by
the compiler that authored the turn. Absent means world-space aim, which is
what every keyframe resolved before the field existed means, so six of the nine
films are byte-identical and the other three changed only inside their turns.

`camera.aim.yaw` / `.pitch` / `.distance` are still real channels present on
every track, so pan and tilt are real rows on the timeline as promised. What
changed is that the target channels are not deleted; the two aim forms coexist
and the segment says which one is load-bearing.

**What this does not foreclose.** The Cinemachine-shaped answer -- aim is a
BEHAVIOR (track this subject) rather than a keyed value, so holding a subject
is not keyed at all -- is better than either representation and remains open.
It belongs with D4's behavior nodes in phase 2, not in a refactor that has to
keep nine films pixel-stable.

Two implementation traps worth carrying forward, both found by tests rather
than by reading:

1. A stated yaw must never be unwrapped toward its neighbour. Unwrapping is for
   angles recovered from a point; folding a stated one turns a 270-degree pan
   into a 90-degree pan the other way.
2. A turn's closing keyframe is popped and replaced by the next move's opening
   keyframe at the same instant, which would take the stated arrival angle with
   it. The replacing key inherits the angles (but not `aimSpace`, which governs
   a segment that now belongs to the next move).

### D2. Layers compose by copy-on-write per channel.

Four layers, evaluated bottom to top:

| Layer | Written by | Keyable |
| --- | --- | --- |
| `base` | resolved formation and scene defaults | yes |
| `directive` | the language, from move nodes | yes |
| `manual` | a human dragging | yes |
| `correction` | handheld, tracking, collision, damping | **no** |

The composition rule: **the topmost layer that owns a channel wins that channel
entirely.** The `manual` layer does not own a channel until it is touched. On
first touch, it is seeded with a copy of the composed value below it, keyed at
the lower layer's key times, and the edit is applied to that copy. From then on
the channel is manual, and the channel row shows an override badge with a
one-click revert.

- *Rejected: per-key merge*, where manual keys interleave with directive keys
  and lower keys survive between them. It reads well until the sentence
  changes: the directive layer regenerates with different key times and the
  surviving manual keys are stranded at stale moments, silently corrupting a
  curve nobody edited.
- *Rejected: additive manual offsets.* Dragging a key would author a delta
  curve rather than a position, so the handle would not follow the pointer to
  where you put it. That fights `no-layout-shift.md`'s direct-manipulation rule
  and every animator's expectation.

The consequence is honest and must be shown, not hidden: **rewriting a sentence
no longer updates channels you have hand-edited.** That is correct behavior. It
is visible through the override badge, and reversible through revert. Silent
partial merging would be worse.

### D3. Corrections are additive, in the channel's own unit, and never keyed.

`value(t) = compose(base, directive, manual)(t) + Σ corrections(t)`

Handheld noise adds meters and degrees. Tracking adds displacement. Collision
adds a push-out. None of them are ever written into a layer, so a film can be
re-shot handheld without touching its curves, exactly as Cinemachine separates
raw values from its correction channel.

- *Rejected: per-channel multiplicative or scale correction modes.* No current
  correction needs one. YAGNI. Recorded in the canon's open questions if a
  proportional lens correction ever appears.

- *Open rather than rejected: a parameter optimizer instead of an additive
  correction.* CinemaTraj handles collision and occlusion by refining a move's
  own free parameters with gradient descent on a signed distance field, rather
  than adding a delta after composition. That is a real alternative for one
  correction type. It stays open because TKA has no SDF and no collision
  requirement; if collision ever becomes a requirement, decide it then instead
  of assuming the additive form covers it.

This also retires two workarounds: `camera.handheld` and `camera.tracking` stop
being optional fields bolted to the resolved camera and become corrections,
which is what they always were.

### D4. Moves are declarative nodes that produce the directive layer.

A move stops being a compile-time function whose output replaces it, and
becomes a node that persists in the document and evaluates into the `directive`
layer. Re-evaluation happens on document change, not per frame.

This gives the three properties that matter:

1. The move survives resolution, so a timeline can draw it as a bar you slide
   and stretch, and `findCapabilityUsage` no longer has to read the authored
   document to discover what the resolved film contains.
2. Concurrent moves (`with`) become plain per-channel addition. `MoveGroupState`
   and `ZERO_DELTA` in `camera-language.ts` are already deltas; they stop being
   collapsed.
3. The directive layer is a cache with a defined invalidation, which keeps the
   snapshot comparison exact.

- *Rejected: moves as pure per-frame runtime evaluators.* It sounds cleaner and
  it makes manual override ambiguous, because a dragged key would have to
  compete with a live generator rather than with stored data. It also makes the
  snapshot gate harder to hold at exactly the moment the gate is most valuable.

**External support, added 2026-09-02.** CinemaTraj has an LLM agent decompose a
prompt into atomic cinematographic movements, each instantiated as a parametric
trajectory that remains optimizable afterward rather than being collapsed into a
path. Two independent designs arriving at a persistent parametric move is a
better argument for this decision than the reasoning above on its own.

### D5. Add `bezier` as a fourth interpolation. Keep the existing three.

`DIRECTOR_INTERPOLATIONS` is `["step", "linear", "smooth"]` and `smooth` stays
the default. A curve editor needs per-key tangents, so keys gain optional
`tanIn` and `tanOut`, meaningful only under `bezier`.

- *Rejected: replacing `smooth` with bezier.* It would change every existing
  film's pixels and blow the snapshot gate on phase 1, which is the one phase
  that must be provably a no-op.

### D6. Phase 1 is camera only.

Camera has the tightest snapshot coverage, it is what the question was about,
and it is the smallest slice that proves the model. Performers already carry a
crude channel model in `stepPlanes`, `stepEffects`, `stepEfforts`, and
`stepStaffLengths`, which are per-step arrays; generalizing those is phase 3.

### D7. The authored document format does not change in phases 1 and 2.

Channels are the representation of the **resolved** film. `FilmDirectorInput`
v4 is untouched, which is precisely what lets the snapshot suite prove those
phases are pure refactors. Phase 3 adds an optional authored `channels` block
for manual overrides, using the established absent-not-null convention so every
film that does not use it resolves byte-identically.

### D8. The channel store stays in `src/routes/test/film-director/_lib/`.

Do not promote to `src/lib/shared/` speculatively. `never-hand-roll.md` asks for
a real second consumer before a shared owner exists. Name the modules so that
promotion is a move, not a rewrite.

## Architecture

### Channel identity

Dotted paths, stable, greppable, sortable:

```text
camera.position.x | camera.position.y | camera.position.z
camera.aim.yaw    | camera.aim.pitch  | camera.aim.distance
camera.lens.fov   | camera.roll
performer.<id>.position.x | performer.<id>.position.z | performer.<id>.facing
performer.<id>.staffLength
```

### Data shapes

```ts
type ChannelId = string;

interface ChannelKey {
  t: number;
  v: number;
  interpolation: DirectorInterpolation | "bezier";
  easing: DirectorEasing;
  tanIn?: [number, number];
  tanOut?: [number, number];
}

interface Channel {
  id: ChannelId;
  keys: ChannelKey[]; // sorted by t, never empty
}

type LayerName = "base" | "directive" | "manual";

interface Layer {
  name: LayerName;
  channels: Map<ChannelId, Channel>;
}

interface Correction {
  id: string;                       // "handheld" | "tracking" | ...
  evaluate(t: number): Map<ChannelId, number>; // additive deltas
}

interface ChannelStore {
  layers: Layer[];                  // bottom to top
  corrections: Correction[];
  sample(id: ChannelId, t: number): number;
}
```

### Evaluation order

```text
for each channel:
  raw = topmost layer owning this channel, sampled at t
  out = raw + Σ correction deltas for this channel at t
```

### The camera frame, rebuilt

`sampleDirectorCameraTrack` keeps its exported signature during phase 1 and
becomes a thin adapter: it samples nine channels and assembles the same
`DirectorCameraFrame` the renderer already consumes. Nothing downstream of it
changes, which is why phase 1 can be a proven no-op.

### The timeline, rebuilt

`FilmTimeline.svelte` keeps its scene ribbon and playhead and gains:

- a **channel tree** on the left, filtered by selection (select a performer,
  see its channels);
- a **dopesheet** row per channel, keys as diamonds, drag to retime;
- a **curve editor** beneath, one curve per selected channel, bezier handles
  under `bezier` interpolation;
- a **behavior lane** drawing each move node as a bar with draggable ends;
- an **override badge** per channel row when `manual` owns it, with revert.

This is what Sequencer, Blender's dope sheet and graph editor, and Theatre.js
all look like, because it is the shape that works.

### The write API

One API, used by both authors:

```ts
setKey(channel: ChannelId, t: number, v: number): void;   // takes the channel manual
removeKey(channel: ChannelId, t: number): void;
revertChannel(channel: ChannelId): void;                   // drop the manual layer's copy
addBehavior(sceneId: string, move: DirectorCameraMove, window: [number, number]): void;
updateBehavior(id: string, patch: Partial<DirectorCameraMove>): void;
removeBehavior(id: string): void;
```

The agent speaks sentences that produce these calls. Austen drags keys that
produce these calls. Neither has a door the other lacks. This is the actual
answer to the embarrassment named on 2026-09-02: the language stops being the
only way in.

## Migration

Four phases. Each is independently shippable, and the first two are provable.

### Phase 1: channel store behind the existing sampler. Pure refactor.

Build the store, express a fused keyframe as nine channels keyed at the same
`t`, and rewrite `sampleDirectorCameraTrack` as an adapter over it.

**The gate this phase was written with was not strong enough, and the
correction matters more than the phase does.** `film-resolution-snapshot`
freezes what RESOLUTION produces: the keyframe list. It says nothing whatever
about the curve BETWEEN two keyframes, which is the entire subject of a sampler
refactor. A Catmull-Rom pass that selected its neighbours differently would
produce byte-identical keyframes and a visibly different film, and that
snapshot would have passed.

So phase 1 splits, and it opens by building the missing gate:

- **1a. Freeze the sampler, then refactor under it.** Add
  `camera-sampling-snapshot.test.ts`: every scene of all nine films sampled on
  a uniform grid, plus probes 1 ms either side of every keyframe (cuts and
  holds hide between grid points), plus out-of-range probes for the clamps.
  Then build the channel store. **Gate: both snapshots unchanged.** Do not
  regenerate either; that discards the only proof the refactor preserved
  behaviour. Landed 2026-09-03, 857 tests, zero snapshot changes.
- **1b. Aim channels and `tilt` (D1 as amended).** This one cannot be
  byte-identical and should never have been scheduled as though it could:
  making a turn sweep its arc instead of chording it changes, by design, the
  frames inside every turn. It is a reviewed diff, and the review is the
  deliverable. Landed 2026-09-03: resolution purely additive, sampling moved 3
  of 50 scenes and 382 of 20,050 probes, all inside turns, largest 0.61 m.

The round-trip property this phase was told to prove is subsumed: the
amendment to D1 keeps the target channels, and the tests in
`camera-aim-channels.test.ts` assert the observable behaviour (constant framing
distance through a turn, angle tracking eased progress, a 270-degree turn that
does not fold to 90) rather than the conversion in isolation.

### Phase 2: moves become nodes that produce the directive layer.

Move evaluation moves out of `resolveDirectorCameraTrack`'s bake and into a
node evaluator writing the `directive` layer. `handheld` and `tracking` become
corrections.

**Gate: the same snapshot suite, still zero changes.** Corrections are sampled
after composition, so a film that never goes handheld must produce identical
numbers.

### Phase 3: the manual layer and the timeline UI.

New behavior, so new tests rather than a snapshot gate. Optional authored
`channels` block, absent-not-null. Copy-on-write seeding, override badges,
revert. Dopesheet, curve editor, behavior lane.

Visual verification is mandatory here per
`.claude/rules/visual-verification-mandatory.md`, at all seven required
viewports. A timeline with channel rows is exactly the kind of dense control
surface that ships broken when nobody looks at it.

### Phase 4: editorial.

Scenes become clips on tracks with in and out points and blends, per the OTIO
model. `scene.extends` retires in favor of clip instancing.

## Testing

- **Snapshot equality is the phase 1 and 2 gate**, and it takes BOTH snapshots.
  `film-resolution-snapshot` proves the keyframes did not move;
  `camera-sampling-snapshot` proves the curve between them did not either.
  Neither implies the other, and a sampler change is invisible to the first.
- **Property test layer composition**: for randomized layer stacks, the topmost
  owner wins, corrections are additive, and revert restores the composed value
  exactly.
- **Contract test the write API**: every mutation validates against the schema
  and a rejected mutation leaves the document unchanged, matching the existing
  contract in `applySceneEdit` and `applyPerformerEdit`.
- **Component tests only on demonstrated need**, per
  `.claude/rules/component-test-discipline.md`. The curve editor's drag math
  earns one; a channel row label does not.

## What this design does not do

- It does not add a learned trajectory model. The research is recorded in the
  canon under Evaluate; nothing here depends on it.
- It does not take a dependency on Theatre.js, OpenUSD, or OpenTimelineIO. Data
  models are adopted; runtimes are not. The canon records why for each.
- It does not promote anything to `src/lib/shared/`.
- It does not change what the directive language can say. Every named rejection
  in `docs/reference/film-director-capability-matrix.md` stays rejected until it
  is separately re-argued.

## Open decisions Austen can overturn in one line

1. **D2's copy-on-write**, if he would rather a sentence rewrite always win and
   hand edits be discarded with a warning.
2. **D1's spherical aim**, if there is a reason to keep cartesian targets that
   is not visible from the code.
3. **D6's camera-only phase 1**, if performers matter more than the camera.
4. **Phase 4 at all.** Editorial is the least-pressured layer and could sit
   indefinitely.

## Related

- `docs/architecture/film-director-research-canon.md` — the evidence
- `docs/reference/film-director-capability-matrix.md` — what the language says today
- `.claude/rules/never-hand-roll.md`, `.claude/rules/canonical-capabilities.md`
- `.claude/rules/visual-verification-mandatory.md`, `.claude/rules/no-layout-shift.md`
