# Procedural World Engine

Lives at `src/lib/shared/3d/procedural-engine/`. Shared infrastructure for every 3D surface that wants terrain streaming, vegetation scatter, atmosphere, water, GPU compute, ECS, or worker-based chunk generation. It is not tied to any destination.

## Structure

```
shared/3d/procedural-engine/
├── core/         chunk-manager, hybrid-chunk-manager, ecs-world, systems,
│                 world-config, world-definitions
├── terrain/      TerrainMeshGenerator, terrain-types
├── vegetation/   biome-vegetation-rules, vegetation-categories, ModelRegistry
├── generation/   seed-generator, biome-system, vegetation-scatter,
│                 drainage-calculator, real-terrain-zone, gpu/ (compute shaders)
├── rendering/    atmosphere, water, drainage-water, instanced-vegetation,
│                 model-cache, terrain-texture-material
├── spatial/      octree
├── objects/      PlacedObject, PlacedObjectRenderer, object-catalog
├── workers/      chunk-generator.worker
└── components/   WorldScene, WorldSceneContent, DebugPanel
```

## Destinations and historical consumers

A destination is a `.svelte` component that composes `WorldScene` (or lower-level engine primitives) with its own world configuration. Each destination lives in its own feature folder:

- `features/campground/CampgroundDestination.svelte` — procedural forest clearing
- `features/hannons-camp/HannonsCampDestination.svelte` — Flow Fest Sim's checked geospatial manifest and binary terrain
- Historical: `features/archive/ArchiveDestination.svelte` was the curated indoor scene. That owner is removed; `/archive` was redirected to `/museum`.
- `features/museum/scenes/procedural/MuseumDestination.svelte` — procedural museum walk mode of the museum feature
- `features/lab/tools/3d-controls/ThreeDControlsLab.svelte` — prop/motion tuning lab

Current destination registration is owned by `shared/3d/destinations/definitions.ts`; the removed Archive entry above is historical.

`shared/3d/StageWorld.svelte` also composes engine primitives directly for the sequence viewer's Stage mode.

## Data ownership

The engine does not know about destination-specific data. When a destination needs real-world terrain, it loads and validates its own manifest and binary field, then passes normalized `terrainData` to `WorldScene`. `WorldSceneContent` consumes the prop; it does not import or fetch destination files itself.

## Why it lives under shared/

Campground, Hannon's Camp, and the 3D Museum scene all need the engine. The sequence viewer's Stage mode needs it too. Putting shared infrastructure inside a feature folder (as it was historically under the now-removed `features/realm/`) forced every consumer to either cross feature boundaries or duplicate the engine. Moving it to `shared/3d/procedural-engine/` eliminates that coupling.
