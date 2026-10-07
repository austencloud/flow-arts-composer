---
status: active
value: 2
effort: S
remaining: 'Shipped as a full 3D Threlte scene, directly contradicting the spec''s "pure 2D SVG, no Three.js" decision. No tests'
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Spatial Lab — Design Spec

> **DRIFT WARNING — 2026-08-02.** Shipped as a full **3D Threlte** scene, directly contradicting the spec's "pure 2D SVG, no Three.js" decision. No tests
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


## Goal

Interactive bird's-eye diagram tool for exploring how body rotation, plane splitting, and arm reachability interact in TKA's 3D space. Serves dual purpose: (1) modeling tool for the performer-relative planes system, (2) user-facing educational feature for understanding spatial concepts.

## Architecture

Standalone Svelte component rendered in a new lab tab. Pure 2D SVG — no Three.js dependency. Reads from `PropState3D` and `UserProportionsState` when in sequence mode; fully self-contained in sandbox mode.

### Components

```
SpatialLab.svelte              — top-level layout (canvas + side panel + status bar)
├── SpatialCanvas.svelte       — SVG viewport with drag handling
│   ├── BodyDiagram.svelte     — ellipse + shoulders + facing arrow + lock ring
│   ├── PropMarker.svelte      — draggable prop circle with label
│   ├── ArmLine.svelte         — dashed shoulder-to-prop line
│   ├── ReachEnvelope.svelte   — radial gradient arc per shoulder
│   ├── CrossingIndicator.svelte — pulsing dot at arm intersection
│   └── PlaneLines.svelte      — edge-on plane lines with grid points
├── SpatialControls.svelte     — side panel (view switcher, toggles, info, presets)
└── SpatialStatusBar.svelte    — reachability indicator + arm reach percentages
```

### State

```typescript
interface SpatialLabState {
  // Props
  leftPropPos: { x: number; y: number };
  rightPropPos: { x: number; y: number };

  // Body
  bodyRotation: number;        // degrees, 0 = facing audience
  bodyLocked: boolean;         // true = manual, false = auto-tracking

  // Derived (auto-computed)
  planeSplitActive: boolean;   // true when any prop behind body
  armsCrossing: boolean;       // true when arm lines intersect
  leftReachPct: number;        // 0-100+, distance as % of max reach
  rightReachPct: number;

  // View
  viewProjection: 'wall' | 'wheel' | 'floor';
  showReachEnvelopes: boolean;
  showArmLines: boolean;
  showCrossingAlert: boolean;

  // Mode
  mode: 'sandbox' | 'sequence';
  currentBeat?: number;        // sequence mode only
}
```

## Feature 1: Sandbox Mode

Manual exploration. User drags props to grid points, body auto-rotates (or is locked).

### Grid Points

Each plane has snap points at cardinal positions visible from the current view projection:
- **Floor view** (bird's eye): W, N/S (stacked), E along a horizontal line
- **Wall view** (front): W, N, E, S around a circle (standard TKA grid)
- **Wheel view** (side): N/S visible, E/W stacked

Grid points scale with `UserProportionsState.handPointRadius` when available.

### Auto Body Rotation

Body faces toward the **front-plane** prop midpoint. Props behind the body (y > body.y + threshold) get weight 0 in the midpoint calculation — they're "parked" and don't influence body facing. Only props on the front plane drive rotation.

```
weight(prop) = prop.y <= body.y + BEHIND_THRESHOLD ? 1.0 : 0.0
weightedMid = sum(prop.pos * weight(prop)) / sum(weight(prop))
targetAngle = atan2(weightedMid.x - body.x, -(weightedMid.y - body.y))
```

If all props are behind (both weights = 0), body holds its current angle.

Rate-limited to `MAX_ROTATION_SPEED` degrees per frame to prevent discontinuous flips. Body smoothly tracks through intermediate angles.

### Body Lock

Click body to toggle lock. When locked:
- Body stays at current angle regardless of prop positions
- Orange ring + arrow indicate locked state
- Props can be placed in "uncomfortable" positions (behind body)
- Useful for exploring what happens when performer extends behind without turning

When unlocked:
- Green arrow, no ring
- Body resumes auto-tracking toward front-plane midpoint

### Plane Split Detection

Automatic. When any prop's Y position exceeds `body.y + threshold`, plane 2 appears with its own grid points. When all props return to the front plane region, plane 2 disappears.

### Arm Visualization

**Arm lines:** Dashed lines from rotated shoulder position to prop position. Shoulder positions computed from body rotation angle + shoulder distance.

**Reach envelopes:** Radial gradient circles centered on each shoulder with radius = max arm reach. Dashed outline at the boundary. Shows where each arm can and can't go.

**Crossing detection:** Line-line intersection test on the two arm segments. When arms cross, pulsing yellow dot at intersection point with "CROSSING" label.

### Reach Metrics

Per-arm percentage: `distance(shoulder, prop) / maxReach * 100`. Color-coded:
- Green: ≤ 80%
- Yellow: 80–100%
- Red: > 100% (prop unreachable)

Status bar shows aggregate: "Both props reachable" / "Arms crossing" / "[Side] prop out of reach".

## Feature 2: Camera Projections

Three buttons switch the view between wall, wheel, and floor projections. Each projection:

1. Rotates which axes map to SVG x/y
2. Changes which grid points are visible vs stacked
3. Relabels the "free axis" (invisible from that camera angle)
4. Updates the bottom label describing what's visible

| Projection | SVG X maps to | SVG Y maps to | Free (invisible) axis |
|-----------|---------------|---------------|----------------------|
| Floor     | Stage X (L/R) | Stage Z (depth) | Y (height)         |
| Wall      | Stage X (L/R) | Stage Y (up/down) | Z (depth)        |
| Wheel     | Stage Z (depth) | Stage Y (up/down) | X (lateral)      |

Prop positions transform when switching projections — same 3D position, different 2D mapping. Body ellipse orientation rotates accordingly.

## Feature 3: Sequence Mode

Load a sequence, scrub through beats, see the bird's-eye view update per beat.

### Data Source

Reads from the same `PropState3D` that the 3D viewer uses. Each beat has:
- Left/right prop world positions
- Plane assignment per prop
- (Future) body yaw annotation

### Controls

- Beat scrubber (slider or arrow keys)
- Play/pause at sequence tempo
- Beat number + position readout in info panel

### Auto-Detection Display

Per beat, the system runs the four-case unreachability taxonomy:
1. **Grid position beyond arm reach** — reach envelope turns red
2. **Prop crossing behind body** — plane split auto-engages
3. **Both props same side** — crossing indicator appears
4. **Anatomical limit** — reach percentage shows strain

Each case gets a colored indicator in the info panel so the user can scrub through and see exactly where problems occur.

## Feature 4: Presets

Quick-load prop configurations that demonstrate key spatial concepts:

| Preset | L Position | R Position | Demonstrates |
|--------|-----------|-----------|-------------|
| Both at E | E, Plane 1 | E, Plane 1 | Spine twist engagement |
| Both at W | W, Plane 1 | W, Plane 1 | Opposite-side spine twist |
| L:W R:E | W, Plane 1 | E, Plane 1 | Wide split, no crossing |
| L:E R:W | E, Plane 1 | W, Plane 1 | Arm crossing |
| R Behind E | E, Plane 1 | E, Plane 2 | Body turn + plane split |
| L Behind W | W, Plane 2 | W, Plane 1 | Opposite-side body turn |
| Both Behind | W, Plane 2 | E, Plane 2 | Extreme case |
| Both N/S | N/S, Plane 1 | N/S, Plane 1 | Centered, no twist |

## Integration Points

### User Proportions

When `userProportionsState` is available, scale:
- `handPointRadius` → grid point distance from center
- `staffLength` → reach envelope radius
- `avatarScale` → body ellipse size

### Performer-Relative Planes (Future)

This lab is the modeling tool for the performer-relative planes system. Once that system is built:
- Sequence mode will show body turn annotations
- Auto-detection will use the four-case taxonomy
- Body rotation will reflect the actual performer-relative plane computation
- The lab becomes the debugging/visualization tool for the body turn pipeline

### 3D Viewer

No direct coupling. The lab is a standalone 2D tool. Sequence mode reads the same prop state data as the 3D viewer but renders independently.

## UI Design

### Layout

Full-width lab tab. SVG canvas takes ~70% width, side panel ~30%. Status bar at bottom.

### Theme

Dark background (#0a0a18 canvas, #12122a panels). Matches existing app dark theme. Blue for left prop, red for right. Green for healthy state, yellow for warning, red for error. Orange for locked body state.

### Interactions

- **Drag** props to reposition (snap to grid on release)
- **Click** body to lock/unlock rotation
- **Toggle** visualization layers via side panel switches (button + toggle-indicator pattern, no checkboxes)
- **Click** presets for instant configurations
- **Click** view buttons to switch camera projection
- **Scrub** beat slider in sequence mode

## Scope

### Phase 1 (This Implementation)

- Sandbox mode with floor view only
- Draggable props with grid snapping
- Auto body rotation with lock/unlock
- Auto plane split detection
- Arm lines + reach envelopes + crossing detection
- Presets
- Info panel with live metrics
- Status bar

### Phase 2 (Follow-up)

- Wall and wheel camera projections (actual coordinate transform, not just label change)
- Sequence mode (load sequence, beat scrubber, play/pause)
- Auto-detection taxonomy display per beat

### Phase 3 (After Performer-Relative Planes)

- Body turn annotations from sequence data
- Full performer-relative plane computation
- Debugging overlay for the body turn pipeline

## File Structure

```
src/lib/features/spatial-lab/
├── components/
│   ├── SpatialLab.svelte
│   ├── SpatialCanvas.svelte
│   ├── SpatialControls.svelte
│   ├── SpatialStatusBar.svelte
│   ├── canvas/
│   │   ├── BodyDiagram.svelte
│   │   ├── PropMarker.svelte
│   │   ├── ArmLine.svelte
│   │   ├── ReachEnvelope.svelte
│   │   ├── CrossingIndicator.svelte
│   │   └── PlaneLines.svelte
│   └── controls/
│       ├── ViewSwitcher.svelte
│       ├── VisualizationToggles.svelte
│       ├── InfoPanel.svelte
│       └── PresetGrid.svelte
├── state/
│   └── spatial-lab-state.svelte.ts
├── services/
│   ├── body-rotation-solver.ts
│   ├── reach-calculator.ts
│   ├── crossing-detector.ts
│   └── plane-split-detector.ts
└── index.ts
```

## Testing

Unit tests for pure computation:
- `body-rotation-solver.test.ts` — target angle from prop positions, rate limiting, front-plane weighting
- `reach-calculator.test.ts` — shoulder position from body rotation, distance to prop, reach percentage
- `crossing-detector.test.ts` — line-line intersection, edge cases (parallel, coincident, near-miss)
- `plane-split-detector.test.ts` — behind-body threshold, split activation/deactivation
