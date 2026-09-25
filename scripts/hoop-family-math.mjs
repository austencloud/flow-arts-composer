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
 * point, and the angle (radians, CCW from +x) at which the arc starts. Both
 * grips wind their vertices counter-clockwise, so the arc starts at `p`
 * (angle `startAngle`) and ends at `q` (angle `startAngle + arcAngleRad`).
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
  const bow = {
    x: mid.x + normal.x * m.sagittaMm,
    y: mid.y + normal.y * m.sagittaMm,
  };
  const phi = Math.atan2(normal.y, normal.x);
  return {
    p,
    q,
    mid,
    normal,
    centre,
    bow,
    startAngle: phi - m.arcAngleRad / 2,
  };
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
