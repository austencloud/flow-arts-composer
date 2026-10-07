---
status: active
value: null
effort: null
remaining: "Verify Stage 3D Performance Studio against the current Stage 3D Performance Studio runtime and acceptance criteria before resuming implementation. Prior recorded remainder: Verify Stage document, workspace, and viewer ownership plus remaining scope against current 3D studio runtime."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Stage 3D Performance Studio

**Date:** 2026-08-20  
**Status:** Active, core architecture implemented

## Product boundary

Stage is the first-class 3D performance authoring module. It owns the work of
combining a cast, formation, environment, and multiple sequence clips into one
performance on a shared beat clock.

The 3D Viewer is a direct standalone viewing surface. It is not a Sequence
Viewer route wearing different chrome. Sequence Viewer may embed the shared 3D
runtime as one reduced render mode, but it does not own the standalone viewer
or the Stage studio.

## One 3D runtime, three products

```text
shared/3d runtime and controls
├── Stage module
│   ├── multi-performer authoring
│   ├── per-performer sequence clip lanes
│   ├── formations and environment setup
│   └── one Stage playhead
├── standalone 3D Viewer
│   ├── direct 3D canvas
│   ├── performer dock
│   ├── vertical scene-control rail
│   └── playback timeline
└── Sequence Viewer 3D mode
    └── reduced embedded consumer of the same runtime
```

No surface may introduce a second performer rig, environment lifecycle,
formation renderer, or 3D control implementation.

## Stage document

`StageChoreography` is the authoring document. Each performer owns an ordered
list of `StageSequenceClip` records:

```ts
interface StageSequenceClip {
  id: string;
  sequenceId: string;
  label: string;
  startBeat: number;
  durationBeats: number;
  sourceBeatCount: number;
  loop: boolean;
}
```

The Stage playhead is authoritative. At any beat, each performer independently
resolves its active clip and source-sequence progress. Adjacent clip boundaries
resolve to the new clip. Empty lane regions resolve to no active sequence.
Movement marks and sequence clips share the same beat space, so play, pause,
seek, drag, and resize remain deterministic.

`sharedSequenceId` is migration input only. New authoring writes performer clip
lanes.

## Stage workspace

The scene receives the full module width. The timeline is a vertically
resizable lower workspace, not a second permanent sidebar. It contains:

- one lane per performer;
- draggable and resizable sequence clips;
- library sequence insertion at the playhead;
- clip selection, loop, removal, and keyboard movement;
- shared transport and BPM primitives;
- one playhead across every lane.

Formation editing and Stage setup live in a compact top-right rail. Stage setup
opens as a bounded floating inspector on large screens, a full workspace
overlay on phones, and a full-height dock on short landscape screens. The
inspector composes the established performer, formation, and scene controls.

## Standalone 3D Viewer

`/lab/viewer-3d` mounts the 3D viewer state and `Viewer3DFullscreen` directly.
It must not import `SequenceViewerOrchestrator`, `SequenceViewerShell`, or
Sequence Viewer chrome. Its native HUD is:

- the shared performer dock on the left;
- the shared scene-control rail on the right;
- immersive and exit actions at the top;
- the shared playback timeline at the bottom.

The viewer owns real playback state, including BPM, play/pause, seek, wrapping,
and fractional step progress.

## Ownership

| Concern | Owner |
| --- | --- |
| Stage document, clip lanes, formation marks, Stage playhead | `features/stage` |
| Performer rigs, environments, cameras, 3D control surfaces | `shared/3d` and `@austencloud/scene-3d` |
| Generic fullscreen behavior | `shared/fullscreen` |
| Shared transport and BPM controls | `shared/animation-engine` |
| Timeline ruler presentation | established Compose timeline primitive |
| Sequence Viewer route chrome and sharing actions | `shared/sequence-viewer` |

## Responsive contract

- Desktop, ultrawide, and 4K keep the scene dominant and the timeline legible.
- Tablet portrait moves transport below the title row and removes compressed
  BPM chips.
- Phone keeps 48px controls, a horizontally scrollable clip canvas, and a
  full-height scrollable setup overlay above the primary navigation.
- Short landscape keeps the scene visible while setup uses a bounded
  full-height dock.
- The standalone viewer offsets its sequence identity around the performer
  dock and keeps both control rails reachable.

## Verification contract

Automated coverage must prove clip boundary sampling, looping, gaps, Stage
state isolation, editing operations, fullscreen ownership, and the absence of
Sequence Viewer imports from the standalone viewer.

Runtime verification uses the production scenes at 1920×1080, 2560×1440,
3840×2160, 1440×900, 820×1180, 960×412, and 375×667. It exercises the setup
panel, native HUD, and console at both desktop and phone sizes.

## Remaining scope

- Persistence and migration for saved Stage documents.
- User-authored clip labels, duplication, and multi-select editing.
- Waveform or pictograph thumbnails inside clips when they remain readable.
- Collision and impossible-travel warnings across performers.
- Stage-specific export and share flows built on the finished document model.
