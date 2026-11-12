/**
 * Buugeng style generator.
 *
 * A real buugeng is two crescent moons joined into an S: each half is a true
 * half-circle, the blade keeps an even width through the grip and the belly of
 * each curve, and only the last stretch tapers to a sharp point that hooks a
 * little past the half-circle. The styles are the cuts people actually sell
 * (Austen, 2026-11-07, after the invented spike/fang/talon shapes read as
 * fakes). Like the real prop, every style narrows to a hand-width grip where
 * the two halves meet and flares out to the full blade a little way along each
 * half, so a hand can close around it and roll the prop (Austen, 2026-11-11):
 *
 *   crescent    the plain blade
 *   perforated  a row of oval holes along each half, solid at the grip
 *   fire        a slim truss frame (solid inner rim, triangle cut-outs) with
 *               Kevlar wick wrapped along the whole outer edge to the tip,
 *               tied down every few centimetres
 *   filigree    an alternating leaf-and-dot cut pattern along each half
 *
 * Classic is the existing notation art (static/images/props/buugeng.svg) and
 * is not drawn here.
 *
 * Every style is fitted to the plain artwork's frame (same viewBox, the grip
 * on the viewBox centre, which is the hand point every renderer rotates and
 * mirrors about), so placements, trails and the chirality mirror hold. The
 * blade is one flat #2e3191 body that the motion-color recolor paints; wicks
 * are #c9ac68, an accent the recolor keeps.
 *
 * Run: node scripts/generate-buugeng-variants.cjs
 */

const fs = require("fs");
const path = require("path");

// ── centreline ──────────────────────────────────────────────────────────────
const CX = 150;
const CY = 90;
const R = 70; // half-circle radius of each half
const CURL = 0.3; // radians each tip hooks past the half-circle (~17°)
const HALF_WIDTH = 9; // half the blade width; full blade ≈ 0.26 R, like the real prop
const TAPER_START = 0.55; // fraction of each half (grip → tip) where the taper begins
const SAMPLES = 240; // per half
const GRIP_HALF = 4.5; // half the grip's width: about 2.5 cm on an 85 cm buugeng
const GRIP_END = 0.05; // fraction of each half that is bare grip (about 7 cm across both, the palm)
const FLARE_END = 0.3; // fraction of each half where the long flare reaches the full blade

const BODY = "#2e3191";
const WICK = "#c9ac68";

// s in [0,1] across the whole S: 0 = first tip, 0.5 = grip, 1 = second tip.
function centre(s) {
  const sweep = Math.PI + CURL;
  if (s <= 0.5) {
    const theta = sweep * (1 - s / 0.5);
    return { x: CX - R + R * Math.cos(theta), y: CY - R * Math.sin(theta) };
  }
  const phi = Math.PI + sweep * ((s - 0.5) / 0.5);
  return { x: CX + R + R * Math.cos(phi), y: CY - R * Math.sin(phi) };
}

/** Centre of the half-circle a point belongs to. */
function lobeCentre(s) {
  return s <= 0.5 ? { x: CX - R, y: CY } : { x: CX + R, y: CY };
}

/** 0 at the grip, 1 at the tip of whichever half s is on. */
function alongHalf(s) {
  return s <= 0.5 ? (0.5 - s) / 0.5 : (s - 0.5) / 0.5;
}

/** s on the given half (0 = first, 1 = second) at fraction t from the grip. */
function sAt(half, t) {
  return half === 0 ? 0.5 - t * 0.5 : 0.5 + t * 0.5;
}

function tangent(s) {
  const e = 1e-4;
  const a = centre(Math.max(0, s - e));
  const b = centre(Math.min(1, s + e));
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

function normal(s) {
  const t = tangent(s);
  return { x: -t.y, y: t.x };
}

/** Unit vector from the half-circle's centre out through the point: the convex side. */
function outward(s) {
  const p = centre(s);
  const c = lobeCentre(s);
  const len = Math.hypot(p.x - c.x, p.y - c.y) || 1;
  return { x: (p.x - c.x) / len, y: (p.y - c.y) / len };
}

/**
 * Narrow the middle of any width profile to the grip: bare grip for GRIP_END
 * of each half, then a smooth flare to the style's own width by FLARE_END.
 */
function withGrip(widthFn) {
  return (s, base) => {
    const w = widthFn(s, base);
    const t = alongHalf(s);
    if (t >= FLARE_END) return w;
    if (t <= GRIP_END) return Math.min(w, GRIP_HALF);
    const u = (t - GRIP_END) / (FLARE_END - GRIP_END);
    const ease = u * u * (3 - 2 * u);
    return GRIP_HALF + (w - GRIP_HALF) * ease;
  };
}

/** Grip, flare to an even blade, then a long taper to a needle point. */
const halfWidth = withGrip((s, base = HALF_WIDTH) => {
  const t = alongHalf(s);
  if (t <= TAPER_START) return base;
  const u = (t - TAPER_START) / (1 - TAPER_START);
  return Math.max(0.35, base * (1 - Math.pow(u, 1.5)));
});

// ── shapes as polygons (construction units) ─────────────────────────────────
function blade(base = HALF_WIDTH, widthFn = halfWidth) {
  const left = [];
  const right = [];
  for (let i = 0; i <= SAMPLES * 2; i++) {
    const s = i / (SAMPLES * 2);
    const p = centre(s);
    const n = normal(s);
    const w = widthFn(s, base);
    left.push([p.x + n.x * w, p.y + n.y * w]);
    right.push([p.x - n.x * w, p.y - n.y * w]);
  }
  return [...left, ...right.reverse()];
}

function ellipse(cx, cy, rx, ry, angle, steps = 28) {
  const pts = [];
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    pts.push([cx + x * ca - y * sa, cy + x * sa + y * ca]);
  }
  return pts;
}

/** Rectangle centred on (cx, cy), `along` long on the unit axis `axis`, rounded. */
function roundedRect(cx, cy, axis, along, across, radius, steps = 6) {
  const perp = { x: -axis.y, y: axis.x };
  const hx = along / 2 - radius;
  const hy = across / 2 - radius;
  const pts = [];
  const corners = [
    [hx, hy, 0],
    [-hx, hy, Math.PI / 2],
    [-hx, -hy, Math.PI],
    [hx, -hy, (Math.PI * 3) / 2],
  ];
  for (const [ox, oy, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = start + (i / steps) * (Math.PI / 2);
      const lx = ox + radius * Math.cos(a);
      const ly = oy + radius * Math.sin(a);
      pts.push([cx + axis.x * lx + perp.x * ly, cy + axis.y * lx + perp.y * ly]);
    }
  }
  return pts;
}

function angleOf(v) {
  return Math.atan2(v.y, v.x);
}

// ── styles ──────────────────────────────────────────────────────────────────
// Each style: body polygon, holes cut from it (evenodd), and extra pieces with
// their own fill (fire's spokes and wicks), all in construction units.
const styles = {};

styles.crescent = { body: blade(), holes: [], pieces: [] };

{
  // Oval holes along the even part of each half, sized to the local blade;
  // the grip and its flare stay solid.
  const holes = [];
  for (const half of [0, 1]) {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const t = FLARE_END - 0.04 + (i / (count - 1)) * 0.56;
      const s = sAt(half, t);
      const p = centre(s);
      const w = halfWidth(s);
      const ry = 0.5 * w;
      if (ry < 1.6) continue;
      holes.push(ellipse(p.x, p.y, 0.95 * w, ry, angleOf(tangent(s))));
    }
  }
  styles.perforated = { body: blade(), holes, pieces: [] };
}

{
  // A real fire buugeng (Neo Flow Art, RD Buugeng): a slim frame with a solid
  // inner rim and outer rail and a Warren truss of triangle cut-outs between
  // them, and Kevlar wick wrapped along the whole outer edge from just off the
  // grip round to the tip, tied down every few centimetres.
  const base = 7.5; // slimmer than the plain blade; the wick adds the rest
  const RIM = 2.2; // inner rim and outer rail
  const STRUT = 1.5; // truss strut half-thickness
  const CELL = 13; // truss cell length along the arc
  const WICK_IN = -1.2; // wick band, measured out from the frame's outer edge
  const WICK_OUT = 5.4;
  const TIE = 1.4; // width of a wire tie across the wick
  const SEGMENT = 15; // wick between ties
  const HALF_LEN = R * (Math.PI + CURL);

  // Point at arc length u from the grip on a half, offset d out from the
  // centreline (positive = convex side).
  const at = (half, u, d) => {
    const s = sAt(half, Math.min(1, Math.max(0, u / HALF_LEN)));
    const p = centre(s);
    const o = outward(s);
    return [p.x + o.x * d, p.y + o.y * d];
  };
  // The frame stays slim right to a blunt tip, where the wick knots over it.
  const fireWidth = withGrip((s, w0) => {
    const t = alongHalf(s);
    return t <= 0.7 ? w0 : w0 * (1 - 0.45 * ((t - 0.7) / 0.3));
  });
  const widthAt = (half, u) => fireWidth(sAt(half, Math.min(1, u / HALF_LEN)), base);

  // Inset a triangle given in (u, d) by `e` on every side.
  const inset = (tri, e) => {
    const lines = tri.map((a, i) => {
      const b = tri[(i + 1) % 3];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      let nx = -dy / len;
      let ny = dx / len;
      const c = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3];
      if ((c[0] - a[0]) * nx + (c[1] - a[1]) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      return { px: a[0] + nx * e, py: a[1] + ny * e, dx, dy };
    });
    return lines.map((l1, i) => {
      const l0 = lines[(i + 2) % 3];
      const det = l0.dx * l1.dy - l0.dy * l1.dx;
      const t = ((l1.px - l0.px) * l1.dy - (l1.py - l0.py) * l1.dx) / det;
      return [l0.px + l0.dx * t, l0.py + l0.dy * t];
    });
  };

  const holes = [];
  const wicks = [];
  const ties = [];
  for (const half of [0, 1]) {
    // Truss: alternate up and down triangles while the frame is deep enough.
    for (let i = 0; ; i++) {
      const a = (FLARE_END - 0.06) * HALF_LEN + (i * CELL) / 2;
      const b = a + CELL;
      if (b > 0.95 * HALF_LEN) break;
      const h = Math.min(widthAt(half, a), widthAt(half, b)) - RIM;
      if (h < 2.6) break;
      const tri =
        i % 2 === 0
          ? [[a, -h], [b, -h], [(a + b) / 2, h]]
          : [[a, h], [b, h], [(a + b) / 2, -h]];
      const inner = inset(tri, STRUT);
      const area = Math.abs(
        (inner[1][0] - inner[0][0]) * (inner[2][1] - inner[0][1]) -
          (inner[2][0] - inner[0][0]) * (inner[1][1] - inner[0][1])
      );
      if (area < 4) continue;
      holes.push(inner.map(([u, d]) => at(half, u, d)));
    }

    // Wick: one wrapped band along the outer edge, wire ties across it, and a
    // knot over the blunt tip.
    const from = (FLARE_END - 0.08) * HALF_LEN;
    const to = HALF_LEN;
    const outerSide = [];
    const innerSide = [];
    const n = 120;
    for (let j = 0; j <= n; j++) {
      const u = from + ((to - from) * j) / n;
      const w = widthAt(half, u);
      outerSide.push(at(half, u, w + WICK_OUT));
      innerSide.push(at(half, u, w + WICK_IN));
    }
    wicks.push([...outerSide, ...innerSide.reverse()]);
    const count = Math.round((to - from) / SEGMENT);
    const step = (to - from) / count;
    for (let k = 1; k < count; k++) {
      const u = from + k * step;
      const w = widthAt(half, u);
      const u0 = u - TIE / 2;
      const u1 = u + TIE / 2;
      ties.push([
        at(half, u0, w + WICK_IN - 0.4),
        at(half, u1, w + WICK_IN - 0.4),
        at(half, u1, w + WICK_OUT + 0.5),
        at(half, u0, w + WICK_OUT + 0.5),
      ]);
    }
    const tipS = sAt(half, 1);
    const tip = centre(tipS);
    const o = outward(tipS);
    const tipW = widthAt(half, HALF_LEN);
    const reachOut = tipW + WICK_OUT;
    const knob = (reachOut + tipW) / 2 + 0.6;
    const mid = (reachOut - tipW) / 2;
    wicks.push(ellipse(tip.x + o.x * mid, tip.y + o.y * mid, knob, knob, 0, 32));
  }
  styles.fire = {
    body: blade(base, fireWidth),
    holes,
    pieces: [
      { fill: WICK, polys: wicks },
      { fill: BODY, polys: ties },
    ],
  };
}

{
  // Alternating slanted leaves with a dot between each pair, like the cut
  // metal sets; the grip and its flare stay solid.
  const base = 11.5;
  const holes = [];
  for (const half of [0, 1]) {
    const steps = 11;
    for (let i = 0; i < steps; i++) {
      const t = FLARE_END - 0.06 + (i / (steps - 1)) * 0.6;
      const s = sAt(half, t);
      const p = centre(s);
      const w = halfWidth(s, base);
      const tan = angleOf(tangent(s));
      if (i % 2 === 0) {
        const lean = (i / 2) % 2 === 0 ? 0.6 : -0.6;
        if (0.36 * w < 1.4) continue;
        holes.push(ellipse(p.x, p.y, 0.8 * w, 0.36 * w, tan + lean));
      } else {
        const r = 0.24 * w;
        if (r < 1.1) continue;
        holes.push(ellipse(p.x, p.y, r, r, 0, 18));
      }
    }
  }
  styles.filigree = { body: blade(base), holes, pieces: [] };
}

// ── fitting into the plain art's frames ─────────────────────────────────────
const PROPS_DIR = path.join(__dirname, "..", "static", "images", "props");
const FRAMES = [
  // [folder, file stem, viewBox width, viewBox height, side margin]
  ["pictograph", "buugeng", 262.6, 135.9, 1.4],
  ["buttons", "buugeng", 262.6, 135.9, 1.4],
  ["animated", "buugeng", 300, 155.26, 1.6],
  ["pictograph", "bigbuugeng", 600, 293.1, 3],
  ["buttons", "bigbuugeng", 600, 293.1, 3],
  ["animated", "bigbuugeng", 600, 293.1, 3],
];

function fmt(n) {
  return Math.round(n * 100) / 100;
}

function allPoints(style) {
  return [style.body, ...style.holes, ...style.pieces.flatMap((p) => p.polys)].flat();
}

function fitFor(style, width, height, margin) {
  const pts = allPoints(style);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const box = {
    minx: Math.min(...xs),
    maxx: Math.max(...xs),
    miny: Math.min(...ys),
    maxy: Math.max(...ys),
  };
  const k = Math.min(
    (width - margin * 2) / (box.maxx - box.minx),
    (height - margin * 2) / (box.maxy - box.miny)
  );
  // Every style is point-symmetric about the grip, so the ink box's centre is
  // the grip, and it lands on the hand point.
  const cx = (box.minx + box.maxx) / 2;
  const cy = (box.miny + box.maxy) / 2;
  const X = (x) => fmt(width / 2 + (x - cx) * k);
  const Y = (y) => fmt(height / 2 + (y - cy) * k);
  return { X, Y };
}

function fittedSvg(style, width, height, margin) {
  const { X, Y } = fitFor(style, width, height, margin);
  const sub = (poly) =>
    `M${poly.map(([x, y]) => `${X(x)} ${Y(y)}`).join("L")}Z`;
  const body = [style.body, ...style.holes].map(sub).join("");
  const fillRule = style.holes.length ? ' fill-rule="evenodd"' : "";
  let paths = `<path d="${body}"${fillRule} style="fill:${BODY}"/>`;
  // Overlapping pieces (the fire wick and its tip knot) must wind the same way,
  // or the nonzero fill cuts their overlap out.
  const clockwise = (poly) => {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % poly.length];
      area += x0 * y1 - x1 * y0;
    }
    return area >= 0 ? poly : [...poly].reverse();
  };
  for (const piece of style.pieces) {
    paths += `<path d="${piece.polys.map(clockwise).map(sub).join("")}" style="fill:${piece.fill}"/>`;
  }
  return `<?xml version="1.0" encoding="utf-8"?><!-- Generated by scripts/generate-buugeng-variants.cjs, fitted to the plain buugeng frame. --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" xml:space="preserve">${paths}</svg>\n`;
}

let fitted = 0;
for (const [name, style] of Object.entries(styles)) {
  for (const [folder, stem, width, height, margin] of FRAMES) {
    const file = path.join(PROPS_DIR, folder, `${stem}-${name}.svg`);
    fs.writeFileSync(file, fittedSvg(style, width, height, margin));
    fitted++;
  }
}
console.log(`${fitted} fitted style sprites written under ${PROPS_DIR}`);

// Tip points for the animator's trails and tip effects, relative to the hand
// point in the pictograph sprite's units, in the plain buugeng's order (the
// +x terminal first).
const tipFrames = { buugeng: FRAMES[0], bigbuugeng: FRAMES[3] };
const tipRows = [];
for (const [stem, [, , width, height, margin]] of Object.entries(tipFrames)) {
  for (const [name, style] of Object.entries(styles)) {
    const { X, Y } = fitFor(style, width, height, margin);
    const tip = (s) => {
      const p = centre(s);
      return `{ dx: ${fmt(X(p.x) - width / 2)}, dy: ${fmt(Y(p.y) - height / 2)} }`;
    };
    tipRows.push(`  ${stem}__${name}: [${tip(1)}, ${tip(0)}],`);
  }
}
const generatedTs = `// GENERATED by scripts/generate-buugeng-variants.cjs. Do not edit; change the
// generator and re-run.
//
// Tip points of each fitted buugeng style sprite, keyed by render key, in the
// pictograph sprite's units relative to the hand point (the viewBox centre).

export interface BuugengStyleTip {
  readonly dx: number;
  readonly dy: number;
}

export const BUUGENG_STYLE_TIP_POINTS = {
${tipRows.join("\n")}
} as const satisfies Record<string, readonly BuugengStyleTip[]>;
`;
const tsFile = path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "shared",
  "pictograph",
  "prop",
  "domain",
  "buugeng-style-geometry.generated.ts"
);
fs.writeFileSync(tsFile, generatedTs);
console.log(`wrote ${path.relative(path.join(__dirname, ".."), tsFile)}`);
