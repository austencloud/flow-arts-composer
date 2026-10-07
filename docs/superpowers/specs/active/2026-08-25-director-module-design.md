---
status: active
value: 5
effort: L
remaining: Reconcile Phase 0-3 Director child specs and prove the Star target end to end before closing this umbrella.
depends_on: 2026-08-20-stage-performance-runtime-design.md
plan_path: ''
tags:
- director
- film
- choreography
- 3d
- admin
last_triaged: '2026-10-07'
work_state: in-progress
---

# Director Module — Bird's-Eye Design

> Umbrella spec. It captures the whole vision, fixes the ownership lines and the
> phase order, and records the contracts the phases must honor. It does not
> contain implementation detail. Phases 0 through 3 each get their own design
> spec before they are built.

**Goal:** Turn the `/test/film-director` proof into a production admin module
where Austen describes a movie in words and the software performs it.

## 1. What this is

The Director builds **the movie**, not the set. Austen, 2026-08-25:

> "the point of this is not to build the scene but the point of this is to build
> the movie"

Its primary user is Austen, and its primary job is producing aesthetically
pleasing, narratable demonstrations of what the software can do. The long-range
target is unchanged from the directive-language work:

> "the ability to describe whatever I want to happen on stage however I want it
> to happen and have it happen"

Everything below serves that sentence.

## 2. Positioning and access

| Question | Decision |
| --- | --- |
| Public? | No. Premium capability, deliberately withheld for now. |
| Access for now | Admin only. |
| Where it lives | Its own tab in the 3D scenes module. |
| Name | Director. |
| Vocabulary | A **film** contains **scenes**; a scene has a **location**. Settled 2026-08-24; unchanged here. |

Holding it back is a positioning choice, not a readiness one. The gate is an
admin check, not an unfinished-feature flag.

"Premium" and "admin only" are different mechanisms. The initial release is
admin-gated. The architecture must not foreclose a later entitlement check, but
this spec does not require one to exist yet, and nothing may assume the admin
check is permanent.

## 3. Ownership

Film production divides this work, and the division mostly matches the
codebase's seams. The exception is the blocking layer, where the reusable asset
turned out to be narrower than it first appeared.

| Layer | Film role | Owner | Owns |
| --- | --- | --- | --- |
| The set | Production design | Scene Composer | Environment, set dressing, scene objects |
| The blocking domain | Choreography | `features/stage/domain` | Marks, travel sampling, easing, crab vs direct facing, beat-relative performance time |
| The movie | Directing | Director module | Cast, shots, camera, effects, editorial time, the film document |

`active/2026-08-20-stage-performance-runtime-design.md` already states that
Scene Composer "does not own performer placement or choreography."

**The Director consumes Stage's blocking domain. It does not hand films to
Stage's runtime.** This is a correction to the first draft of this spec, which
proposed compiling films into Stage marks and letting Stage perform them. The
audit in section 4 established why that seam is wrong:
`StageViewer.svelte:281-291` hardcodes `PlaneMode.WALL`, `PropType.STAFF` for
both hands, and `showEffects={false}`. Routing a film through Stage's viewer
would discard exactly the per-performer prop, effect, and plane control that the
film document exists to express.

The reusable asset is `stage-performance-sampler.ts`: a pure module with no
Svelte and no scene dependencies, which turns marks and a beat into
`StagePerformanceFrame`. The Director imports that and drives its own
`Viewer3DScene`, which already accepts per-performer `position` and
`facingAngle` (`Viewer3DScene.svelte:673-675`).

**One domain owner, two render hosts.** Stage keeps its own viewer as its own
preview. The Director keeps its own. Neither is dead code and neither is a
second source of truth, because they render different documents.

## 4. What is actually built

Audited 2026-08-25 against the tree, then adversarially reviewed. Each claim
below carries its evidence. The first draft of this spec got two of these wrong
in the optimistic direction and one in the pessimistic direction; the corrected
statements are what set the phase order.

### 4.1 Stage's production path runs end to end

Not "half-built." The full chain works:

`FormationOverlay` mutates marks (`FormationOverlay.svelte:75-104`) →
`sampleStagePerformance` (`stage-choreography-state.svelte.ts:298`) →
`StagePerformanceFrame[]` → `StageViewer.svelte:201-237` → `PerformerRig`
(`StageViewer.svelte:278-295`) with `enableLocomotion={true}`,
`enableFootPlanting={true}`, `isMoving`, and `moveSpeed`, plus body-local travel
intent through `runtime.setMoveInput(frame.moveDirection)`
(`StageViewer.svelte:236`).

Crab versus direct travel is implemented in `segmentFacing`
(`stage-performance-sampler.ts:91-102`). The "fan performers walk sideways while
facing front" requirement is solved code, not future work.

The module is registered in both app loading paths (`+layout.svelte:266`,
`ModuleRenderer.svelte:209`). Its 39 unit tests pass (`npm run test`, stage
suite, 10 files, verified 2026-08-25).

What Stage lacks is persistence, an external-input runtime API, and a
Director-facing orchestration boundary. Those are named in the dependency spec.

### 4.2 The motion-matching controller is a lab system, not Stage's runtime

`MmLocomotionController` lives under `features/stage/locomotion/motion-matching/`
but Stage's viewer does not import it. Its consumers are
`/test/mm-locomotion/+page.svelte:15-16` and `lab/tabs/dodge/DodgeTab.svelte:36-38`.
Stage's production path uses `PerformerRig`'s directional clip blending. Do not
cite the motion-matching directory as evidence of Stage readiness.

### 4.3 Foot planting is a disabled flag; travel intent is genuinely missing

`FilmDirectorScene.svelte:392` sets `enablePerformerLocomotion={false}`.
`Viewer3DScene.svelte:700-701` feeds that one value to both `enableLocomotion`
and `enableFootPlanting`, which `PerformerRig` forwards unchanged to `Avatar3D`,
where the planter is only constructed when the flag is true. Nothing overrides
it downstream.

But turning the flag on does not produce stepping. `Viewer3DScene` never passes
`isMoving` or `moveSpeed` to `PerformerRig`, and never calls `setMoveInput`. The
film gives performers static positions only. Enabling the flag should improve
stationary foot contact, which is plausibly the sliding Austen sees. It cannot
move a static root between locations. That plumbing is real Phase 2 work.

### 4.4 The camera has four presets, and they are formulas

`DIRECTOR_CAMERA_PRESETS` holds `front-lockoff`, `hero-dolly-in`, `high-reveal`,
`group-orbit`, and `custom` (`film-director-schema.ts:96-102`), with a default
selected at `resolve-film-director-spec.ts:665`. Saying the camera "has no
presets" was wrong.

What is true is that they resolve through a formula:
`baseDistance × SHOT_SIZE_MULTIPLIER[shotSize]`, elevated by
`ANGLE_ELEVATION_DEG[angle]`, with `baseDistance` derived from a bounding box
over performer positions (`camera-language.ts:40,47,80,107,120`). A formula
cannot know whether the frame it produced is good. That is why the framing is
unreliable, and it is what Phase 1 replaces.

### 4.5 Per-performer control is a UI gap for the Star parameters

`performerSchema` (`film-director-schema.ts:228-245`) already carries
`sequence`, `avatarId`, `prop`, `effect`, `effort`, `position`,
`facingDegrees`, `beatOffset`, `staffLengthCm`, and plane overrides. Every
parameter the Star target names is already in the document, reachable only by
editing JSON.

This claim is scoped to those parameters. The directive-language spec still owes
a capability sweep, so this spec does not assert that every renderer input is
speakable.

### 4.6 The film document has no travel model

`position` and `facingDegrees` are static per performer per scene. That absence
is the real Phase 2 scope.

### 4.7 The Director's domain is route-private

The film schema, resolver, state, camera language, viewer adapter, and scene
component all live under `src/routes/test/film-director/_lib` and `_components`.
The `_` prefix marks them private to the route, which is why a shipped feature
already declares a structural type rather than importing `FilmDirectorInput`
(`film-collection-types.ts:11-20`). Phase 3 is therefore an ownership
extraction with saved-film compatibility risk, not a mounting exercise.

## 5. Contracts this spec fixes

These are decisions, not implementation detail. The phase designs must honor
them or explicitly overturn them.

**Blocking is canonical inside the film.** A film's blocking section is the
authoritative representation. A film never references a Stage choreography
document and never stores a snapshot derived from one. Stage remains an
independent editor of its own documents. There is no round-trip and no conflict
authority to define, because the two never share an artifact.

**Placement frame.** A scene's blocking section declares its own stage
dimensions and authors marks in stage coordinates, so the sampler's existing
`stageToWorld` conversion (`stage-performance-sampler.ts:54-63`) applies
unchanged. When a scene carries blocking, the blocking section owns placement;
`position` and `facingDegrees` are the zero-travel shorthand and compile to a
single mark. A scene may not mix the two.

**Clock.** The Director owns editorial time in seconds. The blocking domain owns
beat-relative performance time. The scene's BPM is the only conversion, applied
at the boundary when sampling. Scene duration in seconds stays authoritative for
the film; a blocking section longer than its scene is truncated at the cut, not
the reverse.

**Camera subject over travel.** Once performers travel, a shot targeting a
performer or group must declare whether it tracks live sampled positions, fixes
the subject at shot start, or frames the union of the path. The Phase 2 design
picks one per preset. Phase 1 presets declare static validity only.

**Performer identity.** Blocking marks bind to performers by the film's own
performer `id`. Index-based correlation is not permitted, because cast changes
between scenes would silently reassign choreography.

## 6. Phases

Order: bridge contract, control surface, travel, productionization.

Phase 0 exists because the adversarial review was right that designing Phase 1's
ownership against an unaudited boundary was a risk. The audit is now done
(section 4), so Phase 0 is small: extract and settle, do not discover.

Integration stays last because it changes no hard part of the movie, but section
4.7 corrects the earlier claim that it is trivial.

### Phase 0 — Bridge contract

- Extract the Director's reusable domain out of route-private `_lib` far enough
  that a `src/lib/` feature can import it without inverting the dependency.
- Establish the sampler as a shared import for the Director, with the placement
  frame, clock, and identity contracts from section 5 encoded in types.
- Preserve saved-film compatibility across the move.

Success: the Director's document types and the blocking sampler are importable
from `src/lib/`, and every saved film still opens.

### Phase 1 — Control surface

Make every parameter the document already supports reachable without editing
JSON, and make the camera trustworthy.

- Per-performer editing inside the Director view, live, for the duration of the
  scene: avatar, prop, effect, effort, sequence, staff length, planes.
- Save the modified film as a new film **or** over the existing one.
- A curated camera-preset library replacing formula-derived framing. Each preset
  is named, hand-tuned, visually verified, and declares the conditions it is
  valid under: cast size, formation, and static placement. Fewer options, every
  one guaranteed. Presets are approved by screenshot, not derived.
- Turn foot planting on and evaluate what it fixes on its own (section 4.3).

Success: Austen composes the Phase 1 portion of the Star target without opening
the JSON editor, and every camera preset produces a usable frame at every
viewport in `visual-verification-mandatory.md`.

### Phase 2 — Travel

- Add the blocking section to the film document: stage dimensions, marks per
  performer per scene, walk style, easing.
- Sample it through `stage-performance-sampler` and drive the Director's own
  `Viewer3DScene`.
- Plumb `isMoving`, `moveSpeed`, and `setMoveInput` through `Viewer3DScene` to
  `PerformerRig`, which today it does not pass at all (section 4.3).
- Verbal specification of blocking, consistent with the existing directive
  language.
- Extend the camera presets with travel-aware validity per the subject contract
  in section 5.

Success: the Star target's line forms, with performers stepping rather than
sliding.

### Phase 3 — Productionization

- Mount the Director as an admin-gated tab in the 3D scenes module.
- Complete the ownership migration begun in Phase 0; retire or thin
  `/test/film-director`.
- Migrate the film collection to the module, preserving deep links.

Success: reachable in the app, admin only, with the saved-film shelf intact and
every previously saved film still opening.

## 7. The Star target (acceptance example)

Austen's stated target for the Star of Five film, recorded as the requirement in
his terms, with the criteria needed to make it testable.

**Phase 1 portion:**

- Front performer runs a simple sequence: `D → J`, starting at beta south, one
  turn on every step.
- Front performer's effect changes from `fire` to `led`. Fire is too visually
  intense for sustained viewing. Both are real effect ids
  (`effect-registry.ts:57-58`).
- Front performer's effort changes from `punch` to `linear`. Both are real
  `EffortId` values (`effort-types.ts:8-16`).
- The avatar is selectable from within the scene, on the page.

The sequence is not yet an executable fixture. `analyze_word_feasibility("DJ")`
confirms DJ is buildable and recommends the `smooth` preset, but that does not
prove the beta-south start and the per-step turn are jointly satisfiable, and
"one turn on every step" is ambiguous between per hand motion, per transition,
and per beat. The Phase 1 design resolves the ambiguity with Austen and pins the
generated sequence artifact into the acceptance fixture.

**Phase 2 portion:**

- The fan performers in front travel sideways.
- The performers in back travel forward.
- The front performer travels backward.
- All of them arrive in a line.
- Start and end locations are predefined, and the steps read as real steps.

"Arrive in a line" needs arrival beat, line order, spacing, and facing at
arrival before it can pass or fail. The Phase 2 design fixes those, along with
whether paths may cross and what walking speed is acceptable. Stage lists
impossible speed, path crossing, and collision as future work in the dependency
spec, so the first Star pass should choose paths that do not cross.

## 8. Risks and open questions

- **Curating camera presets is judgment work, not fan-out work.** Presets must
  be rendered and looked at. Per `fable-routing.md`, subagents cannot see the
  page; this is hands-on work.
- **Foot planting alone may not fix visible sliding.** The flag is worth turning
  on early precisely to find out how much is left.
- **Phase 0 touches saved films.** The film collection stores documents
  verbatim. Any type move must keep old documents opening.
- **Overwrite-in-place needs a decision** on whether prior versions are
  recoverable, whether the film id and any resolved random directives are
  preserved, and whether blocking is re-derived on save. Deferred to the Phase 1
  design.
- **A nested worktree sits inside this checkout** at
  `.claude/worktrees/optimistic-shaw-af2caf`, which global `CLAUDE.md` forbids
  because it falls inside the dev server's file watcher. It is clean, so nothing
  is at risk, but it belongs to another session and is not this spec's to
  remove.

## 9. What this spec does not decide

Component names, file layout, the blocking schema's shape, the preset data
structure, the admin gate mechanism, and migration detail. Each phase gets its
own design spec, brainstormed on its own, before any of it is built.

## 10. Review record

Adversarially reviewed 2026-08-25 by Codex against the tree. Accepted:
the camera-preset correction (4.4), the Stage readiness correction (4.1), the
motion-matching separation (4.2), the scoping of the parameter claim (4.5), the
route-private extraction cost (4.7), the coordinate and identity prerequisites
(section 5), the ownership table's timing contradiction (resolved by the clock
contract), the static-only validity of Phase 1 presets, and the Star target's
missing arrival criteria.

Rejected: the claim that Stage's verification is not reproducible. Run with the
repo's own config, all 10 stage test files and 39 tests pass. The reported
`protobufjs` import failure and the duplicate test discovery under
`.claude/worktrees/` were artifacts of invoking `vitest` without
`--config tests/config/vitest.config.ts`, not defects in the repo.

## Related

- `active/2026-08-20-stage-performance-runtime-design.md` — Stage runtime contract
- `active/2026-08-24-film-collection-design.md` — saved films, the shelf, deep links
- `2026-08-23-film-director-directive-language-design.md` — the directive language
- `archived/2026-05-25-stage-locomotion-design.md` — superseded, useful product research
- `.claude/rules/never-hand-roll.md`, `.claude/rules/effects-earn-their-slot.md`
