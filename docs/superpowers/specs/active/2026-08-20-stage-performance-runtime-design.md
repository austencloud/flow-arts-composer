---
status: active
value: null
effort: null
remaining: "Verify Stage Performance Runtime against the current Stage Performance Runtime runtime and acceptance criteria before resuming implementation. Prior recorded remainder: Verify runtime clock, stage-space mapping, sequence resolution, and uncompleted follow-up order."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Stage Performance Runtime

**Date:** 2026-08-20  
**Status:** Active, first production vertical slice implemented and verified

## Outcome

Stage choreography drives the production 3D performer rig. A performer can
travel between authored marks while a real TKA sequence continues through the
same hands, props, body, and environment hierarchy used by the regular 3D
viewer.

The first slice proves the final ownership seam. It does not introduce a second
avatar loader, a Stage-specific locomotion controller, or a new 3D environment.

## Supersedes and corrects

- `2026-05-25-stage-locomotion-design.md` remains useful product research, but
  its drift banner is incorrect: the editor shell shipped; the production 3D
  performance runtime did not.
- `2026-05-25-stage-choreography-v2-design.md` correctly chose shared 3D
  infrastructure, but its proposed `Viewer3DScene` wrapper was never completed.
- `2026-06-16-reorient-stepping-design.md` is not a dependency of this work.
  The current motion-matching controller is a lab system, while the production
  `PerformerRig` already owns locomotion, directional gait, foot planting, prop
  anchors, and arm IK.
- Scene Composer remains the set-dressing owner. It does not own performer
  placement or choreography.

## Ownership

| Concern | Owner |
| --- | --- |
| Marks, beat timing, formations, sequence assignments | `features/stage` |
| Deterministic sampling of an authored playhead | `features/stage/domain` |
| Performer lifecycle and sequence-to-prop conversion | shared avatar instance state |
| Body locomotion, directional clips, foot planting, arm IK | `@austencloud/scene-3d` `PerformerRig` |
| Environment selection, playable surface, coordinate alignment | shared `Environment3D` |
| Scene object/set placement | Scene Composer |

## Runtime contract

The editor model stays in stage coordinates: X runs left to right and Z runs
upstage to downstage in the top-down editor. The sampler converts that space to
a world frame centered at the 3D origin.

Every sampled performer frame contains independent intent:

```ts
interface StagePerformanceFrame {
  performerId: string;
  stagePosition: { x: number; z: number };
  worldPosition: { x: number; z: number };
  bodyFacing: number;
  travelDirection: { x: number; z: number };
  moveDirection: { x: number; z: number };
  speedMetersPerSecond: number;
  isMoving: boolean;
  activeMarkIndex: number;
  transitionProgress: number;
}
```

`travelDirection` is world-space path direction. `moveDirection` is the same
vector transformed into body-local space for forward, backward, and strafe
clip blending. `bodyFacing` is separate because a sequence may require the
performer to face the audience while traveling sideways.

Direct travel defaults `bodyFacing` to the path heading. Crab travel preserves
the authored performance facing. A later schema revision adds explicit facing
controls to every mark without changing the runtime frame.

## One clock

The Stage playhead is authoritative for:

- mark interpolation;
- world position and facing;
- movement speed and gait direction;
- sequence beat and sub-beat progress.

Avatar playback does not start a second requestAnimationFrame clock. Stage
sets the avatar beat and progress from the choreography playhead. This makes
position and prop pose deterministic under play, pause, and seek.

The existing locomotion mixer still owns foot-cycle phase in the first slice.
Deterministic foot phase during arbitrary scrubbing is a fidelity follow-up,
not a reason to delay the production integration.

## Sequence resolution

Choreographies reference sequences by ID. The first slice defaults to the
existing baked TnD catalog proof sequence so the Stage opens with real product
motion and remains usable without Firestore. User/library IDs resolve through
the shared sequence data provider. A failed resolution produces a visible,
retryable error; it never substitutes fabricated motion.

## Scene composition

```text
StageViewer
  Scene3D
    Environment3D
    PerformerRig[]
      Avatar3D locomotion
      prop anchors
      arm IK
```

`Environment3D` remains the only environment lifecycle owner. The environment
receives the authored stage dimensions so its native platform grows under the
whole choreography. Performer roots use the canonical stage coordinate frame,
so changing scenery cannot move the performance vertically.

No static scene geometry is created by this feature. Existing Blender-backed
and established environment scenes are composed as-is.

## Vertical slice

The first production slice includes:

1. a pure, tested sampler for position, easing, facing, local gait direction,
   and meters-per-second speed;
2. Stage state distributed through factory + context rather than a global
   singleton;
3. a real 3D preview using `Scene3D`, `Environment3D`, and `PerformerRig`;
4. one shared real sequence synchronized to the Stage playhead;
5. a default line-to-formation path so walking and spinning are visible on
   first play;
6. a retryable sequence-load failure state;
7. direct and crab gait input reaching the package locomotion owner.

The sampler and renderer support the current 2–8 performer document. The
initial proof is judged on one performer end to end; supporting the whole cast
through the same iteration is cheaper and prevents a temporary single-avatar
renderer from becoming another owner.

## Follow-up order

1. Explicit per-mark body facing and facing interpolation.
2. User-facing shared-sequence assignment, then per-performer assignments.
3. Stride, impossible-speed, path-crossing, and body/prop collision warnings.
4. Persistence with schema versioning and migration.
5. Deterministic foot phase, curved paths, motion warping, and avoidance.
6. Re-evaluate true motion matching only after a production locomotion corpus
   and pose-search database exist.
7. Body Conductor may eventually author stance and performance-facing intent;
   it must not take ownership of world travel.

## Risks

- Root-motion clips must not translate an authored performer root.
- Sequence turn intent must not be overwritten by path-facing rules.
- Easing changes instantaneous speed; the sampler must provide the derivative,
  not only average segment speed.
- Multiple rigs are expensive to mount simultaneously; the package mount queue
  remains in charge.
- Formation preset geometry currently has shared and Stage-local owners. This
  slice does not expand that duplication.
- A paused Stage must not leave avatars walking in place.

## Verification contract

### Automated

- Stage-space positions map to a centered world frame.
- Direct travel faces and walks along the path.
- Crab travel preserves body facing and produces body-local strafe input.
- Easing affects both position and instantaneous speed.
- Holds and completed paths report idle with zero speed.
- Seeking the same beat twice returns an identical frame.
- Existing Stage editing, 3D viewer, and coordinate-frame tests remain green.

### Runtime

Using a task-owned Chrome DevTools tab:

- play the default choreography and observe real prop motion during travel;
- pause and confirm performers stop walking without changing position;
- scrub and confirm world position and prop pose follow the playhead;
- switch between orbit and top-down editing without losing state;
- inspect hand-to-prop contact during locomotion;
- confirm the environment platform meets the performers' feet;
- confirm no Svelte, WebGL, or asset-loading errors in the console;
- capture the required desktop, 4K, tablet, short-wide, and phone viewports.
