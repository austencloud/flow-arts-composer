---
status: active
value: 3
effort: M
remaining: "Verify Modular Kit Museum — Vertical Slice against the current Modular Kit Museum — Vertical Slice runtime and acceptance criteria before resuming implementation. Prior recorded remainder: 'Kit instancing live for institutional wall-section only; corners/doorways never authored'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Modular Kit Museum — Vertical Slice

> **DRIFT WARNING — 2026-08-02.** Kit instancing live for institutional wall-section only; corners/doorways never authored
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-06-16
**Status:** Design approved, pending spec review
**Scope:** Replace procedural box-derived museum geometry with a Blender-authored modular GLB kit instanced along the existing tile grid. First pass = one wing (Entrance Lobby), proving the pipeline before fan-out.

## Problem

The 3D museum renders with full-height holes straight through the perimeter walls (skybox visible), a see-through floor, and walls that read as flat black slabs. Root cause is a single architectural decision: geometry is *derived as primitive boxes at render time* rather than authored.

### Diagnosis (verified in code, 2026-06-16)

| Symptom | Cause | File |
|---|---|---|
| Holes to sky through walls | `deriveWalls` emits a **1-tile-thick perimeter** of separate `BoxGeometry(0.5, 4.5, 0.5)` slabs. Every `door` / `corridor` / `exhibit-panel` tile is floor, not wall, so it punches a full-height gap. No exterior shell and no corridor ceiling, so each gap shows skybox. | `museum-grid-builder.ts:192` (deriveWalls), `museum-geometry-builder.ts:293,500` |
| Walls pure black | Ambient `0.15` + sparse 16-slot proximity point lights never reach interior wall faces. PBR roughness with no incident light = near-black. | `Museum3DScene.svelte:~1049` |
| See-through floor | Floor tiles are `BoxGeometry(0.48, 0.05, 0.48)` — 5cm-thin, 2cm under-sized per tile → a seam grid over a void (no underside, skybox below). | `museum-geometry-builder.ts:499,556` |

### Key reframe

The museum is **not** runtime-generated from user data. `museum-room-graph.ts` is a hand-authored floorplan; `layout-calculator.ts` compiles it to a tile grid; `museum-geometry-builder.ts` derives boxes from that grid. The "generative" part is the *compile + box-derivation step only*. Going Blender-first therefore does not require discarding the layout — it replaces where geometry comes from.

## Approach (chosen)

**Modular kit on the grid.** Keep the data-driven room-graph, the tile-grid compile, collision, streaming, proximity culling, and the in-app placement editor. Replace **only** the box-derivation step with instancing of Blender-authored modular GLB kit pieces along the same grid.

Rejected alternatives:
- **Author whole space in Blender (monolithic per-wing GLB):** highest visual ceiling but kills the in-app editor and forks the room-graph into a parallel hand-maintained collision map. Too manual per room.
- **Just fix the procedural system:** add a shell + ceiling, thicken/double-side walls, snap floor seams, fix lights. Days not weeks, but the visual ceiling stays at "primitive boxes." Doesn't meet the AAA bar.

## Architecture

### What stays untouched
`museum-room-graph.ts`, `layout-calculator.ts`, the tile grid (`Map<"x,y", MuseumTile>`), collision (`museum-physics-provider.ts`), streaming (`museum-geometry-streamer.ts`), proximity culling, the in-app editor.

### What changes — the geometry-emission swap

The box-derivation in `museum-geometry-builder.ts` is replaced by a kit-instancing path with these new units:

1. **`wall-run-resolver.ts`** (new)
   - **Does:** Scans the wall tiles of a room and produces *runs* (`{ start, length, orientation }`) plus *junctions* (`corner-inner`, `corner-outer`, `end-cap`, `doorway`) by reading each wall tile's 4/8 neighbor bitmask.
   - **Why runs not per-tile:** A 0.5m tile is far smaller than a modular kit piece (sized in meters). Emitting one piece per tile would re-create the seam problem. Run-merging emits one tileable section per straight stretch + dedicated junction pieces.
   - **Depends on:** the tile grid only (pure function: grid in, placement list out). Independently testable with a fixture grid.

2. **`museum-kit-registry.ts`** (new, mirrors the existing `fixture-registry.ts` pattern)
   - **Does:** Maps `(wingTheme, pieceType)` → `{ glbUrl, transform }`. `pieceType ∈ { wall-section, corner-inner, corner-outer, doorway, floor, ceiling, baseboard }`. `wall-section` is authored as a **0.5m-tileable** section so any run length composes cleanly.
   - **Depends on:** GLB assets under `static/models/museum/kit/<theme>/`.

3. **Kit instancer** (extends `museum-geometry-builder.ts`)
   - **Does:** Loads each kit GLB once, places resolver output via `BatchedMesh` / `InstancedMesh` — one batch per piece-type → few draw calls. Reuses the existing batching machinery; only the source geometry changes from `BoxGeometry` to loaded GLB geometry.
   - **Depends on:** resolver output + kit registry. Slots into the streamer unchanged (still emits per-room chunks).

4. **Floor / ceiling**
   - **Does:** One merged mesh per room for floor and for ceiling, replacing the per-tile thin slabs. Kills the seam grid and seals the void; corridor ceiling closes the skybox leak.

5. **Doorways**
   - **Does:** Opening tiles receive a `doorway` piece framing the gap, so corridors read as passages rather than raw holes.

### Lighting

Black walls are fixed by **baking AO / lightmaps into the kit GLB in Blender**, not by adding real-time lights. This is the decisive call for the slice: 12 wings × many runtime lights is the cost trap the current scene already hits (`MAX_POINT_LIGHTS` clamp, torch lights cutting out past 32). Baked lighting gives form and shadow at zero runtime light cost; existing proximity point lights remain only as accent/torch glow.

## Asset pipeline (the automation)

### Architectural kit (CC0 + Blender)
Source a curated **CC0 modular interior kit** (Kenney / Quaternius — both CC0, GLB-ready, listed ship-clean in `blender-first-3d-scenes.md`). Meshy is explicitly **not** used here: it generates organic single objects, not snap-tiling architectural modules.

Pipeline (per the ocean reference impl):
1. One Blender file holding the kit pieces, with material variants per theme.
2. Bake AO / lightmap.
3. Export each piece (or piece-atlas) → `gltf-transform optimize` (resize textures → 1024, WebP/KTX2, dedup, GPU-instance, weld, simplify ≤0.65, Draco, prune).
4. Drop under `static/models/museum/kit/<theme>/`.

### Exhibit props (Meshy's slot)
Statues, vitrines, oddities generated from text/image via Meshy → Blender decimate + bake pass → placed on existing `pedestal` / `exhibit-panel` tiles. Not on the slice's critical path, but the kit registry leaves the slot so wing fan-out can add them. (See related `2026-05-22-meshy-model-integration-design.md`.)

### Slice target
**Entrance Lobby** (institutional / marble theme) — first wing the user sees, and the wing in the bug screenshot.

## Success criteria

Walking the Entrance Lobby in FPS mode:
- Zero skybox-through-walls.
- Zero see-through floor.
- Walls read with form and shadow (baked lighting), not flat black.
- Doorways frame passages; corridors are ceilinged.
- Runs hold the 60fps mobile WebGL budget (draw calls bounded by piece-type batching).
- Pipeline documented enough that wing #2 = "author a kit material variant + run the existing instancer," no new code.

## Out of scope (this slice)
- The other ~11 wing themes (fan-out, post-proof).
- Meshy exhibit-prop generation as a critical deliverable (slot reserved, not built).
- Any change to the room-graph authoring format or the in-app editor.
- A generic GLB-environment registry (tracked separately in `2026-05-29-glb-environment-registry-design.md`).

## Related
- `.claude/rules/blender-first-3d-scenes.md` — the directive and the ocean pipeline this follows.
- `2026-05-24-blender-workflow-design.md`, `2026-05-22-meshy-model-integration-design.md`, `2026-05-29-glb-environment-registry-design.md`.
- Memory: `project_museum_performance.md`, `feedback_ocean_placement_grid.md` (grid registrations are load-bearing — the instancer must preserve them).
