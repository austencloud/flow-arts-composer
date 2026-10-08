---
status: archived
value: 3
effort: M
remaining: Use the Stage performance runtime spec for production locomotion; verify its prop-overlay and 3D preview acceptance there.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: superseded
---

# Stage Locomotion System — Design Spec

> **SUPERSEDED — 2026-08-20.** The Stage editor shell shipped, but its 3D
> preview remained a placeholder and motion matching remained lab-only. The
> production integration is governed by
> `active/2026-08-20-stage-performance-runtime-design.md`.
>
> Status lines below are retained as historical design input.


> Beat-synchronized multi-performer stage choreography with formation keyframing, root-motion locomotion, and overlay prop patterns.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Facing | Full body turns + plane switching | Architected from day one; spatial-lab plane transitions apply |
| Editor | Dedicated 2D stage editor + 3D preview | Drill-chart paradigm; every pro tool does this |
| Locomotion | Root motion + blend tree + beat-synced foot plants | Highest fidelity; existing RootMotionExtractor is foundation |
| Props during walk | Overlay (upper = props, lower = walk) | Props use independent PropState3D system already |
| Module | New 'Stage' feature module | Clean separation; own nav tab |
| Timing | Existing duration-aware beat system | Variable durations, BPM utils, time signatures already built |
| Data model | Choreography = composition (formations + sequence assignments) | Sequences unchanged; choreography references them |
| Build approach | Vertical slice (line → triangle, thin E2E) | Validates integration before deepening any layer |

---

## 1. Data Model

### StageChoreography (top-level document)

```typescript
interface StageChoreography {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;

  // Stage config
  bpm: number;
  timeSignature: TimeSignature;
  stageWidth: number;   // meters (default 10)
  stageDepth: number;   // meters (default 8)

  // Performers
  performers: PerformerSlot[];

  // Formation timeline
  formations: FormationKeyframe[];

  // What each performer plays
  sequenceAssignments: SequenceAssignment[];
}

interface PerformerSlot {
  id: string;
  index: number;
  avatarId: AvatarId;
  label: string;        // "P1", "P2", etc. or custom name
  color: string;        // hex color for 2D editor dot
}

interface FormationKeyframe {
  id: string;
  beat: number;         // position on beat timeline
  positions: PerformerPose[];
  transition?: TransitionConfig;
}

interface PerformerPose {
  performerId: string;
  x: number;            // stage-space meters (0 = stage left, stageWidth = stage right)
  z: number;            // stage-space meters (0 = downstage/audience, stageDepth = upstage)
  facing: number;       // radians (0 = toward audience, PI = toward backstage)
  planeMode?: Plane;    // null = inherit from previous keyframe or default
}

interface TransitionConfig {
  interpolation: 'linear' | 'ease' | 'spline' | 'arc' | 'follow-leader';
  easing: EasingId;
  waypoints?: Vec2[];
  staggerOffset?: number; // normalized 0-1 fraction of transition duration per performer index
}

interface SequenceAssignment {
  performerId: string;
  sequenceId: string;   // reference to persisted SequenceData by ID (never inline)
  startBeat: number;
  endBeat: number;      // required; editor enforces no overlaps per performer
  loop: boolean;
}
```

### Stage coordinate system

```
        AUDIENCE (z = 0)
  ┌─────────────────────────┐
  │                         │
  │  Stage Left    Stage Right
  │  (x = 0)      (x = W)  │
  │                         │
  │       UPSTAGE (z = D)   │
  └─────────────────────────┘
        BACKSTAGE
```

- X axis: stage left (0) to stage right (stageWidth)
- Z axis: downstage/audience (0) to upstage/backstage (stageDepth)
- Y axis: vertical (not used for formation placement; only for elevation if needed later)
- Facing 0 = toward audience (negative Z in 3D world space)

### Persistence

Firebase collection: `choreographies/{userId}/{choreoId}`

Sequences are referenced by ID, not embedded. This keeps choreography documents lightweight and lets sequences be reused across multiple choreographies.

---

## 2. 2D Formation Editor

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  StageEditorPanel (Svelte component)                │
│                                                      │
│  ┌────────────────────────────┐ ┌────────────────┐ │
│  │  StageCanvas (SVG)          │ │ Properties     │ │
│  │  - Grid overlay             │ │ - Transition   │ │
│  │  - Performer dots (drag)    │ │ - Easing       │ │
│  │  - Path lines               │ │ - Waypoints    │ │
│  │  - Ghost positions          │ │ - Per-performer│ │
│  │  - Collision warnings       │ │   overrides    │ │
│  └────────────────────────────┘ └────────────────┘ │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  BeatTimeline                                 │   │
│  │  [F1]━━━━━━━[F2]━━━━━━━━[F3]━━━━━━[F4]     │   │
│  │   ▲ playhead                                  │   │
│  │  Beat markers · Formation markers · Scrub     │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  SequenceAssignmentRail (per performer)       │   │
│  │  P1: [══Sequence A══]  [══Sequence B══]      │   │
│  │  P2: [═══════Sequence C═══════════]          │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### StageCanvas (SVG-based)

Why SVG over Canvas: SVG gives us native DOM event handling per element (drag, hover, click), CSS transitions, accessibility, and Svelte's declarative binding. No hit-testing math needed.

Elements:
- **Grid lines** — 1m intervals, subtle
- **Stage boundary** — outlined rect with "AUDIENCE" / "BACKSTAGE" labels
- **Performer dots** — `<circle>` with color fill, number label, draggable via pointer events
- **Facing indicators** — small arrow from dot center in facing direction
- **Path lines** — `<path>` connecting same performer across keyframes (dashed, color-coded)
- **Ghost dots** — Previous/next keyframe positions (dimmed, dashed stroke)
- **Collision zones** — Red ring when two performers < 1m apart

Interactions:
- Drag dot → update PerformerPose.x/z, live sync to 3D preview
- Right-click dot → facing angle picker (radial widget)
- Double-click empty space → add waypoint for selected performer's transition
- Shift+drag → constrain to axis

### BeatTimeline

Horizontal timeline synced to choreography beat count:
- Beat markers at regular intervals
- Formation keyframe markers (green, clickable to jump to that keyframe)
- Playhead (red line, draggable for scrubbing)
- Click empty beat → create new FormationKeyframe at that position
- Right-click keyframe marker → delete, copy, move

### SequenceAssignmentRail

Multi-track lane (one per performer):
- Colored blocks representing which sequence plays when
- Drag edges to resize (change start/end beat)
- Drop sequences from a picker/browser
- Gaps = performer holds last pose (or idle)

### Formation Presets

Built-in presets (from the playground):
- Line, Triangle, Diamond, Circle, V-Shape, Grid, Stagger, Cluster
- Apply preset → sets all performer positions for current keyframe
- Presets are parameterized by performer count and stage dimensions

### Validation

Real-time checks during editing:
- **Collision detection**: distance < 1m between any pair → visual warning
- **Step feasibility**: if distance / beats > max walking speed → warning "performer can't reach in time"
- **Max speed**: compute required m/s per performer per transition. Human walk ~1.5m/s, run ~4m/s. Flag transitions requiring > 4m/s.

---

## 3. Locomotion Controller

### Blend Tree

Speed-parameterized 1D blend space:

```
Speed 0.0 m/s      → Idle (weight 1.0)
Speed 0.0–1.5 m/s  → Blend Idle→Walk
Speed 1.5 m/s      → Walk (weight 1.0)
Speed 1.5–4.0 m/s  → Blend Walk→Run
Speed 4.0+ m/s     → Run (weight 1.0)
```

Implementation:
```typescript
interface LocomotionController {
  readonly mixer: THREE.AnimationMixer;
  readonly actions: {
    idle: THREE.AnimationAction;
    walk: THREE.AnimationAction;
    run: THREE.AnimationAction;
  };
  
  // Called per-frame by the stage module's useTask loop
  update(dt: number, targetPosition: Vec3, targetFacing: number): void;
  
  // Computed each frame from formation interpolation
  readonly currentSpeed: number;
  readonly isMoving: boolean;
}
```

### Root Motion Pipeline

Extends existing RootMotionExtractor (Phase 1 already built):

1. **Load time**: Import Mixamo walk/run FBX. Extract root bone position track. Compute `clipSpeed` (total root displacement / clip duration).
2. **Runtime**: 
   - Formation interpolation computes target position each frame
   - Compute required speed: `speed = distanceToTarget / remainingTime`
   - Set blend weights based on speed
   - Set `timeScale = speed / clipSpeed` so foot-plants match actual movement rate
   - RootMotionExtractor provides position delta → apply to performer world transform
   - Clamp: if actual root delta ≠ required movement (speed mismatch), blend between root delta and required delta

### Bone Masking (Upper Body Isolation)

Walk cycle must NOT drive upper body (arms, spine above T8):

```typescript
const LOWER_BODY_BONES = [
  'Hips', 'Spine', 'Spine1', // included for hip sway
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'
];

// After mixer.update(), zero out upper body bone transforms
// that came from the walk cycle, keeping only prop-state-driven poses
function maskUpperBody(skeleton: THREE.Skeleton, walkAction: THREE.AnimationAction) {
  // Store upper body rest poses
  // After mixer update, lerp upper body bones back to rest
  // Props are positioned independently by PropState3D system
}
```

**Decision: pre-split clips at import time.** Export walk clips from Mixamo, then strip upper body bone tracks in a build-time script → `walk_lower.glb` contains only lower body + hip sway tracks. Zero runtime masking overhead. Simpler, deterministic, no bone-weight blending edge cases.

### Beat-Synced Foot Plants

At 120 BPM, natural walk = 2 steps/second = 1 step per beat. The system ensures foot-plants land on beat subdivisions:

```typescript
function computeTimeScale(speed: number, bpm: number, clipStepsPerSecond: number): number {
  const beatsPerSecond = bpm / 60;
  const desiredStepsPerSecond = beatsPerSecond; // 1 step per beat at 1:1
  return desiredStepsPerSecond / clipStepsPerSecond;
}
```

When speed requires faster stepping than 1:1 beat mapping allows, foot-plants land on sub-beats (eighth notes at 2:1, sixteenths at 4:1).

---

## 4. Beat Synchronization

### Transport Integration

The Stage module shares the same beat transport as sequence playback:

```typescript
interface StageTransport {
  // Reads from existing AnimationPlaybackController's time position
  readonly currentBeat: number;      // fractional beat position
  readonly currentBeatInt: number;   // floor(currentBeat)
  readonly beatProgress: number;     // fractional part (0-1 within beat)
  readonly bpm: number;
  readonly isPlaying: boolean;
  
  // Formation-specific
  readonly activeFormation: FormationKeyframe;
  readonly nextFormation: FormationKeyframe | null;
  readonly transitionProgress: number; // 0-1 between formations
}
```

### Formation Interpolation

Each frame, compute each performer's target position:

```typescript
function interpolateFormation(
  from: FormationKeyframe,
  to: FormationKeyframe,
  progress: number, // 0-1
  transition: TransitionConfig
): PerformerPose[] {
  const eased = applyEasing(progress, transition.easing);
  
  return from.positions.map((fromPose, i) => {
    const toPose = to.positions[i];
    
    switch (transition.interpolation) {
      case 'linear':
        return lerpPose(fromPose, toPose, eased);
      case 'ease':
        return lerpPose(fromPose, toPose, eased); // easing already in `eased`
      case 'spline':
        return splinePose(fromPose, toPose, transition.waypoints?.[i], eased);
      case 'arc':
        return arcPose(fromPose, toPose, eased);
      case 'follow-leader':
        // staggerOffset is 0-1: fraction of transition each performer lags behind the previous
        const delay = (transition.staggerOffset || 0) * i;
        const staggeredProgress = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
        return lerpPose(fromPose, toPose, applyEasing(staggeredProgress, transition.easing));
    }
  });
}
```

### Facing Interpolation

Facing angle interpolates via shortest-arc rotation:

```typescript
function lerpFacing(from: number, to: number, t: number): number {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  return from + delta * t;
}
```

When facing changes cross a plane boundary (e.g., 0 → PI/2 = audience-facing to stage-right-facing), the plane mode transitions too. This maps to the spatial-lab body-turn system.

---

## 5. 3D Integration

### Connection to Existing Systems

```
StageChoreography (data)
    │
    ├── StageTransport (beat clock)
    │       │
    │       └── drives interpolateFormation() each frame
    │
    ├── PerformerManager (existing, from viewer-3d-state)
    │       │
    │       └── receives target positions per performer
    │
    ├── AvatarInstanceState[] (existing, per performer)
    │       │
    │       ├── sequence playback (unchanged — driven by SequenceAssignment)
    │       └── NEW: locomotion state (speed, isMoving, facing target)
    │
    └── LocomotionController[] (NEW, one per performer)
            │
            ├── AnimationMixer (walk/idle/run clips)
            ├── Blend tree weights
            ├── Root motion extraction
            └── Bone masking
```

### Stage3DPreview Component

A Threlte component embedded in the Stage module that renders the 3D preview:

```svelte
<!-- Stage3DPreview.svelte -->
<T.Group>
  {#each choreography.performers as performer, i}
    <PerformerAvatar
      position={interpolatedPositions[i]}
      facing={interpolatedFacings[i]}
      locomotionController={locomotionControllers[i]}
      avatarState={avatarStates[i]}
    />
  {/each}
  
  <StageFloor width={choreography.stageWidth} depth={choreography.stageDepth} />
  <StageGrid />
  <AudienceIndicator />
</T.Group>
```

### Prop State During Locomotion

The existing prop-state system already computes positions relative to avatar world transform:

```
Avatar world position (driven by locomotion)
    └── PropState3D.position (relative offset from avatar center)
        └── Final world position = avatar.position + propState.position
```

No changes needed to prop calculation. As the avatar walks, props move with it automatically because PropState3D is computed in avatar-local space.

Upper body masking ensures the walk cycle's arm bones don't interfere with the prop state system's positioning.

---

## 6. Module Structure

```
src/lib/features/stage/
├── components/
│   ├── StageModule.svelte          # top-level module (nav tab entry)
│   ├── StageEditorPanel.svelte     # 2D editor container
│   ├── StageCanvas.svelte          # SVG stage view
│   ├── BeatTimeline.svelte         # horizontal beat timeline
│   ├── SequenceAssignmentRail.svelte
│   ├── FormationPresetPicker.svelte
│   ├── TransitionProperties.svelte # right panel: easing, interp, waypoints
│   ├── PerformerPoseDot.svelte     # individual draggable dot
│   ├── PathLine.svelte             # transition path visualization
│   └── Stage3DPreview.svelte       # embedded 3D viewport
├── state/
│   ├── stage-choreography-state.svelte.ts  # reactive choreography document
│   ├── stage-editor-state.svelte.ts        # editor UI state (selection, tool mode)
│   ├── stage-transport.svelte.ts           # beat transport for stage playback
│   └── formation-interpolator.ts           # pure function: keyframes → positions
├── locomotion/
│   ├── locomotion-controller.ts    # blend tree + root motion + bone masking
│   ├── blend-tree.ts               # speed → animation weights
│   ├── bone-mask.ts                # upper body isolation
│   ├── foot-plant-sync.ts          # beat-aligned foot timing
│   └── clip-loader.ts             # Mixamo clip import + root extraction
├── services/
│   ├── choreography-persistence.ts # Firebase CRUD
│   ├── formation-validator.ts      # collision, feasibility checks
│   └── step-feasibility.ts         # can performer reach in time?
└── types/
    └── stage-types.ts              # all interfaces from Section 1
```

---

## 7. Implementation Phases

### Phase 1: Vertical Slice (Line → Triangle)

**Goal:** One working end-to-end demo: 4 performers walk from line formation to triangle formation on beat, with prop patterns playing throughout.

Tasks:
1. Define `StageChoreography` types in `stage-types.ts`
2. Build `formation-interpolator.ts` (linear interpolation between two keyframes)
3. Build minimal `StageCanvas.svelte` (SVG, 4 draggable dots, preset buttons for line/triangle)
4. Build minimal `BeatTimeline.svelte` (two formation markers, play button)
5. Build `locomotion-controller.ts` (load Mixamo walk clip, blend idle/walk, root motion)
6. Build `bone-mask.ts` (mask upper body from walk cycle)
7. Build `Stage3DPreview.svelte` (render 4 performers with locomotion)
8. Wire formation interpolation → locomotion → 3D render
9. Wire existing sequence playback (props overlay during walk)
10. Verify: 4 avatars walk from line to triangle on beat with props spinning

**Key risk mitigations:**
- Mixamo walk clip root motion extraction — test with a single avatar first
- Bone masking — verify prop positions aren't disturbed
- Beat sync — verify foot-plants land on beats visually

### Phase 2: Full Formation Editor

**Goal:** Complete 2D editor with all formation presets, multiple keyframes, and transition types.

Tasks:
1. All formation presets (8 types from playground)
2. Multiple keyframes on timeline (not just 2)
3. Transition config per keyframe (easing, interpolation type)
4. Ghost positions (previous/next keyframe)
5. Path lines (dashed, color-coded)
6. Collision detection + visual warnings
7. Step feasibility validation
8. Formation copy/paste, reorder, delete

### Phase 3: Sequence Assignment

**Goal:** Per-performer sequence assignment with visual rails.

Tasks:
1. SequenceAssignmentRail component
2. Sequence picker/browser (reuse from choreo-card module)
3. Drag-to-resize sequence blocks
4. Loop toggle per assignment
5. Gap handling (idle/hold-last-pose)
6. Multi-performer unison mode (all play same sequence)

### Phase 4: Advanced Locomotion

**Goal:** Full fidelity walking with run blend, curved paths, and musical easing.

Tasks:
1. Run clip integration (blend walk→run at high speeds)
2. Spline paths (Catmull-Rom through waypoints)
3. Arc transitions (circular interpolation)
4. Follow-the-leader (staggered timing)
5. Foot IK for uneven surfaces (stretch goal)
6. Turn-in-place animation (for facing changes without translation)

### Phase 5: Body Turns + Plane Switching

**Goal:** Full spatial-lab integration — facing direction changes trigger plane mode transitions.

Tasks:
1. Define plane transition rules (facing angle → effective plane mode)
2. Animate body rotation (smooth turn during locomotion)
3. Prop position recalculation when plane changes
4. Visual indicator in 2D editor showing which plane each performer is in
5. Transition animation for the "upstage arm becomes downstage arm" swap
6. Integration with spatial-lab's existing reachability analysis

### Phase 6: Persistence + Sharing

**Goal:** Save/load choreographies, share with other users.

Tasks:
1. Firebase persistence (choreographies collection)
2. Auto-save with debounce
3. Choreography browser/gallery
4. Export as video (integrate with existing render pipeline)
5. Share link (tka.run short code)

---

## 8. Technical Risks

| Risk | Mitigation |
|------|-----------|
| Root motion extraction produces jittery movement | Clamp deltas > threshold (already in RootMotionExtractor). Smooth with exponential average. |
| Walk cycle arm swing conflicts with prop positions | Bone masking isolates lower body. Alternatively, import walk clips with upper body stripped at asset level. |
| Beat sync feels mechanical (robotic steps) | Use effort easing system for transition interpolation. Musical easing > linear. Allow slight timing variance (±5% of beat). |
| Formation interpolation produces unnatural speeds | Validation: check m/s at design time. If distance/time > 4m/s, warn user. Auto-suggest adding intermediate keyframes. |
| SVG performance with 8 performers + paths + ghosts | SVG handles this easily (< 100 elements). If needed, switch to Canvas for > 16 performers. |
| Multiple sequence assignments fighting for the same performer | `endBeat` is required (not optional). Editor validates no overlaps per performer at edit time — overlap is a hard error, prevented by UI constraints (blocks cannot overlap on the rail). |

---

## 9. Dependencies

### External (new to project)
- Mixamo walk/idle/run animation clips (free, export as GLB)
- No new npm packages needed — Three.js AnimationMixer handles everything

### Internal (existing systems leveraged)
- `RootMotionExtractor` from `@austencloud/scene-3d` (Phase 1 complete)
- `PerformerManager` + `FormationManager` (multi-avatar stager)
- `AvatarInstanceState` (per-performer playback)
- `AnimationPlaybackController` (beat transport)
- `SequenceData` / `StepData` (sequence model)
- `PropState3D` + `calculatePropState()` (prop positioning)
- `TimeSignature` + duration-aware timing system
- Effort easing system (easing curves for transitions)
- Spatial Lab plane mode concepts (Phase 5)

---

## 10. Polish Backlog

Five bleeding-edge additions identified for after core system works. Each gets its own spec:

1. Inertialization blending (transition quality)
2. Procedural secondary prop motion (spring-based sway on walk)
3. Collision-avoidant path interpolation (active avoidance, not just warnings)
4. Tone.js audio transport (sample-accurate music sync)
5. Spine counter-rotation (natural shoulder-hip opposition)

Full details: `docs/superpowers/specs/2026-05-25-stage-locomotion-polish-backlog.md`

---

## 11. Success Criteria

### Phase 1 "Done" means:
- [ ] 4 performers visible in 3D, each with a numbered indicator
- [ ] Line formation → Triangle formation on button press
- [ ] Walking animation plays during transition (legs move, weight transfers)
- [ ] Foot-plants visually align to beats (within 50ms tolerance)
- [ ] Props continue spinning/patterns throughout the walk
- [ ] Upper body is NOT affected by walk cycle arm swing
- [ ] 2D editor shows performer dots at correct positions
- [ ] Dragging a dot in 2D updates 3D preview live
- [ ] Timeline shows two formation keyframes with playhead

### Full System "Done" means:
- [ ] 1-8 performers choreographed on a configurable stage
- [ ] Unlimited formation keyframes on beat timeline
- [ ] Multiple transition types (linear, ease, spline, arc, follow-leader)
- [ ] Per-performer sequence assignments with visual rail editor
- [ ] Body turns with plane mode switching
- [ ] Collision detection and step feasibility validation
- [ ] Save/load from Firebase
- [ ] Export choreography as video
