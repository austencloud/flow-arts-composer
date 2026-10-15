# Stage Locomotion & Formation Choreography Research

> **Historical survey, not current architecture.** This document records the
> 2026-05-25 research pass and contains recommendations that predate the gait
> clock, exact-step planner, terminal-transition work, authored turn clips, and
> Stage footfall handoff. Use
> [`docs/architecture/locomotion-research-canon.md`](../../../architecture/locomotion-research-canon.md)
> for current research, ownership, adoption status, dataset licensing, rejected
> assumptions, and verification requirements. Do not implement directly from
> the recommendations below.

> Research compiled 2026-05-25. Covers state of the art for beat-synchronized multi-performer locomotion in web-based 3D (Threlte/Three.js).

---

## 1. Root Motion vs. In-Place Animation

Two fundamental approaches to character movement in 3D:

### Root Motion

The animation clip itself drives character position via a dedicated root bone (typically above the hips). If a walk cycle covers 2 meters, the root bone translates 2 meters — the character physically moves through space as the animation plays.

**Characteristics:**
- Weight and momentum feel realistic (step length matches speed)
- Foot sliding eliminated by design
- Harder to blend with gameplay input (speed changes require animation retargeting)
- Requires root motion extraction at import time

**Engine support:**
| Engine | Root Motion Support |
|--------|-------------------|
| Unity | Native (`Apply Root Motion` toggle on Animator) |
| Unreal Engine | Native (Root Motion Mode on AnimMontage) |
| Godot | Native since 4.0 (RootMotionView) |
| Three.js | Manual extraction required — no built-in pipeline |
| Threlte | No native support — delegates to Three.js AnimationMixer |
| ezEngine | Dedicated root motion component with position + rotation extraction |

**Three.js root motion pattern:**
```
1. Load AnimationClip with root bone tracks
2. Each frame: read root bone position delta
3. Zero out root bone position in the clip
4. Apply position delta to the character's world transform
5. Play the zeroed-out clip (in-place visually) while world position updates
```

This is a manual process. The Three.js forum has discussed this since 2018 with no official utility. You must extract the root bone's `position` KeyframeTrack, compute per-frame deltas, then remove that track from the clip.

### In-Place Animation

Character animates "on a treadmill" — legs cycle but position stays at origin. A separate system (physics, input controller, pathfinding) moves the character transform. Animation is purely cosmetic.

**Characteristics:**
- Foot sliding is inherent (decoupled from actual movement)
- Easy to blend with variable-speed movement
- Works well for games where responsiveness > realism
- Standard approach in web 3D due to simpler implementation

**When to use which:**
| Criterion | Root Motion | In-Place |
|-----------|------------|----------|
| Realism of weight | High | Low |
| Responsiveness to input | Lower (animation-bound) | Higher |
| Foot sliding | None | Common |
| Implementation complexity (web) | High | Low |
| Beat sync feasibility | Natural (clip = timing) | Requires careful sync layer |

### Recommendation for TKA

Root motion is the better fit for beat-synchronized performer choreography because:
- Step timing is baked into the animation clip = trivial beat alignment
- Weight transfer feels physical and grounded
- Formation paths are pre-planned (not reactive to input), so root motion's responsiveness tradeoff is irrelevant

The extraction cost is a one-time import pipeline step.

---

## 2. Weight-Based Stepping / Motion Matching

### Motion Matching (Industry Standard 2020-2026)

Originally presented by Ubisoft at GDC 2016 ("Motion Matching and the Road to Next-Gen Animation"), now the dominant locomotion system in AAA games.

**How it works:**
1. Build a large motion capture database (thousands of frames of locomotion)
2. Extract "features" per frame: foot positions, joint velocities, trajectory (future path), facing direction
3. Store features in a matrix (N frames x M feature dimensions)
4. At runtime, query: "given my current pose and desired trajectory, which frame in the database is the best match?"
5. Transition to that frame with a short crossfade (inertialization blending)

**Key properties:**
- No state machine needed (the database IS the state space)
- Step length naturally scales with speed (the database contains walk, jog, run at various speeds)
- Transitions are seamless because you're always jumping to a real mocap frame
- Foot planting happens naturally (mocap data has grounded feet)

**Open-source reference implementation:**
- [orangeduck/Motion-Matching](https://github.com/orangeduck/Motion-Matching) — Daniel Holden's C implementation
- Compiles to WASM via emscripten, runs in browser at `localhost:8080/controller.html`
- Core search logic in `database.h`, controller in `controller.cpp`
- Demonstrates that web-based motion matching IS feasible via WASM

**Engine support (2025-2026):**
| Engine | Motion Matching |
|--------|----------------|
| Unreal Engine 5.7 | Native (PoseSearch plugin, GASP project) |
| Unity | Asset Store plugins (MotionMatching by JLPM22) |
| Godot | Community implementation (Aa20475 GSoC) |
| Three.js / Web | No native; orangeduck WASM demo proves feasibility |

**Recent research (2025):**
- "Environment-aware Motion Matching" (SIGGRAPH Asia 2025) — adapts to obstacles/agents
- "Utilizing Motion Matching with Deep Reinforcement Learning" — combines MM with RL for target tasks
- "Embracing Motion Matching: Using a Little to Get a Lot" (Unreal Fest Bali 2025)

### Foot IK / Ground Adaptation

Even with good animation data, foot IK is needed for terrain adaptation:

**Three.js IK options:**
| Library | Approach | Status |
|---------|----------|--------|
| [THREE.IK](https://github.com/jsantell/THREE.IK) | FABRIK solver, ball-joint constraints | Maintained, basic |
| [ADAPTIK](https://github.com/itspixxel/ADAPTIK) | Fully procedural locomotion | Experimental |
| Custom raycast + two-bone IK | Raycast from foot downward, solve hip/knee/ankle | Most common in Three.js |

**Standard foot IK pipeline:**
1. Raycast from each foot bone downward to terrain
2. Get terrain height at foot position
3. Two-bone IK solver adjusts hip and knee to reach terrain point
4. Hip bone translates vertically by average of both feet's terrain offsets
5. Foot rotation aligns to terrain normal

### How Three.js / Threlte Handle This

**Three.js animation blending for locomotion:**
- AnimationMixer supports multiple concurrent AnimationActions
- Each action has a `weight` (0-1) controlling influence on final pose
- `crossFadeTo()` smoothly transitions between clips
- `timeScale` controls playback speed per-action
- Speed parameterization: blend idle/walk/run by setting weights based on movement speed

**Threlte-specific:**
- `useGltfAnimations` hook — convenience wrapper for GLTF animation control
- `useTask` — frame loop hook for per-frame logic (where you'd drive locomotion)
- `@threlte/rapier` — physics integration for character controllers
- No dedicated locomotion system exists in Threlte

**Practical blend tree for web locomotion:**
```
Speed 0.0 → Idle (weight 1.0)
Speed 0.0-1.5 → Blend Idle→Walk
Speed 1.5 → Walk (weight 1.0)
Speed 1.5-4.0 → Blend Walk→Run
Speed 4.0+ → Run (weight 1.0)
```

This is implemented manually via AnimationAction weights and timeScale adjustments each frame.

---

## 3. Formation Choreography Systems

### Marching Band Formation Software

**Pyware 3D (industry leader since 1982):**
- Used for Super Bowl halftime, Olympics ceremonies, 90%+ college bowl games
- Core concept: "count-to-count" — view/edit any count of the drill at any time
- Morph feature: transitions by morphing existing formations
- Virtual Clinic: scans drill for excessive strides, collisions, sudden direction changes
- Spiral Tool, Follow-the-leader, Gate turns
- Perpetual license, $799-$1,274/year

**DrillWeaver (modern alternative, 2024+):**
- Cloud-based, real-time collaboration
- AI Drill Assistant for formation generation
- Automatic collision detection
- Step size feasibility checks
- Click-to-place waypoints + hold beats
- Transition effects: follow-the-leader, gate turn, pinwheel, scatter
- 3D field view with articulated walk cycle animation
- Facing interpolation + smooth stand-to-walk transitions
- AI-powered smart proximity matching
- Half the cost of Pyware

**Key concepts from marching band software:**
| Concept | Description | Relevance to TKA |
|---------|-------------|------------------|
| Count | A single beat position (formation keyframe) | Maps directly to TKA beat |
| Set | A formation at a specific count | Formation state at a beat |
| Transition | Movement between sets | Path between formation states |
| Step size | Distance per count (feasibility check) | Physical constraint on movement speed |
| Collision detection | Performers can't overlap | Multi-performer spacing |
| Facing interpolation | Which direction performers face during transition | Prop orientation |

### Dance Choreography Tools

**DanceForms 2 (by Credo Interactive / Character Motion):**
- 3D dance choreography with animated human figures
- Library of realistic dance movements
- Multi-dancer formations
- Music timeline synchronization
- Legacy desktop software (aging)

**Choreographic (modern mobile/web app):**
- 2D top-down stage editor
- Dot-based performer placement
- Smooth transition animation between formations
- Music upload with waveform beat matching
- Formation timing precision to 0.01s
- Color-coded sections for group management
- 3D preview of formations from any angle
- Custom stage dimensions (width, depth, side/backstage)
- Collision visualization during transitions

**DanceForm (open source):**
- Interactive 2D stage creator
- Formation/transition visualization
- Web-based (GitHub: anjalis-ingh/DanceForm)

### Formation Keyframing Patterns

All formation tools share this model:

```
Timeline: ──[F1]────────[F2]────────[F3]────────[F4]──
              │              │              │              │
              ▼              ▼              ▼              ▼
         Positions      Positions      Positions      Positions
         at beat 1      at beat 8      at beat 16     at beat 24
```

**Between keyframes, interpolation methods:**
| Method | Description | Use Case |
|--------|-------------|----------|
| Linear | Straight line, constant speed | Simple slides |
| Ease in/out | Acceleration/deceleration | Natural start/stop |
| Spline (Catmull-Rom) | Smooth curved path through waypoints | Flowing movement |
| Follow-the-leader | Performers follow a leader's path sequentially | Chain effects |
| Scatter | Random paths that converge on target | Organic transitions |
| Arc | Circular arc between positions | Pinwheel, gate turns |

**Collision avoidance during transitions:**
- Pyware: post-hoc analysis (Virtual Clinic scans for problems)
- DrillWeaver: real-time detection + AI-suggested fixes
- For web implementation: simple distance threshold check per frame during interpolation

---

## 4. Beat-Synchronized Locomotion

### Rhythm Game Approaches

**Core principle:** Movement is quantized to musical time, not wall-clock time.

**Architecture pattern:**
```
Audio Transport (BPM clock)
    │
    ├── Beat events (1, 2, 3, 4...)
    │       │
    │       └── Formation keyframes snap to beats
    │
    ├── Sub-beat events (eighth notes, sixteenths)
    │       │
    │       └── Step timing within transitions
    │
    └── Continuous progress (0.0 to 1.0 between beats)
            │
            └── Interpolation parameter for smooth movement
```

**Tone.js Transport (best-in-class for web audio sync):**
- Global transport with BPM control (`Tone.Transport.bpm.rampTo()`)
- Schedule events at musical positions ("1:2:0" = bar 1, beat 2)
- Repeating callbacks at intervals (every eighth note, every bar)
- `Tone.Draw` bridges audio thread → animation frame (solves timing drift)
- WebWorker-based scheduling for precision independent of frame rate
- Tempo-relative timing values ("4n" = quarter note, "8n" = eighth note)

**Step timing quantization:**
```
BPM = 120 → beat = 500ms
Performer must travel 3 meters in 4 beats (2000ms)
Speed = 1.5 m/s
Walk animation timeScale adjusted so foot-plant lands on beat
```

**Key insight from research:** Human natural walking tempo is ~120 BPM (2 steps/second). Music at 120 BPM allows 1:1 step-to-beat mapping. At 60 BPM, each beat = one full stride (left+right). At 240 BPM, movements must be subdivided or only hit every other beat.

### Easing Functions That Feel Musical

Standard easing categories mapped to musical feel:

| Easing | Musical Feel | Best For |
|--------|-------------|----------|
| `easeInOutCubic` | Legato (smooth, connected) | Flowing transitions |
| `easeOutBounce` | Staccato (percussive) | Hitting marks sharply |
| `easeInOutElastic` | Swing/groove | Jazzy, playful movement |
| `steps(N)` | Quantized (robotic) | Mechanical/locked timing |
| `easeOutQuart` | Decelerando | Arriving at a position |
| `easeInQuart` | Accelerando | Leaving a position |
| Custom sine-based | Breathing/pulsing | Sustained holds with life |

**Custom musical easing (cosine wave with decay):**
```javascript
// Spring-like settling that feels like landing on a beat
function musicalSettle(t, bounces = 2, decay = 4) {
  return 1 - Math.cos(t * Math.PI * bounces) * Math.exp(-t * decay);
}
```

**Step timing for beat sync:**
- Use `Math.floor(progress * steps) / steps` for quantized steps
- Or: compute sub-beat positions and ease between them
- Tone.js Transport gives you exact beat boundaries; ease within each beat window

### Music-Driven Locomotion Research (2025)

- "Music-Driven Legged Robots" (2025) — hierarchical architecture with phase tracker + oscillators + phase modulator for walking synchronized to external rhythms
- "SmoothSync" (2026) — dual-stream diffusion transformers for beat-synchronized gesture generation from quantized audio
- "A deep learning based framework for music-synchronized dance choreography with pose quantization" (2025) — K-means clustering for discrete pose codebook aligned to beats

---

## 5. Three.js / Threlte Specific Locomotion

### Three.js Animation System Capabilities

**AnimationMixer architecture:**
```
AnimationMixer (per character)
├── AnimationAction (idle)     → weight: 0.3, timeScale: 1.0
├── AnimationAction (walk)     → weight: 0.7, timeScale: 1.2
├── AnimationAction (run)      → weight: 0.0, timeScale: 1.0
└── AnimationAction (gesture)  → weight: 1.0, timeScale: 0.8
```

**Key methods for locomotion:**
- `action.setEffectiveWeight(w)` — blend influence (0-1)
- `action.setEffectiveTimeScale(s)` — playback speed
- `action.crossFadeTo(other, duration)` — smooth transition
- `mixer.update(delta)` — advance all actions by delta seconds
- `action.time` — current playback position (read/write)
- `action.setLoop(THREE.LoopRepeat, Infinity)` — looping
- `action.clampWhenFinished = true` — hold last frame

**Limitations:**
- No blend tree abstraction (manual weight management)
- No root motion extraction pipeline
- No speed parameterization (manual timeScale adjustment)
- No animation events/notifies (must poll `action.time`)
- No IK system built-in

### Mixamo Locomotion Assets

Mixamo provides free locomotion animations compatible with Three.js:

**Available locomotion clips:**
- Idle, Walk, Run, Sprint
- Walk/Run Forward, Backward, Left, Right
- Turn Left/Right (in-place)
- Start/Stop transitions
- Strafe walks

**Integration with Three.js:**
1. Download as FBX or glTF from Mixamo
2. Load via `GLTFLoader` (preferred for web)
3. Animations are in-place by default
4. Retarget to any Mixamo-rigged character

**Blend tree setup (manual in Three.js):**
```javascript
// 1D blend space: speed → animation weight
const speed = character.velocity.length();
const idleWeight = Math.max(0, 1 - speed / walkSpeed);
const walkWeight = speed < runSpeed 
  ? Math.min(1, speed / walkSpeed) 
  : Math.max(0, 1 - (speed - walkSpeed) / (runSpeed - walkSpeed));
const runWeight = Math.max(0, (speed - walkSpeed) / (runSpeed - walkSpeed));

idleAction.setEffectiveWeight(idleWeight);
walkAction.setEffectiveWeight(walkWeight);
runAction.setEffectiveWeight(runWeight);
```

### Threlte Extras for Character Movement

**Available in @threlte/extras:**
- `useGltfAnimations` — load and control GLTF animations
- `useGltf` — load GLTF models
- `<AnimatedSpriteMaterial>` — sprite sheet animation

**Available in @threlte/rapier:**
- `<RigidBody>` — physics body
- `<Collider>` — collision shapes
- Character controller via Rapier's KinematicCharacterController

**Threlte animation transitions example:**
- Official example at `threlte.xyz/docs/examples/animation/animation-transitions/`
- Demonstrates crossfading between clips using `useGltfAnimations`

**Missing from Threlte (must be custom-built):**
- Locomotion blend tree
- Root motion extraction
- Foot IK
- Formation pathfinding
- Beat synchronization layer
- Animation events/notifies

### Pathfinding Libraries for Three.js

| Library | Approach | Crowd Support | Status (2025) |
|---------|----------|---------------|---------------|
| [three-pathfinding](https://github.com/donmccurdy/three-pathfinding) | NavMesh A* | No | Maintained, basic |
| [three-pathfinding-3d](https://discourse.threejs.org/t/three-pathfinding-3d/86541) | Improved algorithms | No | New (Aug 2025) |
| [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) | WASM port of Recast/Detour | Yes (DetourCrowd) | Active, full-featured |
| [navcat](https://github.com/isaac-mason/navcat) | Pure JS navmesh | Yes (crowd API) | New (2025), lightweight |
| [Yuka](https://mugen87.github.io/yuka/) | Steering behaviors | No (individual agents) | Maintained |

**recast-navigation-js (recommended for crowd/formation):**
- WebAssembly port of industry-standard Recast Navigation
- `@recast-navigation/three` package for Three.js integration
- DetourCrowd module: agent collision avoidance, local steering
- Agent parameters: radius, height, maxAcceleration, maxSpeed, separationWeight
- Tiled navmesh support for large/dynamic scenes
- CrowdHelper for Three.js visualization

**navcat (newer alternative, 2025):**
- Engine-agnostic JavaScript navigation mesh library
- `navcat/three` utilities for Three.js integration
- Crowd API with animation hooks for off-mesh connections
- Pure JS (no WASM dependency)
- Graph-based pathfinding (nodes = polygons, links = connections)

**Yuka (steering behaviors):**
- Standalone AI library, works with Three.js
- Steering: Seek, Flee, Arrive, Pursuit, Wander, Interpose, Path Following
- Vehicle model with max speed, acceleration, turn rate
- No formation-specific behaviors built-in, but composable
- Could layer formation targets on top of individual steering

---

## 6. Bird's Eye Formation Editors (2D Top-Down Placement)

### Industry Patterns

**Marching band drill chart model (Pyware/DrillWeaver):**
```
┌─────────────────────────────────────┐
│              FIELD VIEW              │
│                                     │
│    ●1    ●2    ●3    ●4    ●5      │  ← Performers as dots
│                                     │
│         ●6    ●7    ●8             │
│                                     │
│              ●9                     │
│                                     │
└─────────────────────────────────────┘
         Count 1 of 64
```

**Core UI elements:**
| Element | Function |
|---------|----------|
| Grid overlay | Snap performers to grid positions |
| Dot = performer | Drag to position, color-coded by section |
| Timeline/count bar | Scrub through formations |
| Path lines | Show transition paths between formations |
| Ghost dots | Show previous/next formation positions |
| Collision indicators | Red highlight when performers are too close |

**Keyframing workflow:**
1. Set formation at count N (place all dots)
2. Advance to count N+M
3. Set new formation (move dots to new positions)
4. System interpolates between formations
5. Playback shows smooth movement
6. Adjust easing/paths per performer or group

### How Drill Software Handles Transitions

**Pyware approach:**
- Default: linear interpolation (straight line, constant speed)
- Morph: transform one shape into another (computed paths)
- Manual waypoints: add intermediate positions for curved paths
- Follow-the-leader: sequential offset timing

**DrillWeaver approach:**
- Click-to-place waypoints + hold beats
- Transition effects applied per-group:
  - **Follow-the-leader**: each performer follows the one ahead, delayed
  - **Gate turn**: performers pivot around an anchor point
  - **Pinwheel**: rotational movement around center
  - **Scatter**: random/organic paths to target positions
- AI assistance: "move section A to form a circle by count 16"

**Collision detection:**
- Per-frame distance check between all performer pairs
- Typical minimum distance: 2-3 steps (performer body width + clearance)
- Visual warning (red highlight) when distance < threshold
- DrillWeaver: AI suggests path adjustments to resolve collisions

### Formation Editor Architecture for Web

**Recommended architecture for a TKA formation editor:**

```
┌─────────────────────────────────────────┐
│ Formation Editor (2D Canvas/SVG)         │
│                                          │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │ Stage View   │  │ Timeline         │ │
│  │ (top-down)   │  │ (beat-aligned)   │ │
│  │              │  │                  │ │
│  │  ● ● ●      │  │ F1──F2──F3──F4  │ │
│  │    ● ●      │  │ ▲               │ │
│  │              │  │ playhead        │ │
│  └──────────────┘  └──────────────────┘ │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │ Properties                        │   │
│  │ • Transition: spline / linear     │   │
│  │ • Easing: easeInOut / steps       │   │
│  │ • Duration: 4 beats               │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
          │
          ▼ (data flows to)
┌─────────────────────────────────────────┐
│ 3D Viewport (Threlte)                    │
│ • Animated performers following paths   │
│ • Beat-synced locomotion animations     │
│ • Real-time preview                     │
└─────────────────────────────────────────┘
```

**Data model:**
```typescript
interface Formation {
  id: string;
  beat: number;              // musical position (beat number)
  positions: PerformerPosition[];
}

interface PerformerPosition {
  performerId: string;
  x: number;                 // stage coordinates
  z: number;                 // stage coordinates (y is up in 3D)
  facing: number;            // rotation in radians
}

interface Transition {
  from: Formation;
  to: Formation;
  interpolation: 'linear' | 'spline' | 'arc';
  easing: EasingFunction;
  waypoints?: Vec2[];        // intermediate points for curved paths
}
```

---

## 7. Recommended Architecture for TKA

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BEAT TRANSPORT                             │
│  Tone.js Transport → BPM clock → beat events                │
│  Tone.Draw → bridges audio thread to animation frame        │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│                 FORMATION SEQUENCER                            │
│  Formation[] → interpolate between keyframes per beat        │
│  Per performer: position(t), facing(t), speed(t)             │
│  Collision detection per frame                               │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│              LOCOMOTION CONTROLLER (per performer)             │
│  Input: target position + speed + timing                     │
│  Output: walk/idle blend weights, timeScale, root position   │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Blend Tree  │  │ Root Motion  │  │ Foot IK      │       │
│  │ idle/walk/  │  │ Extraction   │  │ (optional)   │       │
│  │ run weights │  │ (clip delta) │  │              │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│              THREE.JS / THRELTE RENDER                         │
│  AnimationMixer per performer                                │
│  useTask frame loop drives mixer.update(delta)               │
│  Skinned mesh + skeleton                                     │
└──────────────────────────────────────────────────────────────┘
```

### Recommended Approach

**For formation pathfinding:** Don't use navmesh. Formation choreography is pre-planned (not reactive AI). Use direct position interpolation with optional spline waypoints. Collision detection is a validation pass, not a pathfinding constraint.

**For locomotion animation:** Root motion clips from Mixamo, with delta extraction at load time. Blend tree (idle/walk/run) driven by computed speed from formation interpolation. TimeScale adjusted so foot-plants land on beat subdivisions.

**For beat synchronization:** Tone.js Transport as the master clock. Formation keyframes snap to beats. Interpolation progress derived from Transport position, not wall-clock delta. Tone.Draw for visual sync.

**For the formation editor:** 2D SVG/Canvas top-down view with drag-and-drop performer dots. Timeline aligned to beats (from audio waveform). Properties panel for transition type and easing. Live 3D preview in Threlte viewport.

### Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Audio/timing | Tone.js Transport | Sample-accurate scheduling, BPM control, Web Audio precision |
| Animation | Three.js AnimationMixer | Industry standard, blend weights, timeScale |
| Physics (optional) | @threlte/rapier | Only if terrain/collision needed |
| Pathfinding | None (direct interpolation) | Choreography is authored, not emergent |
| IK (stretch goal) | Custom two-bone solver or THREE.IK | Foot planting on uneven stage |
| Formation data | Custom keyframe system | Beat-indexed positions per performer |
| Editor UI | Svelte + SVG | Reactive, performant 2D editing |
| 3D preview | Threlte | Already in stack, declarative |

### Implementation Phases

**Phase 1: Formation data model + 2D editor**
- Define Formation/Transition interfaces
- Build SVG stage view with draggable dots
- Beat-aligned timeline with audio waveform
- Linear interpolation between formations
- Export formation sequence as JSON

**Phase 2: 3D locomotion controller**
- Load Mixamo walk/idle/run clips
- Build blend tree (speed → weights)
- Root motion extraction utility
- Drive performers along interpolated paths
- TimeScale sync to beat timing

**Phase 3: Beat synchronization**
- Integrate Tone.js Transport
- Formation keyframes snap to beat positions
- Interpolation progress from Transport.position
- Foot-plant timing aligned to sub-beats
- Tone.Draw for render sync

**Phase 4: Advanced transitions**
- Spline paths (Catmull-Rom through waypoints)
- Follow-the-leader (staggered timing offsets)
- Arc/pinwheel (rotational interpolation)
- Collision detection + visual warnings
- Musical easing presets

---

## Sources

### Motion Matching & Locomotion
- [orangeduck/Motion-Matching (GitHub)](https://github.com/orangeduck/Motion-Matching)
- [Motion Matching Web Demo](https://theorangeduck.com/media/uploads/CodeVsDataDriven/controller.html)
- [Motion Matching in Unreal Engine 5.7](https://dev.epicgames.com/documentation/unreal-engine/motion-matching-in-unreal-engine)
- [Environment-aware Motion Matching (SIGGRAPH Asia 2025)](https://arxiv.org/html/2510.22632v1)
- [LocoMotion Matching (Fab)](https://www.fab.com/listings/87d53674-265e-41ca-8634-5d782ed4abf0)
- [Embracing Motion Matching (Unreal Fest Bali 2025)](https://www.youtube.com/watch?v=FLDXtAV7qsw)

### Three.js Animation & IK
- [Three.js AnimationAction docs](https://threejs.org/docs/pages/AnimationAction.html)
- [Three.js AnimationMixer docs](https://threejs.org/docs/#api/en/animation/AnimationMixer)
- [Three.js Animation System manual](https://threejs.org/manual/en/animation-system.html)
- [Discover three.js - Animation System](https://discoverthreejs.com/book/first-steps/animation-system/)
- [THREE.IK (GitHub)](https://github.com/jsantell/THREE.IK)
- [ADAPTIK procedural locomotion (GitHub)](https://github.com/itspixxel/ADAPTIK)
- [Procedural Leg IK in Three.js + Rapier](https://discourse.threejs.org/t/procedural-leg-ik-in-three-js-rapier/91203)
- [Root motion forum discussion](https://discourse.threejs.org/t/looping-skinned-mesh-animation-with-root-motion/5116)

### Pathfinding & Navigation
- [recast-navigation-js (GitHub)](https://github.com/isaac-mason/recast-navigation-js)
- [@recast-navigation/three (npm)](https://www.npmjs.com/package/@recast-navigation/three)
- [navcat (GitHub)](https://github.com/isaac-mason/navcat)
- [navcat docs](https://navcat.dev/docs/)
- [three-pathfinding (GitHub)](https://github.com/donmccurdy/three-pathfinding)
- [Yuka AI library](https://mugen87.github.io/yuka/)

### Threlte & Svelte 3D
- [Threlte official site](https://threlte.xyz/)
- [useGltfAnimations docs](https://threlte.xyz/docs/reference/extras/use-gltf-animations)
- [Animation transitions example](https://threlte.xyz/docs/examples/animation/animation-transitions/)
- [3D character with Threlte (GitHub)](https://github.com/Zxce3/3D-character-with-threlte)
- [Smooth motion with Threlte (Subvisual)](https://subvisual.com/blog/posts/smooth_motion_with_threejs_and_threlte/)

### Formation & Choreography Software
- [Pyware 3D](https://www.pyware.com/)
- [DrillWeaver](https://www.drillweaver.com/)
- [Choreographic app](https://www.choreographic.app/)
- [DanceForms](https://www.charactermotion.com/danceforms/products.html)
- [DanceForm open source (GitHub)](https://github.com/anjalis-ingh/DanceForm)

### Beat Synchronization & Audio
- [Tone.js Transport wiki](https://github.com/tonejs/tone.js/wiki/Transport)
- [Tone.js official site](https://tonejs.github.io/)
- [Music-Driven Legged Robots (2025)](https://arxiv.org/pdf/2503.04063)
- [SmoothSync beat-synchronized gestures (2026)](https://arxiv.org/pdf/2601.04236)
- [Music-synchronized dance choreography (Nature, 2025)](https://www.nature.com/articles/s41598-025-21266-1)
- [Beat-synchronized walking research](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3707869/)

### Easing & Timing
- [Easing Functions Cheat Sheet](https://easings.net/)
- [GSAP Easing docs](https://gsap.com/docs/v3/Eases/)
- [CSS linear() easing (Chrome)](https://developer.chrome.com/docs/css-ui/css-linear-easing-function)
- [Motion.dev bounce easing tutorial](https://motion.dev/tutorials/js-bounce-easing)

### Mixamo & Animation Assets
- [Mixamo](https://www.mixamo.com/)
- [MCO Locomotion Animations guide](https://mocaponline.com/blogs/mocap-news/locomotion-animations-game-dev)
- [Synty Animation Base Locomotion](https://syntystore.com/products/animation-base-locomotion)

---

## 8. Editor Tooling & Libraries (added 2026-05-25)

Research into available npm packages and open-source tools for the formation editor UI.

### Timeline Libraries

| Library | Type | Verdict | Rationale |
|---------|------|---------|-----------|
| **`animation-timeline-js`** | Canvas-based timeline | **ADOPT** | Zero deps, keyframe markers, zoom/pan/snap, drag-select, virtual rendering. Wraps in Svelte ~100 lines. Replaces 1000+ lines of hand-rolled timeline. Stable ("done" software). |
| `@theatre/core` + `@threlte/theatre` | Full motion studio | Skip | AGPL license (infectious). Designed for cinematic animation, not beat-grid choreography. Stalled at v0.7. |
| `react-timeline-editor` | React component | Skip | React-only. Action blocks (duration), not point-in-time keyframes. |
| `wavesurfer.js` Timeline plugin | Audio waveform | Skip (for now) | Tightly coupled to audio. Useful LATER for music sync overlay, not as primary timeline. |

### SVG/Canvas Drag Libraries

| Library | Type | Verdict | Rationale |
|---------|------|---------|-----------|
| **Raw pointer events** | Native API | **USE** | `pointerdown/move/up` + `setPointerCapture` = ~30 lines. Codebase already uses this pattern (`UnifiedTimeline.svelte` scrubber). |
| `d3-drag` | SVG drag behavior | Candidate | 3KB, handles coordinate transforms through nested SVG groups. Only needed if overlay has complex viewBox transforms. |
| `@neodrag/svelte` | Svelte action | Skip | Applies CSS transforms — conflicts with SVG coordinate systems. Better for HTML elements. |
| `svelte-dnd-action` | List DnD | Already installed, wrong tool | Designed for sortable lists, not free-form 2D positioning. |

### Stage Canvas Libraries

| Library | Type | Verdict | Rationale |
|---------|------|---------|-----------|
| **SVG + pointer events** | Native | **USE** | Lightweight, Svelte-reactive, works with existing overlay pattern in codebase. |
| `Fabric.js` v7 | Interactive canvas | Evaluate for future | Multi-select, grouping, alignment tools, undo/redo built-in. 300KB. OpenMarch uses it. Overkill for v1 but worth considering for v2 when we need multi-select/group operations. |

### Camera Transition

| Library | Status | Verdict |
|---------|--------|---------|
| **`camera-controls`** | Already installed | **USE** — `setLookAt(pos, target, enableTransition)` handles smooth interpolation natively. `getState()`/`setState()` for save/restore. |
| `@threlte/extras` transitions | Already installed | Use for object enter/exit animations, not camera. |

### State-of-the-Art Feature Comparison

Features from Pyware/DrillWeaver/Choreographic that our v1 spec includes:

| Feature | Pyware | DrillWeaver | Choreographic | TKA v1 Spec |
|---------|--------|-------------|---------------|-------------|
| 2D top-down editor | Yes | Yes | Yes | Yes (SVG overlay) |
| Drag-to-place performers | Yes | Yes | Yes | Yes |
| Beat-aligned timeline | Yes (counts) | Yes | Yes | Yes (animation-timeline-js) |
| Formation presets | Yes | Yes | No | Yes (FormationSelector reuse) |
| Linear interpolation | Yes | Yes | Yes | Yes |
| Easing options | Yes | Yes | Limited | Yes (4 presets) |
| Walk style (crab/direct) | Yes (step type) | Yes | No | Yes |
| 3D preview | Yes | Yes (basic) | Yes (basic) | Yes (full Viewer3DScene) |
| Path visualization | Yes | Yes | Yes | Yes (dotted lines in overlay) |
| Collision detection | Yes (Virtual Clinic) | Yes (AI-assisted) | No | No (v2) |
| Curved paths | Yes (spline) | Yes (waypoints) | No | No (v2) |
| Follow-the-leader | Yes | Yes | No | No (future) |
| Gate/pinwheel turns | Yes | Yes | No | No (future) |
| Audio waveform sync | No | Basic | Yes | No (v2 — wavesurfer.js) |
| Multi-select/group | Yes | Yes | Yes (color-coded) | No (v2 — Fabric.js) |
| AI-assisted placement | No | Yes | No | No (future) |
| Custom stage dimensions | Yes | Yes | Yes | Yes |
| Facing direction control | Yes | Yes | Limited | Yes |
| Per-performer timing offset | Yes | Yes (follow-leader) | No | No (future) |

**V1 covers the core workflow.** The main gaps vs. state of the art (curved paths, collision detection, multi-select, audio sync) are documented as future extensions with specific library recommendations.

### Key Architectural Decisions Validated by Research

1. **Beat-grid timeline over keyframe curves** — all formation tools (Pyware, DrillWeaver, Choreographic) use count/beat-based timelines, not continuous keyframe curves. Formations happen AT beats.
2. **SVG overlay over separate 2D canvas** — Choreographic and DrillWeaver both use a lightweight 2D layer, not a heavy canvas library. Fabric.js is only needed when multi-select/grouping becomes a requirement.
3. **No navmesh pathfinding for v1** — all research confirms choreography is AUTHORED (pre-planned), not emergent. Direct interpolation + easing is the correct model. @recast-navigation only needed if obstacle avoidance becomes a requirement.
4. **camera-controls over custom camera animation** — already installed, already handles smooth transitions. Don't re-derive what's solved.
