---
status: backlog
value: 2
effort: M
remaining: Item 1 (inertialization) shipped; items 2-5 unbuilt
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: in-progress
---

# Stage Locomotion — Polish Backlog

> **DRIFT WARNING — 2026-08-02.** Item 1 (inertialization) shipped; items 2-5 unbuilt
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


> Bleeding-edge additions identified during initial design. Each deserves its own spec after the core system works.

## 1. Inertialization Blending

Replaces standard crossfade for idle→walk→run transitions. Instead of blending two poses (causes double-stepping), applies a decaying offset to the new animation. Naughty Dog introduced it; now AAA standard. ~100 LOC custom on top of Three.js AnimationMixer.

**When:** After Phase 1 locomotion controller works.

## 2. Procedural Secondary Prop Motion

Spring-based dampened oscillation on props during locomotion. Each foot-plant triggers a subtle bounce/sway on PropState3D. Makes walking feel alive rather than stiff.

**When:** After Phase 1 prop overlay is verified.

## 3. Collision-Avoidant Path Interpolation

Replace post-hoc collision warnings with active path adjustment. Apply repulsion force during formation interpolation when performers get within 1.5m. Performers smoothly curve around each other. Recast-navigation-js DetourCrowd available but simpler repulsion field may suffice.

**When:** After Phase 2 multi-keyframe transitions work.

## 4. Tone.js Audio Transport

Abstract the timing interface so Tone.js Transport (Web Audio clock) can replace rAF-based transport as master clock. Eliminates audio/visual drift when music plays alongside choreography. Sample-accurate beat events.

**When:** When music playback is added to Stage module.

## 5. Spine Counter-Rotation

Natural walking has shoulder-hip counter-rotation (right shoulder forward when left hip advances). Pre-split lower-body-only clips lose this. Procedural sin wave on spine bones synced to step cycle phase adds realism without upper body animation tracks.

**When:** After Phase 4 advanced locomotion.
