/**
 * The world around a gig's lot, read from an optional second file.
 *
 * The surroundings file sits beside the site plan and describes what stands
 * around the lot: roads, walks, buildings, railings, trees, poles, wires,
 * street lamps and parked cars, and how the plan's own ground, patio and fence
 * are dressed. It uses the plan's axes and units (feet; x to the right, y down
 * the page; `turn` in degrees clockwise on the plan) and is read into metres
 * with world x = plan x and world z = plan y.
 *
 * This module reads no DOM and builds no three.js objects, so the tests cover
 * all of it. Anything it does not know how to stand up, a key, a kind or a
 * value, is named once in `notDrawn` and skipped, never thrown. The renderer
 * holds no site data: every size the file leaves out is in `SURROUND_SIZES`.
 *
 * A face of a rect part is named for the part before its turn (`n` at the
 * smaller y, `e` the larger x, `s`, `w`). Offsets along a face (`atFt`) run
 * from the face's middle along the plan's own axes before the turn: toward +x
 * on an `n` or `s` face, toward +y on an `e` or `w` face.
 */

import { FEET_TO_METRES, readPoint, readPoints, rectCorners, type Pt, type SiteWalkWorld, type StreetShape } from "./site-walk-plan";

const ft = (feet: number) => feet * FEET_TO_METRES;

/** Every guessed size in metres: the file carries only what it chooses to say. */
export const SURROUND_SIZES = {
  roadWidth: ft(24),
  walkWidth: ft(5),
  /** A low concrete kerb: how tall and how wide. */
  kerbHeight: 0.15,
  kerbWidth: 0.18,
  ironPostSpacing: ft(8),
  /** About 4.5 in between pickets. */
  picketSpacing: ft(4.5 / 12),
  railingHeight: ft(3.5),
  fenceHeight: ft(6),
  treeHeight: ft(40),
  /** Crown width as a share of height when the file gives no spread. */
  treeSpreadShare: 0.8,
  poleHeight: ft(32),
  /** How far below the pole's top its crossarm and the wires hang. */
  poleArmDrop: ft(5),
  wireHeight: ft(27),
  lampHeight: ft(12),
  /** A lit street light's arm. */
  lampArmLength: ft(6),
  buildingHeight: ft(10),
  roofOverhang: ft(1),
  /** The dark band on a roof's edge, "about a foot deep". */
  fasciaDepth: ft(1),
  roofRise: ft(4),
  roofColour: "#3b2c25",
  /** A brick course, 2.7 in tall, with its joint. */
  brickCourse: ft(2.7 / 12),
  window: { width: ft(3.5), sill: ft(3), head: ft(7), litShare: 0.5 },
  /** `"windows": "auto"`: one about every 11 ft of wall, 3.5 x 4 ft, sill at 3 ft, about half lit. */
  autoWindow: {
    every: ft(11),
    width: ft(3.5),
    height: ft(4),
    sill: ft(3),
    litShare: 0.5,
  },
  door: { width: ft(3.5), height: ft(7) },
  garage: { width: ft(16), height: ft(7) },
  emblem: { size: ft(3), up: ft(6) },
  star: { size: ft(1.3), every: ft(16), skip: 2 },
  car: {
    sedan: { length: ft(15.5), width: ft(6), height: ft(4.8) },
    suv: { length: ft(16), width: ft(6.4), height: ft(5.6) },
  },
  carColour: "#8b8f95",
  /** What stops you at a trunk: its width, as a share of the tree's height. */
  trunkShare: 0.018,
  poleCollider: 0.26,
  lampCollider: 0.2,
} as const;

export type WallKind = "brick-buff" | "brick-red" | "brick-brown" | "stone" | "siding-white" | "concrete";
const WALLS: readonly WallKind[] = ["brick-buff", "brick-red", "brick-brown", "stone", "siding-white", "concrete"];
export type PatchSurface = "asphalt" | "concrete" | "grass" | "mulch" | "pavers";
const SURFACES: readonly PatchSurface[] = ["asphalt", "concrete", "grass", "mulch", "pavers"];
export type FaceSide = "n" | "e" | "s" | "w";
const FACE_SIDES: readonly FaceSide[] = ["n", "e", "s", "w"];
export type RoofType = "flat" | "hip" | "gable";
export type KerbSides = "both" | "left" | "right" | "none";

export interface WindowRow {
  count: number;
  width: number;
  sill: number;
  head: number;
  /** Share that glow warm at Dusk and Night. */
  lit: number;
}
export interface DoorSpec {
  at: number;
  w: number;
  h: number;
  glass: boolean;
}
export interface GarageSpec {
  at: number;
  w: number;
  h: number;
}
export interface EmblemSpec {
  points: number;
  skip: number;
  size: number;
  at: number;
  up: number;
}
export interface FaceSpec {
  windows: WindowRow | null;
  door: DoorSpec | null;
  garage: GarageSpec | null;
  emblem: EmblemSpec | null;
}
export interface RoofSpec {
  type: RoofType;
  rise: number;
  overhang: number;
  colour: string;
  /** Which side a ridge runs along; null picks the longer one. */
  ridge: "w" | "d" | null;
}

interface PartBase {
  height: number;
  wall: WallKind;
  roof: RoofSpec;
}
export interface RectPart extends PartBase {
  shape: "rect";
  centre: Pt;
  w: number;
  d: number;
  turn: number;
  corners: [Pt, Pt, Pt, Pt];
  faces: Partial<Record<FaceSide, FaceSpec>>;
  /** Faces without an entry of their own get a house's windows. */
  windowsAuto: boolean;
}
export interface PolyPart extends PartBase {
  shape: "poly";
  points: Pt[];
}
export type BuildingPart = RectPart | PolyPart;
export interface BuildingShape {
  id: string;
  /** The plan's building this one stands in for: the plan's plain block is then not drawn. */
  of: string | null;
  parts: BuildingPart[];
}

export interface RoadShape {
  points: Pt[];
  width: number;
  kerbs: KerbSides;
}
export interface WalkShape {
  points: Pt[];
  width: number;
}
export interface PatchShape {
  surface: PatchSurface;
  points: Pt[];
}
export interface StarSpec {
  points: number;
  skip: number;
  size: number;
  every: number;
}
export interface RailingShape {
  /** Its line; empty until `of` is looked up in the plan (`siteFloor` does that). */
  points: Pt[];
  /**
   * A plan fence or box this railing stands in for: it runs along that fence's
   * line or that box's long middle, and the plan's own fence or box is not drawn.
   */
  of: string | null;
  height: number;
  collide: boolean;
  stars: StarSpec | null;
  /** Width of a heavier post at each end and wherever two stretches meet, metres; null for plain posts. */
  endPost: number | null;
}

/**
 * A raised area: a platform, a stair tread. Most name a plan patio by id,
 * whose outline is the top; one the plan does not reach (past the lot's edge)
 * gives its own outline instead.
 */
export interface RaisedSpec {
  /** The plan patio's id, or null for an area with its own outline. */
  of: string | null;
  /** Its own outline, when it names no plan thing. */
  points: Pt[] | null;
  /** Height of the top above the flat ground, metres. */
  height: number;
  /** Whether guests may stand on it. */
  guests: boolean;
}

/**
 * The lawn's heights on a square grid: row r lies at plan y = origin.z + r *
 * spacing, column c at x = origin.x + c * spacing. Metres, above the flat
 * ground. Outside the grid the ground is flat.
 */
export interface GroundGrid {
  origin: Pt;
  spacing: number;
  rows: number[][];
}
export interface TreeShape {
  at: Pt;
  kind: "bare" | "evergreen";
  height: number;
  spread: number;
  seed: number;
}
export interface PoleShape {
  at: Pt;
  height: number;
  lamp: boolean;
  lampToward: Pt | null;
}
export interface WireShape {
  points: Pt[];
  height: number;
}
export interface LampShape {
  at: Pt;
  height: number;
}
export interface CarShape {
  at: Pt;
  turn: number;
  body: "sedan" | "suv";
  colour: string;
}

export interface SiteSurroundings {
  ground: {
    base: "grass" | null;
    lot: "mulch" | null;
    patio: "concrete" | null;
  };
  fence: { style: "chain" | "iron"; height: number | null };
  roads: RoadShape[];
  walks: WalkShape[];
  patches: PatchShape[];
  kerbs: Pt[][];
  buildings: BuildingShape[];
  railings: RailingShape[];
  trees: TreeShape[];
  poles: PoleShape[];
  wires: WireShape[];
  lamps: LampShape[];
  cars: CarShape[];
  raised: RaisedSpec[];
  groundHeights: GroundGrid | null;
  /** Kinds, keys and values that were skipped, once each, in the order first met. */
  notDrawn: string[];
}

export type SurroundingsRead = { ok: true; around: SiteSurroundings } | { ok: false; message: string };

const NOT_SURROUNDINGS = "That file is not a surroundings file.";
const TOP_KEYS = new Set([
  "version",
  "kind",
  "title",
  "ground",
  "fence",
  "roads",
  "walks",
  "patches",
  "kerbs",
  "buildings",
  "railings",
  "trees",
  "poles",
  "wires",
  "lamps",
  "cars",
  "raised",
  "groundHeights",
]);
const PART_KEYS = new Set(["shape", "at", "w", "d", "turn", "points", "heightFt", "wall", "windows", "roof", "faces"]);
const FACE_KEYS = new Set(["windows", "windowWFt", "sillFt", "headFt", "lit", "door", "garage", "emblem"]);

// ------------------------------------------------------------------ small readers

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** A positive size in feet, in metres, or the fallback. */
const sizeFt = (v: unknown, fallback: number): number => (finite(v) && v > 0 ? ft(v) : fallback);
const turnOf = (v: unknown): number => (finite(v) ? (v * Math.PI) / 180 : 0);

/** A stable number from text, so the same building id always lights the same windows. */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The outline of a star polygon: `points` tips on a circle of `radius`, the
 * first straight up, each joined to the one `skip` further round. 6 and 2 is
 * two crossed triangles; 5 and 2 is the five-pointed star. A skip that makes
 * no star (1, or half the tips or more) is a plain ring. Fewer than 3 tips
 * has no outline.
 */
export function starSegments(points: number, skip: number, radius: number): { tips: [number, number][]; segments: [number, number][] } {
  const n = Math.round(points);
  if (!finite(points) || n < 3) return { tips: [], segments: [] };
  const step = Math.round(skip);
  const jump = step >= 1 && step * 2 < n ? step : 1;
  const tips: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    tips.push([Math.sin(angle) * radius, Math.cos(angle) * radius]);
  }
  const segments: [number, number][] = [];
  for (let i = 0; i < n; i++) segments.push([i, (i + jump) % n]);
  return { tips, segments };
}

// ------------------------------------------------------------------ reading

export function readSurroundingsText(text: string): SurroundingsRead {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: NOT_SURROUNDINGS };
  }
  return readSurroundings(json);
}

export function readSurroundings(raw: unknown): SurroundingsRead {
  if (!isObject(raw) || raw.kind !== "site-surroundings") return { ok: false, message: NOT_SURROUNDINGS };
  const notDrawn: string[] = [];
  const skip = (name: string) => {
    if (!notDrawn.includes(name)) notDrawn.push(name);
  };
  for (const key of Object.keys(raw)) if (!TOP_KEYS.has(key)) skip(key);

  const list = (key: string): Record<string, unknown>[] => {
    const v = raw[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      skip(key);
      return [];
    }
    return v.filter((x): x is Record<string, unknown> => {
      if (isObject(x)) return true;
      skip(key.replace(/s$/, ""));
      return false;
    });
  };
  const colourOf = (v: unknown, fallback: string): string => {
    if (v === undefined) return fallback;
    if (typeof v === "string" && HEX.test(v)) return v;
    skip(`colour: ${String(v)}`);
    return fallback;
  };

  // Ground and fence.
  const ground: SiteSurroundings["ground"] = {
    base: null,
    lot: null,
    patio: null,
  };
  if (isObject(raw.ground)) {
    const g = raw.ground;
    for (const [field, allowed] of [
      ["base", "grass"],
      ["lot", "mulch"],
      ["patio", "concrete"],
    ] as const) {
      if (g[field] === undefined) continue;
      if (g[field] === allowed) ground[field] = allowed as never;
      else skip(`ground ${field}: ${String(g[field])}`);
    }
  } else if (raw.ground !== undefined) skip("ground");
  const fence: SiteSurroundings["fence"] = { style: "chain", height: null };
  if (isObject(raw.fence)) {
    const f = raw.fence;
    if (f.style === "iron" || f.style === "chain") fence.style = f.style;
    else if (f.style !== undefined) skip(`fence style: ${String(f.style)}`);
    if (finite(f.heightFt) && f.heightFt > 0) fence.height = ft(f.heightFt);
  } else if (raw.fence !== undefined) skip("fence");

  const lineOf = (thing: Record<string, unknown>, kind: string): Pt[] | null => {
    const pts = readPoints(thing.points, 2);
    if (!pts) skip(kind);
    return pts;
  };

  const roads: RoadShape[] = [];
  for (const thing of list("roads")) {
    const points = lineOf(thing, "road");
    if (!points) continue;
    let kerbs: KerbSides = "both";
    if (thing.kerbs === "both" || thing.kerbs === "left" || thing.kerbs === "right" || thing.kerbs === "none") kerbs = thing.kerbs;
    else if (thing.kerbs !== undefined) skip(`kerbs: ${String(thing.kerbs)}`);
    roads.push({
      points,
      width: sizeFt(thing.widthFt, SURROUND_SIZES.roadWidth),
      kerbs,
    });
  }
  const walks: WalkShape[] = [];
  for (const thing of list("walks")) {
    const points = lineOf(thing, "walk");
    if (points)
      walks.push({
        points,
        width: sizeFt(thing.widthFt, SURROUND_SIZES.walkWidth),
      });
  }
  const patches: PatchShape[] = [];
  for (const thing of list("patches")) {
    const points = readPoints(thing.points, 3);
    if (!points) skip("patch");
    else if (!SURFACES.includes(thing.surface as PatchSurface)) skip(`surface: ${String(thing.surface)}`);
    else patches.push({ surface: thing.surface as PatchSurface, points });
  }
  const kerbs: Pt[][] = [];
  for (const thing of list("kerbs")) {
    const points = lineOf(thing, "kerb");
    if (points) kerbs.push(points);
  }

  // Buildings.
  const buildings: BuildingShape[] = [];
  list("buildings").forEach((thing, index) => {
    if (!Array.isArray(thing.parts)) return skip("building");
    const id = typeof thing.id === "string" && thing.id ? thing.id : `building-${index + 1}`;
    const of = typeof thing.of === "string" && thing.of ? thing.of : null;
    const parts: BuildingPart[] = [];
    for (const part of thing.parts) {
      if (!isObject(part)) {
        skip("part");
        continue;
      }
      const read = readPart(part, skip, colourOf);
      if (read) parts.push(read);
    }
    if (parts.length) buildings.push({ id, of, parts });
    else skip("building");
  });

  const railings: RailingShape[] = [];
  for (const thing of list("railings")) {
    const of = typeof thing.of === "string" && thing.of ? thing.of : null;
    const points = of && thing.points === undefined ? [] : lineOf(thing, "railing");
    if (!points) continue;
    let stars: StarSpec | null = null;
    if (isObject(thing.stars)) {
      const s = thing.stars;
      if (finite(s.points) && s.points >= 3) {
        stars = {
          points: Math.round(s.points),
          skip: finite(s.skip) ? Math.round(s.skip) : SURROUND_SIZES.star.skip,
          size: sizeFt(s.sizeFt, SURROUND_SIZES.star.size),
          every: sizeFt(s.everyFt, SURROUND_SIZES.star.every),
        };
      } else skip("stars");
    }
    railings.push({
      points,
      of,
      height: sizeFt(thing.heightFt, SURROUND_SIZES.railingHeight),
      collide: thing.collide !== false,
      stars,
      endPost: finite(thing.endPostFt) && thing.endPostFt > 0 ? ft(thing.endPostFt) : null,
    });
  }

  const raised: RaisedSpec[] = [];
  for (const thing of list("raised")) {
    const of = typeof thing.of === "string" && thing.of ? thing.of : null;
    const points = of ? null : readPoints(thing.points, 3);
    if ((!of && !points) || !finite(thing.heightFt) || thing.heightFt < 0) {
      skip("raised");
      continue;
    }
    raised.push({ of, points, height: ft(thing.heightFt), guests: thing.guests === true });
  }

  let groundHeights: GroundGrid | null = null;
  if (raw.groundHeights !== undefined) {
    groundHeights = readGrid(raw.groundHeights);
    if (!groundHeights) skip("groundHeights");
  }

  const trees: TreeShape[] = [];
  for (const thing of list("trees")) {
    const at = readPoint(thing.at);
    if (!at) {
      skip("tree");
      continue;
    }
    const kind = thing.kind === undefined ? "bare" : thing.kind;
    if (kind !== "bare" && kind !== "evergreen") {
      skip(`tree: ${String(kind)}`);
      continue;
    }
    const height = sizeFt(thing.heightFt, SURROUND_SIZES.treeHeight);
    trees.push({
      at,
      kind,
      height,
      spread: sizeFt(thing.spreadFt, height * SURROUND_SIZES.treeSpreadShare),
      seed: finite(thing.seed) ? Math.trunc(thing.seed) : 1,
    });
  }

  const poles: PoleShape[] = [];
  for (const thing of list("poles")) {
    const at = readPoint(thing.at);
    if (!at) skip("pole");
    else
      poles.push({
        at,
        height: sizeFt(thing.heightFt, SURROUND_SIZES.poleHeight),
        lamp: thing.lamp === true,
        lampToward: readPoint(thing.lampToward),
      });
  }
  const wires: WireShape[] = [];
  for (const thing of list("wires")) {
    const points = lineOf(thing, "wire");
    if (points)
      wires.push({
        points,
        height: sizeFt(thing.heightFt, SURROUND_SIZES.wireHeight),
      });
  }
  const lamps: LampShape[] = [];
  for (const thing of list("lamps")) {
    const at = readPoint(thing.at);
    if (!at) skip("lamp");
    else
      lamps.push({
        at,
        height: sizeFt(thing.heightFt, SURROUND_SIZES.lampHeight),
      });
  }
  const cars: CarShape[] = [];
  for (const thing of list("cars")) {
    const at = readPoint(thing.at);
    if (!at) {
      skip("car");
      continue;
    }
    const body = thing.body === undefined ? "sedan" : thing.body;
    if (body !== "sedan" && body !== "suv") {
      skip(`car: ${String(body)}`);
      continue;
    }
    cars.push({
      at,
      turn: turnOf(thing.turn),
      body,
      colour: colourOf(thing.colour, SURROUND_SIZES.carColour),
    });
  }

  return {
    ok: true,
    around: {
      ground,
      fence,
      roads,
      walks,
      patches,
      kerbs,
      buildings,
      railings,
      trees,
      poles,
      wires,
      lamps,
      cars,
      raised,
      groundHeights,
      notDrawn,
    },
  };
}

/** A ground grid, or null when any part of it is missing or not a number. */
function readGrid(v: unknown): GroundGrid | null {
  if (!isObject(v)) return null;
  const origin = readPoint(v.originFt);
  if (!origin || !finite(v.spacingFt) || v.spacingFt <= 0 || !Array.isArray(v.rowsFt) || v.rowsFt.length < 2) return null;
  const width = Array.isArray(v.rowsFt[0]) ? v.rowsFt[0].length : 0;
  if (width < 2) return null;
  const rows: number[][] = [];
  for (const row of v.rowsFt) {
    if (!Array.isArray(row) || row.length !== width || !row.every(finite)) return null;
    rows.push(row.map((h: number) => ft(h)));
  }
  return { origin, spacing: ft(v.spacingFt), rows };
}

function readPart(
  part: Record<string, unknown>,
  skip: (name: string) => void,
  colourOf: (v: unknown, fallback: string) => string,
): BuildingPart | null {
  for (const key of Object.keys(part)) if (!PART_KEYS.has(key)) skip(`part key: ${key}`);
  const shape = part.shape;
  if (shape !== "rect" && shape !== "poly") {
    skip(`part: ${String(shape)}`);
    return null;
  }
  let wall: WallKind = "concrete";
  if (WALLS.includes(part.wall as WallKind)) wall = part.wall as WallKind;
  else if (part.wall !== undefined) skip(`wall: ${String(part.wall)}`);
  const height = sizeFt(part.heightFt, SURROUND_SIZES.buildingHeight);

  const roof: RoofSpec = {
    type: "flat",
    rise: SURROUND_SIZES.roofRise,
    overhang: SURROUND_SIZES.roofOverhang,
    colour: SURROUND_SIZES.roofColour,
    ridge: null,
  };
  if (isObject(part.roof)) {
    const r = part.roof;
    if (r.type === "flat" || r.type === "hip" || r.type === "gable") roof.type = r.type;
    else if (r.type !== undefined) skip(`roof: ${String(r.type)}`);
    if (finite(r.riseFt) && r.riseFt >= 0) roof.rise = ft(r.riseFt);
    if (finite(r.overhangFt) && r.overhangFt >= 0) roof.overhang = ft(r.overhangFt);
    roof.colour = colourOf(r.colour, roof.colour);
    if (r.ridge === "w" || r.ridge === "d") roof.ridge = r.ridge;
  } else if (part.roof !== undefined) skip("roof");

  if (shape === "poly") {
    const points = readPoints(part.points, 3);
    if (!points) {
      skip("part: poly");
      return null;
    }
    if (roof.type !== "flat") {
      skip(`roof: ${roof.type} on a poly`);
      roof.type = "flat";
    }
    return { shape, points, height, wall, roof };
  }

  const centre = readPoint(part.at);
  if (!centre || !finite(part.w) || !finite(part.d) || part.w <= 0 || part.d <= 0) {
    skip("part: rect");
    return null;
  }
  const w = ft(part.w);
  const d = ft(part.d);
  const turn = turnOf(part.turn);
  const faces: Partial<Record<FaceSide, FaceSpec>> = {};
  if (isObject(part.faces)) {
    for (const [side, value] of Object.entries(part.faces)) {
      if (!FACE_SIDES.includes(side as FaceSide) || !isObject(value)) {
        skip(`face: ${side}`);
        continue;
      }
      faces[side as FaceSide] = readFace(value, skip);
    }
  } else if (part.faces !== undefined) skip("faces");
  if (part.windows !== undefined && part.windows !== "auto") skip(`windows: ${String(part.windows)}`);
  return {
    shape,
    centre,
    w,
    d,
    turn,
    corners: rectCorners(centre, w, d, turn),
    height,
    wall,
    roof,
    faces,
    windowsAuto: part.windows === "auto",
  };
}

function readFace(face: Record<string, unknown>, skip: (name: string) => void): FaceSpec {
  for (const key of Object.keys(face)) if (!FACE_KEYS.has(key)) skip(`face: ${key}`);
  const W = SURROUND_SIZES.window;
  let windows: WindowRow | null = null;
  if (finite(face.windows) && face.windows >= 1) {
    windows = {
      count: Math.min(40, Math.round(face.windows)),
      width: sizeFt(face.windowWFt, W.width),
      sill: finite(face.sillFt) && face.sillFt >= 0 ? ft(face.sillFt) : W.sill,
      head: sizeFt(face.headFt, W.head),
      lit: finite(face.lit) ? Math.min(1, Math.max(0, face.lit)) : W.litShare,
    };
    if (windows.head <= windows.sill) windows.head = windows.sill + ft(3);
  } else if (face.windows !== undefined) skip("windows");
  let door: DoorSpec | null = null;
  if (isObject(face.door)) {
    const d = face.door;
    door = {
      at: finite(d.atFt) ? ft(d.atFt) : 0,
      w: sizeFt(d.wFt, SURROUND_SIZES.door.width),
      h: sizeFt(d.hFt, SURROUND_SIZES.door.height),
      glass: d.glass === true,
    };
  } else if (face.door !== undefined) skip("door");
  let garage: GarageSpec | null = null;
  if (isObject(face.garage)) {
    const g = face.garage;
    garage = {
      at: finite(g.atFt) ? ft(g.atFt) : 0,
      w: sizeFt(g.wFt, SURROUND_SIZES.garage.width),
      h: sizeFt(g.hFt, SURROUND_SIZES.garage.height),
    };
  } else if (face.garage !== undefined) skip("garage");
  let emblem: EmblemSpec | null = null;
  if (isObject(face.emblem) && finite(face.emblem.points) && face.emblem.points >= 3) {
    const e = face.emblem;
    emblem = {
      points: Math.round(e.points as number),
      skip: finite(e.skip) ? Math.round(e.skip) : SURROUND_SIZES.star.skip,
      size: sizeFt(e.sizeFt, SURROUND_SIZES.emblem.size),
      at: finite(e.atFt) ? ft(e.atFt) : 0,
      up: sizeFt(e.upFt, SURROUND_SIZES.emblem.up),
    };
  } else if (face.emblem !== undefined) skip("emblem");
  return { windows, door, garage, emblem };
}

// ------------------------------------------------------------------ what it does to the plan

/** The plan's own street strips, or none once the file has a road of its own. */
export function drawnStreets(world: SiteWalkWorld, around: SiteSurroundings | null | undefined): StreetShape[] {
  return around && around.roads.length > 0 ? [] : world.streets;
}

/** The fence's height in metres: the file's, or the plan's default. */
export function fenceHeightOf(around: SiteSurroundings | null | undefined): number {
  return around?.fence.height ?? SURROUND_SIZES.fenceHeight;
}

/** True when the file draws the plan's fences as black iron. */
export const ironFence = (around: SiteSurroundings | null | undefined): boolean => around?.fence.style === "iron";
