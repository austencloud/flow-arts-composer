/**
 * The photographed surfaces the site can wear: how big each one really is, which
 * files hold it, and which of them a given plan needs. Pure data, no pictures.
 *
 * Where they came from, and what was changed, is in
 * `static/textures/site-walk/CREDITS.md`.
 */

import {
  SURROUND_SIZES,
  type SiteSurroundings,
  type WallKind,
} from "../site-walk-around";

/** Metres one whole photograph covers, and how its files are named. */
interface ScanSpec {
  wide: number;
  high: number;
  /** A weave has no colour of its own; the cloth keeps the colour it has. */
  albedo: boolean;
  /** A second, sharper picture for a computer. */
  sharp: boolean;
  /** Brown brick is the red one, darker: same relief. */
  normalOf?: string;
  /** How far its relief is pushed, where the camera's own is too little or too much; 1 otherwise. */
  relief?: number;
}

const COURSE = SURROUND_SIZES.brickCourse;
/** One lap of siding shows four inches of board. */
const LAP = (4 / 12) * 0.3048;

export const SCANS = {
  lawn: { wide: 2.5, high: 2.5, albedo: true, sharp: true, relief: 1.5 },
  mulch: { wide: 2.1, high: 2.1, albedo: true, sharp: true, relief: 1.7 },
  street: { wide: 4, high: 4, albedo: true, sharp: true },
  // A gravelly pour; the site's own slabs are trowelled smoother.
  concrete: { wide: 2.1, high: 2.1, albedo: true, sharp: true, relief: 0.35 },
  // Walls are scaled so their courses match the ones the buildings are drawn to.
  "brick-buff": {
    wide: 32 * COURSE,
    high: 16 * COURSE,
    albedo: true,
    sharp: true,
  },
  "brick-red": {
    wide: 28 * COURSE,
    high: 14 * COURSE,
    albedo: true,
    sharp: true,
  },
  "brick-brown": {
    wide: 28 * COURSE,
    high: 14 * COURSE,
    albedo: true,
    sharp: true,
    normalOf: "brick-red",
  },
  stone: { wide: 2, high: 2, albedo: true, sharp: false },
  siding: {
    wide: 16 * LAP,
    high: 8 * LAP,
    albedo: true,
    sharp: true,
    relief: 1.4,
  },
  // Bark carries its own repeats in the trees' UVs; a weave is laid by the metre.
  bark: { wide: 1, high: 1, albedo: true, sharp: false },
  cloth: { wide: 0.4, high: 0.4, albedo: false, sharp: false },
} as const satisfies Record<string, ScanSpec>;

export type ScanName = keyof typeof SCANS;

export function scanRelief(name: ScanName): number {
  const spec: ScanSpec = SCANS[name];
  return spec.relief ?? 1;
}

/** The photograph each kind of wall wears; board-formed concrete keeps its drawn one. */
export const WALL_SCAN: Partial<Record<WallKind, ScanName>> = {
  "brick-buff": "brick-buff",
  "brick-red": "brick-red",
  "brick-brown": "brick-brown",
  stone: "stone",
  "siding-white": "siding",
};

const FOLDER = "/textures/site-walk";

export function scanFiles(
  name: ScanName,
  small: boolean
): { albedo: string | null; normal: string } {
  const spec: ScanSpec = SCANS[name];
  const size = spec.sharp && !small ? "2k" : "1k";
  return {
    albedo: spec.albedo ? `${FOLDER}/${name}-albedo-${size}.webp` : null,
    normal: `${FOLDER}/${spec.normalOf ?? name}-normal.webp`,
  };
}

/** How often the photograph repeats inside one repeat of a mesh that tiles every `tile` metres. */
export function scanRepeat(
  name: ScanName,
  tile: number
): { x: number; y: number } {
  const { wide, high } = SCANS[name];
  return { x: tile / wide, y: tile / high };
}

/** The surfaces this site will show, each once. */
export function neededScans(
  site: { canopies: number; streets: number },
  around: SiteSurroundings | null
): ScanName[] {
  const needed = new Set<ScanName>();
  if (site.canopies > 0) needed.add("cloth");
  if (site.streets > 0) needed.add("street");
  if (around) {
    const { ground, patches, roads, walks, buildings, trees } = around;
    if (ground.base === "grass") needed.add("lawn");
    if (ground.lot === "mulch") needed.add("mulch");
    if (ground.patio === "concrete" || walks.length) needed.add("concrete");
    if (roads.length) needed.add("street");
    for (const patch of patches) {
      if (patch.surface === "asphalt") needed.add("street");
      else if (patch.surface === "grass") needed.add("lawn");
      else if (patch.surface !== "pavers") needed.add(patch.surface);
    }
    for (const building of buildings) {
      for (const part of building.parts) {
        const scan = WALL_SCAN[part.wall];
        if (scan) needed.add(scan);
      }
    }
    if (trees.some((tree) => tree.kind === "bare")) needed.add("bark");
  }
  return [...needed];
}
