/**
 * The fire jam at Middle Earth, laid out once for both engines.
 *
 * The browser scene imports this module directly; Unreal reads the same layout
 * from the JSON that `unreal/FlowFest/Tools/export-jam.ts` writes. Nothing here
 * knows about rendering or terrain height: it places things on the ground plane
 * in the site frame (metres, x east, z south, the same frame as `site.json`),
 * and each engine sets them on its own sampled ground.
 *
 * Everything is deterministic. The same seed builds the same rope, the same
 * chairs and the same performers on every run, so a save, a review capture and
 * the other engine all agree.
 *
 * Sources: Austen's site interview
 * (`docs/superpowers/specs/flow-fest-sim/site-labels-interview.md`) for the
 * amoeba, entrance, queue and dip station; his round-2 answers (2026-10-21) for
 * Thursday's smaller rope, fire inside and LED spinners outside, the dip-funnel-
 * archway-flame entry, the DJ booth and the string lights; and the Unreal
 * structures table (`FlowFestStructures.h`) for the footprints the rope must be
 * laid around.
 */

export const FLOW_FEST_JAM_LAYOUT_VERSION = 2;

export interface JamPoint {
  x: number;
  z: number;
}

/** A thing the rope and the dressing keep clear of, as a conservative circle. */
export interface JamObstacle extends JamPoint {
  id: string;
  radius: number;
}

export type JamPropFamily =
  | "poi"
  | "staff"
  | "hoop"
  | "fans"
  | "dragon-staff"
  | "rope-dart"
  | "double-staff"
  | "clubs";

export type JamFinish = "fire" | "led" | "unlit";

export type JamDressingKind =
  | "chair"
  | "wagon"
  | "blanket"
  | "yoga-mat"
  | "couch"
  | "cooler"
  | "lantern";

export interface JamSafetyStation extends JamPoint {
  id: string;
  /** Yaw in radians about +y; 0 faces +x, turning toward +z. Faces into the circle. */
  yaw: number;
  towel: "back" | "ground";
  occupied: boolean;
  chairColour: number;
}

export interface JamDressingItem extends JamPoint {
  id: string;
  kind: JamDressingKind;
  yaw: number;
  /** Index into the engine's fabric palette. */
  colour: number;
  /** What lies on a blanket or sticks out of a wagon, if anything. */
  carries?: JamPropFamily;
}

export interface JamSpectatorSlot extends JamPoint {
  id: string;
  yaw: number;
  /** 0 to 1; low numbers fill first as the night builds. */
  order: number;
}

/** Inside the rope: Austen's answer is that the fire spins in the circle. */
export interface JamPerformer {
  id: string;
  prop: JamPropFamily;
  /** What the prop carries once the rope is lit. Before then everything is unlit. */
  finish: JamFinish;
  juggler: boolean;
  /** Plays to the audience at the nearest edge instead of facing freely. */
  facesAudience: boolean;
  start: JamPoint;
  /** 0 to 1; low numbers step inside first as the night builds. */
  order: number;
  /** Per-performer seeds for the wander path, in 0 to 1. */
  seeds: [number, number, number, number];
}

/**
 * Outside the rope: "the LED spinners all kind of hang out around the edge of the
 * circle in the open areas and under the structures and next to the vendors and next
 * to the DJ booth." Always LED once it is dark; jugglers carry LED vision clubs.
 */
export interface JamOutsideSpinner extends JamPoint {
  id: string;
  prop: JamPropFamily;
  juggler: boolean;
  anchor: "open" | "canopy" | "vendor" | "dj";
  /** Faces into the circle, the booth or a friend, depending on the anchor. */
  yaw: number;
  /** They drift around their spot, never further than this. */
  wanderRadius: number;
  /** 0 to 1; low numbers come out first as the night builds. */
  order: number;
  seeds: [number, number, number, number];
}

export interface JamEntrance extends JamPoint {
  /** Unit vector pointing from the gap into the circle. */
  inward: JamPoint;
  /** Arc-length interval of the open gap along the closed boundary. */
  gapStart: number;
  gapEnd: number;
  posts: [JamPoint, JamPoint];
  /** The archway you walk through after the dip, from the structures table. */
  archway: JamPoint & { yaw: number };
  /** The lighting flame just inside the field, where you light as you enter. */
  flame: JamPoint;
  /**
   * Two low rope lines funnelling the dipped spinner from the dip station through the
   * archway to the gap posts. Each runs dip side, archway side, post.
   */
  funnel: [JamPoint[], JamPoint[]];
}

/** At the stage edge, facing the circle; a steady beat until about 02:00. */
export interface JamDjBooth extends JamPoint {
  yaw: number;
  width: number;
  depth: number;
  beatsPerMinute: number;
  /** Festival clock hour the beat stops; 26 is 02:00. */
  untilHour: number;
}

/** A run of warm bulbs hung between anchors; each engine sags it between them. */
export interface JamStringLightRun {
  id: string;
  anchors: (JamPoint & { height: number })[];
  /** Metres of sag at the middle of each span. */
  sag: number;
  bulbSpacing: number;
}

/** One key of the opening shot. Height is above the ground under the camera. */
export interface JamShotKey {
  seconds: number;
  x: number;
  heightAboveGround: number;
  z: number;
  lookX: number;
  lookHeightAboveGround: number;
  lookZ: number;
  /** Each engine solves its own sun model for this elevation, so the shot survives a clock change. */
  sunElevationDegrees: number;
}

export interface JamNightCurveKey {
  /** Festival clock hour, 0 to 30 (25 is 01:00 the next morning). */
  hour: number;
  /** Fraction of the performers who are inside. */
  inside: number;
  /** Fraction of the spectator slots that are filled. */
  watching: number;
}

export interface FlowFestJamLayout {
  version: typeof FLOW_FEST_JAM_LAYOUT_VERSION;
  seed: number;
  centre: JamPoint;
  /** Closed boundary, counter-clockwise in the x/z plane as drawn on a map with north up. */
  boundary: JamPoint[];
  perimeterMeters: number;
  entrance: JamEntrance;
  /** The rope as open polylines: the closed boundary with the entrance gap cut out. */
  rope: JamPoint[][];
  queue: JamPoint[];
  obstacles: JamObstacle[];
  stations: JamSafetyStation[];
  dressing: JamDressingItem[];
  spectators: JamSpectatorSlot[];
  performers: JamPerformer[];
  outsideSpinners: JamOutsideSpinner[];
  djBooth: JamDjBooth;
  stringLights: JamStringLightRun[];
  /** Where the player stands when the opening hands over: in the funnel, before the archway. */
  handover: JamPoint & { yaw: number };
  openingShot: JamShotKey[];
  night: JamNightCurveKey[];
  light: {
    /** The rope starts to glow below this sun elevation and is full by `ropeFullBelowDegrees`. */
    ropeOnBelowDegrees: number;
    ropeFullBelowDegrees: number;
    /** Warm white with a slow drift (polish-questions Q4 default). Linear RGB, 0 to 1. */
    ropeColour: [number, number, number];
    ropeDriftColour: [number, number, number];
    ropeDriftSeconds: number;
    /** The frame budget allows this many fire finishes at once; the rest stay LED or wait to dip. */
    maxFireAtOnce: number;
  };
  /** Shared feel of the attention-led interaction; each engine implements it with these numbers. */
  interaction: {
    /** Walking slower than this near a jam counts as lingering. */
    lingerSpeedMetersPerSecond: number;
    /** Distance from the rope within which lingering and sitting apply. */
    lingerRadiusMeters: number;
    /** Seconds of lingering before the camera settles into a spectator framing. */
    lingerSettleSeconds: number;
    /** Seconds of steady flow inside the rope before watchers turn to you. */
    noticeSeconds: number;
    /** Seconds of steady flow before a performer comes over and mirrors you. */
    duetSeconds: number;
    /** How far watchers can be and still turn to face a player who is flowing. */
    noticeRadiusMeters: number;
  };
}

// ---------------------------------------------------------------------------
// Site facts

/**
 * Thursday's smaller rope (Austen's round-2 answer 1: about 35 by 25 m, against the
 * interview's full-size 51 by 32). It keeps the full rope's north-west end, so its gap
 * opens just past the archway, and gives up the south-east.
 */
export const JAM_CENTRE: JamPoint = { x: 88.5, z: -123 };
export const JAM_SEMI_AXES = { x: 17.5, z: 12.5 };
const SEMI_X = JAM_SEMI_AXES.x;
const SEMI_Z = JAM_SEMI_AXES.z;
const STAGE: JamPoint = { x: 126.8, z: -98.6 };
const DIP: JamPoint = { x: 70.9, z: -141.9 };
const ARCHWAY: JamPoint = { x: 77.9, z: -138 };
/** The way through the archway, pointing at the circle. */
const ARCH_IN: JamPoint = (() => {
  const dx = JAM_CENTRE.x - ARCHWAY.x;
  const dz = JAM_CENTRE.z - ARCHWAY.z;
  const l = Math.hypot(dx, dz);
  return { x: dx / l, z: dz / l };
})();
/** The way you walk from the dip to the archway. */
const DIP_TO_ARCH: JamPoint = (() => {
  const l = Math.hypot(ARCHWAY.x - DIP.x, ARCHWAY.z - DIP.z);
  return { x: (ARCHWAY.x - DIP.x) / l, z: (ARCHWAY.z - DIP.z) / l };
})();
/**
 * Where the funnel's two lines start, just past the dip: the north line keeps the dipped
 * spinners off the walk-in line beside them, the south line keeps clear of W1.
 */
const FUNNEL_MOUTH = {
  north: { x: 73.4, z: -140.45 },
  south: { x: 73.2, z: -139.2 },
};
/** The gap opens about four and a half metres past the archway. */
const ENTRANCE_TARGET: JamPoint = {
  x: ARCHWAY.x + ARCH_IN.x * 4.5,
  z: ARCHWAY.z + ARCH_IN.z * 4.5,
};

/** The Middle Earth clearing, with a metre kept back from the tree line. */
const CLEARING = { minX: 53, maxX: 129, minZ: -146, maxZ: -84 };

/**
 * The walking line: in at E1, west along the north edge to the dip station at B1,
 * then (Austen's round-2 answer 3) "funneled through to the entrance where there's
 * an archway through which you enter". The interview's second wait round A1, A2 and
 * B2 is left out of this slice; his newer description has none.
 */
const QUEUE: JamPoint[] = [{ x: 111.8, z: -141.9 }, DIP, ARCHWAY];

/** Solid things a loitering spinner cannot stand in. Open canopies are not here. */
const SOLIDS: JamObstacle[] = [
  { id: "ShowcaseStage", x: 126.8, z: -98.6, radius: 7.4 },
  { id: "FoodPavilion", x: 55.9, z: -96.4, radius: 8.3 },
  { id: "FoodBoothRust", x: 52.5, z: -85, radius: 3.6 },
  { id: "FoodBoothTeal", x: 58.5, z: -85, radius: 3.6 },
  { id: "ToiletRow", x: 66, z: -99, radius: 3 },
  { id: "ShowerTrailer", x: 70, z: -104.2, radius: 4.2 },
  { id: "VolunteerHQ", x: 125.5, z: -128.4, radius: 2.3 },
  { id: "FirstAid", x: 125.5, z: -117.6, radius: 2.3 },
  { id: "DipStation", x: 68.5, z: -144, radius: 3.6 },
  { id: "Archway", x: 77.9, z: -138, radius: 2 },
];

/**
 * Footprints from the Unreal structures table, as circles of their half
 * diagonal. Conservative on purpose: the rope is a hand-laid line and a metre
 * of slack around a canopy leg is how it really goes down.
 */
export const JAM_OBSTACLES: JamObstacle[] = [
  { id: "W1", x: 72, z: -134, radius: 5.2 },
  { id: "W2", x: 106, z: -131, radius: 5.2 },
  { id: "W3", x: 61, z: -110, radius: 5.2 },
  { id: "W4", x: 110, z: -89, radius: 5.2 },
  { id: "ShowcaseStage", x: 126.8, z: -98.6, radius: 7.4 },
  { id: "JugglingTent", x: 93.6, z: -88.9, radius: 9.5 },
  { id: "FoodPavilion", x: 55.9, z: -96.4, radius: 8.3 },
  { id: "VolunteerHQ", x: 125.5, z: -128.4, radius: 2.3 },
  { id: "FirstAid", x: 125.5, z: -117.6, radius: 2.3 },
  { id: "DipStation", x: 68.5, z: -144, radius: 3.6 },
  { id: "Archway", x: 77.9, z: -138, radius: 2 },
];

const ROPE_CLEARANCE = 1.5;
const QUEUE_HALF_WIDTH = 1.4;
const BOUNDARY_SAMPLES = 256;
const ENTRANCE_GAP = 4;
const STATION_SPACING = 5.5;

// ---------------------------------------------------------------------------
// Deterministic noise

/** Integer hash to [0, 1). Same family as the Unreal `Hash01` helpers: cheap and stable. */
export function jamHash01(seed: number, index: number, salt = 0): number {
  let h = (seed * 374761393 + index * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// ---------------------------------------------------------------------------
// Geometry helpers

const dist = (a: JamPoint, b: JamPoint) => Math.hypot(a.x - b.x, a.z - b.z);

function distanceToSegment(p: JamPoint, a: JamPoint, b: JamPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

export function distanceToPolyline(p: JamPoint, line: JamPoint[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++)
    best = Math.min(best, distanceToSegment(p, line[i]!, line[i + 1]!));
  return best;
}

/** Even-odd point in polygon. */
export function insidePolygon(p: JamPoint, polygon: JamPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function segmentsCross(
  a: JamPoint,
  b: JamPoint,
  c: JamPoint,
  d: JamPoint
): boolean {
  const o = (p: JamPoint, q: JamPoint, r: JamPoint) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** True when no two non-adjacent edges of the closed polygon cross. */
export function polygonIsSimple(polygon: JamPoint[]): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, polygon[j]!, polygon[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

function cumulativeLengths(closed: JamPoint[]): number[] {
  const out = [0];
  for (let i = 1; i <= closed.length; i++)
    out.push(out[i - 1]! + dist(closed[i - 1]!, closed[i % closed.length]!));
  return out;
}

/** Point and unit tangent at arc length s along the closed boundary. */
export function pointAtArc(
  closed: JamPoint[],
  lengths: number[],
  s: number
): { p: JamPoint; tangent: JamPoint } {
  const total = lengths[lengths.length - 1]!;
  const t = ((s % total) + total) % total;
  let i = 0;
  while (i + 1 < lengths.length - 1 && lengths[i + 1]! < t) i++;
  const a = closed[i]!;
  const b = closed[(i + 1) % closed.length]!;
  const seg = lengths[i + 1]! - lengths[i]! || 1;
  const u = (t - lengths[i]!) / seg;
  const len = dist(a, b) || 1;
  return {
    p: { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u },
    tangent: { x: (b.x - a.x) / len, z: (b.z - a.z) / len },
  };
}

function signedArea(polygon: JamPoint[]): number {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++)
    area += (polygon[j]!.x - polygon[i]!.x) * (polygon[j]!.z + polygon[i]!.z);
  return area / 2;
}

// ---------------------------------------------------------------------------
// The rope

/** True when a point keeps the rope's clearance from every footprint and the queue. */
function ropeClear(p: JamPoint): boolean {
  for (const o of JAM_OBSTACLES)
    if (dist(p, o) < o.radius + ROPE_CLEARANCE) return false;
  if (distanceToPolyline(p, QUEUE) < QUEUE_HALF_WIDTH + ROPE_CLEARANCE)
    return false;
  return (
    p.x > CLEARING.minX + 6 &&
    p.x < CLEARING.maxX - 6 &&
    p.z > CLEARING.minZ + 6 &&
    p.z < CLEARING.maxZ - 6
  );
}

function smoothCircular(values: number[], radius: number): number[] {
  const n = values.length;
  return values.map((_, i) => {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += values[(i + k + n) % n]!;
    return sum / (2 * radius + 1);
  });
}

/**
 * The amoeba: Thursday's 35 by 25 m ellipse, bent by two octaves of slow
 * hashed noise (about 3 m), bulged toward the stage so the stage side has the
 * best view, then pulled in wherever it would run over a canopy, the dip
 * station or the queue. A rope laid around a canopy leg dents; it does not cut.
 */
export function buildJamBoundary(seed: number): JamPoint[] {
  const n = BOUNDARY_SAMPLES;
  const phases = [0, 1, 2, 3].map((k) => jamHash01(seed, k, 11) * Math.PI * 2);
  const amps = [0, 1, 2, 3].map((k) => 0.6 + 0.4 * jamHash01(seed, k, 12));
  const stageAngle = Math.atan2(STAGE.z - JAM_CENTRE.z, STAGE.x - JAM_CENTRE.x);

  const wanted: number[] = [];
  const limit: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ellipse =
      (SEMI_X * SEMI_Z) /
      Math.hypot(SEMI_Z * Math.cos(a), SEMI_X * Math.sin(a));
    const noise =
      (amps[0]! * Math.sin(2 * a + phases[0]!) +
        amps[1]! * Math.sin(3 * a + phases[1]!) +
        0.5 * amps[2]! * Math.sin(5 * a + phases[2]!) +
        0.5 * amps[3]! * Math.sin(7 * a + phases[3]!)) /
      1.5;
    const toStage = Math.cos(a - stageAngle);
    const bulge = toStage > 0 ? 1.6 * toStage * toStage : 0;
    wanted.push(ellipse + 2 * noise + bulge);

    // Walk out from the middle by 10 cm until the ray first meets something; the rope
    // stays short of it. Walking in from outside would let the rope pass behind a canopy.
    let r = 6;
    const reach = ellipse + 6;
    while (
      r < reach &&
      ropeClear({
        x: JAM_CENTRE.x + (r + 0.1) * Math.cos(a),
        z: JAM_CENTRE.z + (r + 0.1) * Math.sin(a),
      })
    )
      r += 0.1;
    limit.push(r);
  }

  let radii = smoothCircular(
    wanted.map((w, i) => Math.min(w, limit[i]!)),
    4
  );
  for (let pass = 0; pass < 3; pass++)
    radii = smoothCircular(
      radii.map((r, i) => Math.min(r, limit[i]!)),
      2
    );
  radii = radii.map((r, i) => Math.min(r, limit[i]!));

  const out = radii.map((r, i) => {
    const a = (i / n) * Math.PI * 2;
    return {
      x: JAM_CENTRE.x + r * Math.cos(a),
      z: JAM_CENTRE.z + r * Math.sin(a),
    };
  });
  // Counter-clockwise on a north-up map means clockwise in raw x/z (z points south).
  return signedArea(out) < 0 ? out : out.reverse();
}

/**
 * The boundary normal that points into the circle. The boundary's winding fixes which
 * side that is everywhere, so a probe in a tight dent cannot flip it.
 */
function inwardAt(
  _p: JamPoint,
  tangent: JamPoint,
  boundary: JamPoint[]
): JamPoint {
  const left = { x: -tangent.z, z: tangent.x };
  return signedArea(boundary) < 0 ? { x: -left.x, z: -left.z } : left;
}

const yawFacing = (v: JamPoint) => Math.atan2(v.z, v.x);

// ---------------------------------------------------------------------------
// Layout

/** Where dressing may not go: footprints, the queue, the entrance approach, outside the clearing. */
export function dressingBlocked(
  p: JamPoint,
  layout: Pick<FlowFestJamLayout, "boundary" | "entrance">,
  footprintRadius: number
): boolean {
  if (
    p.x < CLEARING.minX + footprintRadius ||
    p.x > CLEARING.maxX - footprintRadius
  )
    return true;
  if (
    p.z < CLEARING.minZ + footprintRadius ||
    p.z > CLEARING.maxZ - footprintRadius
  )
    return true;
  // The strip between the walk-in line and the trees is not part of the jam's edge.
  if (p.z < QUEUE[0]!.z + QUEUE_HALF_WIDTH + footprintRadius) return true;
  for (const o of JAM_OBSTACLES)
    if (dist(p, o) < o.radius + 1 + footprintRadius) return true;
  if (
    distanceToPolyline(p, [...QUEUE, layout.entrance]) <
    QUEUE_HALF_WIDTH + 0.4 + footprintRadius
  )
    return true;
  if (dist(p, layout.entrance) < 4.5 + footprintRadius) return true;
  if (
    layout.entrance.funnel.some(
      (line) => distanceToPolyline(p, line) < 0.6 + footprintRadius
    )
  )
    return true;
  // Stage front: a 12 m apron toward the circle stays open for its crowd.
  if (dist(p, { x: STAGE.x - 9, z: STAGE.z - 4 }) < 6 + footprintRadius)
    return true;
  if (insidePolygon(p, layout.boundary)) return true;
  if (
    distanceToPolyline(p, [...layout.boundary, layout.boundary[0]!]) <
    1.2 + footprintRadius
  )
    return true;
  return false;
}

const DRESSING_RADIUS: Record<JamDressingKind, number> = {
  chair: 0.35,
  wagon: 0.6,
  blanket: 1.1,
  "yoga-mat": 0.9,
  couch: 1.0,
  cooler: 0.35,
  lantern: 0.12,
};

const PROPS: JamPropFamily[] = [
  "poi",
  "staff",
  "hoop",
  "fans",
  "dragon-staff",
  "rope-dart",
  "double-staff",
];
/** Dragon staffs and rope darts are fire props; the LED crowd outside carries the rest. */
const LED_PROPS: JamPropFamily[] = [
  "poi",
  "staff",
  "hoop",
  "fans",
  "double-staff",
];

/** Sixteen fire spinners inside, eighteen LED outside, sixty-eight watching: about a third perform. */
const INSIDE_COUNT = 16;
const SPECTATOR_COUNT = 68;

type SpinnerAnchorPlan = {
  anchor: JamOutsideSpinner["anchor"];
  around: JamPoint;
  minRadius: number;
  maxRadius: number;
  /** Direction the spots favour, in radians, and how far either side they may stray. */
  facing?: number;
  spread?: number;
  count: number;
  jugglers: number;
  wanderRadius: number;
};

/**
 * Where the LED spinners loiter outside the rope: under each workshop canopy, a juggling
 * knot under the juggling tent, by the food pavilion, around the DJ booth, and on open
 * grass a few metres back from the rope.
 */
function buildOutsideSpinners(
  seed: number,
  boundary: JamPoint[],
  entrance: JamEntrance,
  booth: JamDjBooth,
  taken: (JamPoint & { radius: number })[]
): JamOutsideSpinner[] {
  const ring = [...boundary, boundary[0]!];
  const toCentre = (p: JamPoint) =>
    Math.atan2(JAM_CENTRE.z - p.z, JAM_CENTRE.x - p.x);
  const canopy = (id: string) => JAM_OBSTACLES.find((o) => o.id === id)!;
  const pavilion = SOLIDS.find((o) => o.id === "FoodPavilion")!;
  const plans: SpinnerAnchorPlan[] = [
    ...["W1", "W2", "W3", "W4"].map((id) => ({
      anchor: "canopy" as const,
      around: canopy(id),
      minRadius: 0,
      maxRadius: 2.4,
      count: 1,
      jugglers: 0,
      wanderRadius: 1.5,
    })),
    {
      anchor: "canopy",
      around: canopy("JugglingTent"),
      minRadius: 1,
      maxRadius: 4.5,
      count: 2,
      jugglers: 2,
      wanderRadius: 1.2,
    },
    {
      anchor: "vendor",
      around: pavilion,
      minRadius: 9.4,
      maxRadius: 12,
      facing: toCentre(pavilion),
      spread: 1,
      count: 3,
      jugglers: 1,
      wanderRadius: 1.5,
    },
    {
      anchor: "dj",
      around: booth,
      minRadius: 2.4,
      maxRadius: 6,
      facing: booth.yaw,
      spread: 1.1,
      count: 4,
      jugglers: 0,
      wanderRadius: 1.2,
    },
  ];

  const spinners: JamOutsideSpinner[] = [];
  const blocked = (p: JamPoint) => {
    if (
      p.x < CLEARING.minX + 0.5 ||
      p.x > CLEARING.maxX - 0.5 ||
      p.z < CLEARING.minZ + 0.5 ||
      p.z > CLEARING.maxZ - 0.5
    )
      return true;
    if (insidePolygon(p, boundary) || distanceToPolyline(p, ring) < 3)
      return true;
    for (const o of SOLIDS) if (dist(p, o) < o.radius + 0.6) return true;
    if (distanceToPolyline(p, [...QUEUE, entrance]) < QUEUE_HALF_WIDTH + 0.6)
      return true;
    if (entrance.funnel.some((line) => distanceToPolyline(p, line) < 0.8))
      return true;
    if (dist(p, entrance) < 4.5 || dist(p, booth) < 1.6) return true;
    if (taken.some((q) => dist(p, q) < q.radius + 0.5)) return true;
    return spinners.some((q) => dist(p, q) < 2.8);
  };
  const add = (
    p: JamPoint,
    plan: Pick<SpinnerAnchorPlan, "anchor" | "wanderRadius">,
    juggler: boolean,
    yaw: number
  ) => {
    const k = spinners.length;
    spinners.push({
      id: `outside-${k}`,
      ...p,
      prop: juggler
        ? "clubs"
        : LED_PROPS[Math.floor(jamHash01(seed, k, 81) * LED_PROPS.length)]!,
      juggler,
      anchor: plan.anchor,
      yaw,
      wanderRadius: plan.wanderRadius,
      order: jamHash01(seed, k, 82),
      seeds: [
        jamHash01(seed, k, 83),
        jamHash01(seed, k, 84),
        jamHash01(seed, k, 85),
        jamHash01(seed, k, 86),
      ],
    });
  };

  plans.forEach((plan, planIndex) => {
    for (let m = 0; m < plan.count; m++) {
      for (let tries = 0; tries < 60; tries++) {
        const h = planIndex * 1000 + m * 61 + tries;
        const a =
          plan.facing === undefined
            ? jamHash01(seed, h, 71) * Math.PI * 2
            : plan.facing +
              (jamHash01(seed, h, 71) - 0.5) * 2 * (plan.spread ?? 1);
        const r =
          plan.minRadius +
          (plan.maxRadius - plan.minRadius) * Math.sqrt(jamHash01(seed, h, 72));
        const p = {
          x: plan.around.x + Math.cos(a) * r,
          z: plan.around.z + Math.sin(a) * r,
        };
        if (blocked(p)) continue;
        const yaw =
          plan.anchor === "dj"
            ? Math.atan2(booth.z - p.z, booth.x - p.x)
            : plan.anchor === "vendor"
              ? jamHash01(seed, h, 73) * Math.PI * 2
              : toCentre(p) + (jamHash01(seed, h, 74) - 0.5) * 0.8;
        add(p, plan, m < plan.jugglers, yaw);
        break;
      }
    }
  });

  // Open grass around the edge, three to nine metres back from the rope.
  const lengths = cumulativeLengths(boundary);
  const perimeter = lengths[lengths.length - 1]!;
  for (let m = 0, placedOpen = 0; m < 400 && placedOpen < 5; m++) {
    const { p, tangent } = pointAtArc(
      boundary,
      lengths,
      jamHash01(seed, m, 75) * perimeter
    );
    const inn = inwardAt(p, tangent, boundary);
    const out = 3.5 + 5.5 * jamHash01(seed, m, 76);
    const spot = { x: p.x - inn.x * out, z: p.z - inn.z * out };
    // Nobody loiters on the tree side of the walk-in line.
    if (spot.z < -139.5 || blocked(spot)) continue;
    add(
      spot,
      { anchor: "open", wanderRadius: 2.5 },
      placedOpen < 2,
      toCentre(spot) + (jamHash01(seed, m, 77) - 0.5) * 0.8
    );
    placedOpen++;
  }
  return spinners;
}

export function buildFlowFestJamLayout(seed = 7): FlowFestJamLayout {
  const boundary = buildJamBoundary(seed);
  const closed = boundary;
  const lengths = cumulativeLengths(closed);
  const perimeter = lengths[lengths.length - 1]!;

  // Entrance: the boundary point nearest the interview's C2.
  let entranceArc = 0;
  let best = Infinity;
  for (let i = 0; i < closed.length; i++) {
    const d = dist(closed[i]!, ENTRANCE_TARGET);
    if (d < best) {
      best = d;
      entranceArc = lengths[i]!;
    }
  }
  const at = pointAtArc(closed, lengths, entranceArc);
  const inward = inwardAt(at.p, at.tangent, boundary);
  const gapStart = entranceArc - ENTRANCE_GAP / 2;
  const gapEnd = entranceArc + ENTRANCE_GAP / 2;
  const posts: [JamPoint, JamPoint] = [
    pointAtArc(closed, lengths, gapStart).p,
    pointAtArc(closed, lengths, gapEnd).p,
  ];
  // The funnel: two low lines from just past the dip, opening to the archway's 3.8 m span,
  // then on to the gap posts. Each side keeps to its own post. `across` points south-west.
  const across = { x: -ARCH_IN.z, z: ARCH_IN.x };
  const funnelSide = (sign: number): JamPoint[] => {
    const arch = {
      x: ARCHWAY.x + across.x * 1.9 * sign,
      z: ARCHWAY.z + across.z * 1.9 * sign,
    };
    const side = (p: JamPoint) =>
      ((p.x - at.p.x) * across.x + (p.z - at.p.z) * across.z) * sign;
    const post = side(posts[0]) > side(posts[1]) ? posts[0] : posts[1];
    return [sign > 0 ? FUNNEL_MOUTH.south : FUNNEL_MOUTH.north, arch, post];
  };
  const entrance: JamEntrance = {
    ...at.p,
    inward,
    gapStart,
    gapEnd,
    posts,
    archway: { ...ARCHWAY, yaw: yawFacing(ARCH_IN) },
    flame: { x: at.p.x + inward.x * 1.8, z: at.p.z + inward.z * 1.8 },
    funnel: [funnelSide(1), funnelSide(-1)],
  };

  // Rope: one open polyline from the far post round to the near post.
  const rope: JamPoint[] = [];
  for (let s = gapEnd; s <= gapStart + perimeter + 1e-6; s += 0.5)
    rope.push(pointAtArc(closed, lengths, s).p);

  // Safety stations every 5.5 m along the rope, a little outside it, facing in: a chair
  // and a towel. The only flame is the lighting flame at the entrance.
  const stations: JamSafetyStation[] = [];
  const usable = perimeter - ENTRANCE_GAP - 4;
  const stationCount = Math.floor(usable / STATION_SPACING);
  const step = usable / stationCount;
  for (let k = 0; k < stationCount; k++) {
    const s = gapEnd + 2 + step * (k + 0.5);
    const { p, tangent } = pointAtArc(closed, lengths, s);
    const inn = inwardAt(p, tangent, boundary);
    stations.push({
      id: `station-${k}`,
      x: p.x - inn.x * 0.7,
      z: p.z - inn.z * 0.7,
      yaw: yawFacing(inn) + (jamHash01(seed, k, 21) - 0.5) * 0.35,
      towel: jamHash01(seed, k, 22) < 0.6 ? "back" : "ground",
      occupied: jamHash01(seed, k, 24) < 0.5,
      chairColour: Math.floor(jamHash01(seed, k, 25) * 6),
    });
  }

  const layoutSoFar = { boundary, entrance };
  const placed: { p: JamPoint; r: number }[] = stations.map((s) => ({
    p: s,
    r: 0.5,
  }));
  const fits = (p: JamPoint, r: number) =>
    !dressingBlocked(p, layoutSoFar, r) &&
    placed.every((q) => dist(p, q.p) >= q.r + r + 0.3);

  // Edge dressing: walk the rope, and at each step try a spot in the 1.5 to 8 m band.
  // The stage side and the entrance side are busier, as the interview says.
  const stageAngle = Math.atan2(STAGE.z - JAM_CENTRE.z, STAGE.x - JAM_CENTRE.x);
  const entranceAngle = Math.atan2(
    entrance.z - JAM_CENTRE.z,
    entrance.x - JAM_CENTRE.x
  );
  const dressing: JamDressingItem[] = [];
  const quota: Record<JamDressingKind, number> = {
    chair: 60,
    wagon: 14,
    blanket: 28,
    "yoga-mat": 12,
    couch: 8,
    cooler: 10,
    lantern: 16,
  };
  const counts: Record<JamDressingKind, number> = {
    chair: 0,
    wagon: 0,
    blanket: 0,
    "yoga-mat": 0,
    couch: 0,
    cooler: 0,
    lantern: 0,
  };
  const kindsByWeight: [JamDressingKind, number][] = [
    ["chair", 0.32],
    ["blanket", 0.2],
    ["wagon", 0.1],
    ["yoga-mat", 0.1],
    ["couch", 0.07],
    ["cooler", 0.09],
    ["lantern", 0.12],
  ];
  let attempt = 0;
  for (let round = 0; round < 6; round++) {
    for (let s = 0; s < perimeter; s += 1.6) {
      attempt++;
      const { p, tangent } = pointAtArc(closed, lengths, s + round * 0.37);
      const inn = inwardAt(p, tangent, boundary);
      const ang = Math.atan2(p.z - JAM_CENTRE.z, p.x - JAM_CENTRE.x);
      const busy =
        0.45 +
        0.35 * Math.max(0, Math.cos(ang - stageAngle)) +
        0.3 * Math.max(0, Math.cos(ang - entranceAngle));
      if (jamHash01(seed, attempt, 31) > busy) continue;
      const out = 1.6 + 6.4 * Math.pow(jamHash01(seed, attempt, 32), 1.4);
      const along = (jamHash01(seed, attempt, 33) - 0.5) * 1.4;
      const spot = {
        x: p.x - inn.x * out + tangent.x * along,
        z: p.z - inn.z * out + tangent.z * along,
      };
      let pick = jamHash01(seed, attempt, 34);
      let kind: JamDressingKind = "chair";
      for (const [k, w] of kindsByWeight) {
        if (pick < w) {
          kind = k;
          break;
        }
        pick -= w;
      }
      if (counts[kind] >= quota[kind]) continue;
      const faceIn = yawFacing(inn);
      if (kind === "chair") {
        // A cluster of two to five, some facing the circle, some turned to each other.
        const size = 2 + Math.floor(jamHash01(seed, attempt, 35) * 4);
        const members: JamPoint[] = [];
        for (let m = 0; m < size; m++) {
          const offset = (m - (size - 1) / 2) * 0.85;
          members.push({
            x: spot.x + tangent.x * offset,
            z: spot.z + tangent.z * offset,
          });
        }
        if (!members.every((q) => fits(q, DRESSING_RADIUS.chair))) continue;
        const colour = Math.floor(jamHash01(seed, attempt, 36) * 6);
        members.forEach((q, m) => {
          if (counts.chair >= quota.chair) return;
          const turned = jamHash01(seed, attempt * 7 + m, 37) < 0.3;
          const toCentre = Math.atan2(spot.z - q.z, spot.x - q.x);
          dressing.push({
            id: `chair-${counts.chair}`,
            kind: "chair",
            ...q,
            yaw:
              (turned && size > 2 ? toCentre : faceIn) +
              (jamHash01(seed, attempt * 7 + m, 38) - 0.5) * 0.6,
            colour:
              (colour + (jamHash01(seed, attempt * 7 + m, 39) < 0.35 ? 1 : 0)) %
              6,
          });
          placed.push({ p: q, r: DRESSING_RADIUS.chair });
          counts.chair++;
        });
        continue;
      }
      const r = DRESSING_RADIUS[kind];
      if (!fits(spot, r)) continue;
      const lying =
        kind === "blanket" || kind === "yoga-mat" || kind === "couch";
      dressing.push({
        id: `${kind}-${counts[kind]}`,
        kind,
        ...spot,
        yaw:
          (lying ? yawFacing(tangent) : faceIn) +
          (jamHash01(seed, attempt, 40) - 0.5) * (lying ? 0.9 : 0.5),
        colour: Math.floor(jamHash01(seed, attempt, 41) * 6),
        carries:
          kind === "wagon" ||
          (kind === "blanket" && jamHash01(seed, attempt, 42) < 0.5)
            ? PROPS[Math.floor(jamHash01(seed, attempt, 43) * PROPS.length)]
            : undefined,
      });
      placed.push({ p: spot, r });
      counts[kind]++;
    }
  }

  // Standing spectators: a ring 1.5 to 6 m out, facing in, filling front-first. With the
  // spinners inside and out they make Austen's "a third performing, the rest watching".
  const spectators: JamSpectatorSlot[] = [];
  const takenBySpectators: JamPoint[] = [];
  for (
    let k = 0, s = 0;
    s < perimeter * 2 && spectators.length < SPECTATOR_COUNT;
    k++, s += 0.62
  ) {
    const { p, tangent } = pointAtArc(closed, lengths, s);
    const inn = inwardAt(p, tangent, boundary);
    const out = 1.5 + 4.5 * jamHash01(seed, k, 51);
    const spot = { x: p.x - inn.x * out, z: p.z - inn.z * out };
    if (dressingBlocked(spot, layoutSoFar, 0.3)) continue;
    if (placed.some((q) => dist(spot, q.p) < q.r + 0.45)) continue;
    if (takenBySpectators.some((q) => dist(spot, q) < 0.75)) continue;
    takenBySpectators.push(spot);
    spectators.push({
      id: `spectator-${spectators.length}`,
      ...spot,
      yaw: yawFacing(inn) + (jamHash01(seed, k, 52) - 0.5) * 0.5,
      order: (out - 1.5) / 9 + 0.5 * jamHash01(seed, k, 53),
    });
  }

  // Performers inside: all fire once it is dark (round-2 answer 2), about one in five a
  // juggler with fire clubs ("sometimes they can juggle in the circle on fire, if it's
  // nighttime"). Sixteen keep three metres between spinners on Thursday's rope.
  const performers: JamPerformer[] = [];
  for (let k = 0; k < INSIDE_COUNT; k++) {
    let start: JamPoint = JAM_CENTRE;
    for (let tries = 0; tries < 40; tries++) {
      const a = jamHash01(seed, k * 41 + tries, 61) * Math.PI * 2;
      const r = Math.sqrt(jamHash01(seed, k * 41 + tries, 62)) * 0.8;
      const c = {
        x: JAM_CENTRE.x + Math.cos(a) * r * SEMI_X,
        z: JAM_CENTRE.z + Math.sin(a) * r * SEMI_Z,
      };
      if (
        !insidePolygon(c, boundary) ||
        distanceToPolyline(c, [...boundary, boundary[0]!]) < 2.5
      )
        continue;
      if (performers.some((q) => dist(q.start, c) < 3)) continue;
      start = c;
      break;
    }
    const juggler = k % 5 === 2;
    performers.push({
      id: `performer-${k}`,
      prop: juggler
        ? "clubs"
        : PROPS[Math.floor(jamHash01(seed, k, 64) * PROPS.length)]!,
      finish: "fire",
      juggler,
      facesAudience: jamHash01(seed, k, 65) < 0.34,
      start,
      order: jamHash01(seed, k, 66),
      seeds: [
        jamHash01(seed, k, 67),
        jamHash01(seed, k, 68),
        jamHash01(seed, k, 69),
        jamHash01(seed, k, 70),
      ],
    });
  }

  // The DJ booth at the stage edge, off the stage's centre line so it does not block the
  // stage, turned to the circle (round-2 answer 5).
  const fromStage = { x: JAM_CENTRE.x - STAGE.x, z: JAM_CENTRE.z - STAGE.z };
  const fromStageLength = Math.hypot(fromStage.x, fromStage.z);
  const stageOut = {
    x: fromStage.x / fromStageLength,
    z: fromStage.z / fromStageLength,
  };
  const stageAcross = { x: -stageOut.z, z: stageOut.x };
  const boothAt = {
    x: STAGE.x + stageOut.x * 6.6 + stageAcross.x * 3.4,
    z: STAGE.z + stageOut.z * 6.6 + stageAcross.z * 3.4,
  };
  const djBooth: JamDjBooth = {
    ...boothAt,
    yaw: Math.atan2(JAM_CENTRE.z - boothAt.z, JAM_CENTRE.x - boothAt.x),
    width: 2.4,
    depth: 1.1,
    beatsPerMinute: 118,
    untilHour: 26,
  };

  // String lights (round-2 answer 4): a few warm runs on the stage, swagged across its
  // front edge and down to the booth. The Vendor Village path is outside Middle Earth and
  // waits for the slice that walks it.
  const stageEdge = (along: number, height: number) => ({
    x: STAGE.x + stageOut.x * 5.1 + stageAcross.x * along,
    z: STAGE.z + stageOut.z * 5.1 + stageAcross.z * along,
    height,
  });
  const stringLights: JamStringLightRun[] = [
    {
      id: "stage-front",
      anchors: [stageEdge(-5.2, 3.4), stageEdge(0, 3.7), stageEdge(5.2, 3.4)],
      sag: 0.45,
      bulbSpacing: 0.5,
    },
    {
      id: "stage-to-booth",
      anchors: [stageEdge(5.2, 3.4), { ...boothAt, height: 2.3 }],
      sag: 0.35,
      bulbSpacing: 0.5,
    },
  ];

  const outsideSpinners = buildOutsideSpinners(
    seed,
    boundary,
    entrance,
    djBooth,
    [
      ...placed.map((q) => ({ ...q.p, radius: q.r })),
      ...spectators.map((s) => ({ ...s, radius: 0.35 })),
    ]
  );

  // The opening: high on the north-west rise over the dip station at golden hour, a slow
  // descent along the walk as the sun goes, ending behind the archway at eye height as
  // the rope comes on, the lighting flame framed in the arch.
  const behindArch = {
    x: ARCHWAY.x - DIP_TO_ARCH.x * 3,
    z: ARCHWAY.z - DIP_TO_ARCH.z * 3,
  };
  const openingShot: JamShotKey[] = [
    {
      seconds: 0,
      x: 40,
      heightAboveGround: 34,
      z: -168,
      lookX: 90,
      lookHeightAboveGround: 0,
      lookZ: -120,
      sunElevationDegrees: 9,
    },
    {
      seconds: 14,
      x: 58,
      heightAboveGround: 16,
      z: -156,
      lookX: 88,
      lookHeightAboveGround: 1,
      lookZ: -123,
      sunElevationDegrees: 3,
    },
    {
      seconds: 26,
      x: 66,
      heightAboveGround: 5.5,
      z: -149,
      lookX: 86,
      lookHeightAboveGround: 1.2,
      lookZ: -126,
      sunElevationDegrees: -2.5,
    },
    {
      seconds: 36,
      x: behindArch.x,
      heightAboveGround: 1.7,
      z: behindArch.z,
      lookX: JAM_CENTRE.x,
      lookHeightAboveGround: 1.4,
      lookZ: JAM_CENTRE.z,
      sunElevationDegrees: -7,
    },
  ];
  const handover = {
    x: ARCHWAY.x - DIP_TO_ARCH.x * 2.2,
    z: ARCHWAY.z - DIP_TO_ARCH.z * 2.2,
    yaw: yawFacing(DIP_TO_ARCH),
  };

  const night: JamNightCurveKey[] = [
    { hour: 20.0, inside: 0, watching: 0.05 },
    { hour: 20.5, inside: 0.12, watching: 0.2 },
    { hour: 21.5, inside: 0.5, watching: 0.6 },
    { hour: 22.5, inside: 1, watching: 1 },
    { hour: 25.0, inside: 0.75, watching: 0.7 },
    { hour: 26.5, inside: 0.25, watching: 0.25 },
    { hour: 27.0, inside: 0, watching: 0.05 },
  ];

  return {
    version: FLOW_FEST_JAM_LAYOUT_VERSION,
    seed,
    centre: JAM_CENTRE,
    boundary,
    perimeterMeters: perimeter,
    entrance,
    rope: [rope],
    queue: [
      ...QUEUE,
      {
        x: entrance.x - entrance.inward.x * 1.5,
        z: entrance.z - entrance.inward.z * 1.5,
      },
    ],
    obstacles: JAM_OBSTACLES,
    stations,
    dressing,
    spectators,
    performers,
    outsideSpinners,
    djBooth,
    stringLights,
    handover,
    openingShot,
    night,
    light: {
      ropeOnBelowDegrees: 1,
      ropeFullBelowDegrees: -5,
      ropeColour: [1.0, 0.78, 0.52],
      ropeDriftColour: [1.0, 0.52, 0.34],
      ropeDriftSeconds: 90,
      maxFireAtOnce: 18,
    },
    interaction: {
      lingerSpeedMetersPerSecond: 0.6,
      lingerRadiusMeters: 9,
      lingerSettleSeconds: 2.5,
      noticeSeconds: 6,
      duetSeconds: 18,
      noticeRadiusMeters: 14,
    },
  };
}

/** Linear interpolation over the night curve; hours before the first key read as the first key. */
export function jamNightAt(
  night: JamNightCurveKey[],
  hour: number
): { inside: number; watching: number } {
  const first = night[0]!;
  if (hour <= first.hour)
    return { inside: first.inside, watching: first.watching };
  for (let i = 0; i + 1 < night.length; i++) {
    const a = night[i]!;
    const b = night[i + 1]!;
    if (hour <= b.hour) {
      const t = (hour - a.hour) / (b.hour - a.hour);
      return {
        inside: a.inside + (b.inside - a.inside) * t,
        watching: a.watching + (b.watching - a.watching) * t,
      };
    }
  }
  const last = night[night.length - 1]!;
  return { inside: last.inside, watching: last.watching };
}

/** 0 by day, 1 at full night, from the sun's elevation. */
export function jamRopeGlow(
  light: FlowFestJamLayout["light"],
  sunElevationDegrees: number
): number {
  const t =
    (light.ropeOnBelowDegrees - sunElevationDegrees) /
    (light.ropeOnBelowDegrees - light.ropeFullBelowDegrees);
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function jamObstacleClearance(p: JamPoint): number {
  let best = Infinity;
  for (const o of JAM_OBSTACLES) best = Math.min(best, dist(p, o) - o.radius);
  return best;
}

export const JAM_QUEUE_POINTS = QUEUE;
export const JAM_CLEARING = CLEARING;
