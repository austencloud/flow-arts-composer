/**
 * Triad build generator.
 *
 * The 3D viewer builds a triad two ways (scene-3d's triad-frame.ts,
 * TRIAD_FIRE and TRIAD_DAY): a small hub with a finger ring, three straight
 * spines at 120 degrees, and a tip on each spine. This draws those two frames
 * flat for the 2D renderers:
 *
 *   fire  thin bare spines out of a machined hub, a chrome finger ring, and a
 *         wrapped Kevlar wick on each end
 *   day   a fatter printed hub, a thicker grip tube between black ferrules,
 *         and a light head that flares out at each tip
 *
 * The section table below follows the 3D frame's fractions of arm length, with
 * every radius thickened so the hand color still reads at pictograph size (a
 * 3D-true fire spine would draw under a pixel wide).
 *
 * Every build is drawn on the plain triad's frame of the same folder: the same
 * viewBox, the hub on the viewBox centre (the hand point every renderer
 * rotates about), and each arm's far end on that prop's tip point
 * (TRIAD_TIP_POINTS / BIGTRIAD_TIP_POINTS in prop-tip-points.ts), so trails
 * and fire stay on the tips. Where an end cap would poke out of the viewBox
 * (the two slanted arms of the small triad), that arm alone is pulled back
 * just far enough to fit; the generator prints how far.
 *
 * Paint: everything that carries the hand color sits in one
 * `<g data-fan-frame="" fill="#2e3192">` group whose children set no fill, so
 * the shared recolor (render-core applyColorToSvg) paints only the frame and
 * leaves the wicks, heads, ring and ferrules as authored. The primary arm
 * keeps the plain art's gold double band (#c9ac68) in the pictograph and
 * animated folders, as the notation triad does. The plain file's invisible
 * mirrored spacer path is copied across unchanged.
 *
 * Run: node scripts/generate-triad-builds.cjs
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PROPS = path.join(ROOT, "static/images/props");

/** 3D frame: tip far end sits 1.104 arm lengths from the hub. */
const REACH = 1.104;

/**
 * Sections in arm lengths. `from`/`to` run out from the hub; `r`/`r2` are the
 * half-widths at each end.
 */
const BUILDS = {
  fire: {
    ring: { radius: 0.085, tube: 0.034, paint: "metal" },
    parts: [
      { from: 0.115, to: 0.27, r: 0.062, r2: 0.046, paint: "metal" },
      { from: 0.25, to: 0.35, r: 0.047, paint: "black" },
      { from: 0.33, to: 0.9, r: 0.033, paint: "frame" },
      { from: 0.87, to: REACH, r: 0.082, paint: "wick", round: 0.035 },
    ],
    band: { at: [0.7, 0.76], r: 0.05 },
  },
  day: {
    ring: { radius: 0.108, tube: 0.05, paint: "frame" },
    parts: [
      { from: 0.15, to: 0.36, r: 0.09, r2: 0.068, paint: "frame" },
      { from: 0.34, to: 0.42, r: 0.062, paint: "black" },
      { from: 0.4, to: 0.8, r: 0.046, paint: "frame" },
      { from: 0.78, to: 0.86, r: 0.062, paint: "black" },
      { from: 0.85, to: REACH, r: 0.07, r2: 0.1, paint: "head", round: 0.03 },
    ],
    band: { at: [0.58, 0.64], r: 0.06 },
  },
};

const PAINT = {
  metal: 'fill="#9aa0a8" stroke="#55595f" stroke-width="{sw}"',
  black: 'fill="#1c1c1f"',
  wick: 'fill="#e6dcc0" stroke="#5f5543" stroke-width="{sw}"',
  head: 'fill="#eef2f6" stroke="#6f7782" stroke-width="{sw}"',
};
const RING_STROKE = { metal: "#b9bec6" };

/** Tip points per prop, in the pictograph frame relative to the hub. */
const CLUB_TIP_REACH = 258.67 / 2;
const TRIAD_TIPS = [-120, 0, 120].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return { dx: CLUB_TIP_REACH * Math.cos(a), dy: CLUB_TIP_REACH * Math.sin(a) };
});
const BIGTRIAD_TIPS = [
  { dx: -130, dy: -226 },
  { dx: 260, dy: 0 },
  { dx: -130, dy: 226 },
];
const PRIMARY_ARM = 1; // the +x arm carries the gold band

/** Which folders hold triad art, and the frame each one draws in. */
const TARGETS = [
  { prop: "triad", family: "pictograph", tips: TRIAD_TIPS, scale: 1, band: true },
  { prop: "triad", family: "animated", tips: TRIAD_TIPS, scale: 300 / 258.67, band: true },
  { prop: "triad", family: "buttons", tips: TRIAD_TIPS, scale: 248.76 / 258.67, band: false },
  { prop: "bigtriad", family: "pictograph", tips: BIGTRIAD_TIPS, scale: 1, band: true },
  { prop: "bigtriad", family: "animated", tips: BIGTRIAD_TIPS, scale: 1, band: true },
  { prop: "bigtriad", family: "buttons", tips: BIGTRIAD_TIPS, scale: 1, band: false },
];

const fmt = (n) => {
  const s = (Math.round(n * 100) / 100).toFixed(2);
  return s.replace(/\.?0+$/, "") || "0";
};

function readPlain(prop, family) {
  const file = path.join(PROPS, family, `${prop}.svg`);
  const text = fs.readFileSync(file, "utf8");
  const viewBox = text.match(/viewBox="([^"]+)"/)[1];
  const [, , w, h] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  // The invisible mirrored spacer, with the group transform it sits in.
  const spacerMatch = text.match(
    /<path\b(?=[^>]*(?:fill="none"|fill:\s*none))[^>]*\/>/
  );
  if (!spacerMatch) throw new Error(`No spacer path in ${file}`);
  const before = text.slice(0, spacerMatch.index);
  const groupTransform = before.match(/<g\b[^>]*transform="([^"]+)"[^>]*>(?![\s\S]*<\/g>)/);
  const spacer = groupTransform
    ? `<g transform="${groupTransform[1]}">${spacerMatch[0]}</g>`
    : spacerMatch[0];
  return { viewBox, w, h, spacer };
}

/** A section as a closed outline in arm-local units (x out along the arm). */
function sectionOutline(part, L, k) {
  const a = part.from * L * k.len;
  const b = part.to * L * k.len;
  const r1 = part.r * L;
  const r2 = (part.r2 ?? part.r) * L;
  return [
    [a, -r1],
    [b, -r2],
    [b, r2],
    [a, r1],
  ];
}

function rotate([x, y], cos, sin, cx, cy) {
  return [cx + x * cos - y * sin, cy + x * sin + y * cos];
}

/** Closed path through corners, each corner rounded by `rad` (quadratic). */
function roundedPath(points, rad) {
  if (!rad) {
    return `M${points.map((p) => p.map(fmt).join(" ")).join("L")}Z`;
  }
  const n = points.length;
  const cut = (p, q, d) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const t = Math.min(d / len, 0.5);
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const inPt = cut(cur, prev, rad);
    const outPt = cut(cur, next, rad);
    d += `${i === 0 ? "M" : "L"}${fmt(inPt[0])} ${fmt(inPt[1])}`;
    d += `Q${fmt(cur[0])} ${fmt(cur[1])} ${fmt(outPt[0])} ${fmt(outPt[1])}`;
  }
  return `${d}Z`;
}

function annulus(cx, cy, rOuter, rInner) {
  const circle = (r) =>
    `M${fmt(cx + r)} ${fmt(cy)}A${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)}A${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)}Z`;
  return `${circle(rOuter)}${circle(rInner)}`;
}

function buildSvg(target, buildName) {
  const build = BUILDS[buildName];
  const { viewBox, w, h, spacer } = readPlain(target.prop, target.family);
  const cx = w / 2;
  const cy = h / 2;
  const s = target.scale;
  // One arm length for the whole prop, from the longest tip; each arm then
  // stretches to its own tip (Big Triad's slanted tips sit 0.3% further out).
  const reaches = target.tips.map((t) => Math.hypot(t.dx, t.dy) * s);
  const L = Math.min(...reaches) / REACH;
  const sw = fmt(L * 0.012);

  const frame = [];
  const material = [];
  const bands = [];
  const report = [];

  target.tips.forEach((tip, arm) => {
    const angle = Math.atan2(tip.dy, tip.dx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const want = Math.hypot(tip.dx, tip.dy) * s;
    // Stretch along the arm so the far end lands on the tip, then pull back
    // only if an end cap would leave the viewBox.
    let len = want / (REACH * L);
    const fits = (k) =>
      build.parts.every((part) =>
        sectionOutline(part, L, { len: k })
          .map((p) => rotate(p, cos, sin, cx, cy))
          .every(([x, y]) => x >= -0.01 && x <= w + 0.01 && y >= -0.01 && y <= h + 0.01)
      );
    let k = len;
    while (!fits(k) && k > 0.8) k -= 0.0005;
    report.push(
      `arm ${arm}: end ${fmt(k * REACH * L)} of tip ${fmt(want)} (${fmt(
        ((want - k * REACH * L) / want) * 100
      )}% short)`
    );
    for (const part of build.parts) {
      const pts = sectionOutline(part, L, { len: k }).map((p) =>
        rotate(p, cos, sin, cx, cy)
      );
      const d = roundedPath(pts, part.round ? part.round * L : L * 0.006);
      if (part.paint === "frame") frame.push(`<path d="${d}"/>`);
      else material.push(`<path d="${d}" ${PAINT[part.paint].replace("{sw}", sw)}/>`);
    }
    if (target.band && arm === PRIMARY_ARM) {
      for (const at of build.band.at) {
        const a = at * L * k;
        const half = 0.012 * L;
        const r = build.band.r * L;
        const pts = [
          [a - half, -r],
          [a + half, -r],
          [a + half, r],
          [a - half, r],
        ].map((p) => rotate(p, cos, sin, cx, cy));
        bands.push(`<path d="${roundedPath(pts, half * 0.9)}" fill="#c9ac68"/>`);
      }
    }
  });

  // Hub ring: an annulus so the hand-colored day ring needs no stroke paint.
  const ring = build.ring;
  const ringPath = annulus(
    cx,
    cy,
    (ring.radius + ring.tube) * L,
    (ring.radius - ring.tube) * L
  );
  const ringSvg =
    ring.paint === "frame"
      ? null
      : `<path d="${ringPath}" fill-rule="evenodd" fill="${RING_STROKE[ring.paint]}" stroke="#55595f" stroke-width="${sw}"/>`;
  if (ring.paint === "frame") {
    frame.push(`<path d="${ringPath}" fill-rule="evenodd"/>`);
  }

  // Frame first (spines run under the collars and wicks), then materials.
  const body = [
    spacer,
    `<g data-fan-frame="" fill="#2e3192">${frame.join("")}</g>`,
    ...material,
    ...(ringSvg ? [ringSvg] : []),
    ...bands,
  ].join("");
  const label = buildName === "fire" ? "Fire" : "Day";
  const svg = `<?xml version="1.0" encoding="utf-8"?>
<!-- ${target.prop === "bigtriad" ? "Big triad" : "Triad"}, ${label} build. GENERATED by scripts/generate-triad-builds.cjs; edit the generator, not this file. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>
`;
  return { svg, report };
}

for (const target of TARGETS) {
  for (const buildName of Object.keys(BUILDS)) {
    const { svg, report } = buildSvg(target, buildName);
    const out = path.join(PROPS, target.family, `${target.prop}-${buildName}.svg`);
    fs.writeFileSync(out, svg);
    console.log(
      `${path.relative(ROOT, out).replace(/\\/g, "/")}: ${report.join("; ")}`
    );
  }
}
