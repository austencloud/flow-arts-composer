---
status: backlog
value: 2
effort: S
remaining: Verify the Q-cycle and current performance harness against this spec before assigning remaining work.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Unified View Toggle + Performance Test Harness

> **DRIFT WARNING — 2026-08-02.** Q-cycle shipped exactly; perf harness never built
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-04-05
**Status:** Draft
**Scope:** Merge Q (2D/3D flip) and V (first/third person) into one Q-cycle, build an isolated-room performance harness

---

## Problem

Two separate keybindings control view modes:
- **Q** — toggles between 2D top-down and 3D (with a 1.5s camera flip animation)
- **V** — cycles between first-person and third-person while already in 3D

This is confusing. The user has to know which key does what, and V only works after Q has already put you in 3D. A single Q key cycling through all three views is simpler.

Additionally, the museum has no way to measure transition performance. When one isolated room renders fine but the full museum stutters, there's no tooling to find the tipping point.

---

## Design: Unified Q Toggle

### View Cycle

```
Q press:  top-down (2D) → first-person (3D) → third-person (3D) → top-down (2D)
```

Each press of Q advances one step. The cycle wraps.

### State Machine

```
TOP_DOWN ──Q──> FIRST_PERSON ──Q──> THIRD_PERSON ──Q──> TOP_DOWN
```

| Transition | Animation | Pointer Lock | Camera Owner |
|---|---|---|---|
| TOP_DOWN → FIRST_PERSON | 1.5s flip (existing) | Request on keypress | UCC (first-person) |
| FIRST_PERSON → THIRD_PERSON | Instant zoom-out | Keep locked | UCC (third-person) |
| THIRD_PERSON → TOP_DOWN | 1.5s flip-back (existing) | Release | Flip animation |

### Implementation

**DimensionFlipProof.svelte:**
- Remove the `isInFPS` boolean. Replace with `viewMode: "top-down" | "first-person" | "third-person"`.
- Q handler cycles: `top-down → first-person → third-person → top-down`.
- When transitioning `first-person → third-person`, call `cameraPreferences.setModeForDestination("museum", CameraMode.THIRD_PERSON)` and let UCC handle the switch. No flip animation needed.
- When transitioning `third-person → top-down`, capture camera state via `syncFpsFromCamera()` then start the flip-back animation.

**Museum3DScene.svelte:**
- Replace `fpsActive` boolean with the parent's `viewMode` prop.
- `fpsActive` becomes `viewMode !== "top-down"`.
- The `lastCameraMode` state is replaced by the parent's `viewMode`.
- UCC receives `allowedModes` based on current view: first-person mode only shows FP, third-person mode only shows TP. No internal V-key cycling.

**UnifiedCameraController.svelte:**
- V key handler: **disabled when in museum** (the museum controls its own mode cycle via Q). UCC's V key only applies in non-museum destinations.
- Add a prop `disableModeToggle?: boolean` that suppresses the V key handler. Museum passes `true`.

### V Key Removal (Museum Only)

V still works in other destinations (showroom, test scenes). Only the museum disables it because Q handles the full cycle there.

### Persisted State

`sessionStorage` key `museum-view-mode` stores the last view mode. On HMR restore, resume in the saved mode. On fresh load, start in `top-down`.

---

## Design: Performance Test Harness

### Goal

An isolated integration test that:
1. Creates a synthetic museum with N rooms
2. Renders it in a headless-ish Three.js context
3. Cycles through view transitions
4. Measures frame times, reports stutters
5. Scales up room count until performance degrades

### Approach: Vitest + Synthetic Grid (No Browser)

The test doesn't need a real renderer. It exercises the **geometry build pipeline** and **state transitions** that cause the freeze. The actual GPU work (shader compilation, texture upload) can't be measured in vitest, but the JS-thread blocking can.

### Test File: `tests/unit/museum/ViewTransitionPerformance.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { buildMuseumGeometry } from "$lib/features/museum/services/implementations/MuseumGeometryBuilder";

describe("View transition performance", () => {
  // Helper: build a grid with N rooms, each 10x10 tiles
  function makeNRoomGrid(n: number): MuseumGrid { ... }

  it("single room geometry builds under 100ms", async () => {
    const grid = makeNRoomGrid(1);
    const start = performance.now();
    const geo = await buildMuseumGeometry(grid);
    const elapsed = performance.now() - start;

    expect(geo.floorMeshes.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
    console.log(`1 room: ${elapsed.toFixed(1)}ms`);
  });

  it("5 rooms geometry builds under 500ms", async () => {
    const grid = makeNRoomGrid(5);
    const start = performance.now();
    const geo = await buildMuseumGeometry(grid);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    console.log(`5 rooms: ${elapsed.toFixed(1)}ms`);
  });

  it("full museum (31 wings) geometry builds under 2000ms", async () => {
    // Use the REAL museum grid, not synthetic
    const { buildMuseumGrid } = await import("$lib/features/museum/services/implementations/MuseumGridBuilder");
    const { MUSEUM_ROOMS, MUSEUM_EDGES, GRID_CONFIG } = await import("$lib/features/museum/data/museum-room-graph");
    const { grid } = buildMuseumGrid(MUSEUM_ROOMS, MUSEUM_EDGES, GRID_CONFIG);

    const start = performance.now();
    const geo = await buildMuseumGeometry(grid);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2000);
    console.log(`Full museum (${grid.wings.length} wings, ${grid.tiles.size} tiles): ${elapsed.toFixed(1)}ms`);
    console.log(`  Floor meshes: ${geo.floorMeshes.length}`);
    console.log(`  Wall meshes: ${geo.wallMeshes.length}`);
    console.log(`  Torches: ${geo.torchPositions.length}`);
    console.log(`  Plaques: ${geo.plaquePlacements.length}`);
  });

  // Progressive scale test — find the breaking point
  for (const roomCount of [1, 5, 10, 20, 50]) {
    it(`${roomCount} rooms: measure geometry build time`, async () => {
      const grid = makeNRoomGrid(roomCount);
      const start = performance.now();
      const geo = await buildMuseumGeometry(grid);
      const elapsed = performance.now() - start;

      console.log(`${roomCount} rooms (${grid.tiles.size} tiles): ${elapsed.toFixed(1)}ms, ${geo.floorMeshes.length} floor meshes, ${geo.wallMeshes.length} wall meshes`);
      // No hard assertion — this is a benchmark, not a pass/fail
      expect(geo.floorMeshes.length).toBeGreaterThan(0);
    });
  }
});
```

### What This Tests

| Metric | What It Catches |
|---|---|
| Geometry build time | JS-thread blocking during transition |
| Mesh count scaling | Whether batching stays efficient at scale |
| Tile count vs. time | Linear vs. quadratic scaling |
| Per-phase timing | Which phase (bucketing, floor, wall, ceiling) dominates |

### What This Does NOT Test

- GPU shader compilation time (needs a real renderer)
- Texture loading time (needs HTTP)
- Actual frame drops during animation (needs requestAnimationFrame)

For GPU-side testing, use Chrome DevTools Performance tab manually, or the Chrome DevTools MCP to capture a trace.

---

## Room-Based Streaming (Future, Level 2)

The performance harness will reveal the scaling curve. When it shows super-linear growth, the fix is room-based streaming:

1. Each room builds its own geometry chunk independently
2. A `RoomStreamingManager` tracks which rooms are loaded based on player position
3. Current room + adjacent rooms (connected by doors) are in the scene graph
4. Distant rooms are disposed and rebuilt on approach
5. The geometry builder already produces per-room data via the wing system — this is a natural extension

The harness makes it measurable. Build → measure → optimize → measure again.

---

## Files to Create/Modify

| File | Action |
|---|---|
| `DimensionFlipProof.svelte` | Replace `isInFPS` with `viewMode` state machine, unify Q handler |
| `Museum3DScene.svelte` | Accept `viewMode` prop, remove `fpsActive` boolean |
| `UnifiedCameraController.svelte` | Add `disableModeToggle` prop |
| `tests/unit/museum/ViewTransitionPerformance.test.ts` | New — performance harness |
| `MuseumGeometryBuilder.ts` | Add per-phase timing to progress callback |
