---
status: active
value: 5
effort: M
remaining: Audit the Director control surface against the Phase 1 Star acceptance, including performer edits, camera presets, saves, and foot planting.
depends_on: 2026-08-25-director-module-design.md
plan_path: ''
tags:
- director
- film
- camera
- performers
- admin
last_triaged: '2026-10-07'
work_state: unverified
---

# Director Control Surface — Phase 1 Design

**Queue evidence, 2026-10-07:** The live Director workbench mounts `FilmDirectorChannelEditor`; the old “not started” queue claim is stale. The Phase 1 Star acceptance has not been re-proved, so this remains open.

**Goal:** Make every parameter the film document already supports reachable
without editing JSON, and replace formula-derived camera framing with a curated
library whose every offered option has been looked at.

Phase 1 of `active/2026-08-25-director-module-design.md`. It delivers the
Phase 1 half of the Star target and nothing beyond it.

## 1. Scope

Three deliverables:

1. **Per-performer control surface.** Live editing of avatar, sequence, prop,
   planes, effort, effects, and staff length for the performers in the current
   scene.
2. **Save and overwrite.** Save the edited film as a new film or over the
   existing one, keeping exactly one prior version recoverable.
3. **Camera preset library.** Named, hand-tuned, screenshot-approved presets
   that declare the conditions they are valid under.

Travel, blocking, and anything that requires a performer to move are Phase 2 and
are out of scope here. The `enablePerformerLocomotion` flag is turned on and
evaluated (see section 6), but no travel is authored.

## 2. Architecture: document-first editing

The Director already has the right shape for this, and Phase 1 uses it rather
than inventing a parallel one.

`film-director-state.svelte.ts` holds three values: `sourceInput` (the authored
document), `film` (`resolveFilmDirectorSpec(sourceInput)`), and `draft` (the
JSON text). Saving stores `sourceInput` (`FilmDirectorWorkbench.svelte:213`).
Resolution is deterministic, seeded off the film id
(`directive-random.ts:resolveFilmSeed`).

**Every control-surface edit patches `sourceInput`, then re-resolves.** This is
the same path the JSON editor already takes at
`film-director-state.svelte.ts:158-159`, driven by controls instead of a
textarea. Consequences that fall out for free:

- One source of truth. The live scene is a projection of the document.
- Edits survive scrubbing and scene cuts, because the adapter re-applies from
  the document.
- The JSON editor stays in sync, so it remains a usable escape hatch.
- Save needs no capture step; the document already holds the edit.

The rejected alternative was editing the live `performerManager` and reading it
back at save time. It is cheaper, and the hub already writes that way, but the
adapter re-applies from the document on every scene cut, so edits evaporate on
scrub. That is acceptable for the single-scene Star film and broken for the
four-scene films.

### 2.1 The random-directive freeze rule

`createAxisStream` draws are position-dependent within a `(scene, axis)` pair:
its own doc comment records that editing an earlier pick re-rolls every later
one. So writing a concrete value over a `random` directive shifts the stream and
silently changes *other* performers in that scene and axis.

**Rule: when a control-surface edit overwrites a directive that resolves
randomly, the same patch freezes every other randomly-resolved value in that
scene and axis by writing its currently resolved value as a concrete value.**
The edit changes exactly the performer that was edited and nothing else.

This is a one-way door by design. Freezing loses the ability to re-roll that
axis from the seed. The Reroll affordance that exists today operates on
`seed.axes`, so it continues to work for axes that have not been frozen, and the
control surface does not offer it for frozen ones.

### 2.2 Patch validity

A patch that would produce a document failing `filmDirectorInputSchema` is
rejected before it is applied. The prior value stays, and the control reverts to
it with a toast. The document is never allowed into an invalid state, because
`film` is derived from it and a throw there takes the scene down.

## 3. Per-performer control surface

### 3.1 Reuse, not rebuild

`SceneControlWorkspace`
(`src/lib/shared/3d/components/controls/SceneControlWorkspace.svelte`) already is
this surface. It is the right-edge rail plus inspector, and it resolves three
presentations — docked, overlay, and compact — from its own measured box. Its
performer tool reaches `PerformerHubDetail`, which carries exactly the tabs Phase
1 needs: Avatar, Sequence, Prop, Planes, Effort, Effects
(`performer-hub-types.ts`). Everything reads `getViewer3DContext()`, which
`FilmDirectorScene.svelte:64` establishes, so it works inside the Director
without modification to its read path.

Per `never-hand-roll.md`, this is **extend**, not create. The owner of
per-performer editing is the workspace. The Director composes it, passing the
bands its own chrome occupies as `topOffset` and `bottomOffset`.

Grep record: searched `performer`, `PerformerHub`, `performer-hub`, `setProp`,
`setEffect`, `setEffort`, `setAvatarModel` across `src/lib` and `src/routes`,
then checked each match for live consumers. That second step is the one that
matters here: the name search alone surfaced three generations of this surface —
`PerformerRail` (bottom-center), `PerformerHub` (left edge), and the workspace —
of which only the workspace still had consumers. The other two were deleted with
this work. Searching by capability finds candidates; only the consumer check
identifies the owner.

### 3.2 The write seam

The detail panel writes to `viewer.performerManager` performers directly. Phase 1
adds one optional prop, a **performer edit sink**, threaded from
`SceneControlWorkspace` down both of its branches — the desktop inspector and the
compact bottom sheet — to `PerformerHubDetail`. When absent, the panel behaves
exactly as it does today for every existing consumer. When provided, it calls the
sink instead of mutating the manager, and the sink owns applying the change.

The sink receives the performer's identity and the field and value that changed.
It does not receive the manager. This keeps the hub ignorant of documents and
the Director ignorant of the hub's internals.

The Director's sink patches `sourceInput` for the current scene, applying the
freeze rule from section 2.1, and lets re-resolve drive the visible change.

`onSettingChange` is not reused for this. It is an analytics channel
(`ViewerControlSink`, shaped as control/field/previous/next for reporting), and
overloading it for state propagation would couple two unrelated concerns.

### 3.3 Performer identity

Patches bind to the performer's `id` within the scene, never to its array index.
`performerSchema` already carries an optional `id`; the Director assigns a
stable one when a scene's performers are authored without them, at load, so the
identity exists before any edit can reference it.

This matters because `director-viewer-adapter.ts:122` correlates document
performers to live performers by index. That correlation stays as-is for
rendering, but it is not what edits are keyed on.

### 3.4 Placement

`PerformerHub` is an absolutely-positioned stage overlay
(`.hub-anchor { position: absolute }`), designed to sit on the 3D view rather
than in a side panel. It mounts inside `FilmDirectorScene`'s template alongside
`Viewer3DCanvas`, which is where the viewer context is available and where the
overlay's positioning is meaningful.

### 3.5 Scope of an edit

Scene-scoped. Each scene declares its own `performance.performers` or
`performance.cast`, and the four-scene sample films use entirely scene-local
performer ids (`ember-1..8`, then `lead`/`left-support`/`right-support`, then
`ocean-1..4`). Performers do not recur across scenes, so there is nothing to
propagate to. This matches Austen's framing: "for the duration of the scene."

When a scene uses a `cast` block with `defaults` rather than an explicit
`performers` array, an edit to one performer materializes that performer into
the `performers` array with the edited field set, leaving `defaults` intact for
the rest. `castSchema` already permits `count`, `defaults`, and a partial
`performers` array together.

## 4. Save and overwrite

`SaveFilmModal` and `filmCollectionState` already handle save-as-new. Phase 1
adds overwrite.

- **Save as new** is unchanged.
- **Overwrite** replaces the stored document of an existing film, preserving its
  id, its short link, and its poster unless a new frame was captured.
- **One prior version is retained.** The replaced document is stashed on the
  same record as `previousFilm`, with the timestamp of the replacement. A single
  Restore action swaps it back. Restoring does not itself stack: restoring
  replaces the current document and the stashed one becomes what was current.
- There is no version list, no pruning, and no history UI beyond Restore.

The modal grows a destination choice when the film being edited came from the
collection: save as new, or overwrite the film it was opened from. A film that
was not opened from the collection can only be saved as new, because there is
nothing to overwrite.

**Known blocker:** the `users/{uid}/film-collection` rules block is committed in
`firestore.rules` but not deployed, so signed-in saves currently fail with a
permissions error. Guest saves work off localStorage. Deploying the rules is a
prerequisite for verifying this deliverable signed in.

## 5. Camera preset library

### 5.1 Why the current framing misbehaves

`camera-language.ts` derives `baseDistance` from a bounding box over performer
positions (`:80`), scales it by `SHOT_SIZE_MULTIPLIER` (`:40`, applied at
`:107`), and elevates by a fixed `ANGLE_ELEVATION_DEG` per angle (`:47`, applied
at `:120`). Distance is unbounded in both directions, so a wide eight-performer
line pushes the camera absurdly far and a solo pulls it absurdly close, while
elevation stays fixed regardless of distance and produces geometry that reads as
wrong. That is the "laughably weird" behavior.

### 5.2 What a preset is

A preset is a named camera recipe with explicit placement, a bounded fit policy,
and declared validity:

- **Placement** relative to the cast centroid: azimuth in degrees off the
  audience axis, elevation in degrees. Explicit values, not multipliers.
- **Fit policy**: dolly along the view axis until the cast's horizontal extent
  subtends a target fraction of the frame, then **clamp to a minimum and maximum
  distance in meters**. The clamp is what makes absurd framing unreachable, and
  it is the substantive fix.
- **Motion**: hold, dolly (from a wider starting fill to the target), or orbit
  (a bounded lateral arc at fixed radius and elevation).
- **Subject**: the group centroid, or a named performer.
- **Validity**: the formations the preset is offered for.

Presets are expressed in real units so they can be reasoned about and adjusted,
but they are not derived. Their numbers come from looking at frames.

### 5.3 The library

Six presets. The four existing ids are kept and retuned so saved films continue
to resolve; two are added.

| Id | Reads as | Offered for |
| --- | --- | --- |
| `front-lockoff` | Static, eye level, dead front | Every formation. The always-valid fallback. |
| `three-quarter` | Static, 35 degrees off axis, eye level | line, v-shape, diagonal, grid-2x2 |
| `high-reveal` | Elevated, shows the formation's shape | circle, grid-2x2, diagonal, v-shape |
| `hero-dolly-in` | Wide to medium on a named subject | solo, line, v-shape |
| `group-orbit` | Bounded lateral arc around the cast | circle, solo, grid-2x2 |
| `custom` | Author-supplied keyframes | Every formation. Unchanged escape hatch. |

`three-quarter` is added because dead-front flattens lines and V shapes, which
is most of what these films use. The rest map onto what exists.

### 5.4 What "guaranteed to be good" means

Guaranteed means **screenshot-approved for that combination**, not
formula-satisfied.

Every offered (preset, formation) pair is rendered and looked at at cast size 4,
plus at the extremes the formation supports (1 and 8 where valid). A pair that
does not produce a usable frame is either retuned until it does or removed from
that formation's offered list. The library ships only approved pairs.

The UI does not offer an unapproved combination. If a saved film requests one,
the resolver falls back to `front-lockoff`, which is valid everywhere, and the
control surface shows that a fallback was applied rather than silently
substituting.

Approvals are recorded as data next to the presets so the contract test in
section 8 can assert that every offered pair has one.

### 5.5 Validity is static-only

Presets approved in Phase 1 declare static-placement validity only. Travel does
not exist until Phase 2, and a preset cannot be verified against a moving cast
without trajectories and a subject-tracking policy. Phase 2 extends validity per
the camera subject contract in the umbrella spec; it does not inherit a
guarantee that was never tested.

## 6. Foot planting

`FilmDirectorScene.svelte:392` sets `enablePerformerLocomotion={false}`, which
`Viewer3DScene.svelte:700-701` feeds to both `enableLocomotion` and
`enableFootPlanting`. Phase 1 turns it on and evaluates what it fixes on its own.

The expected effect is better stationary foot contact, since the film's
performers do not move. It cannot produce stepping; `Viewer3DScene` never passes
`isMoving` or `moveSpeed`, which is Phase 2 work. If enabling it regresses
anything visually or costs frame rate, it goes back off and the finding is
recorded for Phase 2 rather than being worked around here.

## 7. Error handling

| Failure | Behavior |
| --- | --- |
| Patch would invalidate the document | Reject before applying, revert the control, toast. |
| Re-resolve throws | Keep the last good `film`, revert `sourceInput` to its prior value, toast. The scene never renders from a failed resolve. |
| Overwrite target no longer exists | Fall back to save-as-new, and say so in the toast rather than failing. |
| Save rejected by Firestore rules | Existing `filmCollectionState` error path and toast. |
| Saved film requests an unapproved preset combination | Resolve to `front-lockoff` and surface the substitution in the camera control. |
| Sequence referenced by an edit fails to load | Existing director sequence-library error path; the performer keeps its prior sequence. |

## 8. Testing

**Unit**

- Scene-scoped performer patch: sets the field on the right performer by id;
  leaves siblings untouched; materializes a `cast` default into an explicit
  performer without disturbing `defaults`.
- Freeze rule: overwriting a randomly-resolved value writes concrete values for
  every other randomly-resolved value in that scene and axis, and the resolved
  output for those performers is byte-identical before and after.
- Patch validity: an out-of-range `staffLengthCm` is rejected and the document
  is unchanged.
- Preset fit policy: distance hits the target fill where the clamp allows, and
  is clamped at both bounds for a one-performer and an eight-performer line.

**Contract**

- Every (preset, formation) pair the UI offers has an approval record.
- Every preset id referenced by the sample films in `_films/` resolves, so the
  retune does not break an authored film.

**Visual**

The screenshot matrix from section 5.4, at the viewports required by
`visual-verification-mandatory.md`. Per that rule and `fable-routing.md`, this
is hands-on work: it is not delegated, because the judgment is the deliverable.

## 9. Acceptance

The Phase 1 half of the Star target, composed without opening the JSON editor:

- The front performer's effect changes from `fire` to `led`.
- Its effort changes from `punch` to `linear`.
- Its avatar is selectable from within the scene.
- Its sequence is set to `D → J`.
- The film is saved over Star of Five, and the prior version is restorable.
- Every camera preset offered for Star's formation produces a usable frame.

The `D → J` sequence needs its ambiguity resolved before it is a fixture:
"one turn on every step" is not yet pinned to per hand motion, per transition,
or per beat, and the beta-south start is not yet shown to be jointly satisfiable
with it. That is settled with Austen during implementation, against MCP rather
than assumption, and the resulting sequence is pinned into the acceptance
fixture.

## 10. Out of scope

Travel and blocking, the `isMoving`/`moveSpeed` plumbing, travel-aware preset
validity, verbal specification of performer edits, the admin gate, and moving
the Director out of `src/routes/test/`. Those are Phases 0, 2, and 3.

## Related

- `active/2026-08-25-director-module-design.md` — the umbrella and its contracts
- `active/2026-08-24-film-collection-design.md` — the shelf and saved films
- `2026-08-23-film-director-directive-language-design.md` — the directive language
- `.claude/rules/never-hand-roll.md`, `.claude/rules/primitive-discovery.md`
- `.claude/rules/visual-verification-mandatory.md`, `.claude/rules/4k-native-layout.md`
