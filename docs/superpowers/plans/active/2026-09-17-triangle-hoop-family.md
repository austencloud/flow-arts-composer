# Triangle Prop and Mini Hoop Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `PropType.TRIANGLE` (a bowed equilateral frame of 5/8" hoop tubing, corner or mid-side grip) in 2D, both 3D renderers, and as captured sprites, and regenerate the mini and big hoop glyphs and 3D hardware from the same station table.

**Architecture:** One hand-authored station table (`scripts/hoop-family-stations.json`) feeds a Node generator that writes the three pictograph glyphs, the side-grip appearance, and a generated TS module of boxes, tip points, crops, and reaches. The app registries import the generated module. The 3D side is procedural in both renderers (`@austencloud/scene-3d` via pnpm patch, and the in-repo worker mirror), pinned to the same numbers by tests. The grip is a global appearance toggle (`triangleGrip` in settings, `PropBuild`, and `WorkerPropBuild`) that changes the render key in 2D and the geometry origin in 3D.

**Tech Stack:** SvelteKit 5 runes, Threlte/three.js, vitest, Node ESM scripts, pnpm patches.

**Spec:** `docs/superpowers/specs/active/2026-09-17-triangle-hoop-family-design.md`

**Worktree:** `E:/worktrees/tka-platform/triangle-hoop-family` on `codex/triangle-hoop-family`. Every command below runs from that directory unless it says otherwise. `node_modules` there is a junction to the primary checkout's, so package edits under `node_modules/@austencloud/scene-3d/src` go through `pnpm patch` (Task 7).

**House rules that apply to every task:** no em dashes, no emojis, no checkboxes in UI (pills only), comments explain provenance the way the neighbouring code does. Commit only the paths the task names (never `git add -A`).

---

## File structure

| Path | Responsibility |
| --- | --- |
| `scripts/hoop-family-stations.json` (new) | The measured numbers, each with a `source`. Hand-authored. |
| `scripts/hoop-family-math.mjs` (new) | Pure geometry: bow radius, arc angle, height, reach, vertex layout per grip, bow points, tip points. Used by the generator and tests. |
| `scripts/build-hoop-family-svgs.mjs` (new) | Reads the table, writes the SVGs and the generated TS module. Idempotent. |
| `src/lib/shared/pictograph/prop/domain/hoop-family-geometry.generated.ts` (generated) | Boxes, tip points, glyph crops, reaches (m), triangle stations (m). |
| `static/images/props/{pictograph,animated,buttons}/{minihoop,bighoop,triangle}.svg` (generated) | Glyphs. `animated` and `buttons` are byte copies of `pictograph`. |
| `static/images/props/appearances/triangle-side.svg` (generated) | Side-grip glyph. |
| `src/lib/shared/pictograph/prop/domain/triangle-appearance.ts` (new) | `TriangleGrip`, normalize, render key, sprite key, artwork path. |
| `src/lib/shared/pictograph/prop/domain/prop-look.ts` | `PropRenderAppearance.triangleGrip`, render key resolution. |
| `src/lib/shared/pictograph/prop/domain/enums/*`, display registry, codecs, tagger, arrow placer, classification lists, optical fit, profile catalog, effects lab, voice map, picker sections, recipes, svg-color | Registry membership for `TRIANGLE`. |
| `static/data/arrow_placement/default/triangle/*.json` (copied) | Seeded placements, byte copies of minihoop's. |
| `src/lib/shared/animation-engine/services/IPropTextureLoader.ts`, `svg-generator.ts`, `prop-type-manager.ts`, `domain/types/prop-tip-points.ts` | 2D canvas: boxes, artwork path, render key threading, tip points by render key. |
| `src/lib/shared/settings/domain/app-settings.ts`, `state/settings-state.svelte.ts` | `triangleGrip` persistence. |
| `src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte`, `BentoPropGrid.svelte` | Two-pill Grip dock. |
| `node_modules/@austencloud/scene-3d/src/lib/...` (via pnpm patch) | `PropType.TRIANGLE`, `PropBuild.triangleGrip`, hoop hardware, `triangle-geometry.ts`, `Triangle3D.svelte`, `Prop3D` dispatch. |
| `src/lib/shared/3d/worker-renderer/...` | Worker mirror: types, protocol list, `createHoop` hardware, `createTriangle`, build plumbing. |
| `src/lib/shared/3d/effects/prop-tip-geometry-3d.ts` | Absolute reaches for hoops and triangle. |
| `src/lib/shared/3d/domain/scene-prop-catalog.ts`, `SequenceViewerOrchestrator.svelte`, `ScenePropPicker.svelte`, sprites route | Hoop family in the 3D studio, settings to scene sync, `triangle_side` sprite job. |
| Tests | `tests/unit/hoop-family/*.test.ts`, `tests/unit/3d-viewer/triangle-3d.test.ts`, additions to existing registry and worker tests. |

---

## Task 1: Station table and geometry math

**Files:**
- Create: `scripts/hoop-family-stations.json`
- Create: `scripts/hoop-family-math.mjs`
- Test: `tests/unit/hoop-family/hoop-family-math.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/hoop-family/hoop-family-math.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  loadStations,
  triangleMetrics,
  triangleLayout,
  hoopTipPoints,
  triangleTipPoints,
} from "../../../scripts/hoop-family-math.mjs";

const stations = loadStations();

describe("hoop family stations", () => {
  it("records a source for every measured number", () => {
    const raw = JSON.parse(
      readFileSync("scripts/hoop-family-stations.json", "utf8")
    ) as Record<string, unknown>;
    for (const [key, entry] of Object.entries(raw)) {
      if (key === "_") continue;
      expect(entry, key).toHaveProperty("source");
      expect(typeof (entry as { source: unknown }).source, key).toBe("string");
    }
  });

  it("derives the triangle's bow from chord and sagitta", () => {
    const m = triangleMetrics(stations);
    expect(m.bowRadiusMm).toBeCloseTo(1757.58, 1);
    expect((m.arcAngleRad * 180) / Math.PI).toBeCloseTo(18.294, 2);
    expect(m.heightMm).toBeCloseTo(483.935, 2);
    expect(m.reachMm).toBeCloseTo(506.285, 2);
  });

  it("puts the far point at the reach for both grips", () => {
    const corner = triangleLayout(stations, "corner");
    const side = triangleLayout(stations, "side");
    // Corner grip: a vertex sits on the hand and the far side's bow point is
    // at the reach.
    expect(corner.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(corner.sides[1].bow.x).toBeCloseTo(corner.reachMm, 6);
    // Side grip: the near side's bow point sits on the hand, its chord one
    // sagitta ahead, and the far vertex is at the reach.
    expect(side.vertices[0].x).toBeCloseTo(22.35, 6);
    expect(Math.abs(side.vertices[0].y)).toBeCloseTo(279.4, 6);
    expect(side.vertices[2].x).toBeCloseTo(side.reachMm, 6);
    expect(() => triangleLayout(stations, "edge")).toThrow();
  });

  it("runs every arc from p to q around a centre one bow radius from both", () => {
    for (const grip of ["corner", "side"]) {
      const layout = triangleLayout(stations, grip);
      for (const side of layout.sides) {
        const at = (a) => ({
          x: side.centre.x + layout.bowRadiusMm * Math.cos(a),
          y: side.centre.y + layout.bowRadiusMm * Math.sin(a),
        });
        const start = at(side.startAngle);
        const end = at(side.startAngle + layout.arcAngleRad);
        expect(start.x).toBeCloseTo(side.p.x, 6);
        expect(start.y).toBeCloseTo(side.p.y, 6);
        expect(end.x).toBeCloseTo(side.q.x, 6);
        expect(end.y).toBeCloseTo(side.q.y, 6);
        for (const point of [side.p, side.q, side.bow]) {
          expect(
            Math.hypot(point.x - side.centre.x, point.y - side.centre.y)
          ).toBeCloseTo(layout.bowRadiusMm, 6);
        }
      }
    }
  });

  it("reproduces the shipped hoop tip points exactly", () => {
    const mini = hoopTipPoints(stations.mini_glyph);
    expect(mini).toEqual([
      { dx: 10.37, dy: -35.62 },
      { dx: 78.13, dy: -57.63 },
      { dx: 120, dy: 0 },
      { dx: 78.13, dy: 57.63 },
      { dx: 10.37, dy: 35.62 },
    ]);
    const big = hoopTipPoints(stations.big_glyph);
    expect(big).toEqual([
      { dx: 34.6, dy: -83.7 },
      { dx: 193.8, dy: -135.43 },
      { dx: 292.2, dy: 0 },
      { dx: 193.8, dy: 135.43 },
      { dx: 34.6, dy: 83.7 },
    ]);
  });

  it("gives each triangle grip five tips with the far point on the axis", () => {
    // Corner: far bow point, the two far vertices, the bow points of the
    // gripped sides.
    expect(triangleTipPoints(stations, "corner")).toEqual([
      { dx: 135.15, dy: 0 },
      { dx: 129.18, dy: 74.58 },
      { dx: 129.18, dy: -74.58 },
      { dx: 61.61, dy: 42.46 },
      { dx: 61.61, dy: -42.46 },
    ]);
    // Side: far vertex, the two near vertices, the bow points of the far sides.
    expect(triangleTipPoints(stations, "side")).toEqual([
      { dx: 135.15, dy: 0 },
      { dx: 5.97, dy: 74.58 },
      { dx: 5.97, dy: -74.58 },
      { dx: 73.54, dy: 42.46 },
      { dx: 73.54, dy: -42.46 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/hoop-family/hoop-family-math.test.ts`
Expected: FAIL, cannot find module `scripts/hoop-family-math.mjs`.

- [ ] **Step 3: Write the station table**

```json
{
  "_": "Hoop family stations, real millimetres unless the key says units. Hand-authored; scripts/build-hoop-family-svgs.mjs reads it, the 3D builders mirror it, and tests pin the mirrors. Every number names its source.",
  "tube_od_mm": {
    "value": 15.875,
    "source": "5/8in HDPE hoop tubing, the only size that holds an 18.5in ring (hoop-geometry.ts)"
  },
  "hoop_od_mm": {
    "value": 469.9,
    "source": "18.5in, MoodHoops' smallest 5/8in mini (hoop-geometry.ts)"
  },
  "big_scale": {
    "value": 1.4,
    "source": "Prop3D.svelte BIG_SCALE, the factor every big variant uses"
  },
  "hoop_join_tape_mm": {
    "value": 45,
    "source": "gaffer band over the insert connector, measured on a hoop in hand"
  },
  "hoop_button_mm": {
    "value": 6,
    "source": "push button showing through the join tape"
  },
  "hoop_grip_tape_mm": {
    "value": 150,
    "source": "grip wrap opposite the join, measured on a hoop in hand"
  },
  "hardware_ratio": {
    "value": 1.3,
    "source": "printed elbow sleeve OD over tube OD in the triangle photo; tape bands use the same ratio"
  },
  "triangle_side_mm": {
    "value": 558.8,
    "source": "22in; the photo's tube-to-side ratio of 0.028 at a 5/8in tube"
  },
  "triangle_sagitta_mm": {
    "value": 22.35,
    "source": "4% of the chord, the outward bow of each side in the photo"
  },
  "elbow_leg_mm": {
    "value": 50,
    "source": "how far the printed elbow reaches along each side, photo"
  },
  "glyph_tube_units": {
    "value": 10,
    "source": "notation weight, about 2x the real tube at the mini glyph's scale (the old drawing used 16)"
  },
  "big_glyph_tube_units": {
    "value": 15,
    "source": "the largest weight that keeps the big ring inside its 600x300 box"
  },
  "mini_glyph": {
    "box": [257.9, 138.2],
    "centre_dx": 59.4,
    "radius": 60.6,
    "source": "the shipped minihoop box and the centreline its tip points measure"
  },
  "big_glyph": {
    "box": [600, 300],
    "centre_dx": 149.8,
    "radius": 142.4,
    "source": "the shipped bighoop box and the centreline its tip points measure"
  },
  "grip_band_hex": {
    "value": "#C9AC68",
    "source": "the gold the triad and quiad glyphs already use for their grip"
  },
  "hardware_hex": {
    "value": "#1C1C1F",
    "source": "matte black printed PLA and gaffer tape; dark enough for selective recolor to preserve"
  },
  "tube_hex": {
    "value": "#9A9A9A",
    "source": "neutral gray placeholder that selective recolor repaints in the hand colour"
  }
}
```

- [ ] **Step 4: Write the math module**

```js
// scripts/hoop-family-math.mjs
// Pure geometry for the hoop family. The generator and the tests import it;
// the 3D builders in @austencloud/scene-3d and the worker renderer restate
// the same formulas in TypeScript, and tests pin them to this module.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function loadStations() {
  return JSON.parse(
    readFileSync(join(here, "hoop-family-stations.json"), "utf8")
  );
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Bow radius, arc angle, height and reach from chord and sagitta, in mm. */
export function triangleMetrics(stations) {
  const c = stations.triangle_side_mm.value;
  const s = stations.triangle_sagitta_mm.value;
  const bowRadiusMm = (c * c) / (8 * s) + s / 2;
  const arcAngleRad = 2 * Math.asin(c / (2 * bowRadiusMm));
  const heightMm = (c * Math.sqrt(3)) / 2;
  return {
    chordMm: c,
    sagittaMm: s,
    bowRadiusMm,
    arcAngleRad,
    heightMm,
    // Vertex to the far side's bow point, or a side's bow point to the far
    // vertex: both are height plus one sagitta.
    reachMm: heightMm + s,
  };
}

/**
 * Vertex positions in mm with the hand at the origin and reach along +x.
 * Corner grip: vertex 0 on the hand, the far side across +x. Side grip: the
 * near side's bow point on the hand, so its chord sits one sagitta ahead and
 * the far vertex is at full reach.
 */
export function triangleLayout(stations, grip) {
  if (grip !== "corner" && grip !== "side") {
    throw new Error(`unknown triangle grip: ${grip}`);
  }
  const m = triangleMetrics(stations);
  const half = m.chordMm / 2;
  // Both grips wind counter-clockwise so every side's arc runs from p to q.
  const vertices =
    grip === "side"
      ? [
          { x: m.sagittaMm, y: half },
          { x: m.sagittaMm, y: -half },
          { x: m.sagittaMm + m.heightMm, y: 0 },
        ]
      : [
          { x: 0, y: 0 },
          { x: m.heightMm, y: -half },
          { x: m.heightMm, y: half },
        ];
  const centroid = {
    x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
    y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3,
  };
  const sides = [
    [vertices[0], vertices[1]],
    [vertices[1], vertices[2]],
    [vertices[2], vertices[0]],
  ].map(([p, q]) => sideArc(p, q, centroid, m));
  return { ...m, grip, vertices, centroid, sides };
}

/**
 * One bowed side as an arc: its centre, the outward unit normal, the bow
 * point, and the angle (radians, CCW from +x) at which the arc starts. The
 * arc starts at `p` (angle `startAngle`) and ends at `q` (angle
 * `startAngle + arcAngleRad`), which holds because both grips wind
 * counter-clockwise.
 */
function sideArc(p, q, centroid, m) {
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const nx = mid.x - centroid.x;
  const ny = mid.y - centroid.y;
  const len = Math.hypot(nx, ny);
  const normal = { x: nx / len, y: ny / len };
  const centre = {
    x: mid.x - normal.x * (m.bowRadiusMm - m.sagittaMm),
    y: mid.y - normal.y * (m.bowRadiusMm - m.sagittaMm),
  };
  const bow = { x: mid.x + normal.x * m.sagittaMm, y: mid.y + normal.y * m.sagittaMm };
  const phi = Math.atan2(normal.y, normal.x);
  return { p, q, mid, normal, centre, bow, startAngle: phi - m.arcAngleRad / 2 };
}

/** Glyph units per real millimetre: the mini glyph's centreline over the real one. */
export function glyphUnitsPerMm(stations) {
  const realCentrelineDiameter =
    stations.hoop_od_mm.value - stations.tube_od_mm.value;
  return (2 * stations.mini_glyph.radius) / realCentrelineDiameter;
}

/**
 * The five hoop tips: ring angles 216, 288, 0, 72, 144 degrees on the
 * centreline, exactly as prop-tip-points.ts measured them.
 */
export function hoopTipPoints(glyph) {
  return [216, 288, 0, 72, 144].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return {
      dx: round2(glyph.centre_dx + glyph.radius * Math.cos(a)),
      dy: round2(glyph.radius * Math.sin(a)),
    };
  });
}

/**
 * Five triangle tips in glyph units. Corner: far bow point, far vertices,
 * bow points of the gripped sides. Side: far vertex, near vertices, bow
 * points of the far sides. Order: axis point, +y vertex, -y vertex, +y bow,
 * -y bow.
 */
export function triangleTipPoints(stations, grip) {
  const k = glyphUnitsPerMm(stations);
  const layout = triangleLayout(stations, grip);
  const u = (p) => ({ dx: round2(p.x * k), dy: round2(p.y * k) });
  const [v0, v1, v2] = layout.vertices;
  const [s01, s12, s20] = layout.sides;
  if (grip === "side") {
    // v0 = (s, +half) and v1 = (s, -half) are the near vertices, v2 the far
    // one; s20 (v2 to v0) is the +y far side, s12 (v1 to v2) the -y far side.
    return [u(v2), u(v0), u(v1), u(s20.bow), u(s12.bow)];
  }
  // v0 is on the hand; v1 = (h, -half), v2 = (h, +half); s12 is the far side;
  // s20 (v2 to v0) is the +y gripped side, s01 (v0 to v1) the -y one.
  return [u(s12.bow), u(v2), u(v1), u(s20.bow), u(s01.bow)];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/hoop-family/hoop-family-math.test.ts`
Expected: PASS (6 tests). If a triangle tip sign is off, the vertex or side index is wrong, not the geometry: check the comments above against the layout.

- [ ] **Step 6: Commit**

```bash
git add scripts/hoop-family-stations.json scripts/hoop-family-math.mjs tests/unit/hoop-family/hoop-family-math.test.ts
git commit -m "feat(props): hoop family station table and geometry math"
```

---

## Task 2: Generator for the glyphs and the generated geometry module

**Files:**
- Create: `scripts/build-hoop-family-svgs.mjs`
- Generate: `src/lib/shared/pictograph/prop/domain/hoop-family-geometry.generated.ts`
- Generate: `static/images/props/pictograph/{minihoop,bighoop,triangle}.svg`, `static/images/props/animated/{minihoop,bighoop,triangle}.svg`, `static/images/props/buttons/{minihoop,bighoop,triangle}.svg`, `static/images/props/appearances/triangle-side.svg`
- Test: `tests/unit/hoop-family/hoop-family-svgs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/hoop-family/hoop-family-svgs.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  HOOP_FAMILY_BOXES,
  HOOP_FAMILY_TIP_POINTS,
  HOOP_FAMILY_GLYPH_CROPS,
  HOOP_FAMILY_REACH_M,
  TRIANGLE_STATIONS_M,
} from "$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated";

function viewBox(path: string): [number, number] {
  const svg = readFileSync(path, "utf8");
  const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!match) throw new Error(`${path} has no viewBox`);
  return [Number(match[1]), Number(match[2])];
}

describe("generated hoop family artwork", () => {
  it("keeps the hoop boxes where trails and sprites expect them", () => {
    expect(HOOP_FAMILY_BOXES.minihoop).toEqual({ width: 257.9, height: 138.2 });
    expect(HOOP_FAMILY_BOXES.bighoop).toEqual({ width: 600, height: 300 });
  });

  it("derives the triangle box from the reach and the vertex spread", () => {
    expect(HOOP_FAMILY_BOXES.triangle.width).toBeCloseTo(283.3, 1);
    expect(HOOP_FAMILY_BOXES.triangle.height).toBeCloseTo(162.17, 1);
  });

  it.each([
    ["static/images/props/pictograph/minihoop.svg", "minihoop"],
    ["static/images/props/animated/minihoop.svg", "minihoop"],
    ["static/images/props/buttons/minihoop.svg", "minihoop"],
    ["static/images/props/pictograph/bighoop.svg", "bighoop"],
    ["static/images/props/animated/bighoop.svg", "bighoop"],
    ["static/images/props/buttons/bighoop.svg", "bighoop"],
    ["static/images/props/pictograph/triangle.svg", "triangle"],
    ["static/images/props/animated/triangle.svg", "triangle"],
    ["static/images/props/buttons/triangle.svg", "triangle"],
    ["static/images/props/appearances/triangle-side.svg", "triangle"],
  ] as const)("%s carries the %s box", (path, key) => {
    const [w, h] = viewBox(path);
    expect(w).toBeCloseTo(HOOP_FAMILY_BOXES[key].width, 2);
    expect(h).toBeCloseTo(HOOP_FAMILY_BOXES[key].height, 2);
  });

  it("writes the pictograph, animated and button files identically", () => {
    for (const prop of ["minihoop", "bighoop", "triangle"]) {
      const a = readFileSync(`static/images/props/pictograph/${prop}.svg`, "utf8");
      expect(readFileSync(`static/images/props/animated/${prop}.svg`, "utf8")).toBe(a);
      expect(readFileSync(`static/images/props/buttons/${prop}.svg`, "utf8")).toBe(a);
    }
  });

  it("paints the tube in the neutral gray that selective recolor repaints", () => {
    const svg = readFileSync("static/images/props/pictograph/triangle.svg", "utf8");
    expect(svg).toContain('fill="#9A9A9A"');
    expect(svg).toContain('fill="#1C1C1F"');
    expect(svg).toContain('fill="#C9AC68"');
    expect(svg).not.toContain("stroke=");
  });

  it("keeps the hoop tip points at their shipped values", () => {
    expect(HOOP_FAMILY_TIP_POINTS.minihoop[2]).toEqual({ dx: 120, dy: 0 });
    expect(HOOP_FAMILY_TIP_POINTS.bighoop[2]).toEqual({ dx: 292.2, dy: 0 });
    expect(HOOP_FAMILY_TIP_POINTS.triangle).toHaveLength(5);
    expect(HOOP_FAMILY_TIP_POINTS.triangle_side).toHaveLength(5);
  });

  it("crops each button to its painted window", () => {
    for (const key of ["minihoop", "bighoop", "triangle"] as const) {
      const crop = HOOP_FAMILY_GLYPH_CROPS[key];
      expect(crop.imageWidth).toBe(HOOP_FAMILY_BOXES[key].width);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(crop.imageWidth + 0.01);
    }
  });

  it("states the 3D reaches in metres", () => {
    expect(HOOP_FAMILY_REACH_M.minihoop).toBeCloseTo(0.454025, 6);
    expect(HOOP_FAMILY_REACH_M.bighoop).toBeCloseTo(0.454025 * 1.4, 6);
    expect(HOOP_FAMILY_REACH_M.triangle).toBeCloseTo(0.506285, 5);
    expect(TRIANGLE_STATIONS_M.bowRadius).toBeCloseTo(1.757581, 5);
    expect(TRIANGLE_STATIONS_M.sleeveRadius).toBeCloseTo(0.01031875, 8);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/hoop-family/hoop-family-svgs.test.ts`
Expected: FAIL, cannot resolve `hoop-family-geometry.generated`.

- [ ] **Step 3: Write the generator**

```js
// scripts/build-hoop-family-svgs.mjs
// Generates the hoop family glyphs and the geometry module the app imports.
//
//   node scripts/build-hoop-family-svgs.mjs
//
// Reads scripts/hoop-family-stations.json (every number has a source there)
// and writes:
//   static/images/props/{pictograph,animated,buttons}/{minihoop,bighoop,triangle}.svg
//   static/images/props/appearances/triangle-side.svg
//   src/lib/shared/pictograph/prop/domain/hoop-family-geometry.generated.ts
//
// Drawing rules (spec section 3): notation weight for the tube, hardware bands
// at 1.3x the tube, hoop boxes and centrelines unchanged from the shipped
// artwork, the triangle box derived from reach and vertex spread. Every shape
// is a FILL. applyColorToSvg recolors fills only, and the hoop family runs in
// selective mode: the neutral gray tube is repainted in the hand colour while
// the near-black hardware and the gold grip band survive.
import { mkdirSync, writeFileSync } from "node:fs";
import {
  glyphUnitsPerMm,
  hoopTipPoints,
  loadStations,
  triangleLayout,
  triangleMetrics,
  triangleTipPoints,
} from "./hoop-family-math.mjs";

const stations = loadStations();
const TUBE = stations.tube_hex.value;
const HARDWARE = stations.hardware_hex.value;
const GOLD = stations.grip_band_hex.value;
const r2 = (n) => Math.round(n * 100) / 100;
const f = (n) => r2(n).toFixed(2).replace(/\.?0+$/, "");

/** A thick arc as a filled annular sector: centre, centreline radius, half width, angles in radians. */
function arcBand(cx, cy, radius, halfWidth, start, end, fill) {
  const ro = radius + halfWidth;
  const ri = radius - halfWidth;
  const large = end - start > Math.PI ? 1 : 0;
  const p = (r, a) => `${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`;
  return (
    `<path fill="${fill}" d="M${p(ro, start)} A${f(ro)},${f(ro)} 0 ${large} 1 ${p(ro, end)} ` +
    `L${p(ri, end)} A${f(ri)},${f(ri)} 0 ${large} 0 ${p(ri, start)} Z"/>`
  );
}

function ring(cx, cy, radius, halfWidth, fill) {
  const ro = radius + halfWidth;
  const ri = radius - halfWidth;
  return (
    `<path fill="${fill}" fill-rule="evenodd" d="M${f(cx + ro)},${f(cy)} ` +
    `A${f(ro)},${f(ro)} 0 1 0 ${f(cx - ro)},${f(cy)} A${f(ro)},${f(ro)} 0 1 0 ${f(cx + ro)},${f(cy)} Z ` +
    `M${f(cx + ri)},${f(cy)} A${f(ri)},${f(ri)} 0 1 0 ${f(cx - ri)},${f(cy)} A${f(ri)},${f(ri)} 0 1 0 ${f(cx + ri)},${f(cy)} Z"/>`
  );
}

function circle(cx, cy, r, fill) {
  return `<circle fill="${fill}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`;
}

function svg(width, height, comment, body) {
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n<!--\n${comment}\n-->\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(width)} ${f(height)}">\n${body}\n</svg>\n`
  );
}

const GENERATED_NOTE =
  "GENERATED by scripts/build-hoop-family-svgs.mjs from scripts/hoop-family-stations.json. Do not edit; change the table and re-run.";

/** Hoop glyph: grip at the box centre, ring across +x, join tape far, gold band near. */
function hoopGlyph(glyph, tubeUnits, name) {
  const [w, h] = glyph.box;
  const cx = w / 2 + glyph.centre_dx;
  const cy = h / 2;
  const scale = glyph.radius / stations.mini_glyph.radius;
  const k = glyphUnitsPerMm(stations) * scale;
  const band = tubeUnits * stations.hardware_ratio.value;
  const joinArc = (stations.hoop_join_tape_mm.value * k) / glyph.radius;
  const gripArc = (stations.hoop_grip_tape_mm.value * k) / glyph.radius;
  const button = Math.max(2.5 * scale, (stations.hoop_button_mm.value * k) / 2);
  const body = [
    ring(cx, cy, glyph.radius, tubeUnits / 2, TUBE),
    // Join tape at the far rim, angle 0, with the push button on top of it.
    arcBand(cx, cy, glyph.radius, band / 2, -joinArc / 2, joinArc / 2, HARDWARE),
    circle(cx + glyph.radius, cy, button, "#3A3A3F"),
    // Grip band at the near rim, angle 180, where the hand is.
    arcBand(cx, cy, glyph.radius, band / 2, Math.PI - gripArc / 2, Math.PI + gripArc / 2, GOLD),
  ].join("\n");
  const painted = {
    x: r2(cx - glyph.radius - band / 2),
    y: r2(cy - glyph.radius - band / 2),
    width: r2(2 * glyph.radius + band),
    height: r2(2 * glyph.radius + band),
  };
  return {
    svg: svg(w, h, `${name} glyph. ${GENERATED_NOTE}\nGrip at the box centre on the tube centreline; ring across +x; join tape and button at the far rim; gold grip band at the near rim.`, body),
    box: { width: w, height: h },
    crop: { imageWidth: w, imageHeight: h, ...painted },
    tips: hoopTipPoints(glyph),
  };
}

/** Triangle glyph for one grip: grip at the box centre, far point across +x. */
function triangleGlyph(grip, box) {
  const k = glyphUnitsPerMm(stations);
  const layout = triangleLayout(stations, grip);
  const tube = stations.glyph_tube_units.value;
  const band = tube * stations.hardware_ratio.value;
  const cx = box.width / 2;
  const cy = box.height / 2;
  const R = layout.bowRadiusMm * k;
  const legArc = (stations.elbow_leg_mm.value * k) / R;
  const parts = [];
  for (const side of layout.sides) {
    const ox = cx + side.centre.x * k;
    const oy = cy + side.centre.y * k;
    const a0 = side.startAngle;
    const a1 = side.startAngle + layout.arcAngleRad;
    parts.push(arcBand(ox, oy, R, tube / 2, a0, a1, TUBE));
  }
  // Elbows: a sleeve leg over the first 50 mm of each side from each vertex,
  // plus a sphere at the vertex. The gripped elbow (corner grip) is gold.
  const vertexColour = (v) =>
    grip === "corner" && v.x === 0 && v.y === 0 ? GOLD : HARDWARE;
  for (const side of layout.sides) {
    const ox = cx + side.centre.x * k;
    const oy = cy + side.centre.y * k;
    const a0 = side.startAngle;
    const a1 = side.startAngle + layout.arcAngleRad;
    parts.push(arcBand(ox, oy, R, band / 2, a0, a0 + legArc, vertexColour(side.p)));
    parts.push(arcBand(ox, oy, R, band / 2, a1 - legArc, a1, vertexColour(side.q)));
  }
  for (const v of layout.vertices) {
    parts.push(circle(cx + v.x * k, cy + v.y * k, band / 2, vertexColour(v)));
  }
  if (grip === "side") {
    // Gold band centred on the near side's bow point, which is on the hand.
    const near = layout.sides.find((s) => Math.abs(s.bow.x) < 1e-6 && Math.abs(s.bow.y) < 1e-6);
    const ox = cx + near.centre.x * k;
    const oy = cy + near.centre.y * k;
    const half = (stations.hoop_grip_tape_mm.value * k) / R / 2;
    const mid = near.startAngle + layout.arcAngleRad / 2;
    parts.push(arcBand(ox, oy, R, band / 2, mid - half, mid + half, GOLD));
  }
  const halfSpread = (layout.chordMm / 2) * k + band / 2;
  const painted = {
    x: r2(cx - band / 2),
    y: r2(cy - halfSpread),
    width: r2(layout.reachMm * k + band),
    height: r2(2 * halfSpread),
  };
  return {
    svg: svg(box.width, box.height, `Triangle glyph, ${grip} grip. ${GENERATED_NOTE}\nThree bowed sides of 5/8in tubing, printed elbows, ${grip === "corner" ? "gripped elbow in gold" : "gold grip band at the near side's bow point"}. Grip at the box centre; far point across +x.`, parts.join("\n")),
    crop: { imageWidth: box.width, imageHeight: box.height, ...painted },
    tips: triangleTipPoints(stations, grip),
  };
}

// Triangle box: half-width = reach + half band, because the far point is
// either bare tube (corner grip) or a vertex wearing a sleeve sphere (side
// grip) and the sphere is the wider of the two; half-height = vertex spread
// + band. One box serves both grips.
function triangleBox() {
  const k = glyphUnitsPerMm(stations);
  const m = triangleMetrics(stations);
  const tube = stations.glyph_tube_units.value;
  const band = tube * stations.hardware_ratio.value;
  const halfW = m.reachMm * k + band / 2;
  const halfH = (m.chordMm / 2) * k + band / 2;
  return { width: r2(2 * halfW), height: r2(2 * halfH) };
}

const mini = hoopGlyph(stations.mini_glyph, stations.glyph_tube_units.value, "Mini hoop");
const big = hoopGlyph(stations.big_glyph, stations.big_glyph_tube_units.value, "Big hoop");
const box = triangleBox();
const corner = triangleGlyph("corner", box);
const side = triangleGlyph("side", box);

for (const dir of ["pictograph", "animated", "buttons"]) {
  mkdirSync(`static/images/props/${dir}`, { recursive: true });
  writeFileSync(`static/images/props/${dir}/minihoop.svg`, mini.svg);
  writeFileSync(`static/images/props/${dir}/bighoop.svg`, big.svg);
  writeFileSync(`static/images/props/${dir}/triangle.svg`, corner.svg);
}
writeFileSync("static/images/props/appearances/triangle-side.svg", side.svg);

const m = triangleMetrics(stations);
const tubeRadiusM = stations.tube_od_mm.value / 2000;
const hoopCentrelineM = (stations.hoop_od_mm.value - stations.tube_od_mm.value) / 1000;
// Twelve significant digits: enough for the package tests' nine-decimal pins,
// without printing the doubles' rounding noise into a source file.
const metres = (x) => Number(x.toPrecision(12));
const ts = `// GENERATED by scripts/build-hoop-family-svgs.mjs from
// scripts/hoop-family-stations.json. Do not edit; change the table and re-run.
//
// Boxes and tip points are in glyph units on a grip-centred box with the prop
// across +x. Reaches and stations are in metres for the 3D renderers.

export interface HoopFamilyBox {
  readonly width: number;
  readonly height: number;
}

export interface HoopFamilyTip {
  readonly dx: number;
  readonly dy: number;
}

export interface HoopFamilyCrop {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const HOOP_FAMILY_BOXES = {
  minihoop: ${JSON.stringify(mini.box)},
  bighoop: ${JSON.stringify(big.box)},
  triangle: ${JSON.stringify(box)},
} as const satisfies Record<string, HoopFamilyBox>;

export const HOOP_FAMILY_TIP_POINTS = {
  minihoop: ${JSON.stringify(mini.tips)},
  bighoop: ${JSON.stringify(big.tips)},
  triangle: ${JSON.stringify(corner.tips)},
  triangle_side: ${JSON.stringify(side.tips)},
} as const satisfies Record<string, readonly HoopFamilyTip[]>;

export const HOOP_FAMILY_GLYPH_CROPS = {
  minihoop: ${JSON.stringify(mini.crop)},
  bighoop: ${JSON.stringify(big.crop)},
  triangle: ${JSON.stringify(corner.crop)},
} as const satisfies Record<string, HoopFamilyCrop>;

/** Hand to the far tube centreline, in metres. Hoops: across the ring. Triangle: height plus one sagitta, both grips. */
export const HOOP_FAMILY_REACH_M = {
  minihoop: ${metres(hoopCentrelineM)},
  bighoop: ${metres(hoopCentrelineM * stations.big_scale.value)},
  triangle: ${metres(m.reachMm / 1000)},
} as const;

/** Triangle stations in metres; Triangle3D.svelte and the worker mirror restate these and tests pin them here. */
export const TRIANGLE_STATIONS_M = {
  sideChord: ${metres(m.chordMm / 1000)},
  sagitta: ${metres(m.sagittaMm / 1000)},
  bowRadius: ${metres(m.bowRadiusMm / 1000)},
  arcAngle: ${metres(m.arcAngleRad)},
  height: ${metres(m.heightMm / 1000)},
  reach: ${metres(m.reachMm / 1000)},
  tubeRadius: ${metres(tubeRadiusM)},
  sleeveRadius: ${metres(tubeRadiusM * stations.hardware_ratio.value)},
  elbowLeg: ${metres(stations.elbow_leg_mm.value / 1000)},
} as const;

/** Hoop hardware in metres: the join tape, its button, and the grip wrap. */
export const HOOP_HARDWARE_M = {
  joinTape: ${metres(stations.hoop_join_tape_mm.value / 1000)},
  button: ${metres(stations.hoop_button_mm.value / 1000)},
  gripTape: ${metres(stations.hoop_grip_tape_mm.value / 1000)},
  hardwareRatio: ${stations.hardware_ratio.value},
} as const;
`;
writeFileSync("src/lib/shared/pictograph/prop/domain/hoop-family-geometry.generated.ts", ts);
console.log("hoop family artwork written", { mini: mini.box, big: big.box, triangle: box });
```

- [ ] **Step 4: Run the generator, then the test**

Run: `node scripts/build-hoop-family-svgs.mjs && npx vitest run --config tests/config/vitest.config.ts tests/unit/hoop-family/`
Expected: the generator prints the three boxes (triangle about 283.3 x 162.17); both test files PASS. The big hoop's join band (outer radius 152.15 from a centre at x 449.8) overruns the 600 box by up to 1.95 units at the far rim; the tube itself fits. That is a sub-pixel flat spot at every size the glyph is shown and is accepted rather than thinning the big tube below 15 (spec section 3).

- [ ] **Step 5: Rasterize and look at the four glyphs**

Run (Git Bash):

```bash
mkdir -p "$TMP/hoop-family" && for f in static/images/props/pictograph/minihoop.svg static/images/props/pictograph/bighoop.svg static/images/props/pictograph/triangle.svg static/images/props/appearances/triangle-side.svg; do "/c/Program Files/Inkscape/bin/inkscape" "$f" --export-type=png --export-filename="$TMP/hoop-family/$(basename "$f" .svg).png" -h 260 -b white; done && magick montage "$TMP/hoop-family"/*.png -tile 2x2 -geometry +12+12 -background "#ddd" "$TMP/hoop-family/montage.png"
```

Then Read `$TMP/hoop-family/montage.png`. Expected: rings with a short black band at the right rim and a longer gold band at the left rim; a triangle pointing right with black elbows and (corner) a gold left elbow or (side) a gold band on the left side. SVG's y axis points down, so angle 0 is +x and angle 90 degrees is DOWN; that does not change left/right. If the hoop's bands land on the wrong side, `centre_dx` was subtracted rather than added. If the gold elbow on the corner triangle lands on a far vertex, an arc is being read from `q` to `p`: `triangleLayout` winds both grips counter-clockwise so every arc starts at `side.p`.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-hoop-family-svgs.mjs src/lib/shared/pictograph/prop/domain/hoop-family-geometry.generated.ts static/images/props/pictograph/minihoop.svg static/images/props/pictograph/bighoop.svg static/images/props/pictograph/triangle.svg static/images/props/animated/minihoop.svg static/images/props/animated/bighoop.svg static/images/props/animated/triangle.svg static/images/props/buttons/minihoop.svg static/images/props/buttons/bighoop.svg static/images/props/buttons/triangle.svg static/images/props/appearances/triangle-side.svg tests/unit/hoop-family/hoop-family-svgs.test.ts
git commit -m "feat(props): generate hoop family glyphs and geometry from the station table"
```

---

## Task 3: `PropType.TRIANGLE` and every 2D registry

**Files:**
- Modify: `src/lib/shared/pictograph/prop/domain/enums/prop-type.ts`
- Modify: `src/lib/shared/pictograph/prop/domain/enums/prop-classification.ts`
- Modify: `src/lib/shared/render/core/constants/prop-classification.ts`
- Modify: `packages/render-core/src/constants/prop-classification.ts`
- Modify: `packages/render-core/src/svg-color.ts`
- Modify: `src/lib/shared/pictograph/prop/domain/prop-type-display-registry.ts`
- Modify: `src/lib/shared/navigation/services/sequence-encoder.ts`
- Modify: `src/lib/shared/navigation/services/legacy-sequence-codec.ts`
- Modify: `src/lib/features/loop-labeler/services/rule-based-tagger.ts`
- Modify: `src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.ts`
- Modify: `scripts/seed-prop-default-placements.mjs`
- Copy: `static/data/arrow_placement/default/minihoop/*.json` to `static/data/arrow_placement/default/triangle/`
- Modify: `src/lib/shared/components/rail-prop-optical-fit.ts`
- Modify: `src/lib/shared/community/domain/profile-prop-catalog.ts`
- Modify: `src/lib/features/lab/effects-lab/components/EffectPropTypeSelector.svelte`
- Modify: `src/lib/shared/voice-control/services/interpreters/prop-sub-interpreter.ts`
- Modify: `src/lib/shared/pictograph/shared/services/svg-preloader.ts`
- Modify: `src/lib/shared/pictograph/prop/domain/prop-composition-recipes.ts`
- Test: `tests/unit/hoop-family/triangle-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/hoop-family/triangle-registry.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { SMALL_UNILATERAL_PROPS } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
import {
  BASE_TO_VARIANTS,
  getBasePropType,
  getPropTypeDisplayInfo,
  PROP_PICKER_SECTIONS,
  VARIANT_PROP_TYPES,
} from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
import {
  encodePropForURL,
  parsePropTypeFromURLValue,
} from "$lib/shared/navigation/services/sequence-encoder";
import { SELECTIVE_COLOR_PROP_TYPES } from "$lib/shared/utils/svg-color-utils";

describe("triangle registry membership", () => {
  it("is a small one-handed prop in the hoop family", () => {
    expect(PropType.TRIANGLE).toBe("triangle");
    expect(SMALL_UNILATERAL_PROPS as readonly string[]).toContain("triangle");
    expect(getBasePropType(PropType.TRIANGLE)).toBe(PropType.MINIHOOP);
    expect(BASE_TO_VARIANTS[PropType.MINIHOOP]).toEqual([
      PropType.BIGHOOP,
      PropType.TRIANGLE,
    ]);
    expect(VARIANT_PROP_TYPES).toContain(PropType.TRIANGLE);
    expect(getPropTypeDisplayInfo(PropType.TRIANGLE)).toEqual({
      label: "Triangle",
      image: "/images/props/buttons/triangle.svg",
    });
  });

  it("is listed once in the picker, under Standard", () => {
    const sections = PROP_PICKER_SECTIONS.filter((s) =>
      s.props.includes(PropType.TRIANGLE)
    );
    expect(sections.map((s) => s.label)).toEqual(["Standard"]);
  });

  it("encodes as the digit 8 and round-trips", () => {
    expect(encodePropForURL(PropType.TRIANGLE)).toBe("8");
    expect(parsePropTypeFromURLValue("8")).toBe(PropType.TRIANGLE);
    expect(parsePropTypeFromURLValue("triangle")).toBe(PropType.TRIANGLE);
  });

  it("recolors selectively so the black elbows and gold band survive", () => {
    for (const prop of ["minihoop", "bighoop", "triangle"]) {
      expect(SELECTIVE_COLOR_PROP_TYPES as readonly string[]).toContain(prop);
    }
  });

  it("seeds arrow placements as a copy of the mini hoop's", () => {
    for (const mt of ["anti", "dash", "float", "pro", "static"]) {
      const a = readFileSync(
        `static/data/arrow_placement/default/minihoop/default_${mt}_placements.json`,
        "utf8"
      );
      const b = readFileSync(
        `static/data/arrow_placement/default/triangle/default_${mt}_placements.json`,
        "utf8"
      );
      expect(b, mt).toBe(a);
    }
  });

  it("keeps the seeded prop lists in sync", () => {
    const placer = readFileSync(
      "src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.ts",
      "utf8"
    );
    const seed = readFileSync("scripts/seed-prop-default-placements.mjs", "utf8");
    expect(placer).toMatch(/"triangle",/);
    expect(seed).toMatch(/"triangle",/);
  });
});
```

`getBasePropType`, `VARIANT_PROP_TYPES`, `PROP_PICKER_SECTIONS` and `getPropTypeDisplayInfo` are already exported from `prop-type-display-registry.ts`; `BASE_TO_VARIANTS` (line 405) is a non-exported `const` and this task exports it. `SMALL_UNILATERAL_PROPS` is exported from `prop-classification.ts`. `encodePropForURL` and `parsePropTypeFromURLValue` are exported from `sequence-encoder.ts`. `SELECTIVE_COLOR_PROP_TYPES` is re-exported by `src/lib/shared/utils/svg-color-utils.ts` from `packages/render-core/src/svg-color.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/hoop-family/triangle-registry.test.ts`
Expected: FAIL on `PropType.TRIANGLE` being undefined.

- [ ] **Step 3: Add the enum value and classification**

`src/lib/shared/pictograph/prop/domain/enums/prop-type.ts`, after `BIGHOOP = "bighoop",`:

```ts
  /** Bowed equilateral frame of 5/8in hoop tubing; a mini hoop variant. */
  TRIANGLE = "triangle",
```

`src/lib/shared/pictograph/prop/domain/enums/prop-classification.ts`: add `"triangle",` to `SMALL_UNILATERAL_PROPS` directly after `"minihoop",`.

`src/lib/shared/render/core/constants/prop-classification.ts`: add `"triangle",` after `"minihoop",` in its `SMALL_UNILATERAL_PROPS`.

`packages/render-core/src/constants/prop-classification.ts`: add `"triangle",` after `"minihoop",` in its `SMALL_UNILATERAL_PROPS`.

`packages/render-core/src/svg-color.ts`, in `SELECTIVE_COLOR_PROP_TYPES` after the `"fire_double_staff",` entry:

```ts
  // Hoop family: the tube is neutral gray and takes left or right, while the
  // black join tape, elbows and button and the gold grip band stay as drawn.
  "minihoop",
  "bighoop",
  "triangle",
```

- [ ] **Step 4: Display registry, variants, picker section, recipe**

`src/lib/shared/pictograph/prop/domain/prop-type-display-registry.ts`:

After the `[PropType.BIGHOOP]` entry:

```ts
    [PropType.TRIANGLE]: {
      label: "Triangle",
      image: "/images/props/buttons/triangle.svg",
    },
```

In `VARIANT_PROP_TYPES`, after `PropType.BIGHOOP,` under `// Hoop family`: add `PropType.TRIANGLE,`.

In `VARIANT_TO_BASE`, after `[PropType.BIGHOOP]: PropType.MINIHOOP,`: add `[PropType.TRIANGLE]: PropType.MINIHOOP,`.

In `BASE_TO_VARIANTS`: change `[PropType.MINIHOOP]: [PropType.BIGHOOP],` to `[PropType.MINIHOOP]: [PropType.BIGHOOP, PropType.TRIANGLE],` and export the const (`export const BASE_TO_VARIANTS`).

In `PROP_PICKER_SECTIONS` "Standard", after `PropType.MINIHOOP,`: add `PropType.TRIANGLE,`.

`STANDARD_TO_BIG` is untouched: the triangle has no big variant, so `hasBigVariant(TRIANGLE)` is false and the Size dock stays hidden for it.

`src/lib/shared/pictograph/prop/domain/prop-composition-recipes.ts`: in the FIRST recipe table (the one with `// Hoops: overlapping circles (Venn)`), after the `[PropType.MINIHOOP]` entry:

```ts
  // Triangles: the two frames interlock the way the photographed pair does.
  [PropType.TRIANGLE]: {
    left: { x: 40, y: 50, rotation: 0, scale: 0.5 },
    right: { x: 60, y: 50, rotation: 180, scale: 0.5 },
    pairScale: 1,
  },
```

- [ ] **Step 5: Codecs, tagger, placements, optical fit, catalogs, voice, preloader**

`src/lib/shared/navigation/services/sequence-encoder.ts` and `src/lib/shared/navigation/services/legacy-sequence-codec.ts`, in each `PROP_TYPE_ENCODE`, after `[PropType.BIGHOOP]: "H",`:

```ts
  // Digit for the same reason as the baton and fire staff: every letter that
  // reads as "triangle" or "tri" is taken (T, t, Q, q, I, and R reserved).
  [PropType.TRIANGLE]: "8",
```

`src/lib/features/loop-labeler/services/rule-based-tagger.ts`: change

```ts
    case PropType.MINIHOOP:
    case PropType.BIGHOOP:
      return "hoop";
```

to

```ts
    case PropType.MINIHOOP:
    case PropType.BIGHOOP:
    case PropType.TRIANGLE:
      return "hoop";
```

`src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.ts`: add `"triangle",` after `"bighoop",` in `SEEDED_PROPS`.

`scripts/seed-prop-default-placements.mjs`: add `"triangle",` after `"bighoop",` in `SEED_PROPS`.

Copy the placement files (Git Bash):

```bash
mkdir -p static/data/arrow_placement/default/triangle && cp static/data/arrow_placement/default/minihoop/default_{anti,dash,float,pro,static}_placements.json static/data/arrow_placement/default/triangle/
```

`src/lib/shared/components/rail-prop-optical-fit.ts`: after `[PropType.BIGHOOP]: { scale: 1.72 },` add `[PropType.TRIANGLE]: { scale: 1.38 },`.

`src/lib/shared/community/domain/profile-prop-catalog.ts`, in the Hoop group's `choices`, after the Big Hoop skill:

```ts
      skill(PropType.TRIANGLE, "Triangle", [PropType.TRIANGLE]),
```

`src/lib/features/lab/effects-lab/components/EffectPropTypeSelector.svelte`: change `{ label: "Hoop", types: ["minihoop", "bighoop"] },` to `{ label: "Hoop", types: ["minihoop", "bighoop", "triangle"] },`.

`src/lib/shared/voice-control/services/interpreters/prop-sub-interpreter.ts`: after the `minihoop: "minihoop",` line add `triangle: "triangle",` and `triangles: "triangle",`.

`src/lib/shared/pictograph/shared/services/svg-preloader.ts`: add `"triangle",` after `"minihoop",`.

- [ ] **Step 6: Run the registry test and the existing coverage tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/hoop-family/ tests/unit/energy-props-codec.test.ts src/lib/shared/pictograph/prop/domain/__tests__/prop-picker-catalog.test.ts src/lib/shared/components/__tests__/rail-prop-optical-fit.test.ts src/lib/shared/render/core/__tests__/prop-classification.test.ts tests/unit/opus-svg-audit/pictograph-asset-resolution.test.ts`
Expected: all PASS. `pictograph-asset-resolution` passes because Task 2 already wrote `pictograph/triangle.svg`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/pictograph/prop/domain/enums/prop-type.ts src/lib/shared/pictograph/prop/domain/enums/prop-classification.ts src/lib/shared/render/core/constants/prop-classification.ts packages/render-core/src/constants/prop-classification.ts packages/render-core/src/svg-color.ts src/lib/shared/pictograph/prop/domain/prop-type-display-registry.ts src/lib/shared/navigation/services/sequence-encoder.ts src/lib/shared/navigation/services/legacy-sequence-codec.ts src/lib/features/loop-labeler/services/rule-based-tagger.ts src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.ts scripts/seed-prop-default-placements.mjs static/data/arrow_placement/default/triangle src/lib/shared/components/rail-prop-optical-fit.ts src/lib/shared/community/domain/profile-prop-catalog.ts src/lib/features/lab/effects-lab/components/EffectPropTypeSelector.svelte src/lib/shared/voice-control/services/interpreters/prop-sub-interpreter.ts src/lib/shared/pictograph/shared/services/svg-preloader.ts src/lib/shared/pictograph/prop/domain/prop-composition-recipes.ts tests/unit/hoop-family/triangle-registry.test.ts
git commit -m "feat(props): register the triangle as a mini hoop variant"
```

---

## Task 4: Triangle appearance, render keys, boxes, and tip points

**Files:**
- Create: `src/lib/shared/pictograph/prop/domain/triangle-appearance.ts`
- Modify: `src/lib/shared/pictograph/prop/domain/prop-look.ts`
- Modify: `src/lib/shared/animation-engine/services/IPropTextureLoader.ts`
- Modify: `src/lib/shared/animation-engine/services/svg-generator.ts`
- Modify: `src/lib/shared/animation-engine/domain/types/prop-tip-points.ts`
- Test: `src/lib/shared/pictograph/prop/domain/__tests__/triangle-appearance.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/pictograph/prop/domain/__tests__/triangle-appearance.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRIANGLE_GRIP,
  isTrianglePropType,
  normalizeTriangleGrip,
  parseTriangleRenderKey,
  resolveTriangleRenderKey,
  triangleAppearanceArtwork,
  triangleSpriteKey,
} from "../triangle-appearance";
import { resolvePropRenderKey } from "../prop-look";
import { getPropDimensions } from "$lib/shared/animation-engine/services/IPropTextureLoader";
import { resolvePropSvgPath } from "$lib/shared/animation-engine/services/svg-generator";
import { getTipPointsBaseline } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import { HOOP_FAMILY_TIP_POINTS } from "../hoop-family-geometry.generated";

describe("triangle grip appearance", () => {
  it("defaults to the corner grip and rejects garbage", () => {
    expect(DEFAULT_TRIANGLE_GRIP).toBe("corner");
    expect(normalizeTriangleGrip(undefined)).toBe("corner");
    expect(normalizeTriangleGrip("edge")).toBe("corner");
    expect(normalizeTriangleGrip("side")).toBe("side");
  });

  it("only applies to the triangle", () => {
    expect(isTrianglePropType("triangle")).toBe(true);
    expect(isTrianglePropType("Triangle")).toBe(true);
    expect(isTrianglePropType("minihoop")).toBe(false);
  });

  it("keys the side grip like a fan build", () => {
    expect(resolveTriangleRenderKey("triangle", "corner")).toBe("triangle");
    expect(resolveTriangleRenderKey("triangle", "side")).toBe("triangle__side");
    expect(parseTriangleRenderKey("triangle__side")).toEqual({
      propType: "triangle",
      grip: "side",
    });
    expect(parseTriangleRenderKey("triangle_side")).toEqual({
      propType: "triangle",
      grip: "side",
    });
    expect(parseTriangleRenderKey("triangle")).toBeNull();
    expect(parseTriangleRenderKey("fan__lotus")).toBeNull();
    expect(triangleSpriteKey("corner")).toBe("triangle");
    expect(triangleSpriteKey("side")).toBe("triangle_side");
    expect(triangleAppearanceArtwork("side")).toBe(
      "/images/props/appearances/triangle-side.svg?v=1"
    );
    expect(triangleAppearanceArtwork("corner")).toBeNull();
  });

  it("resolves the render key from the appearance", () => {
    expect(resolvePropRenderKey("triangle", {})).toBe("triangle");
    expect(resolvePropRenderKey("triangle", { triangleGrip: "side" })).toBe(
      "triangle__side"
    );
    // No sprite captured yet: the model look falls back to the glyph key.
    expect(
      resolvePropRenderKey("triangle", { triangleGrip: "side", propLook: "model" })
    ).toMatch(/^triangle(__side|_side__model)$/);
    expect(resolvePropRenderKey("minihoop", { triangleGrip: "side" })).toBe(
      "minihoop"
    );
  });

  it("shares one box and one artwork path per grip", () => {
    const box = getPropDimensions("triangle");
    expect(getPropDimensions("triangle__side")).toEqual(box);
    expect(getPropDimensions("triangle_side__model")).toEqual(box);
    expect(resolvePropSvgPath("triangle")).toBe("/images/props/pictograph/triangle.svg");
    expect(resolvePropSvgPath("triangle__side")).toBe(
      "/images/props/appearances/triangle-side.svg?v=1"
    );
  });

  it("gives each grip its own five tips", () => {
    expect(getTipPointsBaseline("triangle").points).toEqual(
      HOOP_FAMILY_TIP_POINTS.triangle
    );
    expect(getTipPointsBaseline("triangle__side").points).toEqual(
      HOOP_FAMILY_TIP_POINTS.triangle_side
    );
    expect(getTipPointsBaseline("triangle_side__model").points).toEqual(
      HOOP_FAMILY_TIP_POINTS.triangle_side
    );
    expect(getTipPointsBaseline("minihoop").points).toEqual(
      HOOP_FAMILY_TIP_POINTS.minihoop
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/pictograph/prop/domain/__tests__/triangle-appearance.test.ts`
Expected: FAIL, cannot resolve `../triangle-appearance`.

- [ ] **Step 3: Write `triangle-appearance.ts`**

```ts
// src/lib/shared/pictograph/prop/domain/triangle-appearance.ts
import { PropType } from "./enums/prop-type";

/**
 * Where the hand holds the triangle. Both are real: a corner grip wraps the
 * printed elbow, a side grip wraps the bow point of one side. The frame is the
 * same object either way and reaches the same distance (spec section 2), so
 * the grip is an appearance choice like a fan build, never notation.
 */
export const TRIANGLE_GRIPS = ["corner", "side"] as const;
export type TriangleGrip = (typeof TRIANGLE_GRIPS)[number];

export const DEFAULT_TRIANGLE_GRIP: TriangleGrip = "corner";

export function normalizeTriangleGrip(value: unknown): TriangleGrip {
  return value === "side" ? "side" : DEFAULT_TRIANGLE_GRIP;
}

export function isTrianglePropType(propType: string | null | undefined): boolean {
  return propType?.toLowerCase() === PropType.TRIANGLE;
}

/**
 * Renderer-only identity, like `resolveFanRenderKey`: the corner grip is the
 * notation glyph, the side grip is a look on top of it. Never enters PropType,
 * choreography, or URLs.
 */
export function resolveTriangleRenderKey(
  propType: string,
  grip: TriangleGrip
): string {
  const normalized = propType.toLowerCase();
  if (!isTrianglePropType(normalized) || grip === "corner") return normalized;
  return `${normalized}__side`;
}

/**
 * The captured model sprite for a grip. The save endpoint only accepts
 * `[a-z0-9_]`, so the side sprite is `triangle_side`, not `triangle-side`.
 */
export function triangleSpriteKey(grip: TriangleGrip): string {
  return grip === "side" ? "triangle_side" : PropType.TRIANGLE;
}

export interface TriangleRenderKey {
  propType: "triangle";
  grip: "side";
}

/** Both the render key and the sprite key of the side grip map back to the triangle. */
export function parseTriangleRenderKey(value: string): TriangleRenderKey | null {
  const normalized = value.toLowerCase();
  if (normalized === "triangle__side" || normalized === "triangle_side") {
    return { propType: "triangle", grip: "side" };
  }
  return null;
}

export function triangleAppearanceArtwork(grip: TriangleGrip): string | null {
  if (grip === "corner") return null;
  // Generated by scripts/build-hoop-family-svgs.mjs on the same box as
  // pictograph/triangle.svg, so placements and trails stay in frame.
  return "/images/props/appearances/triangle-side.svg?v=1";
}

export interface TriangleGripOption {
  id: TriangleGrip;
  label: string;
}

export const TRIANGLE_GRIP_OPTIONS: readonly TriangleGripOption[] = [
  { id: "corner", label: "Corner" },
  { id: "side", label: "Side" },
];
```

- [ ] **Step 4: Thread the grip through `prop-look.ts`**

In `prop-look.ts` add the import:

```ts
import {
  isTrianglePropType,
  normalizeTriangleGrip,
  resolveTriangleRenderKey,
  triangleSpriteKey,
  type TriangleGrip,
} from "./triangle-appearance";
```

Extend the appearance contract:

```ts
export interface PropRenderAppearance {
  fanAppearance?: FanAppearance | null;
  propLook?: PropLook | null;
  triangleGrip?: TriangleGrip | null;
}
```

Replace the body of `resolvePropRenderKey` with:

```ts
  const normalized = propType.toLowerCase();
  if (isFanPropType(normalized)) {
    return resolveFanRenderKey(
      normalized,
      normalizeFanAppearance(appearance.fanAppearance)
    );
  }
  const wantsModel = normalizePropLook(appearance.propLook) === "model";
  if (isTrianglePropType(normalized)) {
    // The grip picks the sprite (triangle or triangle_side) under the model
    // look, and the glyph key (triangle or triangle__side) otherwise.
    const grip = normalizeTriangleGrip(appearance.triangleGrip);
    const spriteKey = triangleSpriteKey(grip);
    if (wantsModel && hasModelSprite(spriteKey)) return `${spriteKey}__model`;
    return resolveTriangleRenderKey(normalized, grip);
  }
  if (wantsModel && hasModelSprite(normalized)) {
    return `${normalized}__model`;
  }
  return normalized;
```

In `propTileArtwork`, replace the model branch so the side grip's sprite is used for tiles:

```ts
  const spriteKey = isTrianglePropType(normalized)
    ? triangleSpriteKey(normalizeTriangleGrip(appearance.triangleGrip))
    : normalized;
  if (
    normalizePropLook(appearance.propLook) === "model" &&
    hasModelSprite(spriteKey)
  ) {
    return {
      href: modelSpriteArtwork(spriteKey, side),
      styled: true,
      prelit: true,
      crop: modelSpriteCrop(PROP_MODEL_SPRITES[spriteKey]!),
    };
  }
```

In `NOTATION_GLYPH_CROPS`, replace the `bighoop` entry and add minihoop and triangle from the generated module:

```ts
import { HOOP_FAMILY_GLYPH_CROPS } from "./hoop-family-geometry.generated";
...
  minihoop: HOOP_FAMILY_GLYPH_CROPS.minihoop,
  bighoop: HOOP_FAMILY_GLYPH_CROPS.bighoop,
  triangle: HOOP_FAMILY_GLYPH_CROPS.triangle,
```

- [ ] **Step 5: Boxes, artwork path, tip points**

`IPropTextureLoader.ts`: import `HOOP_FAMILY_BOXES` from `$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated` and `parseTriangleRenderKey` from `$lib/shared/pictograph/prop/domain/triangle-appearance`. In `PROP_DIMENSIONS` replace the two hoop lines and add the triangle:

```ts
  minihoop: HOOP_FAMILY_BOXES.minihoop,
  bighoop: HOOP_FAMILY_BOXES.bighoop,
  triangle: HOOP_FAMILY_BOXES.triangle,
```

In `getPropDimensions`, after computing `baseType`:

```ts
  const modelRenderKey = parseModelRenderKey(normalized);
  const baseType = modelRenderKey?.propType ?? normalized;
  // Both triangle grips share one grip-centred box (spec section 2).
  const triangleKey = parseTriangleRenderKey(baseType);
  return (
    PROP_DIMENSIONS[triangleKey?.propType ?? baseType] ?? {
      ...DEFAULT_PROP_DIMENSIONS,
    }
  );
```

`svg-generator.ts`: import `parseTriangleRenderKey` and `triangleAppearanceArtwork` from the triangle module. In `resolvePropSvgPath`, after the fan branch:

```ts
  const triangleRenderKey = parseTriangleRenderKey(propTypeLower);
  if (triangleRenderKey) {
    return triangleAppearanceArtwork(triangleRenderKey.grip)!;
  }
```

In `generatePropSvg`, change `const semanticPropType = fanRenderKey?.propType ?? propTypeLower;` to:

```ts
  const semanticPropType =
    fanRenderKey?.propType ??
    parseTriangleRenderKey(propTypeLower)?.propType ??
    propTypeLower;
```

so the side-grip key still recolors selectively as `triangle`.

`prop-tip-points.ts`: import `HOOP_FAMILY_TIP_POINTS` from the generated module. Replace the literal point arrays of `MINIHOOP_TIP_POINTS` and `BIGHOOP_TIP_POINTS` with the generated ones (keep the comments; note in each that the generator reproduces the measured values):

```ts
const MINIHOOP_TIP_POINTS: PropTipConfig = {
  points: [...HOOP_FAMILY_TIP_POINTS.minihoop],
};
const BIGHOOP_TIP_POINTS: PropTipConfig = {
  points: [...HOOP_FAMILY_TIP_POINTS.bighoop],
};
// The triangle's five tips per grip: the far point on the axis, then the two
// vertices and two bow points that frame it (scripts/hoop-family-math.mjs).
const TRIANGLE_TIP_POINTS: PropTipConfig = {
  points: [...HOOP_FAMILY_TIP_POINTS.triangle],
};
const TRIANGLE_SIDE_TIP_POINTS: PropTipConfig = {
  points: [...HOOP_FAMILY_TIP_POINTS.triangle_side],
};
```

In `PROP_TIP_POINTS` after `bighoop: BIGHOOP_TIP_POINTS,` add `triangle: TRIANGLE_TIP_POINTS,`.

In `PROP_RENDER_KEY_TIP_POINTS` add:

```ts
  // The side grip by glyph key and by sprite key. The model-sprite scaler only
  // handles axial tables, so the sprite key is registered outright.
  triangle__side: TRIANGLE_SIDE_TIP_POINTS,
  triangle_side__model: TRIANGLE_SIDE_TIP_POINTS,
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/pictograph/prop/domain/__tests__/ src/lib/shared/animation-engine/domain/types/__tests__/prop-tip-points.test.ts tests/unit/hoop-family/`
Expected: PASS. If `prop-look.test.ts` asserts `resolvePropRenderKey("minihoop", ...)`, it still passes: only the triangle branch changed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/pictograph/prop/domain/triangle-appearance.ts src/lib/shared/pictograph/prop/domain/prop-look.ts src/lib/shared/animation-engine/services/IPropTextureLoader.ts src/lib/shared/animation-engine/services/svg-generator.ts src/lib/shared/animation-engine/domain/types/prop-tip-points.ts src/lib/shared/pictograph/prop/domain/__tests__/triangle-appearance.test.ts
git commit -m "feat(props): triangle grip appearance, render keys, boxes and tip points"
```

---

## Task 5: Settings persistence, animator threading, and the Grip dock

**Files:**
- Modify: `src/lib/shared/settings/domain/app-settings.ts`
- Modify: `src/lib/shared/settings/state/settings-state.svelte.ts`
- Modify: `src/lib/shared/animation-engine/services/prop-type-manager.ts`
- Modify: `src/lib/shared/pictograph/prop/components/PropCompositionPreview.svelte`
- Modify: `src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte`
- Modify: `src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte`
- Test: `tests/unit/hoop-family/triangle-settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/hoop-family/triangle-settings.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "$lib/shared/settings/state/settings-state.svelte";
import type { AppSettings } from "$lib/shared/settings/domain/app-settings";

describe("triangle grip setting", () => {
  it("defaults to the corner grip next to the fan appearance", () => {
    expect(DEFAULT_SETTINGS.triangleGrip).toBe("corner");
    const settings: AppSettings = { ...DEFAULT_SETTINGS, triangleGrip: "side" };
    expect(settings.triangleGrip).toBe("side");
  });
});
```

`DEFAULT_SETTINGS` (line 88 of `settings-state.svelte.ts`) is a non-exported `const`; Step 3 exports it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/hoop-family/triangle-settings.test.ts`
Expected: FAIL, `triangleGrip` undefined.

- [ ] **Step 3: Persist the setting**

`app-settings.ts`: add `import type { TriangleGrip } from "../../pictograph/prop/domain/triangle-appearance";` and, after `fanAppearance?: FanAppearance;`:

```ts
  /** Where the hand holds the triangle: the printed elbow or a side's bow point. */
  triangleGrip?: TriangleGrip;
```

`settings-state.svelte.ts`: import `DEFAULT_TRIANGLE_GRIP` from `$lib/shared/pictograph/prop/domain/triangle-appearance`, add `triangleGrip: DEFAULT_TRIANGLE_GRIP,` after `fanAppearance: DEFAULT_FAN_APPEARANCE,` in `DEFAULT_SETTINGS`, and change `const DEFAULT_SETTINGS` to `export const DEFAULT_SETTINGS`.

- [ ] **Step 4: Thread the grip through the animator's prop type manager**

`prop-type-manager.ts`:

Import:

```ts
import {
  DEFAULT_TRIANGLE_GRIP,
  normalizeTriangleGrip,
  type TriangleGrip,
} from "$lib/shared/pictograph/prop/domain/triangle-appearance";
```

Field, after `private propLook: PropLook = DEFAULT_PROP_LOOK;`:

```ts
  private triangleGrip: TriangleGrip = DEFAULT_TRIANGLE_GRIP;
```

`baseRenderKey` gains a fifth parameter and passes it through:

```ts
  private baseRenderKey(
    propType: string,
    appearance: FanAppearance,
    look: PropLook,
    baseColors: TunnelPropColorPair | null = this.currentBaseColors,
    triangleGrip: TriangleGrip = this.triangleGrip
  ): string {
    return resolvePropRenderKey(propType, {
      fanAppearance: appearance,
      propLook: baseColors ? "pictograph" : look,
      triangleGrip,
    });
  }
```

In `handleOverrides`, after `const nextLook = normalizePropLook(...)`:

```ts
    const nextGrip = normalizeTriangleGrip(
      this.settingsService?.currentSettings?.triangleGrip
    );
```

pass `nextGrip` as the fifth argument to both `baseRenderKey` calls there, and set `this.triangleGrip = nextGrip;` next to `this.propLook = nextLook;`.

In the settings path (the method around line 280 that computes `settingsLook`), add `const settingsGrip = normalizeTriangleGrip(this.settingsService?.currentSettings?.triangleGrip);`, pass it to both `baseRenderKey` calls, and set `this.triangleGrip = settingsGrip;` next to `this.propLook = settingsLook;`.

In the texture reload method (around line 630, `let look = this.propLook;`), add `let grip = this.triangleGrip;`, set `grip = normalizeTriangleGrip(settings.triangleGrip);` in the settings branch, and `this.triangleGrip = grip;` after `this.propLook = look;`.

In `propSig` (around line 415) append the grip: change the template's `${this.propLook}|` to `${this.propLook}:${this.triangleGrip}|`.

`PropCompositionPreview.svelte`: where the default appearance is built (`propLook: getSettings?.().propArtwork ?? null, fanAppearance: ...`), add `triangleGrip: getSettings?.().triangleGrip ?? null,`.

- [ ] **Step 5: The Grip dock in PropGrid**

`PropGrid.svelte` script additions:

```ts
  import {
    TRIANGLE_GRIP_OPTIONS,
    isTrianglePropType,
    normalizeTriangleGrip,
    type TriangleGrip,
  } from "$lib/shared/pictograph/prop/domain/triangle-appearance";
```

Add to the destructured props and the `$props<{...}>()` type:

```ts
    triangleGrip,
    onTriangleGripChange,
```

```ts
    triangleGrip: TriangleGrip;
    onTriangleGripChange: (grip: TriangleGrip) => void;
```

Derived state, next to `showFanLook`:

```ts
  // The triangle's grip is a look on top of the tile, like the fan build. It
  // docks as a two-pill row once the triangle is current.
  const showGrip = $derived(
    showAppearance &&
      selectedPropType !== null &&
      isTrianglePropType(selectedPropType)
  );
  const currentGrip = $derived(normalizeTriangleGrip(triangleGrip));
  function chooseGrip(grip: TriangleGrip) {
    if (currentGrip === grip) return;
    onTriangleGripChange(grip);
  }
```

Snippet, directly after `{/snippet}` of `sizeControl`:

```svelte
  {#snippet gripControl()}
    <div class="size-toggle" role="group" aria-label="Triangle grip">
      {#each TRIANGLE_GRIP_OPTIONS as option (option.id)}
        <button
          type="button"
          class="size-option"
          class:active={currentGrip === option.id}
          aria-pressed={currentGrip === option.id}
          data-testid={`triangle-grip-${option.id}`}
          onclick={() => chooseGrip(option.id)}>{option.label}</button
        >
      {/each}
    </div>
  {/snippet}
```

Rail toolbar: after `{#if showSize}{@render sizeControl()}{/if}` add `{#if showGrip}{@render gripControl()}{/if}`.

Dock: after the `size-dock` block add:

```svelte
  {#if showGrip && drill === null && layout !== "rail"}
    <div class="look-dock size-dock" transition:growFade={{ axis: "y" }}>
      <span class="look-label">Grip</span>
      {@render gripControl()}
    </div>
  {/if}
```

No new CSS: `.size-toggle` and `.size-option` already style both pills, and `.look-dock.size-dock` already lays out the row.

`BentoPropGrid.svelte`: add `| "triangleGrip" | "onTriangleGripChange"` to the `Omit` union and pass:

```svelte
  triangleGrip={settings.triangleGrip ?? "corner"}
  onTriangleGripChange={(triangleGrip) => void updateSettings({ triangleGrip })}
```

Every other `<PropGrid>` host is `BentoPropGrid`, so nothing else changes.

- [ ] **Step 6: Run tests and the type check**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/hoop-family/ && npm run check:fast`
Expected: tests PASS; `check:fast` reports no new errors in the files touched (it may report pre-existing warnings elsewhere; compare against `git stash`-free baseline by scanning for the touched paths only).

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/settings/domain/app-settings.ts src/lib/shared/settings/state/settings-state.svelte.ts src/lib/shared/animation-engine/services/prop-type-manager.ts src/lib/shared/pictograph/prop/components/PropCompositionPreview.svelte src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte tests/unit/hoop-family/triangle-settings.test.ts
git commit -m "feat(props): persist the triangle grip and dock a Corner / Side row"
```

---

## Task 6: 3D reach table (app side)

**Files:**
- Modify: `src/lib/shared/3d/effects/prop-tip-geometry-3d.ts`
- Test: `tests/unit/3d-viewer/triangle-3d.test.ts` (created here, extended in Task 7)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/3d-viewer/triangle-3d.test.ts
import { describe, expect, it } from "vitest";
import { resolvePropTipAnchors3D } from "$lib/shared/3d/effects/prop-tip-geometry-3d";
import { HOOP_FAMILY_REACH_M } from "$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated";

const STAFF_HALF_M = 0.8636 / 2;
const BUILD = { fanBuild: "pictograph", finish: "day" } as const;

describe("hoop family 3D reach", () => {
  it("tracks one tip at an absolute reach that ignores the staff length", () => {
    for (const [prop, reach] of [
      ["triangle", HOOP_FAMILY_REACH_M.triangle],
      ["minihoop", HOOP_FAMILY_REACH_M.minihoop],
      ["bighoop", HOOP_FAMILY_REACH_M.bighoop],
    ] as const) {
      const anchors = resolvePropTipAnchors3D(prop, STAFF_HALF_M, BUILD);
      expect(anchors, prop).toHaveLength(1);
      expect(anchors[0]!.effectTipIndex).toBe(1);
      expect(anchors[0]!.offset.y, prop).toBeCloseTo(reach, 6);
      const shorter = resolvePropTipAnchors3D(prop, STAFF_HALF_M * 0.8, BUILD);
      expect(shorter[0]!.offset.y, prop).toBeCloseTo(reach, 6);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/3d-viewer/triangle-3d.test.ts`
Expected: FAIL: minihoop resolves to `0.8636 * 0.7`, and `PropType.TRIANGLE` is missing from the scene enum (the triangle falls through to the staff default).

- [ ] **Step 3: Make the hoop family absolute**

In `prop-tip-geometry-3d.ts` import `HOOP_FAMILY_REACH_M` from `$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated`. Replace the `HOOP_REACH_RATIO` constant and its comment with:

```ts
/**
 * Hand to the far tube centreline, in metres, from the hoop family station
 * table. A hoop is sold in inch sizes and a triangle is three cut lengths of
 * tubing: both are fixed-size objects, so like the club their reach is
 * absolute. The old `0.7 x staffLength` ratio described the earlier
 * staff-proportional Hoop3D, sized at 0.35x the staff length, and never
 * matched the 18.5in ring: at the default staff length that ratio gives
 * 0.605m against the ring's actual 0.454m reach. The 2D tip tables sit on
 * the tube centreline too, so the reach is measured to the centreline, not
 * the outer edge.
 */
const HOOP_REACH_M = HOOP_FAMILY_REACH_M.minihoop;
const BIGHOOP_REACH_M = HOOP_FAMILY_REACH_M.bighoop;
const TRIANGLE_REACH_M = HOOP_FAMILY_REACH_M.triangle;
```

and the table entries:

```ts
  [PropType.MINIHOOP]: () => HOOP_REACH_M,
  [PropType.BIGHOOP]: () => BIGHOOP_REACH_M,
  [PropType.TRIANGLE]: () => TRIANGLE_REACH_M,
```

`PropType.TRIANGLE` here is the scene package's enum; it does not exist until Task 7 adds it, so this task's test passes only after Task 7. Run the hoop half now by temporarily asserting only minihoop and bighoop if you want a green checkpoint; otherwise proceed straight to Task 7 and run this test there.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/3d/effects/prop-tip-geometry-3d.ts tests/unit/3d-viewer/triangle-3d.test.ts
git commit -m "feat(3d): absolute reaches for the hoop family"
```

---

## Task 7: Package patch: `PropType.TRIANGLE`, `PropBuild.triangleGrip`, hoop hardware, `Triangle3D`

All package edits happen in a pnpm patch directory, then land with `pnpm patch-commit`, which rewrites `patches/@austencloud__scene-3d@0.1.6.patch`, `pnpm-lock.yaml`, and the shared `node_modules`. The dev server in the primary checkout resolves the package to `src/`, so it picks the change up on restart.

**Files (inside the patch dir, mirrored under `node_modules/@austencloud/scene-3d/src/`):**
- Modify: `lib/domain/enums/PropType.ts`
- Modify: `lib/state/prop-finish-state.svelte.ts`
- Modify: `lib/components/props/hoop-geometry.ts`
- Modify: `lib/components/props/frame-materials.ts`
- Modify: `lib/components/props/Hoop3D.svelte`
- Create: `lib/components/props/triangle-geometry.ts`
- Create: `lib/components/props/Triangle3D.svelte`
- Modify: `lib/components/props/Prop3D.svelte`
- Repo: `patches/@austencloud__scene-3d@0.1.6.patch`, `pnpm-lock.yaml`
- Test: `tests/unit/3d-viewer/triangle-3d.test.ts` (extend)

- [ ] **Step 1: Extend the failing test**

Append to `tests/unit/3d-viewer/triangle-3d.test.ts`:

```ts
import { PropType } from "@austencloud/scene-3d";
import { toScenePropType } from "$lib/shared/3d/domain/scene-prop-type";
import { PropType as AppPropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { TRIANGLE_STATIONS_M } from "$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated";
import {
  TRIANGLE_ARC_ANGLE,
  TRIANGLE_BOW_RADIUS_M,
  TRIANGLE_ELBOW_LEG_M,
  TRIANGLE_REACH_M,
  TRIANGLE_SLEEVE_RADIUS_M,
  triangleSideArcs,
  triangleVertices,
} from "../../../node_modules/@austencloud/scene-3d/src/lib/components/props/triangle-geometry";
import {
  HOOP_GRIP_TAPE_M,
  HOOP_JOIN_TAPE_M,
  HOOP_BUTTON_RADIUS_M,
  HOOP_HARDWARE_RADIUS_M,
  HOOP_CENTERLINE_RADIUS_M,
  HOOP_TUBE_RADIUS_M,
} from "../../../node_modules/@austencloud/scene-3d/src/lib/components/props/hoop-geometry";
import { propFinishState } from "../../../node_modules/@austencloud/scene-3d/src/lib/state/prop-finish-state.svelte";

describe("triangle 3D geometry", () => {
  it("passes straight through to the scene enum", () => {
    expect(toScenePropType(AppPropType.TRIANGLE)).toBe(PropType.TRIANGLE);
    expect(PropType.TRIANGLE).toBe("triangle");
  });

  it("restates the station table to the metre", () => {
    expect(TRIANGLE_BOW_RADIUS_M).toBeCloseTo(TRIANGLE_STATIONS_M.bowRadius, 6);
    expect(TRIANGLE_ARC_ANGLE).toBeCloseTo(TRIANGLE_STATIONS_M.arcAngle, 9);
    expect(TRIANGLE_REACH_M).toBeCloseTo(TRIANGLE_STATIONS_M.reach, 6);
    expect(TRIANGLE_SLEEVE_RADIUS_M).toBeCloseTo(TRIANGLE_STATIONS_M.sleeveRadius, 9);
    expect(TRIANGLE_ELBOW_LEG_M).toBe(TRIANGLE_STATIONS_M.elbowLeg);
  });

  it("puts the far point at the reach for both grips, along +y", () => {
    for (const grip of ["corner", "side"] as const) {
      const vertices = triangleVertices(grip);
      const arcs = triangleSideArcs(grip);
      expect(arcs).toHaveLength(3);
      // Every arc endpoint lands on a vertex.
      for (const arc of arcs) {
        for (const angle of [arc.startAngle, arc.startAngle + TRIANGLE_ARC_ANGLE]) {
          const x = arc.centre.x + TRIANGLE_BOW_RADIUS_M * Math.cos(angle);
          const y = arc.centre.y + TRIANGLE_BOW_RADIUS_M * Math.sin(angle);
          const onVertex = vertices.some(
            (v) => Math.hypot(v.x - x, v.y - y) < 1e-9
          );
          expect(onVertex, `${grip} ${angle}`).toBe(true);
        }
      }
      // The furthest point on any arc from the hand is the reach.
      const far = Math.max(
        ...arcs.map((arc) => {
          const mid = arc.startAngle + TRIANGLE_ARC_ANGLE / 2;
          return arc.centre.y + TRIANGLE_BOW_RADIUS_M * Math.sin(mid);
        }),
        ...vertices.map((v) => v.y)
      );
      expect(far, grip).toBeCloseTo(TRIANGLE_REACH_M, 9);
    }
    expect(triangleVertices("corner")[0]).toEqual({ x: 0, y: 0 });
    expect(triangleVertices("side")[2].y).toBeCloseTo(TRIANGLE_REACH_M, 9);
  });

  it("dresses the hoop with tape, a button and a grip wrap at real sizes", () => {
    expect(HOOP_HARDWARE_RADIUS_M).toBeCloseTo(HOOP_TUBE_RADIUS_M * 1.3, 9);
    expect(HOOP_JOIN_TAPE_M).toBe(0.045);
    expect(HOOP_GRIP_TAPE_M).toBe(0.15);
    expect(HOOP_BUTTON_RADIUS_M).toBe(0.003);
    expect(HOOP_JOIN_TAPE_M / HOOP_CENTERLINE_RADIUS_M).toBeLessThan(Math.PI / 4);
  });

  it("carries the grip in the scene build", () => {
    expect(propFinishState.build.triangleGrip).toBe("corner");
    propFinishState.setTriangleGrip("side");
    expect(propFinishState.triangleGrip).toBe("side");
    expect(propFinishState.build.triangleGrip).toBe("side");
    propFinishState.setTriangleGrip("corner");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/3d-viewer/triangle-3d.test.ts`
Expected: FAIL, `triangle-geometry` module missing.

- [ ] **Step 3: Open the patch directory**

Run: `pnpm patch @austencloud/scene-3d@0.1.6 --edit-dir "$TMP/scene-3d-triangle"` (Git Bash; on PowerShell use `$env:TEMP`). pnpm copies the currently patched package into that directory. Confirm `ls "$TMP/scene-3d-triangle/src/lib/components/props/Hoop3D.svelte"` exists. Make every edit below inside that directory.

- [ ] **Step 4: Enum and build state**

`src/lib/domain/enums/PropType.ts` (tab-indented): after `BIGHOOP = "bighoop",` add `TRIANGLE = "triangle",`.

`src/lib/state/prop-finish-state.svelte.ts`:

```ts
export type TriangleGrip = "corner" | "side";

export interface PropBuild {
  finish: PropFinish;
  fanBuild: FanBuild;
  fanFrameColor: FanFrameColor;
  fanCover: FanCover;
  /** Where the hand holds the triangle: a printed elbow or a side's bow point. */
  triangleGrip: TriangleGrip;
}
```

In the class add `private _triangleGrip = $state<TriangleGrip>("corner");`, the accessors:

```ts
  get triangleGrip(): TriangleGrip {
    return this._triangleGrip;
  }

  setTriangleGrip(grip: TriangleGrip): void {
    this._triangleGrip = grip;
  }
```

and `triangleGrip: this._triangleGrip,` in the `build` getter.

- [ ] **Step 5: Hoop hardware stations and material**

`src/lib/components/props/hoop-geometry.ts`: replace the paragraph beginning `Deliberately NOT modelled: the connector join.` with:

```
 * The connector join used to be deliberately left off: the seam itself is a
 * hairline. What IS visible on a mini hoop in someone's hand is the gaffer
 * tape wrapped over the join with the push button showing through it, and the
 * grip wrap opposite. Those are centimetres long and they are what make a ring
 * read as a hoop rather than a torus primitive, so they are modelled below.
```

Append after `HOOP_REACH_M`:

```ts
/**
 * Hardware bands sit over the tube at this ratio of its radius: the printed
 * elbow sleeves on the triangle measure 1.3x the tube in the photo, and the
 * taped bands on a hoop read the same. scripts/hoop-family-stations.json.
 */
export const HOOP_HARDWARE_RATIO = 1.3;
export const HOOP_HARDWARE_RADIUS_M = HOOP_TUBE_RADIUS_M * HOOP_HARDWARE_RATIO;

/** Gaffer band over the insert connector, at the far rim from the hand. */
export const HOOP_JOIN_TAPE_M = 0.045;
/** The push button showing through the join tape: 6 mm across. */
export const HOOP_BUTTON_RADIUS_M = 0.003;
/** Grip wrap centred on the hand. */
export const HOOP_GRIP_TAPE_M = 0.15;

/** Arc a band of the given length subtends on the ring's centreline, in radians. */
export function hoopBandArc(lengthM: number, scale: number): number {
  return lengthM / HOOP_CENTERLINE_RADIUS_M;
}
```

(`scale` cancels: band length and ring radius both scale, so the arc is scale-free; keep the parameter out if the linter flags it as unused. Simplest: `export function hoopBandArc(lengthM: number): number { return lengthM / HOOP_CENTERLINE_RADIUS_M; }`.)

`src/lib/components/props/frame-materials.ts`: add `hardware` to `HoopMaterialSet` and its factory:

```ts
export interface HoopMaterialSet {
  /** The tube. One material for the whole ring, because a hoop is one tube. */
  readonly tube: MeshPhysicalMaterial;
  /** Gaffer tape, printed elbows and the push button: matte near-black. */
  readonly hardware: MeshStandardMaterial;
  /** Path-visualization marker at the prop's position. */
  readonly trail: MeshBasicMaterial;
}
```

and in `getHoopMaterials`, after `tube:`:

```ts
    hardware: new MeshStandardMaterial({
      color: "#1c1c1f",
      roughness: 0.72,
      metalness: 0.04,
    }),
```

(`MeshStandardMaterial` is already imported in that file for the frame set.)

- [ ] **Step 6: Hoop3D with tape, button and grip wrap**

Replace the module script of `src/lib/components/props/Hoop3D.svelte` with:

```svelte
<script module lang="ts">
  import { SphereGeometry, TorusGeometry } from "three";
  import {
    HOOP_CENTERLINE_RADIUS_M,
    HOOP_TUBE_RADIUS_M,
    HOOP_RING_SEGMENTS,
    HOOP_TUBE_SEGMENTS,
    HOOP_HARDWARE_RADIUS_M,
    HOOP_JOIN_TAPE_M,
    HOOP_GRIP_TAPE_M,
    HOOP_BUTTON_RADIUS_M,
    hoopBandArc,
  } from "./hoop-geometry";

  interface HoopGeometrySet {
    ring: TorusGeometry;
    joinTape: TorusGeometry;
    gripTape: TorusGeometry;
    button: SphereGeometry;
  }

  const builds = new Map<number, HoopGeometrySet>();

  function band(scale: number, lengthM: number): TorusGeometry {
    const arc = hoopBandArc(lengthM);
    return new TorusGeometry(
      HOOP_CENTERLINE_RADIUS_M * scale,
      HOOP_HARDWARE_RADIUS_M * scale,
      12,
      Math.max(8, Math.round((HOOP_RING_SEGMENTS * arc) / (2 * Math.PI))),
      arc
    );
  }

  function getHoopGeometry(scale: number): HoopGeometrySet {
    const cached = builds.get(scale);
    if (cached) return cached;

    const geometry: HoopGeometrySet = {
      ring: new TorusGeometry(
        HOOP_CENTERLINE_RADIUS_M * scale,
        HOOP_TUBE_RADIUS_M * scale,
        HOOP_TUBE_SEGMENTS,
        HOOP_RING_SEGMENTS
      ),
      joinTape: band(scale, HOOP_JOIN_TAPE_M),
      gripTape: band(scale, HOOP_GRIP_TAPE_M),
      button: new SphereGeometry(HOOP_BUTTON_RADIUS_M * scale, 12, 8),
    };
    builds.set(scale, geometry);
    return geometry;
  }

  /** Rotation about z that centres an arc of `arc` radians on `centreAngle`. */
  function centreArc(centreAngle: number, arc: number): number {
    return centreAngle - arc / 2;
  }
</script>
```

Update the instance script: replace the paragraph starting `The invented white grip torus is gone.` with:

```
   * Two black bands dress the ring: gaffer tape over the connector join at the
   * far rim, with the push button showing through it, and the grip wrap
   * centred on the hand at the near rim. Both come off the station table in
   * `scripts/hoop-family-stations.json`. Nothing else marks the ring.
```

and replace `const geometry = $derived(getHoopGeometry(scale));` with:

```ts
  const geometry = $derived(getHoopGeometry(scale));
  const joinArc = $derived(hoopBandArc(HOOP_JOIN_TAPE_M));
  const gripArc = $derived(hoopBandArc(HOOP_GRIP_TAPE_M));
  const ringLift = $derived(HOOP_CENTERLINE_RADIUS_M * scale);
```

Replace the markup inside `<T.Group {rotation} layers={propLayer}>` with:

```svelte
    <!-- Lifted by the centreline radius so the tube's centreline passes through
         the origin at the bottom of the ring, which is where the hand is. -->
    <T.Mesh
      geometry={geometry.ring}
      material={materials.tube}
      position={[0, ringLift, 0]}
      dispose={false}
    />
    <!-- Join tape at the far rim (angle pi/2 in the torus plane), button on top of it. -->
    <T.Mesh
      geometry={geometry.joinTape}
      material={materials.hardware}
      position={[0, ringLift, 0]}
      rotation={[0, 0, centreArc(Math.PI / 2, joinArc)]}
      dispose={false}
    />
    <T.Mesh
      geometry={geometry.button}
      material={materials.hardware}
      position={[0, 2 * ringLift + HOOP_HARDWARE_RADIUS_M * scale, 0]}
      dispose={false}
    />
    <!-- Grip wrap centred on the hand (angle -pi/2). -->
    <T.Mesh
      geometry={geometry.gripTape}
      material={materials.hardware}
      position={[0, ringLift, 0]}
      rotation={[0, 0, centreArc(-Math.PI / 2, gripArc)]}
      dispose={false}
    />
```

- [ ] **Step 7: `triangle-geometry.ts`**

```ts
// src/lib/components/props/triangle-geometry.ts
/**
 * Triangle: three lengths of 5/8in hoop tubing joined by printed elbows into
 * an equilateral frame whose sides keep the tubing's bow.
 *
 * Every number restates scripts/hoop-family-stations.json in the app repo
 * (metres here, millimetres there); tests/unit/3d-viewer/triangle-3d.test.ts
 * pins the two together. The chord is 22in, measured off the photo at the
 * tube's known 5/8in; the sides bow outward by 4% of the chord.
 *
 * The frame lies in the XY plane like the hoop's torus, hand at the origin,
 * reach along +y. Corner grip: vertex 0 on the hand, the far side across +y.
 * Side grip: the near side's bow point on the hand, so its chord sits one
 * sagitta ahead and the far vertex is at full reach. Both reaches are height
 * plus one sagitta, which is why one reach entry serves both grips.
 */
import { HOOP_HARDWARE_RATIO, HOOP_TUBE_RADIUS_M } from "./hoop-geometry";

export type TriangleGrip = "corner" | "side";

export const TRIANGLE_SIDE_CHORD_M = 0.5588;
export const TRIANGLE_SAGITTA_M = 0.02235;

/** R = c^2 / 8s + s / 2, the circle through both vertices and the bow point. */
export const TRIANGLE_BOW_RADIUS_M =
  (TRIANGLE_SIDE_CHORD_M * TRIANGLE_SIDE_CHORD_M) / (8 * TRIANGLE_SAGITTA_M) +
  TRIANGLE_SAGITTA_M / 2;

/** Full arc each side subtends at its bow centre, in radians (about 18.3 degrees). */
export const TRIANGLE_ARC_ANGLE =
  2 * Math.asin(TRIANGLE_SIDE_CHORD_M / (2 * TRIANGLE_BOW_RADIUS_M));

export const TRIANGLE_HEIGHT_M = (TRIANGLE_SIDE_CHORD_M * Math.sqrt(3)) / 2;

/** Hand to the far tube centreline, both grips. */
export const TRIANGLE_REACH_M = TRIANGLE_HEIGHT_M + TRIANGLE_SAGITTA_M;

export const TRIANGLE_TUBE_RADIUS_M = HOOP_TUBE_RADIUS_M;

/** Printed elbow sleeve, 1.3x the tube. */
export const TRIANGLE_SLEEVE_RADIUS_M = HOOP_TUBE_RADIUS_M * HOOP_HARDWARE_RATIO;

/** How far each elbow reaches along each side from the vertex. */
export const TRIANGLE_ELBOW_LEG_M = 0.05;

/** The elbow leg as an arc on the bow circle, in radians. */
export const TRIANGLE_ELBOW_LEG_ANGLE = TRIANGLE_ELBOW_LEG_M / TRIANGLE_BOW_RADIUS_M;

/** Segments around each side's arc; 0.56 m of tube at about 6 mm per segment. */
export const TRIANGLE_SIDE_SEGMENTS = 96;
export const TRIANGLE_TUBE_SEGMENTS = 20;

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface TriangleSideArc {
  /** Centre of the bow circle for this side. */
  readonly centre: Point2;
  /** Angle (radians, CCW from +x) where the arc begins; it sweeps TRIANGLE_ARC_ANGLE. */
  readonly startAngle: number;
}

/** Both grips wind counter-clockwise (x right, y up) so each side's arc runs from its first vertex to its second. */
export function triangleVertices(grip: TriangleGrip): readonly [Point2, Point2, Point2] {
  const half = TRIANGLE_SIDE_CHORD_M / 2;
  if (grip === "side") {
    return [
      { x: -half, y: TRIANGLE_SAGITTA_M },
      { x: half, y: TRIANGLE_SAGITTA_M },
      { x: 0, y: TRIANGLE_SAGITTA_M + TRIANGLE_HEIGHT_M },
    ];
  }
  return [
    { x: 0, y: 0 },
    { x: half, y: TRIANGLE_HEIGHT_M },
    { x: -half, y: TRIANGLE_HEIGHT_M },
  ];
}

/**
 * One arc per side. The bow centre sits on the perpendicular bisector, on the
 * centroid's side of the chord, R - s from the chord's midpoint; the arc is
 * centred on the outward normal's angle.
 */
export function triangleSideArcs(grip: TriangleGrip): readonly TriangleSideArc[] {
  const [a, b, c] = triangleVertices(grip);
  const centroid = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  return [
    [a, b],
    [b, c],
    [c, a],
  ].map(([p, q]) => {
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const nx = mid.x - centroid.x;
    const ny = mid.y - centroid.y;
    const len = Math.hypot(nx, ny);
    const inset = TRIANGLE_BOW_RADIUS_M - TRIANGLE_SAGITTA_M;
    return {
      centre: { x: mid.x - (nx / len) * inset, y: mid.y - (ny / len) * inset },
      startAngle: Math.atan2(ny, nx) - TRIANGLE_ARC_ANGLE / 2,
    };
  });
}
```

- [ ] **Step 8: `Triangle3D.svelte`**

```svelte
<script module lang="ts">
  import { SphereGeometry, TorusGeometry } from "three";
  import {
    TRIANGLE_ARC_ANGLE,
    TRIANGLE_BOW_RADIUS_M,
    TRIANGLE_ELBOW_LEG_ANGLE,
    TRIANGLE_SIDE_SEGMENTS,
    TRIANGLE_SLEEVE_RADIUS_M,
    TRIANGLE_TUBE_RADIUS_M,
    TRIANGLE_TUBE_SEGMENTS,
  } from "./triangle-geometry";

  interface TriangleGeometrySet {
    side: TorusGeometry;
    leg: TorusGeometry;
    vertex: SphereGeometry;
  }

  let cached: TriangleGeometrySet | null = null;

  /** One frame size only: the triangle ships in one size and has no big variant. */
  function getTriangleGeometry(): TriangleGeometrySet {
    if (cached) return cached;
    cached = {
      side: new TorusGeometry(
        TRIANGLE_BOW_RADIUS_M,
        TRIANGLE_TUBE_RADIUS_M,
        TRIANGLE_TUBE_SEGMENTS,
        TRIANGLE_SIDE_SEGMENTS,
        TRIANGLE_ARC_ANGLE
      ),
      leg: new TorusGeometry(
        TRIANGLE_BOW_RADIUS_M,
        TRIANGLE_SLEEVE_RADIUS_M,
        12,
        8,
        TRIANGLE_ELBOW_LEG_ANGLE
      ),
      vertex: new SphereGeometry(TRIANGLE_SLEEVE_RADIUS_M, 16, 12),
    };
    return cached;
  }
</script>

<script lang="ts">
  /**
   * Triangle3D Component
   *
   * Three bowed sides of 5/8in hoop tubing in the hand colour, six printed
   * elbow legs and three vertex spheres in black. `triangle-geometry.ts`
   * carries the numbers; the grip in `build.triangleGrip` decides which point
   * of the frame sits on the group origin. Same materials as Hoop3D: the
   * triangle is hoop tubing.
   */

  import { T } from "@threlte/core";
  import type { Prop3DProps } from "./Prop3DProps";
  import { computePropRotation } from "./prop3d-transforms";
  import { getHoopMaterials } from "./frame-materials";
  import { PLATE_TRAIL_GEOMETRY } from "./plate-materials";
  import {
    LAYER_WORLD,
    LAYER_PLAYER_BODY,
  } from "../../layers/layer-constants";
  import {
    TRIANGLE_ARC_ANGLE,
    TRIANGLE_ELBOW_LEG_ANGLE,
    triangleSideArcs,
    triangleVertices,
  } from "./triangle-geometry";

  let {
    propState,
    color,
    visible = true,
    isActivePlayer = false,
    build,
  }: Prop3DProps = $props();

  const propLayer = $derived(isActivePlayer ? LAYER_PLAYER_BODY : LAYER_WORLD);
  const grip = $derived(build?.triangleGrip === "side" ? "side" : "corner");
  const geometry = getTriangleGeometry();
  const materials = $derived(getHoopMaterials(color));
  const arcs = $derived(triangleSideArcs(grip));
  const vertices = $derived(triangleVertices(grip));
  const rotation = $derived(computePropRotation(propState));
</script>

{#if visible}
  <T.Group {rotation} layers={propLayer}>
    {#each arcs as arc, i (i)}
      <T.Mesh
        geometry={geometry.side}
        material={materials.tube}
        position={[arc.centre.x, arc.centre.y, 0]}
        rotation={[0, 0, arc.startAngle]}
        dispose={false}
      />
      <!-- Elbow legs: the first 50 mm of the side from each end. -->
      <T.Mesh
        geometry={geometry.leg}
        material={materials.hardware}
        position={[arc.centre.x, arc.centre.y, 0]}
        rotation={[0, 0, arc.startAngle]}
        dispose={false}
      />
      <T.Mesh
        geometry={geometry.leg}
        material={materials.hardware}
        position={[arc.centre.x, arc.centre.y, 0]}
        rotation={[0, 0, arc.startAngle + TRIANGLE_ARC_ANGLE - TRIANGLE_ELBOW_LEG_ANGLE]}
        dispose={false}
      />
    {/each}
    {#each vertices as vertex, i (i)}
      <T.Mesh
        geometry={geometry.vertex}
        material={materials.hardware}
        position={[vertex.x, vertex.y, 0]}
        dispose={false}
      />
    {/each}
  </T.Group>

  <T.Mesh
    geometry={PLATE_TRAIL_GEOMETRY}
    material={materials.trail}
    layers={propLayer}
    dispose={false}
  />
{/if}
```

- [ ] **Step 9: Dispatch from Prop3D**

`src/lib/components/props/Prop3D.svelte`: add `import Triangle3D from "./Triangle3D.svelte";` after the Hoop3D import, and after the `BIGHOOP` branch:

```svelte
  {:else if propType === PropType.TRIANGLE}
    <Triangle3D {propState} {color} {visible} {isActivePlayer} {build} />
```

- [ ] **Step 10: Commit the patch and run the tests**

Run: `pnpm patch-commit "$TMP/scene-3d-triangle"`
Expected: `patches/@austencloud__scene-3d@0.1.6.patch` grows, `pnpm-lock.yaml` updates its patch hash, and `node_modules/@austencloud/scene-3d/src/lib/components/props/Triangle3D.svelte` exists.

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/3d-viewer/triangle-3d.test.ts tests/unit/3d-viewer/fan-appearance-state.test.ts tests/unit/worker-renderer/worker-prop-factory.test.ts`
Expected: `triangle-3d` PASS. `fan-appearance-state` FAILS on the `toEqual` of `propFinishState.build` (it now has `triangleGrip`): add `triangleGrip: "corner",` to that expected object in `tests/unit/3d-viewer/fan-appearance-state.test.ts`. `worker-prop-factory` FAILS on "pins exact support to every canonical PropType": that is Task 8.

- [ ] **Step 11: Commit**

```bash
git add patches/@austencloud__scene-3d@0.1.6.patch pnpm-lock.yaml tests/unit/3d-viewer/triangle-3d.test.ts tests/unit/3d-viewer/fan-appearance-state.test.ts
git commit -m "feat(scene-3d): triangle prop, hoop tape and button, grip in the build"
```

---

## Task 8: Worker renderer mirror

**Files:**
- Modify: `src/lib/shared/3d/worker-renderer/worlds/props/worker-prop-factory-types.ts`
- Modify: `src/lib/shared/3d/worker-renderer/domain/worker-renderer-protocol.ts`
- Modify: `src/lib/shared/3d/worker-renderer/worlds/props/worker-prop-materials.ts`
- Modify: `src/lib/shared/3d/worker-renderer/worlds/props/worker-procedural-props.ts`
- Modify: `src/lib/shared/3d/worker-renderer/services/worker-performer-effect-intent.ts`
- Modify: `src/lib/shared/3d/worker-renderer/services/worker-performer-snapshot.ts`
- Modify: `src/lib/shared/3d/worker-renderer/worlds/worker-performer.ts`
- Test: `tests/unit/worker-renderer/worker-hoop-family.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/worker-renderer/worker-hoop-family.test.ts
import { Box3, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createProceduralWorkerProp } from "$lib/shared/3d/worker-renderer/worlds/props/worker-procedural-props";
import type { WorkerPropFactoryOptions } from "$lib/shared/3d/worker-renderer/worlds/props/worker-prop-factory-types";
import {
  HOOP_FAMILY_REACH_M,
  TRIANGLE_STATIONS_M,
} from "$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated";

function options(
  propType: string,
  triangleGrip: "corner" | "side" = "corner"
): WorkerPropFactoryOptions {
  return {
    propType,
    color: "blue",
    length: 0.8636,
    thickness: 0.012,
    build: {
      finish: "day",
      fanBuild: "pictograph",
      fanFrameColor: "black",
      fanCover: "bare",
      triangleGrip,
    },
    layer: 3,
  };
}

function meshes(root: { traverse(cb: (o: unknown) => void): void }): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) out.push(o);
  });
  return out;
}

function bodyBounds(visual: { root: { children: unknown[] } }): Box3 {
  // createVisual adds the rotated body first, then the trail indicator.
  const body = visual.root.children[0] as Parameters<Box3["setFromObject"]>[0];
  body.updateMatrixWorld(true);
  // precise = true walks the vertices; the default corner-transform box
  // over-estimates a rotated torus arc by a few millimetres.
  return new Box3().setFromObject(body, true);
}

describe("worker hoop family", () => {
  it("dresses the hoop with a ring, two bands and a button", () => {
    const visual = createProceduralWorkerProp(options("minihoop"));
    expect(visual).not.toBeNull();
    // ring + join tape + button + grip tape + trail indicator
    expect(meshes(visual!.root)).toHaveLength(5);
    const box = bodyBounds(visual!);
    const size = box.getSize(new Vector3());
    // Ring top is 2 x centreline; the button sits one hardware radius above
    // that and is 3 mm in radius.
    expect(box.max.y).toBeCloseTo(
      HOOP_FAMILY_REACH_M.minihoop + TRIANGLE_STATIONS_M.sleeveRadius + 0.003,
      3
    );
    expect(size.x).toBeCloseTo(HOOP_FAMILY_REACH_M.minihoop + 2 * TRIANGLE_STATIONS_M.tubeRadius, 2);
  });

  it("builds the triangle from three sides, six legs and three vertices", () => {
    for (const grip of ["corner", "side"] as const) {
      const visual = createProceduralWorkerProp(options("triangle", grip));
      expect(visual, grip).not.toBeNull();
      expect(meshes(visual!.root), grip).toHaveLength(3 + 6 + 3 + 1);
      const box = bodyBounds(visual!);
      expect(box.max.y, grip).toBeCloseTo(
        TRIANGLE_STATIONS_M.reach + TRIANGLE_STATIONS_M.tubeRadius,
        2
      );
      expect(box.max.x, grip).toBeCloseTo(
        TRIANGLE_STATIONS_M.sideChord / 2 + TRIANGLE_STATIONS_M.sleeveRadius,
        2
      );
      expect(box.min.x, grip).toBeCloseTo(-box.max.x, 2);
    }
    // The corner grip has nothing behind the hand but the sleeve sphere; the
    // side grip has only the tube radius.
    const corner = bodyBounds(createProceduralWorkerProp(options("triangle", "corner"))!);
    const side = bodyBounds(createProceduralWorkerProp(options("triangle", "side"))!);
    expect(corner.min.y).toBeCloseTo(-TRIANGLE_STATIONS_M.sleeveRadius, 3);
    expect(side.min.y).toBeCloseTo(-TRIANGLE_STATIONS_M.tubeRadius, 3);
  });
});
```

`TRIANGLE_STATIONS_M.sleeveRadius` equals the hoop hardware radius (both are `tubeRadius x 1.3`), which is why the hoop test borrows it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/worker-renderer/worker-hoop-family.test.ts tests/unit/worker-renderer/worker-prop-factory.test.ts`
Expected: FAIL: the triangle returns null (unsupported), the hoop has 2 meshes, and `worker-prop-factory` complains that `triangle` is not pinned.

- [ ] **Step 3: Types and protocol**

`worker-prop-factory-types.ts`: after `BIGHOOP: "bighoop",` add `TRIANGLE: "triangle",`. In `WorkerPropBuild` add `triangleGrip: "corner" | "side";` after `fanCover`.

`worker-renderer-protocol.ts`: add `"triangle",` after `"bighoop",` in `WORKER_PERFORMER_PROP_TYPES`.

`worker-prop-materials.ts`: add `hardware: MeshStandardMaterial;` to `HoopMaterials` and, in `getHoopMaterials`, after the `tube` entry:

```ts
    hardware: new MeshStandardMaterial({
      color: "#1c1c1f",
      roughness: 0.72,
      metalness: 0.04,
    }),
```

- [ ] **Step 4: Hoop hardware and the triangle builder**

`worker-procedural-props.ts`: add `CANONICAL_PROP_TYPE.TRIANGLE,` after `CANONICAL_PROP_TYPE.BIGHOOP,` in `PROCEDURAL_WORKER_PROP_TYPES`.

Replace the hoop block (from `const HOOP_OUTER_DIAMETER = 0.4699;` through the end of `createHoop`) with:

```ts
// Mirrors hoop-geometry.ts and triangle-geometry.ts in @austencloud/scene-3d,
// which restate scripts/hoop-family-stations.json in metres.
// tests/unit/worker-renderer/worker-hoop-family.test.ts pins the built
// geometry to the generated station module.
const HOOP_OUTER_DIAMETER = 0.4699;
const HOOP_TUBE_RADIUS = 0.015875 / 2;
const HOOP_CENTERLINE_RADIUS = HOOP_OUTER_DIAMETER / 2 - HOOP_TUBE_RADIUS;
const HOOP_HARDWARE_RADIUS = HOOP_TUBE_RADIUS * 1.3;
const HOOP_JOIN_TAPE = 0.045;
const HOOP_GRIP_TAPE = 0.15;
const HOOP_BUTTON_RADIUS = 0.003;

interface HoopGeometries {
  ring: TorusGeometry;
  joinTape: TorusGeometry;
  gripTape: TorusGeometry;
  button: SphereGeometry;
}
const hoopGeometries = new Map<number, HoopGeometries>();

function hoopBand(scale: number, length: number): TorusGeometry {
  const arc = length / HOOP_CENTERLINE_RADIUS;
  return new TorusGeometry(
    HOOP_CENTERLINE_RADIUS * scale,
    HOOP_HARDWARE_RADIUS * scale,
    12,
    Math.max(8, Math.round((128 * arc) / (2 * Math.PI))),
    arc
  );
}

function getHoopGeometries(scale: number): HoopGeometries {
  let geometry = hoopGeometries.get(scale);
  if (!geometry) {
    geometry = {
      ring: new TorusGeometry(
        HOOP_CENTERLINE_RADIUS * scale,
        HOOP_TUBE_RADIUS * scale,
        20,
        128
      ),
      joinTape: hoopBand(scale, HOOP_JOIN_TAPE),
      gripTape: hoopBand(scale, HOOP_GRIP_TAPE),
      button: new SphereGeometry(HOOP_BUTTON_RADIUS * scale, 12, 8),
    };
    hoopGeometries.set(scale, geometry);
  }
  return geometry;
}

function createHoop(
  options: WorkerPropFactoryOptions,
  scale: number
): WorkerPropVisual {
  const layer = options.layer ?? 0;
  const geometry = getHoopGeometries(scale);
  const materials = getHoopMaterials(options.color);
  const body = new Group();
  const lift = HOOP_CENTERLINE_RADIUS * scale;

  const ring = mesh(geometry.ring, materials.tube, layer);
  ring.position.y = lift;
  body.add(ring);

  // Join tape at the far rim (angle pi/2), the push button on top of it.
  const joinTape = mesh(geometry.joinTape, materials.hardware, layer);
  joinTape.position.y = lift;
  joinTape.rotation.z = Math.PI / 2 - HOOP_JOIN_TAPE / HOOP_CENTERLINE_RADIUS / 2;
  body.add(joinTape);

  const button = mesh(geometry.button, materials.hardware, layer);
  button.position.y = 2 * lift + HOOP_HARDWARE_RADIUS * scale;
  body.add(button);

  // Grip wrap centred on the hand (angle -pi/2).
  const gripTape = mesh(geometry.gripTape, materials.hardware, layer);
  gripTape.position.y = lift;
  gripTape.rotation.z = -Math.PI / 2 - HOOP_GRIP_TAPE / HOOP_CENTERLINE_RADIUS / 2;
  body.add(gripTape);

  return createVisual(options, body, materials.trail);
}

const TRIANGLE_SIDE_CHORD = 0.5588;
const TRIANGLE_SAGITTA = 0.02235;
const TRIANGLE_BOW_RADIUS =
  (TRIANGLE_SIDE_CHORD * TRIANGLE_SIDE_CHORD) / (8 * TRIANGLE_SAGITTA) +
  TRIANGLE_SAGITTA / 2;
const TRIANGLE_ARC_ANGLE =
  2 * Math.asin(TRIANGLE_SIDE_CHORD / (2 * TRIANGLE_BOW_RADIUS));
const TRIANGLE_HEIGHT = (TRIANGLE_SIDE_CHORD * Math.sqrt(3)) / 2;
const TRIANGLE_ELBOW_LEG_ANGLE = 0.05 / TRIANGLE_BOW_RADIUS;

interface TriangleGeometries {
  side: TorusGeometry;
  leg: TorusGeometry;
  vertex: SphereGeometry;
}
let triangleGeometries: TriangleGeometries | null = null;

function getTriangleGeometries(): TriangleGeometries {
  if (!triangleGeometries) {
    triangleGeometries = {
      side: new TorusGeometry(
        TRIANGLE_BOW_RADIUS,
        HOOP_TUBE_RADIUS,
        20,
        96,
        TRIANGLE_ARC_ANGLE
      ),
      leg: new TorusGeometry(
        TRIANGLE_BOW_RADIUS,
        HOOP_HARDWARE_RADIUS,
        12,
        8,
        TRIANGLE_ELBOW_LEG_ANGLE
      ),
      vertex: new SphereGeometry(HOOP_HARDWARE_RADIUS, 16, 12),
    };
  }
  return triangleGeometries;
}

// Both grips wind counter-clockwise, matching triangle-geometry.ts.
function triangleVertices(grip: "corner" | "side"): [number, number][] {
  const half = TRIANGLE_SIDE_CHORD / 2;
  return grip === "side"
    ? [
        [-half, TRIANGLE_SAGITTA],
        [half, TRIANGLE_SAGITTA],
        [0, TRIANGLE_SAGITTA + TRIANGLE_HEIGHT],
      ]
    : [
        [0, 0],
        [half, TRIANGLE_HEIGHT],
        [-half, TRIANGLE_HEIGHT],
      ];
}

function createTriangle(options: WorkerPropFactoryOptions): WorkerPropVisual {
  const layer = options.layer ?? 0;
  const grip = options.build.triangleGrip === "side" ? "side" : "corner";
  const geometry = getTriangleGeometries();
  const materials = getHoopMaterials(options.color);
  const body = new Group();

  const vertices = triangleVertices(grip);
  const cx = (vertices[0]![0] + vertices[1]![0] + vertices[2]![0]) / 3;
  const cy = (vertices[0]![1] + vertices[1]![1] + vertices[2]![1]) / 3;
  const inset = TRIANGLE_BOW_RADIUS - TRIANGLE_SAGITTA;

  for (let i = 0; i < 3; i += 1) {
    const [px, py] = vertices[i]!;
    const [qx, qy] = vertices[(i + 1) % 3]!;
    const mx = (px + qx) / 2;
    const my = (py + qy) / 2;
    const nx = mx - cx;
    const ny = my - cy;
    const len = Math.hypot(nx, ny);
    const ox = mx - (nx / len) * inset;
    const oy = my - (ny / len) * inset;
    const start = Math.atan2(ny, nx) - TRIANGLE_ARC_ANGLE / 2;

    const side = mesh(geometry.side, materials.tube, layer);
    side.position.set(ox, oy, 0);
    side.rotation.z = start;
    body.add(side);

    for (const angle of [
      start,
      start + TRIANGLE_ARC_ANGLE - TRIANGLE_ELBOW_LEG_ANGLE,
    ]) {
      const leg = mesh(geometry.leg, materials.hardware, layer);
      leg.position.set(ox, oy, 0);
      leg.rotation.z = angle;
      body.add(leg);
    }
  }
  for (const [vx, vy] of vertices) {
    const vertex = mesh(geometry.vertex, materials.hardware, layer);
    vertex.position.set(vx, vy, 0);
    body.add(vertex);
  }
  return createVisual(options, body, materials.trail);
}
```

In the `switch` after the `BIGHOOP` case add:

```ts
    case CANONICAL_PROP_TYPE.TRIANGLE:
      return createTriangle(options);
```

- [ ] **Step 5: Build plumbing**

`worker-performer-effect-intent.ts`: add `triangleGrip: input.propBuild.triangleGrip ?? "corner",` after `fanCover:` (the `??` keeps the older test fixtures that omit the field valid at runtime).

`worker-performer-snapshot.ts`, in the effect-intent build comparison, add one more disjunct:

```ts
      options.effectIntent.propBuild.fanCover !== options.propBuild.fanCover ||
      options.effectIntent.propBuild.triangleGrip !==
        options.propBuild.triangleGrip)
```

`worker-performer.ts`, in the snapshot sameness check after the `fanCover` line:

```ts
      snapshot.propBuild.triangleGrip === this.snapshot.propBuild.triangleGrip &&
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/worker-renderer/ tests/unit/3d-worker-renderer/`
Expected: PASS, including "pins exact support to every canonical PropType" and "constructs every canonical type without falling back to a staff". If a `toEqual` on a snapshot's `propBuild` fails because `triangleGrip` is now present, add `triangleGrip: "corner"` to that fixture's expected object.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/3d/worker-renderer/worlds/props/worker-prop-factory-types.ts src/lib/shared/3d/worker-renderer/domain/worker-renderer-protocol.ts src/lib/shared/3d/worker-renderer/worlds/props/worker-prop-materials.ts src/lib/shared/3d/worker-renderer/worlds/props/worker-procedural-props.ts src/lib/shared/3d/worker-renderer/services/worker-performer-effect-intent.ts src/lib/shared/3d/worker-renderer/services/worker-performer-snapshot.ts src/lib/shared/3d/worker-renderer/worlds/worker-performer.ts tests/unit/worker-renderer/worker-hoop-family.test.ts
git commit -m "feat(worker-3d): mirror the triangle and hoop hardware"
```

If any test under `tests/unit/3d-worker-renderer/` needed a `triangleGrip: "corner"` fixture update, add that file to the same commit.

---

## Task 9: 3D studio family, build sync, PropBuild literal sites, and the sprite job

**Files:**
- Modify: `src/lib/shared/3d/domain/scene-prop-catalog.ts`
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte`
- Modify: `src/lib/shared/3d/components/controls/ScenePropPicker.svelte`
- Modify: `src/routes/test/film-director/_lib/film-director-schema.ts`
- Modify: `src/routes/test/prop-3d-studio/capture/+page.svelte`
- Modify: `src/routes/test/prop-3d-studio/sprites/+page.svelte`
- Modify: `src/routes/test/prop-3d-studio/sprites/SpriteCaptureScene.svelte`
- Test: `tests/unit/hoop-family/scene-hoop-family.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/hoop-family/scene-hoop-family.test.ts
import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  findScenePropFamily,
  isScenePhysicalProp,
  SCENE_PROP_TYPES,
} from "$lib/shared/3d/domain/scene-prop-catalog";

describe("hoop family in the 3D studio", () => {
  it("offers Mini Hoop and Triangle under one Hoop tile", () => {
    const hoop = findScenePropFamily(PropType.TRIANGLE);
    expect(hoop).toBeDefined();
    expect(hoop!.representative).toBe(PropType.MINIHOOP);
    expect(hoop!.controlLabel).toBe("Hoop build");
    expect(hoop!.variants.map((v) => v.id)).toEqual([
      PropType.MINIHOOP,
      PropType.TRIANGLE,
    ]);
    expect(isScenePhysicalProp(PropType.TRIANGLE)).toBe(true);
    expect(new Set(SCENE_PROP_TYPES).size).toBe(SCENE_PROP_TYPES.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/hoop-family/scene-hoop-family.test.ts`
Expected: FAIL, no Hoop family.

- [ ] **Step 3: The Hoop family**

`scene-prop-catalog.ts`: add to `SCENE_PROP_FAMILIES` (after the Triad / Trigeng family):

```ts
  {
    tileLabel: "Hoop",
    controlLabel: "Hoop build",
    representative: PropType.MINIHOOP,
    variants: [
      { id: PropType.MINIHOOP, label: "Mini Hoop" },
      { id: PropType.TRIANGLE, label: "Triangle" },
    ],
  },
```

Look at how `SCENE_PROP_TYPES` is built (line 110 onward): it flattens family variants and appends `SCENE_PROP_REPRESENTATIVES`. If `MINIHOOP` now appears twice (as a representative and as a family variant), dedupe the way the file already does for other representatives that also head a family (e.g. `TRIAD`); if it uses a `Set`, nothing to do. Confirm `SCENE_PROP_TYPES` has no duplicates by adding `expect(new Set(SCENE_PROP_TYPES).size).toBe(SCENE_PROP_TYPES.length);` to the test above.

- [ ] **Step 4: Settings to scene sync**

`SequenceViewerOrchestrator.svelte`: in the same `$effect` that syncs the fan appearance, extend both signatures to include the grip. Import `normalizeTriangleGrip` from `$lib/shared/pictograph/prop/domain/triangle-appearance`, then:

```ts
    const settingsGrip = normalizeTriangleGrip(getSettings().triangleGrip);
    const settingsSignature = `${fanAppearanceSignature(settingsAppearance)}|${settingsGrip}`;
    const sceneSignature = `${fanAppearanceSignature(sceneAppearance)}|${propFinishState.triangleGrip}`;
```

In the settings-won branch, after the three `propFinishState.setFan*` calls add `propFinishState.setTriangleGrip(settingsGrip);` (inside the same `if (sceneSignature !== settingsSignature)`). In the scene-won branch change the update to `void updateSettings({ fanAppearance: sceneAppearance, triangleGrip: propFinishState.triangleGrip });`.

`ScenePropPicker.svelte`: the 3D studio has no orchestrator, so the scene default follows settings here too. This sync is one way, settings to scene, and must run unconditionally: a performer-scoped host still gets its own resolved `build` from `buildOverride ?? propFinishState.build` a few lines above, but that `build` is never what this effect writes, so gating the effect on `buildOverride` protects nothing and (in the Prop Studio, whose host always passes a `build` prop) makes the sync permanently inert. Extract the effect body into an exported helper next to the picker, `scene-prop-picker-grip-sync.svelte.ts`, so a test can drive the real function through `$effect.root` without mounting the picker's heavier dependency tree:

```ts
// scene-prop-picker-grip-sync.svelte.ts
export function syncTriangleGripToScene(): void {
  const grip = normalizeTriangleGrip(getSettings().triangleGrip);
  if (propFinishState.triangleGrip !== grip) {
    propFinishState.setTriangleGrip(grip);
  }
}
```

`ScenePropPicker.svelte` mounts it unconditionally: `$effect(syncTriangleGripToScene);`.

No grip control renders in the build stage, so `buildLayoutSignature` does not need `build.triangleGrip`; leave it out.

- [ ] **Step 5: The other `PropBuild` literal sites in `src`**

`src/routes/test/film-director/_lib/film-director-schema.ts`: in `propBuildSchema` add `triangleGrip: z.enum(["corner", "side"]).optional(),` after `fanCover`.

`src/routes/test/prop-3d-studio/capture/+page.svelte`: document `- triangleGrip: corner | side` in the header comment, add `params.get("triangleGrip") ?? "",` to `captureKey`, and after the `fanCover` block:

```ts
    const triangleGrip = params.get("triangleGrip");
    if (triangleGrip === "corner" || triangleGrip === "side") {
      propFinishState.setTriangleGrip(triangleGrip);
    }
```

`src/lib/shared/3d/domain/build-for-effect.ts` uses partial `equipBuild` objects and needs no change. `worker-performer-effect-intent.ts` was handled in Task 8.

- [ ] **Step 6: The `triangle_side` sprite job**

`src/routes/test/prop-3d-studio/sprites/SpriteCaptureScene.svelte`: add an optional build override prop.

```ts
  import type { PropBuild } from "@austencloud/scene-3d";
  ...
    /** Build fields to apply over the scene default (the side-grip capture). */
    build?: Partial<PropBuild>;
```

destructure `build: buildOverride` and change `const propBuild = $derived(propFinishState.build);` to:

```ts
  const propBuild = $derived({ ...propFinishState.build, ...(buildOverride ?? {}) });
```

`src/routes/test/prop-3d-studio/sprites/+page.svelte`:

```ts
  import type { PropBuild } from "@austencloud/scene-3d";
  ...
  /** The sprite key is the prop, except where one prop captures more than one look. */
  type Job = {
    prop: PropType;
    key: string;
    color: (typeof COLORS)[number];
    build?: Partial<PropBuild>;
  };

  /** Extra looks captured under their own sprite key. */
  const EXTRA_LOOKS: Partial<Record<PropType, { key: string; build: Partial<PropBuild> }[]>> = {
    [PropType.TRIANGLE]: [{ key: "triangle_side", build: { triangleGrip: "side" } }],
  };

  const jobs = $derived(
    queue.flatMap((prop) => {
      const looks = [{ key: prop as string, build: undefined }, ...(EXTRA_LOOKS[prop] ?? [])];
      return looks.flatMap((look) =>
        COLORS.map((color) => ({ prop, key: look.key, color, build: look.build }) as Job)
      );
    }).filter((job) => !requested || job.key === requested || (job.prop as string) === requested)
  );
```

Keep the `queue` filter as it is but make it match on the prop behind a requested key, so `?prop=triangle_side` works: change `all.filter((prop) => (prop as string) === requested)` to `all.filter((prop) => (prop as string) === requested || (EXTRA_LOOKS[prop] ?? []).some((look) => look.key === requested))`.

In `handleCaptured`, send `prop: job.key` instead of `prop: job.prop`, and in the log lines use `job.key`. In the markup pass `build={current.build}` to `SpriteCaptureScene` and key the block on `${current.key}:${current.color}`.

- [ ] **Step 7: Run tests and the type check**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/hoop-family/ tests/unit/3d-viewer/ && npm run check:fast`
Expected: tests PASS; no new type errors in the touched files.

- [ ] **Step 8: Commit**

```bash
git add src/lib/shared/3d/domain/scene-prop-catalog.ts src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte src/lib/shared/3d/components/controls/ScenePropPicker.svelte src/routes/test/film-director/_lib/film-director-schema.ts src/routes/test/prop-3d-studio/capture/+page.svelte src/routes/test/prop-3d-studio/sprites/+page.svelte src/routes/test/prop-3d-studio/sprites/SpriteCaptureScene.svelte tests/unit/hoop-family/scene-hoop-family.test.ts
git commit -m "feat(3d): hoop family in the studio, grip sync, triangle_side sprite job"
```

---

## Task 10: Sprite capture and visual verification

This task runs in the browser against the dev server. Per `.claude/rules/worktree-workflow.md` the primary checkout runs the dev server; the worktree's branch has to be visible to it. Use the worktree's own port if the rule provides one; otherwise, finish Task 11 first (merge), then capture on the primary and commit the sprites as a follow-up on `main`. Record which path was taken in the final summary.

**Files:**
- Generate: `static/images/props/appearances/model/{minihoop,bighoop,triangle,triangle_side}-{blue,red}.svg`
- Regenerate: `src/lib/shared/pictograph/prop/domain/prop-model-sprites.generated.ts`

- [ ] **Step 1: Capture the four sprite pairs**

Open `/test/prop-3d-studio/sprites?prop=minihoop`, then `?prop=bighoop`, `?prop=triangle` (which also runs the `triangle_side` job), waiting for `document.body.dataset.spriteCaptureDone === "1"` each time. Check the log lists `saved` for all eight captures. Decode one to confirm it is not empty:

```bash
grep -o 'data:image/webp;base64,[^"]*' static/images/props/appearances/model/triangle_side-blue.svg | head -c 100
```

- [ ] **Step 2: Run the sprite-dependent tests**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/pictograph/prop/domain/__tests__/ tests/unit/hoop-family/`
Expected: PASS; `resolvePropRenderKey("triangle", { triangleGrip: "side", propLook: "model" })` now returns `triangle_side__model`.

- [ ] **Step 3: Visual pass (visual-verification-mandatory.md)**

Screenshots to take and check, each Read back:

1. `/test/prop-3d-studio` with the Hoop tile, Triangle variant, both grips (toggle the Grip pills in the picker): the far point along the prop axis, black elbows, hand colour tube; mini hoop shows tape, button and grip wrap. Switch renderer to the worker (if the studio exposes it) and repeat.
2. A pictograph cell with triangle on each hand, pictograph look and model look (`/test/sidebar-props` or the option picker on `/create`).
3. The prop picker tile for Hoop, its drill-down showing Mini Hoop / Big Hoop / Triangle, and the Grip row after selecting Triangle.
4. The Grip row across the seven viewport tiers listed in `visual-verification-mandatory.md` (resize the built-in browser tab; check the pills do not wrap and the dock keeps its gutter).

Fix anything wrong in source and re-check before moving on.

- [ ] **Step 4: Commit**

```bash
git add static/images/props/appearances/model/minihoop-blue.svg static/images/props/appearances/model/minihoop-red.svg static/images/props/appearances/model/bighoop-blue.svg static/images/props/appearances/model/bighoop-red.svg static/images/props/appearances/model/triangle-blue.svg static/images/props/appearances/model/triangle-red.svg static/images/props/appearances/model/triangle_side-blue.svg static/images/props/appearances/model/triangle_side-red.svg src/lib/shared/pictograph/prop/domain/prop-model-sprites.generated.ts
git commit -m "feat(props): capture hoop family model sprites"
```

---

## Task 11: Full check and worktree finish

- [ ] **Step 1: Full test run and type check**

Run: `npx vitest run --config tests/config/vitest.config.ts && npm run check`
Expected: green. Anything red in a file this plan touched is fixed here; anything red elsewhere is noted in the summary with the failing test name, not fixed.

- [ ] **Step 2: Lint the touched files**

Run: `npx prettier --check scripts/build-hoop-family-svgs.mjs scripts/hoop-family-math.mjs src/lib/shared/pictograph/prop/domain/triangle-appearance.ts src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte && npx eslint scripts/build-hoop-family-svgs.mjs scripts/hoop-family-math.mjs src/lib/shared/pictograph/prop/domain/triangle-appearance.ts src/lib/shared/3d/worker-renderer/worlds/props/worker-procedural-props.ts`
Expected: clean. Run `npx prettier --write` on any file it flags and amend the relevant commit or add a `style:` commit.

- [ ] **Step 3: Finish the worktree**

From `E:/tka-platform` (the primary checkout), per `.claude/rules/worktree-workflow.md` and the memory `project_tka_worktree_finish_gotchas`:

```bash
MSYS_NO_PATHCONV=1 npm run wt:finish -- codex/triangle-hoop-family --route /test/prop-3d-studio
```

Expected: the branch merges into `main`, the route opens for a final look, the worktree is removed. If the junction blocks removal, `cmd /c rmdir E:\worktrees\tka-platform\triangle-hoop-family\node_modules` first (memory `feedback_worktree_junction_removal`).

---

## Self-review

**Spec coverage.** Section 1 (identity, family, encoder, tagger, placements): Task 3. Section 2 (station table): Task 1. Section 3 (generated 2D, boxes, tips, crops, test on viewBoxes): Task 2, wired in Task 4. Section 4 (both renderers, reach table, provenance note rewrite): Tasks 6, 7, 8. Section 5 (grip type, render keys, PropBuild, settings, Grip row): Tasks 4, 5, 7, 8, 9. Section 6 (sprites, tests, visual pass): Tasks 9, 10, and tests throughout. Section 7 (ownership record): in the spec, no code.

**Type consistency.** `TriangleGrip` is defined in three places on purpose (app `triangle-appearance.ts`, package `prop-finish-state.svelte.ts`, worker `WorkerPropBuild` inline union), the same way `FanBuild` is; all three are `"corner" | "side"`. `triangleSpriteKey` returns `"triangle" | "triangle_side"`; `parseTriangleRenderKey` accepts `triangle__side` and `triangle_side`; `PROP_RENDER_KEY_TIP_POINTS` registers `triangle__side` and `triangle_side__model`. The generated module's names (`HOOP_FAMILY_BOXES`, `HOOP_FAMILY_TIP_POINTS`, `HOOP_FAMILY_GLYPH_CROPS`, `HOOP_FAMILY_REACH_M`, `TRIANGLE_STATIONS_M`, `HOOP_HARDWARE_M`) are used with those exact names in Tasks 2, 4, 6, 7, 8.

**Known judgement calls.** The static pictograph loader does not take the grip (spec out-of-scope note). `hasBigVariant(TRIANGLE)` is false by design, so the Size dock hides for the triangle while the Grip dock shows. The sprite page's `?prop=triangle` run captures both `triangle` and `triangle_side`.
