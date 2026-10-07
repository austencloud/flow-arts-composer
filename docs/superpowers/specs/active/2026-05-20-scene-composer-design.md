---
status: active
value: 3
effort: M
remaining: "Verify Scene Composer — Design Spec against scripts/generate-winter-composer-instance-map.mjs before resuming implementation. Prior recorded remainder: User-facing Firebase persistence and optional per-scene catalog expansion"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---

# Scene Composer — Design Spec

> **DRIFT WARNING — 2026-08-02.** Phases 1-3 live in Scene Lab Compose mode; museum editor migration (the dedup point) never happened
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.

> **AUDIT UPDATE — 2026-08-10.** The shared editor can place, select, transform,
> remove, undo, redo, and serialize composer-owned objects. It cannot edit native
> scene meshes or members of an `InstancedMesh`. Autumn and Cosmic register in
> Scene Lab; Ocean has an unimported plugin; the other seven Scene Lab scenes have
> no plugin. The contract below governs the remaining rollout and supersedes the
> unchecked phase lists where they conflict.

> **IMPLEMENTATION UPDATE — 2026-08-10.** The native adapter, stable instance
> identity, shared validation, save state, all-ten-scene registry, and Themes Lab
> UI rollout are implemented. Museum transforms and history now use the shared
> adapter and command stack while retaining museum-specific placement UI. Winter
> persists through a rebuild-owned composer manifest and a verified optimized-GLB
> instance sidecar.

**Date:** 2026-05-20
**Status:** Draft
**Scope:** Plugin architecture for universal 3D object placement across all scenes

## Problem

Procedural scene generation places objects in nonsensical locations (mushrooms on rivers, paths through water, crowded clusters). The museum editor has production-ready manual placement infrastructure (raycasting, gizmo, undo/redo, ghost preview) but it's locked to museum-specific grid logic and fixture types. Meanwhile, 9+ scenes exist with no way to manually compose object layouts.

## Decision Record

| Question         | Decision                                           | Rationale                                                                                                                          |
| ---------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Architecture     | Plugin system with registry                        | Scales to 500 scenes without growing switch statements                                                                             |
| Phase 1 scope    | Dev tool only                                      | Users compose later via persistence adapter swap                                                                                   |
| Persistence      | `.ts` file writer (dev endpoint)                   | Same pattern as museum's `placement-persister.ts`                                                                                  |
| Object catalogs  | Per-scene                                          | Each scene declares what fits its aesthetic                                                                                        |
| Default handling | Seed data (mutable copy)                           | User starts with Austen's curated layout, can modify everything                                                                    |
| User-facing      | Future phase                                       | Firebase per-user persistence, Scribe-gated                                                                                        |
| Capability owner | `src/lib/shared/3d/scene-composer/`                | Selection, placement, transforms, deletion, history, and persistence must not be reimplemented per scene                           |
| Native props     | Adapter contract                                   | Scene renderers keep ownership of their meshes and batches while the composer edits through a common interface                     |
| Stable identity  | Authored placement IDs                             | GLB node order and instance indexes are runtime details, never persistence keys                                                    |
| Instanced props  | Proxy transform target                             | The gizmo edits one proxy object, then the adapter writes its matrix back to the existing batch                                    |
| Locked structure | Selectable but immutable                           | Terrain, routes, shells, water surfaces, required lights, and other structural objects remain inspectable without becoming movable |
| Save target      | Authoring manifest or scene-owned placement module | Runtime assets and rebuild inputs must read the same transforms                                                                    |

## 2026-08-10 Native Editing Contract

The Scene Composer remains the only owner of editing behavior. Scene plugins
describe what can be edited and delegate scene mutations to adapters. A plugin
may expose composer-owned placements, native objects, or both.

```typescript
interface SceneComposerPlugin {
  sceneId: string;
  displayName: string;
  catalog: ComposerCatalog;
  surfaceRules: SurfaceRules;
  getDefaults(): ComposerPlacement[];
  constraints?: PlacementConstraints;
  nativeObjects?: SceneObjectAdapter;
  persistence?: PlacementPersistence;
}

interface SceneObjectAdapter {
  enumerate(root: Object3D): SceneObjectHandle[];
  resolveHit(hit: Intersection<Object3D>): SceneObjectHandle | null;
  read(handle: SceneObjectHandle): ComposerPlacement;
  createTransformTarget(handle: SceneObjectHandle): Object3D;
  previewTransform(handle: SceneObjectHandle, target: Object3D): void;
  applyPlacement(
    handle: SceneObjectHandle,
    placement: ComposerPlacement,
    target?: Object3D
  ): void;
  disposeTransformTarget(handle: SceneObjectHandle, target: Object3D): void;
}

interface SceneObjectHandle {
  id: string;
  objectKey: string;
  kind: "object" | "instance";
  locked: boolean;
  object: Object3D;
  instanceId?: number;
}
```

`SceneObjectHandle.id` is an authored ID. An adapter may use a lookup from that
ID to the current GLB node or batch member, but it must not persist a raw node
index or `instanceId`. Re-exporting, mesh optimization, and batch compaction may
change those runtime indexes.

For an instanced object, `createTransformTarget` returns a temporary `Object3D`
whose world transform matches the selected member. `TransformControls` attaches
to that proxy. Each gizmo update writes the proxy matrix back through
`InstancedMesh.setMatrixAt` and marks `instanceMatrix.needsUpdate`. Removal sets
authored visibility through the adapter. It must not compact the batch, because
compaction changes later runtime indexes. Normal viewing keeps the original
batch and draw-call count.

Locked handles may be selected so the editor can show their identity and
transform. Translate, rotate, scale, and delete commands reject them before a
command reaches history. Surface meshes are locked by default unless a plugin
explicitly lists them as props.

## Stable Save Targets

Each scene declares one write boundary:

- `placement-module`: composer-owned objects saved to the scene's `placements.ts`;
- `manifest`: native objects saved to a scene-owned JSON or TypeScript authoring
  manifest that already feeds runtime rendering;
- `overlay`: native runtime objects whose source asset cannot yet be rebuilt from
  a manifest. The overlay is keyed by authored IDs and applied after asset load.

`overlay` is a migration boundary, not permission to use GLB indexes as IDs. Its
mapping file still binds authored IDs to the current delivery asset, and the
scene's asset build must validate every binding. A later Blender or optimizer
run fails when an authored ID disappears or becomes ambiguous.

Winter saves additions and native overrides to
`scripts/winter-composer-placements.json`. The Blender build reads that manifest,
applies runtime-coordinate transforms to authored trees and settlement props,
imports supported catalog additions, and writes authored composer metadata into
the raw GLB. `scripts/generate-winter-composer-instance-map.mjs` correlates the
current raw and optimized assets by mesh family and nearest world position, then
writes `scripts/winter-composer-instance-map.json`. The sidecar is hash-bound to
both GLBs and maps optimized instance matrices back to stable authored IDs. The
optimizer preserves those IDs in `EXT_mesh_gpu_instancing` batch metadata on the
next rebuild. Terrain, the skirt, paths, stage route surfaces, pond surface,
lodge shell, and required lighting stay locked.

## Registration and Coverage

One registration module imports the ten Scene Lab plugins: `winter`, `forest`,
`autumn`, `cosmic`, `ocean`, `ember`, `blossom`, `rainbow`, `celestial`, and
`void`. Both the current Themes Lab route and the legacy Scene Lab import that
module. A coverage test compares the registry with the supported scene IDs so a
scene cannot silently lose Compose mode.

Every plugin makes an explicit catalog decision. `void` may expose a small
catalog and no native props. Catalog previews and placed objects use the real
approved model when `modelPath` exists. Fallback primitives are reserved for
missing-asset diagnostics and never count as visual proof for a scene rollout.

## Command and Persistence Rules

Selection resolves through the active plugin before falling back to
`userData.composerId`. History stores authored IDs and before/after placement
data, not live object references alone. Undo and redo therefore survive an
adapter rebuilding an instance batch. Save captures composer-owned placements
and native adapter changes in one scene document. Reload resolves the same IDs
and reapplies position, quaternion, scale, visibility, and deletion state.

Placement validation runs for new objects and transformed native props. A
rejected transform restores the last valid transform and does not enter history.
Scene safety zones remain scene-owned data and are shared by placement, move,
reload, and build verification.

## 2026-08-10 Verification Baseline

- Registry coverage resolves exactly ten plugins and every catalog model path
  exists.
- Adapter integration covers plain objects, compound authored objects, locked
  structure, per-instance transforms, visibility deletion without compaction,
  undo, redo, and manifest reload with stable IDs.
- The Winter sidecar matches the current raw and optimized GLB hashes and
  resolves every one of the 472 authored trees to a unique ID.
- The live dev endpoint accepts the Winter JSON manifest without changing its
  content hash.
- Themes Lab exposes Compose and the scene-owned asset palette for all ten tabs.
  The layout is verified at desktop, tablet, phone portrait, and 960×412
  landscape sizes.
- Museum keeps its F2 picker, override callbacks, and persistence boundary while
  delegating transform identity and history behavior to the shared owners.

## Existing Infrastructure

These already exist and are production-ready:

| Component                             | Path                                                            | Status                                                     |
| ------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `ManualRaycaster.svelte`              | `src/lib/shared/3d/components/`                                 | Generic, shared                                            |
| `PlacedObject` interface              | `src/lib/shared/3d/procedural-engine/objects/PlacedObject.ts`   | Scene-agnostic (has `sceneId`, quaternion rotation, scale) |
| `ObjectDefinition` + `OBJECT_CATALOG` | `src/lib/shared/3d/procedural-engine/objects/object-catalog.ts` | Generic catalog with fallback geometry, snap rules         |
| `MuseumSceneEditor.svelte`            | `src/lib/features/museum/components/game/`                      | Raycasting + gizmo + undo/redo + WASD (to extract)         |
| `PlacementGhost.svelte`               | `src/lib/features/museum/components/editor/`                    | Surface classification + ghost preview (to extract)        |
| `PlacementPickerPanel.svelte`         | `src/lib/features/museum/components/editor/`                    | Catalog UI (to extract)                                    |
| `placement-persister.ts`              | `src/lib/features/museum/services/`                             | `.ts` file writer via Vite dev endpoint (to generalize)    |
| `placeable-object-registry.ts`        | `src/lib/features/museum/domain/`                               | Museum-specific catalog (stays museum-only)                |

## Architecture

### 1. Scene Composer Plugin Contract

Every scene that supports object placement implements this interface:

```typescript
// src/lib/shared/3d/scene-composer/types.ts

interface SceneComposerPlugin {
  /** Must match a SceneId from scene-lab-types.ts */
  sceneId: string;

  /** Human-readable name for picker panel header */
  displayName: string;

  /** Per-scene object catalog */
  catalog: ComposerCatalog;

  /** Rules for where objects can be placed */
  surfaceRules: SurfaceRules;

  /** Austen's curated default layout (seed data) */
  getDefaults(): PlacedObject[];

  /** Scene-specific placement constraints */
  constraints?: PlacementConstraints;
}
```

### 2. Catalog System

Extends the existing `ObjectDefinition` from `object-catalog.ts`:

```typescript
interface ComposerCatalog {
  /** Grouped for picker panel UI */
  categories: CatalogCategory[];

  /** Resolve full definition by key */
  getDefinition(key: string): ObjectDefinition | undefined;

  /** All definitions flat */
  allItems(): ObjectDefinition[];
}

interface CatalogCategory {
  id: string;
  label: string;
  icon: string;
  items: ObjectDefinition[];
}
```

`ObjectDefinition` already has: `key`, `name`, `type`, `fallbackGeometry`, `defaultScale`, `defaultHeight`, `snapToGround`, `canRotate`, `canScale`, `color`, optional `modelPath`. No changes needed to the base type.

Each scene builds its own catalog:

```typescript
// src/lib/shared/3d/environments/scenes/autumn/autumn-composer-plugin.ts

const autumnCatalog: ComposerCatalog = {
  categories: [
    {
      id: 'vegetation',
      label: 'Vegetation',
      icon: 'fa-tree',
      items: [
        { key: 'oak-tree', name: 'Oak Tree', type: 'prop', fallbackGeometry: 'cone', ... },
        { key: 'birch-tree', name: 'Birch Tree', type: 'prop', fallbackGeometry: 'cone', ... },
        { key: 'bush-large', name: 'Large Bush', type: 'prop', fallbackGeometry: 'sphere', ... },
        { key: 'mushroom-cluster', name: 'Mushroom Cluster', type: 'prop', fallbackGeometry: 'sphere', ... },
      ]
    },
    {
      id: 'terrain',
      label: 'Terrain',
      icon: 'fa-mountain',
      items: [
        { key: 'rock-large', name: 'Large Rock', type: 'prop', fallbackGeometry: 'sphere', ... },
        { key: 'rock-small', name: 'Small Rock', type: 'prop', fallbackGeometry: 'sphere', ... },
        { key: 'fallen-log', name: 'Fallen Log', type: 'prop', fallbackGeometry: 'cylinder', ... },
      ]
    },
    {
      id: 'atmosphere',
      label: 'Atmosphere',
      icon: 'fa-fire',
      items: [
        { key: 'campfire', name: 'Campfire', type: 'prop', fallbackGeometry: 'cylinder', ... },
        { key: 'lantern', name: 'Lantern', type: 'prop', fallbackGeometry: 'sphere', ... },
        { key: 'mist-patch', name: 'Mist Patch', type: 'zone', fallbackGeometry: 'cylinder', ... },
      ]
    }
  ],
  getDefinition(key) { return this.allItems().find(d => d.key === key); },
  allItems() { return this.categories.flatMap(c => c.items); },
};
```

### 3. Surface Rules

Controls what surfaces accept placements and how objects orient:

```typescript
interface SurfaceRules {
  /**
   * Test whether a mesh is a valid placement surface.
   * Receives the intersected mesh — return true to allow placement.
   */
  isSurface(mesh: Mesh): boolean;

  /**
   * How placed objects orient relative to the surface.
   * - 'upright': always Y-up regardless of surface normal
   * - 'surface-normal': align to surface normal (for slopes, walls)
   * - 'custom': plugin provides orientFromNormal() callback
   */
  orientationMode: "upright" | "surface-normal" | "custom";

  /** Custom orientation resolver (required when orientationMode = 'custom') */
  orientFromNormal?(normal: Vector3): Quaternion;

  /** Grid snap size in world units. null = freeform placement. */
  gridSize: number | null;

  /** Y-offset above surface intersection to prevent z-fighting */
  surfaceOffset: number;
}
```

Museum overrides with wall detection + tile grid. Autumn uses freeform ground-only. Each scene decides.

### 4. Placement Constraints

Optional rules that limit placement:

```typescript
interface PlacementConstraints {
  /** Maximum total objects in scene (performance budget) */
  maxObjects?: number;

  /** Per-object-type instance caps */
  maxPerType?: Record<string, number>;

  /** Minimum distance between any two objects (meters) */
  minSpacing?: number;

  /** Exclusion zones — areas where nothing can be placed */
  exclusionZones?: ExclusionZone[];

  /** Custom validation — return error message or null if valid */
  validate?(placement: PlacedObject, existing: PlacedObject[]): string | null;
}

interface ExclusionZone {
  center: [number, number, number];
  radius: number;
  reason: string; // "performer clearing" | "stream path" | etc.
}
```

Autumn example: exclusion zone at center (r=10 performer clearing), max 200 objects, min spacing 0.5m.

### 5. Scene Composer Registry

Singleton. Scenes register at import time. Editor queries by sceneId.

```typescript
// src/lib/shared/3d/scene-composer/registry.ts

class SceneComposerRegistry {
  private plugins = new Map<string, SceneComposerPlugin>();

  register(plugin: SceneComposerPlugin): void {
    if (this.plugins.has(plugin.sceneId)) {
      throw new Error(
        `Scene composer plugin already registered: ${plugin.sceneId}`
      );
    }
    this.plugins.set(plugin.sceneId, plugin);
  }

  get(sceneId: string): SceneComposerPlugin | undefined {
    return this.plugins.get(sceneId);
  }

  has(sceneId: string): boolean {
    return this.plugins.has(sceneId);
  }

  list(): SceneComposerPlugin[] {
    return [...this.plugins.values()];
  }

  /** Scene IDs that have composer support */
  composableSceneIds(): string[] {
    return [...this.plugins.keys()];
  }
}

export const composerRegistry = new SceneComposerRegistry();
```

### 6. Generic Scene Editor

Extracted from `MuseumSceneEditor.svelte`. Core responsibilities:

```
GenericSceneEditor.svelte
├── Raycasting (delegates to ManualRaycaster)
├── Selection (click mesh → find root → select → attach gizmo)
├── TransformControls gizmo (translate/rotate/scale, 1/2/3 keys)
├── Undo/redo command stack (Ctrl+Z / Ctrl+Shift+Z)
├── WASD camera panning (8 units/sec, 24 with Shift)
├── Keyboard shortcuts (Delete, Escape, number keys for catalog)
└── Delegates to plugin for:
    ├── Surface hit testing (surfaceRules.isSurface)
    ├── Object orientation (surfaceRules.orientationMode)
    ├── Constraint validation (constraints.validate)
    └── Save (persistence adapter)
```

**Props:**

```typescript
// GenericSceneEditor.svelte props
interface GenericSceneEditorProps {
  plugin: SceneComposerPlugin;
  persistence: PlacementPersistence;
  active: boolean;
  onPlacementsChanged?: (placements: PlacedObject[]) => void;
}
```

**Object identification:** Museum editor walks hierarchy looking for `plaque-*`, `performer-station-*`, `furniture-*` prefixes. Generic editor uses a different approach — every placed object's Three.js mesh gets `userData.composerId = placedObject.id`. Selection walks ancestors looking for `userData.composerId`.

### 7. Placement Ghost (Extracted)

`ComposerGhost.svelte` — extracted from museum's `PlacementGhost.svelte`.

**Generic behavior (kept):**

- Follows cursor via raycasting against scene meshes
- Surface normal classification (floor vs wall vs slope)
- Visual feedback: translucent green (valid) / red (invalid)
- Fallback geometry rendering (cone/box/cylinder/sphere from ObjectDefinition)
- Click to commit placement
- Escape to cancel
- Quaternion orientation from surface normal

**Museum-specific behavior (removed):**

- GLTF model cloning from `FIXTURE_REGISTRY` / `modelTemplateCache` — moved to museum plugin's asset loader
- Tile snapping (0.5m grid) — moved to `surfaceRules.gridSize`
- Wall facing / mount height / wall offset — moved to museum plugin's surface rules
- `onDelete` right-click for manual placements — stays in museum wrapper

**New behavior:**

- Reads `ObjectDefinition.fallbackGeometry` to render preview shape
- Reads `surfaceRules.orientationMode` for orientation
- Reads `surfaceRules.gridSize` for snap (null = freeform)
- Reads `constraints.exclusionZones` to show red in forbidden areas

### 8. Picker Panel (Extracted)

`ComposerPickerPanel.svelte` — extracted from museum's `PlacementPickerPanel.svelte`.

**Layout:** Fixed sidebar (240px). Header shows scene name. Categories from `plugin.catalog.categories`. Each item shows fallback geometry swatch + label. Number keys 1-9 for quick select.

**Additions over museum version:**

- Category headers with collapse/expand
- Object count per category
- Search/filter (when catalog > 20 items)
- Active placement indicator (which object is selected for placement)

### 9. Undo/Redo Command Stack

Generic, not tied to any scene:

```typescript
// src/lib/shared/3d/scene-composer/command-stack.ts

interface Command {
  execute(): void;
  undo(): void;
  label: string;
}

class CommandStack {
  undoStack: Command[] = $state([]);
  redoStack: Command[] = $state([]);
  canUndo = $derived(this.undoStack.length > 0);
  canRedo = $derived(this.redoStack.length > 0);

  execute(cmd: Command): void {
    cmd.execute();
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  undo(): void { ... }
  redo(): void { ... }
  clear(): void { ... }
}
```

**Command types:**

- `PlaceObjectCommand` — adds object to placements array
- `RemoveObjectCommand` — removes object
- `TransformCommand` — stores before/after position + rotation + scale
- `BatchCommand` — wraps multiple commands (for "Reset to Defaults")

### 10. Persistence — Dev Tool File Writer

Phase 1 writes `.ts` placement files per scene, same pattern as museum:

```typescript
// src/lib/shared/3d/scene-composer/persistence/file-persistence.ts

interface PlacementPersistence {
  load(sceneId: string): PlacedObject[];
  save(sceneId: string, placements: PlacedObject[]): Promise<void>;
}

class FilePersistence implements PlacementPersistence {
  /** Reads from the scene's committed placement file */
  load(sceneId: string): PlacedObject[] {
    // Import from src/lib/shared/3d/environments/scenes/{scene}/placements.ts
  }

  /** Writes via Vite dev endpoint */
  async save(sceneId: string, placements: PlacedObject[]): Promise<void> {
    const content = serializePlacements(sceneId, placements);
    await fetch(`/__composer-placements/${sceneId}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: content,
    });
  }
}
```

Output format — committed TypeScript:

```typescript
// src/lib/shared/3d/environments/scenes/autumn/placements.ts
// Auto-generated by Scene Composer. Do not edit manually.

import type { PlacedObject } from "$lib/shared/3d/procedural-engine/objects/PlacedObject";

export const AUTUMN_PLACEMENTS: PlacedObject[] = [
  {
    id: "oak-001",
    sceneId: "forest-autumn",
    objectType: "prop",
    modelKey: "oak-tree",
    position: [5.2, 0, -3.1],
    rotation: [0, 0.38, 0, 0.92],
    scale: [1.2, 1.4, 1.2],
    createdAt: new Date("2026-05-20"),
    lastModified: new Date("2026-05-20"),
    userId: "dev",
  },
  // ...
];
```

**Future Phase (user-facing):** Swap `FilePersistence` for `FirebasePersistence` implementing the same interface. Firebase adapter reads/writes `users/{uid}/scenes/{sceneId}/placements` collection. Scribe-gated at the save call. No changes to editor, ghost, picker, or command stack.

### 11. Vite Dev Server Plugin

Handles the `/__composer-placements/:sceneId` POST endpoint:

```typescript
// vite-plugins/composer-placements.ts

function composerPlacementsPlugin(): Plugin {
  return {
    name: "composer-placements",
    configureServer(server) {
      server.middlewares.use("/__composer-placements", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }

        const sceneId = req.url?.slice(1); // strip leading /
        const body = await readBody(req);

        const outPath = resolve(
          "src/lib/shared/3d/environments/scenes",
          sceneIdToDir(sceneId),
          "placements.ts"
        );

        await writeFile(outPath, body, "utf-8");
        res.statusCode = 200;
        res.end("OK");
      });
    },
  };
}
```

### 12. Scene Lab Integration

Scene Lab gets a "Compose" mode toggle alongside existing Orbit/Walk/Fly camera modes:

```
Scene Lab
├── Scene selector tabs (existing)
├── Camera mode: Orbit | Walk | Fly | Compose    ← new mode
├── Scene controls sidebar (existing color/fog sliders)
│   └── [Compose mode active] → ComposerPickerPanel replaces controls
├── ScenePreview
│   └── [Compose mode active] → GenericSceneEditor injected
└── Status bar: object count, dirty indicator, save button
```

**Compose mode activation:**

1. Scene Lab checks `composerRegistry.has(activeSceneId)`
2. If yes, "Compose" button appears in camera mode strip
3. Clicking "Compose" activates `GenericSceneEditor` over the scene
4. Picker panel replaces scene controls sidebar
5. Camera switches to orbit mode with WASD panning (editor-controlled)
6. Save button appears — writes placements to disk

**Scene rendering with placements:**
When Compose mode is active, the scene component receives placements as a prop and renders them alongside its procedural content. Each scene decides how to render placed objects (fallback geometry or custom components).

### 13. Placed Object Renderer

Generic component that renders a `PlacedObject` using its `ObjectDefinition`:

```typescript
// src/lib/shared/3d/scene-composer/ComposedObject.svelte

// Renders fallback geometry (cone/box/cylinder/sphere) at the
// object's position/rotation/scale. When modelPath is set on the
// ObjectDefinition, loads and renders the GLTF instead.
//
// Sets userData.composerId = id for selection raycasting.
```

Each scene wraps this or replaces it with scene-specific renderers. Autumn might render `oak-tree` as an InstancedMesh batch for performance, while `campfire` gets a custom component with particle emitter.

### 14. Museum Migration

Museum editor becomes a thin wrapper around GenericSceneEditor:

```
MuseumSceneEditor.svelte (after migration)
├── Creates museumPlugin from placeable-object-registry.ts
├── Surface rules: tile grid (0.5m), wall detection, mount height
├── Passes to GenericSceneEditor
└── Handles museum-specific callbacks:
    ├── saveOverrideForObject (grid sync)
    ├── onOverrideChanged (parent notification)
    └── findClickedObject (plaque/performer/furniture prefix matching)
```

Museum's existing `PlaceableObjectDef` stays — it implements `ObjectDefinition` with museum-specific extensions (wallOffset, mountHeight, wingTheme). The museum plugin's catalog wraps `PLACEABLE_OBJECTS` into `CatalogCategory[]` format.

No behavioral changes for museum users. Same shortcuts, same gizmo, same save flow.

## File Structure

```
src/lib/shared/3d/scene-composer/
├── types.ts                          # Plugin contract interfaces
├── registry.ts                       # SceneComposerRegistry singleton
├── command-stack.ts                  # Generic undo/redo
├── composer-editor-state.svelte.ts   # Reactive editor state
├── GenericSceneEditor.svelte         # Universal editor shell
├── ComposerGhost.svelte              # Placement preview (extracted)
├── ComposerPickerPanel.svelte        # Object catalog sidebar (extracted)
├── ComposedObject.svelte             # Renders placed objects
└── persistence/
    ├── types.ts                      # PlacementPersistence interface
    └── file-persistence.ts           # Dev-tool .ts file writer

src/lib/shared/3d/environments/scenes/autumn/
├── autumn-composer-plugin.ts         # Plugin registration
├── placements.ts                     # Generated placement data (committed)
└── ... existing scene components

src/lib/shared/3d/environments/scenes/forest/
├── forest-composer-plugin.ts
├── placements.ts
└── ...

vite-plugins/
└── composer-placements.ts            # Dev endpoint for saving
```

## Phase Plan

### Phase 1: Core Extraction (this spec)

1. Create `scene-composer/` directory with plugin contract types
2. Create `SceneComposerRegistry` singleton
3. Extract `GenericSceneEditor` from `MuseumSceneEditor`
4. Extract `ComposerGhost` from `PlacementGhost`
5. Extract `ComposerPickerPanel` from `PlacementPickerPanel`
6. Create generic `CommandStack` for undo/redo
7. Create `ComposedObject` renderer
8. Create `FilePersistence` + Vite plugin
9. Migrate museum editor to thin wrapper around `GenericSceneEditor`
10. Verify museum editor works identically after migration

### Phase 2: Autumn Scene Plugin

1. Create `autumn-composer-plugin.ts` with catalog (trees, rocks, logs, bushes, campfire, mushrooms, mist)
2. Define surface rules (ground-only, freeform, upright orientation)
3. Define constraints (performer clearing exclusion zone, max objects)
4. Extract current procedural placements as seed data in `placements.ts`
5. Wire into Scene Lab Compose mode
6. Verify round-trip: enter compose → move objects → save → reload → placements persist

### Phase 3: Additional Scene Plugins

- Forest (firefly variant, autumn variant)
- Winter
- Cosmic
- Ocean (all variants)

### Future: User-Facing

- `FirebasePersistence` adapter implementing `PlacementPersistence`
- Scribe gate on save
- "Reset to Default" button (reloads `getDefaults()`)
- Per-user placement collections in Firestore

## Non-Goals (Phase 1)

- User-facing persistence (Firebase)
- Multi-user collaboration
- Custom GLTF model import
- Terrain editing (heightmaps, textures)
- Physics simulation for placed objects
- Undo/redo persistence across sessions
