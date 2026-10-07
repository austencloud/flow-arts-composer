---
status: active
value: 2
effort: M
remaining: "Rebuild and review one exhibit-scale cave habitat vertical slice before propagating all six"
depends_on: ""
plan_path: ""
tags:
  - museum
  - exhibit-design
  - experience-design
last_triaged: 2026-10-07
work_state: unverified
---

# Vulcan Cave Floor Plan

**Queue evidence (2026-10-07):** The old dependency `5efa348fb2` is an existing entrance-lobby implementation commit, not an outstanding prerequisite. The exhibit-scale cave habitat correction below still needs one reviewed vertical slice before wider propagation.

**Date:** 2026-08-02
**Decision:** `mX982dvKMyhhL2wIvu6V`
**Scope:** Author and present the graph-first cave plan that will feed the web prototype's eventual 3D room.

## Live-review correction (2026-08-02)

The first walkable implementation proved that this plan's room program was too small and too abstract. Its 5.5-8.5 metre performer-chamber interiors fit a generic mannequin but leave no credible room for visitor circulation, interpretation, artifacts, a barrier, or a recessed habitat. That implementation is rejected as an art and scale target. It remains useful only as a technical harness for the route, first-person controller, collision, room streaming, and six independent sequence loops.

The continuation is governed by tracker decision `VyGMg2dcpRttLAGRSIG5`:

- Each mode encounter is an exhibit-scale habitat, not a decorated performance box.
- The visitor approaches a gate or architectural barrier from a public interpretation apron and looks into a recessed prehistoric environment.
- Each figure reads as a prehistoric human within that environment, not as the shared modern mannequin on a pedestal.
- Performance props are bespoke rough-hewn sticks or torches, not standard TKA practice props.
- Cave formations, fire, timber, roots, vegetation near openings, artifacts, sound, and authored material conditions do the environmental storytelling. Color-coded point lights and scattered rocks are insufficient.
- One chamber must reach the intended final quality and receive visual approval before the pattern is repeated across the other five.

The linear six-solo graph remains approved. The compiled room dimensions and the relative labels "small" and "intimate" below do not.

## Decision

The cave contains six dedicated solo automatons: Water, Fire, Earth, Air, Sun, and Moon. Each performs alone. The performer-count rule governs ensemble size, not the total number of exhibits in the wing.

No two automatons share a performance sightline or acoustic zone. The visitor encounters them in a single ordered path, so the cave introduces six modes without presenting an ensemble before the later museum earns one.

## Spatial graph

The plan is a strictly linear chain:

`Cave Threshold -> Squeeze -> Water -> Fire -> Earth -> Air -> Sun -> Moon -> Egypt Threshold`

The graph bends into a compact serpentine footprint. It has no branches, optional shortcuts, or hub choices. Corridors are at least three tiles wide, every room is generated from `RoomNode` data, and the finished grid must pass flood-fill and overlap validation.

### Spatial beats

| Space           | Relative scale       | Performer | Purpose                                                        |
| --------------- | -------------------- | --------- | -------------------------------------------------------------- |
| Cave Threshold  | Intimate             | None      | Habitation, protected artifacts, first clinical Order material |
| Squeeze         | Narrow and long      | None      | Remove the lobby sightline and compress the visitor            |
| Water           | Exhibit-scale habitat | Water     | First isolated demonstration and minimum chamber quality bar   |
| Fire            | Exhibit-scale habitat | Fire      | Stronger contrast and rhythmic light                           |
| Earth           | Largest habitat       | Earth     | Main expansion and tactile stone-grid interaction              |
| Air             | Tall habitat          | Air       | Vertical release expressed through the authored shell          |
| Sun             | Deep habitat          | Sun       | First half of the deepest paired idea                          |
| Moon            | Deep habitat          | Moon      | Second half, with a colder and quieter treatment               |
| Egypt Threshold | Small seal           | None      | Warm sandstone light and a closed continuation                 |

Exact dimensions come from the museum room compiler. The review page reports the compiled half-metre tile dimensions rather than repeating hand-entered metre values.

## Content guardrails

- Six physical figures, exactly one in each mode chamber.
- Each chamber may run its own proximity-triggered performance, but never as part of a synchronized group.
- Element and celestial mappings may appear on the development plan. The visitor-facing cave does not label those associations.
- Pictographs remain pre-alphabetic. Latin letter names do not appear in the cave.
- Costumes stay serious. Chamber identity comes from geology, light, sound, and movement rather than literal elemental outfits.
- The Day and Night rooms are separate spaces, not a toggle on one shared figure.

## Implementation approach

### Reuse

- Extend `MuseumFloorPlanPreview.svelte` with configurable accessible text and caption copy.
- Reuse `RoomNode`, `RoomEdge`, `buildMuseumGrid`, `corridor-router`, and `layout-validator` for the plan itself.
- Reuse `MuseumTileRenderer`, `SegmentedControl`, and `PanelButton` on the review page.
- Follow the current lobby plan page's theme tokens and responsive composition.

### Create

- `src/lib/features/museum/data/vulcan-cave-floor-plan.ts`: cave room graph, derived zones, circulation, and compiled plan metadata. This is unique museum business data; no equivalent cave graph exists.
- `src/routes/test/museum-cave-plan/+page.svelte`: a development review surface for the cave plan. The existing lobby route cannot represent cave-specific metrics and the six-performer brief without replacing its approved lobby review.
- `tests/unit/museum/vulcan-cave-floor-plan.test.ts`: silent invariants for connectivity, topology, performer count, room ownership, and spatial rhythm.

No new drawing primitive, router, validator, button, panel, or interaction library is introduced. The existing responsive SVG and tile overlay remain the rendering path. Current SVG guidance confirms that a `viewBox` is the correct scaling contract; the figure caption carries the complete text alternative for the visual plan.

## Verification gates

1. Grid validation reports valid, with no unreachable rooms or overlaps.
2. The graph has one root, one terminal, and no node with more than one incoming or outgoing main-path edge.
3. Exactly six performers exist, with one inside each mode chamber and none elsewhere.
4. Every corridor is at least three tiles wide.
5. The squeeze is narrower than every performer chamber; Earth is the largest performer chamber.
6. The page passes focused unit tests and the relevant Svelte check output is clean.
7. The page is inspected at 1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180, 960x412, and 375x667.
8. The plan remains readable without the overlay through its built-tile layer, and all plan information remains available as text beside the visual.

## Out of scope

- Blender cave geometry and optimized GLBs
- Final performer models or animations
- Cave audio acquisition
- The tactile sequence-matching implementation
- Changes to the current 3D lobby route

Those use this graph after the floor plan is approved visually.
