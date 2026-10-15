# 3D Destinations: Design Vision

**Repository status (2026-10-14):** This is a product vision, not a shipped-feature inventory. Stage formation presets exist at `src/lib/features/stage/state/formation-presets.ts`, and the shared world engine lives at `src/lib/shared/3d/procedural-engine/`. The former `src/lib/features/realm/` is absent. Endless World references below are historical proposals; whether to resume that scope remains a product decision.

This document defines the purpose, UX model, and future direction for each 3D destination in Flow Arts Composer.

---

## Stage

**Purpose:** Choreography authoring tool. Assemble 3D performers on a stage, line up their movements, assign timings, and build reusable show templates.

**User role:** Director/choreographer viewing from outside the scene.

**Camera:** Orbit (3rd person) by default. You need to see the whole stage and all performers to orchestrate their movements.

**Key features:**

- Multiple performers with independent sequences
- Formation presets (line, circle, V-shape, etc.)
- Beat synchronization and offsets between performers
- Grid overlays showing wall/floor/wheel planes
- Timeline-style choreography editing (future)

**Output:** Show templates that can be used as basis for real-world performances.

---

## Gallery

**Purpose:** Curated exhibition space. Browse and experience someone's body of work - sequences, compositions, avatars, staged productions.

**User role:** Visitor walking through a museum/portfolio.

**Camera:** First-person by default. You're immersed in the space, experiencing it as a viewer.

**Key features:**

- Creator-curated spaces (they design how their work is displayed)
- Multiple media types: 2D pictograph sequences, 3D avatar performances, full stage productions
- Public browsing of community contributions
- Relaxed exploration pace

**Output:** Appreciation and discovery of community creations.

---

## Endless World

**Purpose:** Open-ended explorable environment. Originally conceived as procedurally-expanding gallery, now evolving toward more ambitious world-building.

**User role:** Browser in an expansive space.

**Camera:** First-person with free movement.

**Current state:** Experimental. Testing modern 3D landscape generation and exploration.

**Future directions being considered:**

1. **Procedural gallery expansion** - Sequences appear on walls as you walk. The world generates ahead of you, appearing pre-built but actually loading on demand.

2. **Flow arts themed world** - Abstract environment designed around the aesthetic of flow arts.

3. **Flow City** - Urban environment themed around the flow community.

4. **Real-world terrain import** - Recreate actual flow festival locations using Google Maps/terrain data. Specific candidate: **Kinetic Fire** at Hannon's Camp America - a real festival that could be virtually recreated for the community to browse.

**Technical considerations for terrain import:**

- Google Maps 3D data export (Cesium, Google Earth Studio, photogrammetry)
- Height map generation from satellite data
- Texture mapping from aerial imagery
- Legal considerations for using location data

---

## UX Implications Summary

| Destination   | Default Camera     | User Role | Primary Action |
| ------------- | ------------------ | --------- | -------------- |
| Stage         | Orbit (3rd person) | Director  | Author/edit    |
| Gallery       | First-person       | Visitor   | Browse/view    |
| Endless World | First-person       | Browser   | Browse/browse  |

---

## Architecture Notes

Each destination should:

- Persist its own camera preference separately
- Have distinct UI affordances matching its purpose
- Share core 3D infrastructure (avatars, props, animation engine) but differ in interaction model

---

_Last updated: 2026-01-15_
