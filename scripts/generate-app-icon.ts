/**
 * Generate the app icon from the real arrow assets.
 *
 * The icon is the TKA mandala: in each quadrant of the diamond grid a 0-turn
 * pro (the outer quarter-arc) and a 1-turn anti (the loop inside it), white
 * dots on the four hand points and the center, on the app's navy. Arrow
 * anchors, rotations and assets come from render-core, the same pieces the app
 * and the MCP renderer use, so the icon can be rebuilt and recolored.
 *
 * Usage:
 *   npm run icons:app -- --out <dir> [--palette spectrum]
 *     Writes <dir>/<palette>.png (1024), <palette>-maskable.png and
 *     <palette>.svg only.
 *   npm run icons:app -- --write [--palette spectrum]
 *     Rewrites the PWA, resources/ and Android launcher icon set.
 *   --dots hand-points puts the dots on the literal +-150 grid hand points
 *     instead of where the outer arcs end (see handDots).
 *
 * Palettes: hands (red/blue like the old hand-drawn icon), rainbow (eight
 * solid hues around the wheel) and spectrum (one continuous hue gradient
 * around the ring, the default).
 */

import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateArrowPlacement } from "../packages/render-core/src/calculations/arrow-placement.js";
import { resolveFullArrowAssetPath } from "../packages/render-core/src/calculations/arrow-asset-path.js";
import { getHandpathDirection } from "../packages/render-core/src/calculations/orientation.js";
import { DIAMOND_HAND_POINTS } from "../packages/render-core/src/constants/grid-coordinates.js";
import type {
  GridLocation,
  MotionType,
} from "../packages/render-core/src/types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC = path.join(ROOT, "static");

const NAVY = "#0b1d2a";
const HAND_RED = "#ed1c24";
const HAND_BLUE = "#3575e2";
const CENTER = { x: 475, y: 475 };

// Radial nudges along each quadrant's diagonal, in 950-unit grid space. At the
// bare layer-2 anchor the pro and anti of a quadrant sit on top of each other;
// the pro is pushed outward into the big outer arc and the anti pulled inward
// into the inner loop, as the hand-drawn icon has them, with a clear gap between.
const PRO_RADIAL_OFFSET = 60;
const ANTI_RADIAL_OFFSET = 30;

// Dot sizes measured on the hand-drawn icon (1024 px, mandala ~872 px across):
// hand-point dots ~61 px wide, the center dot ~28 px. Kept as fractions of the
// art's extent so they scale with the arrows.
const DOT_DIAMETER_FRACTION = 0.07;
const CENTER_DOT_DIAMETER_FRACTION = 0.032;

// Square crop around the art, padded this much per side.
const PAD_FRACTION = 0.06;
// Maskable icons keep the art inside the central 80% circle (W3C safe zone).
const MASKABLE_SAFE_RADIUS = 0.4;

// HSL like tunnelPropColor in src/lib/shared/sequence-viewer/tunnel/tunnel-prop-colors.ts.
const SAT = 0.85;
const LIGHT = 0.57;

// Turns per motion type. Every motion starts radial ("in").
const PRO_TURNS = 0;
const ANTI_TURNS = 1;

/**
 * Tail and head of each radial asset the icon can use, in its own viewBox
 * space, read from the path data (keyed by asset file name). pro_0.0 starts
 * its path at the arrowhead tip (228.3, 244.3) and its round tail cap spans
 * (0, 0)-(11, 18.8). anti_0.0's tail cap spans (0.4, 9.4)-(17.6, 9.7) at the
 * top and its tip is the right-most point (230.5, ~210). anti_1.0's tail cap
 * spans (0, 9.1)-(18.5, 9.2) at the top and its path closes on the tip
 * (230.2, 213.4).
 */
const ASSET_ENDS: Record<string, { tail: Pt; head: Pt }> = {
  "pro_0.0": { tail: { x: 6, y: 9.4 }, head: { x: 228.3, y: 244.3 } },
  "anti_0.0": { tail: { x: 9, y: 4 }, head: { x: 230.5, y: 210 } },
  "anti_1.0": { tail: { x: 9.2, y: 4 }, head: { x: 230.2, y: 213.4 } },
};

type Pt = { x: number; y: number };
type Palette = "hands" | "rainbow" | "spectrum";
type Ring = "outer" | "inner";

interface QuadrantMotion {
  quadrant: "se" | "sw" | "nw" | "ne";
  motionType: "pro" | "anti";
  start: GridLocation;
  end: GridLocation;
  /** Color in the hands palette, copied from the hand-drawn icon. */
  handColor: string;
}

// Every motion starts radial ("in"); turns come from PRO_TURNS / ANTI_TURNS.
// Hand colors follow the old icon: the NW and SE pros are red, the NE and SW
// pros blue, each anti the other.
const MOTIONS: QuadrantMotion[] = [
  {
    quadrant: "se",
    motionType: "pro",
    start: "e",
    end: "s",
    handColor: HAND_RED,
  },
  {
    quadrant: "se",
    motionType: "anti",
    start: "s",
    end: "e",
    handColor: HAND_BLUE,
  },
  {
    quadrant: "sw",
    motionType: "pro",
    start: "w",
    end: "s",
    handColor: HAND_BLUE,
  },
  {
    quadrant: "sw",
    motionType: "anti",
    start: "s",
    end: "w",
    handColor: HAND_RED,
  },
  {
    quadrant: "nw",
    motionType: "pro",
    start: "w",
    end: "n",
    handColor: HAND_RED,
  },
  {
    quadrant: "nw",
    motionType: "anti",
    start: "n",
    end: "w",
    handColor: HAND_BLUE,
  },
  {
    quadrant: "ne",
    motionType: "pro",
    start: "e",
    end: "n",
    handColor: HAND_BLUE,
  },
  {
    quadrant: "ne",
    motionType: "anti",
    start: "n",
    end: "e",
    handColor: HAND_RED,
  },
];

/**
 * Same rule as shouldMirrorArrow in
 * src/lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.ts:
 * anti mirrors on clockwise, the others on counter-clockwise.
 */
function shouldMirror(
  motionType: string,
  rotationDirection: "cw" | "ccw"
): boolean {
  return motionType === "anti"
    ? rotationDirection === "cw"
    : rotationDirection === "ccw";
}

interface PlacedArrow {
  motion: QuadrantMotion;
  ring: Ring;
  pathData: string;
  transform: string;
  tail: Pt;
  head: Pt;
  globalTail: Pt;
  globalHead: Pt;
}

function readAsset(relativePath: string): {
  width: number;
  height: number;
  pathData: string;
} {
  const svg = readFileSync(path.join(STATIC, relativePath), "utf-8");
  const viewBox = svg
    .match(/viewBox\s*=\s*"([^"]+)"/i)?.[1]
    ?.split(/\s+/)
    .map(Number);
  const pathData = svg.match(/<path[^>]*\sd="([^"]+)"/i)?.[1];
  if (!viewBox || viewBox.length !== 4 || !pathData) {
    throw new Error(`Unexpected arrow asset shape: ${relativePath}`);
  }
  return { width: viewBox[2]!, height: viewBox[3]!, pathData };
}

function placeArrows(): PlacedArrow[] {
  return MOTIONS.map((motion) => {
    // Pro spins with the hand path, anti against it.
    const handpath = getHandpathDirection(motion.start, motion.end);
    if (handpath !== "cw" && handpath !== "ccw") {
      throw new Error(`${motion.start}->${motion.end} is not a shift`);
    }
    const rotationDirection =
      motion.motionType === "pro" ? handpath : handpath === "cw" ? "ccw" : "cw";

    const placement = calculateArrowPlacement(
      motion.motionType as MotionType,
      motion.start,
      motion.end,
      rotationDirection,
      "diamond"
    );
    const assetPath = resolveFullArrowAssetPath({
      motionType: motion.motionType,
      startOrientation: "in",
      turns: motion.motionType === "pro" ? PRO_TURNS : ANTI_TURNS,
    });
    const asset = readAsset(assetPath);
    const mirror = shouldMirror(motion.motionType, rotationDirection);

    const dx = placement.x - CENTER.x;
    const dy = placement.y - CENTER.y;
    const length = Math.hypot(dx, dy);
    const radial =
      motion.motionType === "pro" ? PRO_RADIAL_OFFSET : -ANTI_RADIAL_OFFSET;
    const x = placement.x + (dx / length) * radial;
    const y = placement.y + (dy / length) * radial;

    // Same composition as renderArrow in mcp-server/src/core/standalone-renderer.ts.
    const transform =
      `translate(${round(x)} ${round(y)}) rotate(${placement.rotation})` +
      (mirror ? " scale(-1 1)" : "") +
      ` translate(${round(-asset.width / 2)} ${round(-asset.height / 2)})`;

    const toGlobal = (p: Pt): Pt => {
      let lx = p.x - asset.width / 2;
      const ly = p.y - asset.height / 2;
      if (mirror) lx = -lx;
      const r = (placement.rotation * Math.PI) / 180;
      return {
        x: x + lx * Math.cos(r) - ly * Math.sin(r),
        y: y + lx * Math.sin(r) + ly * Math.cos(r),
      };
    };
    const assetName = path.basename(assetPath, ".svg");
    const ends = ASSET_ENDS[assetName];
    if (!ends) throw new Error(`No tail/head points for ${assetName}`);

    return {
      motion,
      ring: motion.motionType === "pro" ? "outer" : "inner",
      pathData: asset.pathData,
      transform,
      tail: ends.tail,
      head: ends.head,
      globalTail: toGlobal(ends.tail),
      globalHead: toGlobal(ends.head),
    };
  });
}

/** Screen angle around the grid center, degrees clockwise from east, 0-360. */
function angleOf(p: Pt): number {
  const degrees = (Math.atan2(p.y - CENTER.y, p.x - CENTER.x) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

function hsl(hue: number): string {
  const h = (((hue % 360) + 360) % 360) / 360;
  const q = LIGHT < 0.5 ? LIGHT * (1 + SAT) : LIGHT + SAT - LIGHT * SAT;
  const p = 2 * LIGHT - q;
  const channel = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return (
    "#" +
    [h + 1 / 3, h, h - 1 / 3]
      .map((t) =>
        Math.round(channel(t) * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Rainbow: one hue per arrow, 45 degrees apart. Arrows are ordered clockwise
 * by the angle of their tail-head midpoint; the pro and anti of a quadrant
 * share that angle (snapped to the quadrant diagonal), so the outer arc takes
 * one step and the inner loop the next, and the eye reads a single wheel. Each pair
 * straddles its diagonal's own angle (-22.5 / +22.5), which lines the wheel up
 * with the spectrum palette.
 */
function rainbowHues(arrows: PlacedArrow[]): Map<PlacedArrow, number> {
  const keyed = arrows.map((arrow) => ({
    arrow,
    angle:
      Math.round(
        angleOf({
          x: (arrow.globalTail.x + arrow.globalHead.x) / 2,
          y: (arrow.globalTail.y + arrow.globalHead.y) / 2,
        }) / 45
      ) * 45,
  }));
  keyed.sort(
    (a, b) => a.angle - b.angle || (a.arrow.ring === "outer" ? -1 : 1)
  );
  const firstHue = keyed[0]!.angle - 22.5;
  return new Map(
    keyed.map(({ arrow }, index) => [arrow, firstHue + index * 45])
  );
}

const SPECTRUM_STOPS = 8;

function spectrumGradient(arrow: PlacedArrow, id: string): string {
  const start = angleOf(arrow.globalTail);
  let sweep = angleOf(arrow.globalHead) - start;
  if (sweep > 180) sweep -= 360;
  if (sweep < -180) sweep += 360;
  const stops = Array.from({ length: SPECTRUM_STOPS + 1 }, (_, k) => {
    const t = k / SPECTRUM_STOPS;
    return `<stop offset="${round(t)}" stop-color="${hsl(start + sweep * t)}"/>`;
  }).join("");
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
    `x1="${arrow.tail.x}" y1="${arrow.tail.y}" x2="${arrow.head.x}" y2="${arrow.head.y}">` +
    `${stops}</linearGradient>`
  );
}

interface Art {
  /** SVG elements in 950-unit grid space, without background. */
  arrowsMarkup: string;
  defs: string;
}

function buildArrows(arrows: PlacedArrow[], palette: Palette): Art {
  const hues = rainbowHues(arrows);
  const defs: string[] = [];
  const markup = arrows.map((arrow, index) => {
    let fill: string;
    if (palette === "hands") {
      fill = arrow.motion.handColor;
    } else if (palette === "rainbow") {
      fill = hsl(hues.get(arrow)!);
    } else {
      const id = `spectrum-${index}`;
      defs.push(spectrumGradient(arrow, id));
      fill = `url(#${id})`;
    }
    return `<g transform="${arrow.transform}"><path d="${arrow.pathData}" fill="${fill}"/></g>`;
  });
  return { arrowsMarkup: markup.join("\n  "), defs: defs.join("\n  ") };
}

/**
 * Where the four hand dots go. The arrow assets are drawn larger than the
 * +-150 hand-point spacing (in the app they overlap the grid), so dots on the
 * literal hand points land inside the inner loops. The hand-drawn icon instead puts
 * each dot where the two outer arcs beside it begin and end; "ends" does the
 * same, at the mean axis distance of the pro tails and heads.
 */
type DotPlacement = "ends" | "hand-points";

function handDots(arrows: PlacedArrow[], placement: DotPlacement): Pt[] {
  const locations = ["n", "e", "s", "w"] as const;
  if (placement === "hand-points") {
    return locations.map((loc) => DIAMOND_HAND_POINTS[loc]!);
  }
  const reach: number[] = [];
  for (const arrow of arrows) {
    if (arrow.ring !== "outer") continue;
    for (const p of [arrow.globalTail, arrow.globalHead]) {
      reach.push(Math.max(Math.abs(p.x - CENTER.x), Math.abs(p.y - CENTER.y)));
    }
  }
  const r = reach.reduce((sum, v) => sum + v, 0) / reach.length;
  return [
    { x: CENTER.x, y: CENTER.y - r },
    { x: CENTER.x + r, y: CENTER.y },
    { x: CENTER.x, y: CENTER.y + r },
    { x: CENTER.x - r, y: CENTER.y },
  ];
}

function dotsMarkup(extent: number, hands: Pt[]): string {
  const r = (DOT_DIAMETER_FRACTION * extent) / 2;
  const rc = (CENTER_DOT_DIAMETER_FRACTION * extent) / 2;
  return [
    ...hands.map(
      (p) => `<circle cx="${p.x}" cy="${p.y}" r="${round(r)}" fill="#fff"/>`
    ),
    `<circle cx="${CENTER.x}" cy="${CENTER.y}" r="${round(rc)}" fill="#fff"/>`,
  ].join("\n  ");
}

// The art is rasterized once on a canvas wider than the grid to find its
// real extent (curved shapes make viewBox corners a poor bound).
const SCAN = { min: -300, size: 1550, scale: 1 };

function svgDoc(
  viewBox: [number, number, number, number],
  px: number,
  body: string,
  defs = ""
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${viewBox.map(round).join(" ")}">\n` +
    (defs ? `  <defs>\n  ${defs}\n  </defs>\n` : "") +
    `  ${body}\n</svg>\n`
  );
}

interface Extent {
  box: { x0: number; y0: number; x1: number; y1: number };
  /** Farthest opaque pixel from the box center. */
  radius: number;
}

async function measure(body: string, defs: string): Promise<Extent> {
  const px = SCAN.size * SCAN.scale;
  const svg = svgDoc(
    [SCAN.min, SCAN.min, SCAN.size, SCAN.size],
    px,
    body,
    defs
  );
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const hits: number[] = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x]! > 8) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
        hits.push(x, y);
      }
    }
  }
  const toUnits = (v: number) => SCAN.min + v / SCAN.scale;
  const box = {
    x0: toUnits(x0),
    y0: toUnits(y0),
    x1: toUnits(x1),
    y1: toUnits(y1),
  };
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  let radius = 0;
  for (let i = 0; i < hits.length; i += 2) {
    radius = Math.max(
      radius,
      Math.hypot(toUnits(hits[i]! + 0.5) - cx, toUnits(hits[i + 1]! + 0.5) - cy)
    );
  }
  return { box, radius };
}

interface Master {
  body: string;
  defs: string;
  extent: Extent;
}

async function buildMaster(
  palette: Palette,
  dots: DotPlacement
): Promise<Master> {
  const arrows = placeArrows();
  const art = buildArrows(arrows, palette);
  const arrowExtent = await measure(art.arrowsMarkup, art.defs);
  const size = Math.max(
    arrowExtent.box.x1 - arrowExtent.box.x0,
    arrowExtent.box.y1 - arrowExtent.box.y0
  );
  const body = `${art.arrowsMarkup}\n  ${dotsMarkup(size, handDots(arrows, dots))}`;
  return { body, defs: art.defs, extent: await measure(body, art.defs) };
}

/** Icon SVG at `px`, art centered on navy, padded square or maskable. */
function iconSvg(master: Master, px: number, kind: "any" | "maskable"): string {
  const { box, radius } = master.extent;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const half =
    kind === "maskable"
      ? radius / MASKABLE_SAFE_RADIUS / 2
      : Math.max(box.x1 - box.x0, box.y1 - box.y0) / 2 / (1 - 2 * PAD_FRACTION);
  const viewBox: [number, number, number, number] = [
    cx - half,
    cy - half,
    half * 2,
    half * 2,
  ];
  const background = `<rect x="${round(cx - half)}" y="${round(cy - half)}" width="${round(half * 2)}" height="${round(half * 2)}" fill="${NAVY}"/>`;
  return svgDoc(viewBox, px, `${background}\n  ${master.body}`, master.defs);
}

/** Render at 1024 and downscale, so small sizes get proper filtering. */
async function renderPng(
  master: Master,
  px: number,
  kind: "any" | "maskable"
): Promise<sharp.Sharp> {
  const big = Math.max(1024, px);
  const png = await sharp(Buffer.from(iconSvg(master, big, kind)))
    .png()
    .toBuffer();
  return sharp(png).resize(px, px, { kernel: "lanczos3" }).removeAlpha();
}

async function writePng(
  image: sharp.Sharp,
  file: string,
  withAlpha: boolean
): Promise<void> {
  mkdirSync(path.dirname(file), { recursive: true });
  await (withAlpha ? image.ensureAlpha() : image)
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`  ${path.relative(ROOT, file)}`);
}

async function writeSolid(file: string, px: number): Promise<void> {
  await writePng(
    sharp({ create: { width: px, height: px, channels: 3, background: NAVY } }),
    file,
    false
  );
}

const PWA_SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512, 1024];
const ANDROID_DENSITIES: Record<string, number> = {
  ldpi: 36,
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

async function writeIconSet(master: Master): Promise<void> {
  const icons = path.join(STATIC, "pwa", "icons");
  for (const px of PWA_SIZES) {
    await writePng(
      await renderPng(master, px, "any"),
      path.join(icons, `icon-${px}x${px}.png`),
      true
    );
  }
  for (const px of [192, 512]) {
    await writePng(
      await renderPng(master, px, "maskable"),
      path.join(icons, `maskable-icon-${px}x${px}.png`),
      true
    );
  }

  const resources = path.join(ROOT, "resources");
  await writePng(
    await renderPng(master, 1024, "any"),
    path.join(resources, "icon-only.png"),
    true
  );
  await writePng(
    await renderPng(master, 1024, "any"),
    path.join(resources, "icon-foreground.png"),
    true
  );
  await writeSolid(path.join(resources, "icon-background.png"), 1024);

  const res = path.join(ROOT, "android", "app", "src", "main", "res");
  for (const [density, px] of Object.entries(ANDROID_DENSITIES)) {
    const dir = path.join(res, `mipmap-${density}`);
    await writePng(
      await renderPng(master, px, "any"),
      path.join(dir, "ic_launcher_foreground.png"),
      true
    );
    await writeSolid(path.join(dir, "ic_launcher_background.png"), px);
    // Legacy launchers: keep each file's own alpha (rounded square, circle)
    // as the mask and swap in the new art.
    for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
      const file = path.join(dir, name);
      if (!existsSync(file)) throw new Error(`Missing ${file}`);
      const mask = await sharp(file)
        .ensureAlpha()
        .extractChannel(3)
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (mask.info.width !== px || mask.info.height !== px) {
        throw new Error(
          `${file} is ${mask.info.width}x${mask.info.height}, expected ${px}`
        );
      }
      const rgb = await (await renderPng(master, px, "any")).raw().toBuffer();
      const image = sharp(rgb, {
        raw: { width: px, height: px, channels: 3 },
      }).joinChannel(mask.data, {
        raw: { width: px, height: px, channels: 1 },
      });
      await writePng(image, file, true);
    }
  }
}

function parseArgs(argv: string[]): {
  palette: Palette;
  dots: DotPlacement;
  out?: string;
  write: boolean;
} {
  let palette: Palette = "spectrum";
  let dots: DotPlacement = "ends";
  let out: string | undefined;
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--palette") {
      const value = argv[++i];
      if (value !== "hands" && value !== "rainbow" && value !== "spectrum") {
        throw new Error(
          `--palette must be hands, rainbow or spectrum (got ${value})`
        );
      }
      palette = value;
    } else if (arg === "--dots") {
      const value = argv[++i];
      if (value !== "ends" && value !== "hand-points") {
        throw new Error(`--dots must be ends or hand-points (got ${value})`);
      }
      dots = value;
    } else if (arg === "--out") {
      out = argv[++i];
      if (!out) throw new Error("--out needs a directory");
    } else if (arg === "--write") {
      write = true;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  if (!out && !write) {
    throw new Error(
      "Pass --out <dir> for previews or --write for the icon set"
    );
  }
  return { palette, dots, out, write };
}

async function main(): Promise<void> {
  const { palette, dots, out, write } = parseArgs(process.argv.slice(2));
  const master = await buildMaster(palette, dots);

  if (out) {
    const dir = path.resolve(out);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, `${palette}.svg`),
      iconSvg(master, 1024, "any")
    );
    await writePng(
      await renderPng(master, 1024, "any"),
      path.join(dir, `${palette}.png`),
      false
    );
    await writePng(
      await renderPng(master, 1024, "maskable"),
      path.join(dir, `${palette}-maskable.png`),
      false
    );
  }
  if (write) {
    console.log(`Writing the ${palette} icon set:`);
    await writeIconSet(master);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
