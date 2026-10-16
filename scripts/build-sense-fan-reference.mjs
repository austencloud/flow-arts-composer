#!/usr/bin/env node
// Converts Flow DNA's flat outline of the Sense Fan shell into
// scripts/assets/sense-fan-reference.json, the single source for the Sense Fan
// SVG, GLB and tip anchors. Runs once, with Austen's approval, against a local
// Flow DNA Studio checkout:
//
//   node scripts/build-sense-fan-reference.mjs <flow-dna-studio-checkout>
//
// The source frame is millimetres with the grip centre at (-180, 0) and the
// fan opening along +x. The reference frame is metres with the grip centre at
// the origin, +Y along the reach and X across it (the Star frame).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_HOLE_AREA_M2 = 5e-5; // 50 mm²: screw holes and slivers vanish at pictograph size.
const GRIP_CENTER_MM = [-180, 0];
const RIM_BEARINGS_DEG = [-70.2, -42.2, 0, 42.2, 70.2]; // The fire fan's bearings, as Moon uses.
const RIM_INSET_M = 0.008;
const SHEET_THICKNESS_M = 0.003; // Estimate until Duncan gives the real figure.
const SVG_SCALE_PX_PER_M = 417.3; // DoodleGrip scale shared by the cut-sheet builds.

const checkout = process.argv[2];
if (!checkout) {
  console.error("Usage: node scripts/build-sense-fan-reference.mjs <flow-dna-studio-checkout>");
  process.exit(1);
}

const source = readFileSync(join(resolve(checkout), "src/lib/fan/body.ts"), "utf8");
const match = source.match(/export const FAN_BODY\s*:\s*BodyLoop\[\]\s*=\s*(\[[\s\S]*?\]);/);
if (!match) throw new Error("Outline ring list not found in the Flow DNA checkout.");
const ringsMm = JSON.parse(match[1]);

const round = (value) => Math.round(value * 1e5) / 1e5;
const toReference = ([x, y]) => [round(-y / 1000), round((x - GRIP_CENTER_MM[0]) / 1000)];

function area(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function openRing(ring) {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

const rings = ringsMm.map((ring) => openRing(ring.map(toReference)));
const outline = rings[0];
const holes = rings.slice(1).filter((ring) => ring.length >= 3 && area(ring) >= MIN_HOLE_AREA_M2);
const dropped = rings.length - 1 - holes.length;

// The farthest point where a ray from the grip at each bearing leaves the
// silhouette, pulled back towards the grip so the anchor sits on the shell.
function rimPoint(bearingDeg) {
  const theta = (bearingDeg * Math.PI) / 180;
  const dir = [Math.sin(theta), Math.cos(theta)];
  let farthest = 0;
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const edge = [b[0] - a[0], b[1] - a[1]];
    const denom = dir[0] * edge[1] - dir[1] * edge[0];
    if (Math.abs(denom) < 1e-12) continue;
    const t = (a[0] * edge[1] - a[1] * edge[0]) / denom;
    const u = (a[0] * dir[1] - a[1] * dir[0]) / denom;
    if (t > 0 && u >= 0 && u <= 1) farthest = Math.max(farthest, t);
  }
  if (farthest === 0) throw new Error(`No rim crossing at ${bearingDeg} degrees.`);
  const r = farthest - RIM_INSET_M;
  return [round(dir[0] * r), round(dir[1] * r)];
}

const xs = outline.map(([x]) => x);
const ys = outline.map(([, y]) => y);
const reference = {
  version: 1,
  source: "Flow DNA Sense Fan",
  provenance:
    "Shell outline traced from Flow DNA's own flat outline of the Sense Fan, shared at Duncan Greenwood's request; conversion approved by Austen on 2026-10-15. Stroked hub and hinge edges are left out, and holes under 50 mm² are dropped. The LED layout is deliberately absent. Sheet thickness is an estimate.",
  prop_length_m: round(Math.max(...ys)),
  span_m: round(Math.max(...xs) - Math.min(...xs)),
  base_offset_m: round(Math.min(...ys)),
  sheet_thickness_m: SHEET_THICKNESS_M,
  sheet_thickness_estimate: true,
  svg_scale_px_per_m: SVG_SCALE_PX_PER_M,
  min_hole_area_m2: MIN_HOLE_AREA_M2,
  rim_bearings_deg: RIM_BEARINGS_DEG,
  rim_inset_m: RIM_INSET_M,
  rim_points_m: RIM_BEARINGS_DEG.map(rimPoint),
  outline_m: outline,
  holes_m: holes,
};

const out = join(dirname(fileURLToPath(import.meta.url)), "assets/sense-fan-reference.json");
const compactPoints = (key, value) =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === "number" ? JSON.stringify(value) : value;
const json = JSON.stringify(reference, compactPoints, 2).replace(/"(\[-?[\d.e-]+,-?[\d.e-]+\])"/g, "$1");
writeFileSync(out, `${json}\n`);
console.log(
  `Wrote ${out}: outline ${outline.length} points, ${holes.length} holes kept, ${dropped} dropped, ` +
    `prop length ${reference.prop_length_m} m, span ${reference.span_m} m.`,
);
