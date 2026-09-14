/**
 * The Sundial — Vulcan Cave sun bay.
 *
 * Same contract as the water, fire, earth and air bays: pure geometry that,
 * given the compiled cave grid, derives world-space elevation zones, blocked
 * regions and EVERY shape the graybox renders. The physics provider consumes
 * elevationAt/blockedAt; the graybox reads the same lists and the same polar
 * helpers. One geometry source — a shape the graybox draws that this module
 * does not know about is a bug by construction.
 *
 * ── What makes this room different from the other four ──────────────────────
 *
 * The other bays are rectangles. This one is polar, and the polar frame is not
 * decoration: the visitor's BEARING from the chamber centre is the sun's
 * azimuth and their DISTANCE from it is the sun's elevation, so walking inward
 * walks the day to noon. The sun sits on the visitor's own bearing — at their
 * back — which makes every shadow in the room, the four performers' and their
 * own, run parallel with theirs. The spiral crossing is the only way in, and it
 * sweeps exactly 90° while it winds from r=9 to r=4, so the walk to zenith
 * performs Quarter-Same's own phase offset with the visitor's body.
 *
 * ── Why the chamber centre is not the room centre ───────────────────────────
 *
 * The northern SUN_CRACK_RUN_M of the interior is the rising light crack, so
 * the ⌀24 m chamber occupies the southern 24 m and its centre sits 5 m south of
 * the bay's own centre. Every polar quantity in this file is measured about
 * THAT centre. The floor plan places its four performers from the same two
 * exported helpers below, so the pillars and the sun mapping can never end up
 * on different axes.
 *
 * There is not one absolute world coordinate in this file: every offset is
 * metres measured from a compiled room bound or a real door tile span.
 */
import type {
  MuseumGrid,
  MuseumTerrainProgram,
} from "../domain/museum-grid-types";
import {
  TILE_METRES,
  WALL_THICKNESS,
  WATERLINE_Y,
  bandRects,
  doorSpan,
  inRectClosed,
  spansExcluding,
  tileCentredOffset,
  unionRect,
  type CeilingRect,
  type FloorRect,
  type Point2,
  type WallRect,
  type WorldRect,
} from "./drowned-gallery-terrain";

const TILE = TILE_METRES;
const HALF = TILE / 2;


export const SUN_ROOM_ID = "cave-sun";
export const AIR_ROOM_ID_FOR_SUN = "cave-air";

// ── Chamber metrics (metres) ────────────────────────────────────────────────
//
// These four are the room's whole plan, and the floor plan imports them so the
// performer ring and the sun mapping are derived from one set of numbers.

/** Depth of the north light crack, measured from the interior's north edge. */
export const SUN_CRACK_RUN_M = 10;
/** The round chamber is ⌀24. */
export const SUN_CHAMBER_RADIUS_M = 12;
/** The four Quarter-Same pillars stand on this circle. */
export const SUN_PILLAR_RADIUS_M = 6.5;
/**
 * Cap radius of a pillar — ⌀1.8, wide enough to stand a performer on and
 * narrow enough to leave real clearance where the crossing passes it. At the
 * original ⌀2.2 the walk squeezed by with 0.4 m either side, which reads as
 * "nearly touching" even when the arithmetic says it fits.
 */
export const SUN_PILLAR_CAP_RADIUS_M = 0.9;

/**
 * The chamber centre in INTERIOR metres (from the interior's minimum edges),
 * given the room's full tile span. The floor plan calls this before the grid
 * exists, to place performers; `buildSundialLayout` calls it after, off the
 * compiled wing bounds. Same expression both times, which is the point.
 *
 * `tileCentredOffset` is what makes the four radii equal. A performer lands on
 * a tile CENTRE, which is a quarter-metre off every interior edge, so a centre
 * placed on a tile boundary instead pushes the east pillar to r=6.25 and the
 * west to r=6.75 — an asymmetric ring in the one room whose entire subject is
 * four-fold rotational symmetry. The first build of this module rounded to the
 * boundary and the ring test caught it at 6.25 m.
 */
export function sunChamberCentreMetres(roomWidthTiles: number): {
  xMetres: number;
  zMetres: number;
} {
  return {
    xMetres: tileCentredOffset(((roomWidthTiles - 2) * TILE) / 2),
    zMetres: tileCentredOffset(SUN_CRACK_RUN_M + SUN_CHAMBER_RADIUS_M),
  };
}

// ── Datums (metres; museum floor = 0) ───────────────────────────────────────

/** Both doors sit on the museum datum; the chamber floor is cut below it. */
export const SUN_DOOR_Y = 0;
/** The rim walk, r ∈ [9, 12] — where the day starts, sun ~8° above the horizon. */
export const SUN_RIM_Y = -0.4;

/**
 * The summit: the top of the centre drum, r ≤ 4. Noon, and the place the eye
 * lifts from.
 *
 * ── Why the room climbs ─────────────────────────────────────────────────────
 *
 * It did not, at first. The crossing ran from −0.4 to −0.2 — a 0.19 m rise
 * across its whole length, which is to say flat — because the design made
 * DISTANCE from the centre carry the sun's elevation and deliberately refused
 * a literal stair, on the grounds that climbing costs zenith and repeats Air's
 * vertical axis one room later. Austen walked it (2026-08-05): *"I don't
 * really get the staircase effect it's not really going up like a spiral
 * staircase"*, and of the eye, *"way too low and I should have to work for
 * [it] by climbing around a spiral staircase."*
 *
 * So the crossing is a helix now. It still sweeps exactly 90°, because that
 * sweep IS the room's subject — the walk performs Quarter-Same's own phase
 * offset with the visitor's body — but it climbs 6.4 m while it does it, at
 * roughly the pitch of a real spiral stair.
 *
 * The climb pays for itself twice. The first graybox failed its own gate: from
 * a centre disc at −0.2 the prop shadows landed on the ring floor at −4.0, at
 * the bottom of a pit, behind the pillars, invisible from the one spot the
 * thesis needed them visible. From a summit at +6.0 the visitor looks DOWN ten
 * metres onto that ring — which is exactly the top-down projection the design
 * asks for, and the reason the shadows are worth walking to.
 */
export const SUN_SUMMIT_Y = 6.0;
/** The collapsed ring floor, 4 < r < 9. Seen from above, never walked. */
export const SUN_RING_FLOOR_Y = -4.0;
/**
 * Top of a pillar cap. Set near the helix's own mid-height so the visitor
 * passes the performers at something like eye level on the way up, and still
 * looks down on all four from the summit.
 */
export const SUN_PILLAR_TOP_Y = 2.6;

/** Tall, because the drum is now 10 m of it and the eye rides above that. */
export const SUN_CEILING_Y = 16.0;
export const SUN_CORRIDOR_CEILING_Y = 2.6;

/**
 * The ceiling medallion the eye's hatch opens in. Solid stone over the disc;
 * everything outside it, out to the chamber wall, is the collapsed opening the
 * sky comes through.
 */
export const SUN_MEDALLION_RADIUS_M = 4.0;


/** Radius where the crossing leaves the rim. */
export const CROSSING_OUTER_R = 9;
/** Radius where it meets the centre disc. */
export const CROSSING_INNER_R = 4;
/**
 * Half-width of the walkable crossing.
 *
 * A 1.5 m walk. The binding constraint is radial, not angular: the crossing starts and ends
 * on compass bearings (so its midpoint threads the diagonal gap between two
 * pillars), which puts each endpoint 2.5 m radially from the pillar circle.
 * That 2.5 m is the whole budget: half-width + pillar cap + clearance. At 1.0
 * there was 0.4 m left over, which reads as grazing.
 */
export const CROSSING_HALF_WIDTH = 0.75;
/** The sweep, locked: a quarter of the compass, no more and no less. */
export const CROSSING_SWEEP = Math.PI / 2;

/** Open ground demanded between the walkway's edge and any pillar's edge. */
export const MIN_PILLAR_CLEARANCE = 0.5;

/**
 * Rotational bias applied to the crossing's start bearing. Zero, and that is a
 * result rather than a default: starting exactly on a compass point is
 * provably the best available. The crossing passes each of two pillars'
 * bearings exactly once, and on the compass it does so at its two ENDPOINTS,
 * where the radius is furthest from the pillar circle (9 and 4 against 6.5, so
 * 2.5 m each). Any bias drags one of those crossings inward: +8° took pillar
 * T from 0.46 m to 0.09 m, and −8° did the same to pillar U. The 2.5 m is the
 * whole budget, so clearance is bought from the walkway's width, not its
 * bearing.
 */
export const CROSSING_END_INSET = 0;


/** Elevation at the chamber centre: dead overhead. */
export const SUN_ZENITH_DEG = 90;
/** Elevation at the chamber wall: dawn, raking the room end to end. */
export const SUN_HORIZON_DEG = 8;


/** The lift at dead centre — stand here and the ground carries you to Moon. */
export const EYE_RADIUS_M = 1.0;
/** Underside of the medallion: where the plinth stops and the hatch is. */
export const EYE_TOP_Y = SUN_CEILING_Y - 0.6;
/**
 * Lift speed. Air's UPDRAFT_SPEED is 1.0 and Austen has never signed off on
 * that rate either, so this is deliberately one constant to re-tune.
 */
export const EYE_SPEED = 1.2;


export interface SundialPillar {
  id: string;
  centre: Point2;
  radius: number;
  topY: number;
}

export interface SundialLayout {
  /** Interior world rect of the sun bay. */
  interior: WorldRect;
  /** Full wing footprint including its wall ring — the rendered floor slab. */
  shell: WorldRect;
  /** Corridor tiles between the Air south door and the sun north door. */
  corridor: WorldRect[];

  /** Centre of the round chamber. Origin for every polar quantity here. */
  centre: Point2;
  chamberRadius: number;
  discRadius: number;
  ringInner: number;
  ringOuter: number;

  /** The four Quarter-Same pillars, in the collapse ring. */
  pillars: SundialPillar[];

  /** Bearing where the crossing leaves the rim, and where it meets the disc. */
  crossingStartTheta: number;
  crossingEndTheta: number;

  /** Ramped walks from each real door tile to the chamber rim. */
  approaches: FloorRect[];

  floorRects: FloorRect[];
  wallRects: WallRect[];
  ceilingRects: CeilingRect[];

  /** What the bay owns — its room plus the corridor it draws. The cave composer
   *  routes terrain queries by THIS, never by `bayBounds`. */
  bayFootprint: WorldRect[];
  /** Union bbox of the sun bay. The terrain answers only inside it. */
  bayBounds: WorldRect;

  // ── the room's mechanism, shared by physics and the graybox ──
  blockedAt(x: number, z: number): boolean;
  elevationAt(x: number, z: number, fromY?: number): number;
  /** Sun elevation in degrees for a visitor standing here. */
  sunElevationDeg(x: number, z: number): number;
  /** Sun azimuth — the visitor's OWN bearing, so the sun is at their back. */
  sunAzimuth(x: number, z: number): number;

  probes: {
    entry: Point2;
    rim: Point2;
    crossingStart: Point2;
    crossingMid: Point2;
    centre: Point2;
    /** Inside the collapse ring, off the crossing — must be blocked. */
    ringGap: Point2;
    exit: Point2;
  };
}


const cx = (r: WorldRect) => (r.minX + r.maxX) / 2;
const cz = (r: WorldRect) => (r.minZ + r.maxZ) / 2;

/** World rect of a wing's FULL tile footprint, wall ring included. */
function outerWorldRect(b: {
  x: number;
  y: number;
  width: number;
  height: number;
}): WorldRect {
  return {
    minX: b.x * TILE - HALF,
    minZ: b.y * TILE - HALF,
    maxX: (b.x + b.width - 1) * TILE + HALF,
    maxZ: (b.y + b.height - 1) * TILE + HALF,
  };
}

/** Smallest signed angular difference, wrapped to [-π, π]. */
function angleDelta(a: number, b: number): number {
  const d = a - b;
  return Math.atan2(Math.sin(d), Math.cos(d));
}


export function buildSundialLayout(grid: MuseumGrid): SundialLayout | null {
  const sunWing = grid.wings.find((w) => w.id === SUN_ROOM_ID);
  const airWing = grid.wings.find((w) => w.id === AIR_ROOM_ID_FOR_SUN);
  // The neighbour is optional. It is read only to span the corridor between the
  // two rooms, and the room picker can isolate this room on its own - a grid
  // with no neighbour has no such corridor. Requiring it returned null, which
  // left the wing component with a collapsed origin: the shell mounted at the
  // world origin instead of around the visitor, and the isolated room rendered
  // black with no error. Same fault, same fix, as the Root Terrace.
  if (!sunWing) return null;

  const shell = outerWorldRect(sunWing.bounds);
  const interior: WorldRect = {
    minX: shell.minX + TILE,
    maxX: shell.maxX - TILE,
    minZ: shell.minZ + TILE,
    maxZ: shell.maxZ - TILE,
  };

  const northDoor = doorSpan(grid, SUN_ROOM_ID, "north");
  const eastDoor = doorSpan(grid, SUN_ROOM_ID, "east");
  if (!northDoor || !eastDoor) {
    throw new Error(
      "Sundial layout: a door on the sun route is missing from the compiled grid"
    );
  }

  // ── The chamber. Its centre comes off the SAME expression the floor plan
  // uses to place the four performers, so pillar radii and the polar sun
  // mapping are guaranteed to share an origin.
  const centreMetres = sunChamberCentreMetres(sunWing.bounds.width);
  const centre: Point2 = {
    x: interior.minX + centreMetres.xMetres,
    z: interior.minZ + centreMetres.zMetres,
  };

  const chamberRadius = SUN_CHAMBER_RADIUS_M;
  if (
    centre.z + chamberRadius > interior.maxZ + 0.01 ||
    centre.x + chamberRadius > interior.maxX + 0.01 ||
    centre.x - chamberRadius < interior.minX - 0.01
  ) {
    throw new Error(
      "Sundial layout: the ⌀24 m chamber overruns the sun bay — enlarge cave-sun"
    );
  }

  // ── Where the crossing leaves the rim. Two constraints, and the first
  // version of this honoured only one of them.
  //
  // It should start near the north door, so the visitor arrives facing the one
  // route in — that part was right, and the door bearing is still where it
  // starts from.
  //
  // But it also has to MISS the pillars, and that is not a free choice. The
  // crossing crosses the pillar circle exactly once, at its midpoint, so the
  // midpoint bearing is what decides whether the walk threads the gap or runs
  // through a performer. Taking the door bearing literally put the midpoint
  // 11° off due west and the walk went straight through pillar T, overlapping
  // it by 1.55 m — visible immediately from inside the room, and the reason
  // this comment exists. The pillars sit on the compass points, so the gaps
  // between them are the diagonals, and the midpoint must land on one.
  const northDoorX = (northDoor.min + northDoor.max) / 2;
  const doorTheta = Math.atan2(northDoorX - centre.x, interior.minZ - centre.z);
  // Midpoint = θ0 + 45°, and it must be a diagonal, so θ0 is a compass point.
  // Pick the one nearest the door — then rotate the whole crossing a few
  // degrees off it. Landing exactly on the compass points puts both ENDS
  // radially in line with a pillar, and the spiral curves toward each one as
  // it approaches: the tightest point is just before the end, not at it, and
  // that left 0.46 m at pillar T. A small bias moves both ends off their
  // pillar's bearing in the same rotational direction, so both gain, and the
  // midpoint stays comfortably in the diagonal gap.
  const quarter = Math.PI / 2;
  const crossingStartTheta =
    Math.round(doorTheta / quarter) * quarter - CROSSING_END_INSET;
  const crossingEndTheta = crossingStartTheta + CROSSING_SWEEP;

  // ── The four pillars, on the same circle as the stations. Bearings are the
  // compass points the floor plan uses: north, east, south, west.
  const pillars: SundialPillar[] = (
    [
      ["u", 0, -SUN_PILLAR_RADIUS_M],
      ["s", SUN_PILLAR_RADIUS_M, 0],
      ["v", 0, SUN_PILLAR_RADIUS_M],
      ["t", -SUN_PILLAR_RADIUS_M, 0],
    ] as const
  ).map(([suffix, dx, dz]) => ({
    id: `sun-pillar-${suffix}`,
    centre: { x: centre.x + dx, z: centre.z + dz },
    radius: SUN_PILLAR_CAP_RADIUS_M,
    topY: SUN_PILLAR_TOP_Y,
  }));

  // A pillar sitting on the crossing puts a performer in the visitor's path.
  // This is measured as the real gap between two solids — the crossing's edge
  // and the pillar's edge — by sampling the spiral's centreline. The earlier
  // version asked `onCrossing(..., pillar.radius)`, which compares the pillar
  // CENTRE against the crossing's centreline using the pillar's radius as the
  // tolerance. That ignores the walkway's own width entirely, so it reported
  // clear while the walk ran 1.55 m into pillar T.
  const clearanceTo = (pillar: SundialPillar): number => {
    let nearest = Number.POSITIVE_INFINITY;
    const STEPS = 400;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const r =
        CROSSING_OUTER_R - (CROSSING_OUTER_R - CROSSING_INNER_R) * t;
      const theta = crossingStartTheta + CROSSING_SWEEP * t;
      const x = centre.x + Math.sin(theta) * r;
      const z = centre.z + Math.cos(theta) * r;
      nearest = Math.min(
        nearest,
        Math.hypot(x - pillar.centre.x, z - pillar.centre.z)
      );
    }
    return nearest - CROSSING_HALF_WIDTH - pillar.radius;
  };
  for (const pillar of pillars) {
    const gap = clearanceTo(pillar);
    if (gap < MIN_PILLAR_CLEARANCE) {
      throw new Error(
        `Sundial layout: only ${gap.toFixed(2)} m between the spiral crossing and ${pillar.id} — the walk must thread the gap between pillars, not graze one`
      );
    }
  }

  // ── Door approaches. Both doors sit on the museum datum and the rim is 0.4 m
  // below it, so each approach is a short ramp rather than a step. The east
  // door is the one the design deletes with the eye lift; until then it is the
  // only route to Moon, so it gets a real walk like any other door.
  const APPROACH_HALF_WIDTH = 3.0;
  /**
   * How far the chamber's edge stands from the centre along one axis, at an
   * offset of `across` along the other — the half-chord, not the radius.
   *
   * An approach that stopped at `centre ± chamberRadius` only touches the
   * chamber when its door sits on that axis. Move the door off-axis and the
   * approach stops short of the round wall, leaving a blocked gap between the
   * doorway and the room with nothing to see: the museum-wide walk had the Sun
   * connected to the Moon by a corridor nobody could reach, because the east
   * door landed 10.75 m off the chamber's equator on a 12 m radius.
   */
  const halfChord = (across: number) =>
    Math.sqrt(Math.max(chamberRadius * chamberRadius - across * across, 0));

  const northApproach: WorldRect = {
    minX: northDoorX - APPROACH_HALF_WIDTH,
    maxX: northDoorX + APPROACH_HALF_WIDTH,
    // To the SHELL, not the interior: a door tile sits ON the wall line, half a
    // tile outside `interior`, so an approach that stopped at the interior left
    // the doorway itself blocked — the corridor arrives, the door is stamped,
    // and the one tile joining them says no.
    minZ: shell.minZ - TILE,
    maxZ: centre.z - halfChord(northDoorX - centre.x) + 0.5,
  };
  const eastDoorZ = (eastDoor.min + eastDoor.max) / 2;
  const eastApproach: WorldRect = {
    minX: centre.x + halfChord(eastDoorZ - centre.z) - 0.5,
    maxX: shell.maxX + TILE,
    minZ: eastDoorZ - APPROACH_HALF_WIDTH,
    maxZ: eastDoorZ + APPROACH_HALF_WIDTH,
  };
  const approaches: FloorRect[] = [
    {
      id: "sun-approach-north",
      rect: northApproach,
      kind: "ramp-z",
      fromY: SUN_DOOR_Y,
      toY: SUN_RIM_Y,
    },
    {
      id: "sun-approach-east",
      rect: eastApproach,
      kind: "ramp-x",
      fromY: SUN_RIM_Y,
      toY: SUN_DOOR_Y,
    },
  ];

  // ── Corridor from Air. Air and Sun both suppress their tile geometry, so the
  // corridor between them is suppressed too and this module owns it.
  const sb = sunWing.bounds;
  const ab = airWing?.bounds;
  const corridorTxMin = ab ? Math.min(ab.x, sb.x) - 2 : 0;
  const corridorTxMax = ab ? Math.max(ab.x + ab.width, sb.x + sb.width) + 2 : 0;
  const corridor = ab
    ? bandRects(
        grid,
        corridorTxMin,
        corridorTxMax,
        ab.y + ab.height,
        sb.y,
        (t) => t === "corridor" || t === "door"
      )
    : [];
  const corridorWalls = ab
    ? bandRects(
        grid,
        corridorTxMin,
        corridorTxMax,
        ab.y + ab.height,
        sb.y - 1,
        (t) => t === "wall"
      )
    : [];

  // ── Floor rects. These exist so the terrain program and the graybox share a
  // list for the RECTANGULAR parts of the bay — the approaches and the
  // corridor. Everything inside the chamber is polar and is answered by the
  // closed-form helpers below, not by walking rects.
  const floorRects: FloorRect[] = [
    ...approaches,
    ...corridor.map((rect, i) => ({
      id: `sun-corridor-${i}`,
      rect,
      kind: "flat" as const,
      fromY: SUN_DOOR_Y,
      toY: SUN_DOOR_Y,
    })),
  ];

  // ── Wall rects: envelope with gaps derived from real door tiles ───────────
  const baseY = SUN_RING_FLOOR_Y - 1.0;
  const wallRects: WallRect[] = [];
  const pushWall = (id: string, rect: WorldRect, top: number) => {
    if (rect.maxX - rect.minX > 0.01 && rect.maxZ - rect.minZ > 0.01) {
      wallRects.push({ id, rect, baseY, topY: top });
    }
  };

  for (const [x0, x1] of spansExcluding(shell.minX, shell.maxX, [northDoor])) {
    pushWall(
      `sun-north-${x0.toFixed(2)}`,
      { minX: x0, maxX: x1, minZ: shell.minZ - WALL_THICKNESS, maxZ: shell.minZ },
      SUN_CEILING_Y
    );
  }
  pushWall(
    "sun-south",
    {
      minX: shell.minX,
      maxX: shell.maxX,
      minZ: shell.maxZ,
      maxZ: shell.maxZ + WALL_THICKNESS,
    },
    SUN_CEILING_Y
  );
  pushWall(
    "sun-west",
    {
      minX: shell.minX - WALL_THICKNESS,
      maxX: shell.minX,
      minZ: shell.minZ - WALL_THICKNESS,
      maxZ: shell.maxZ + WALL_THICKNESS,
    },
    SUN_CEILING_Y
  );
  for (const [z0, z1] of spansExcluding(shell.minZ, shell.maxZ, [eastDoor])) {
    pushWall(
      `sun-east-${z0.toFixed(2)}`,
      { minX: shell.maxX, maxX: shell.maxX + WALL_THICKNESS, minZ: z0, maxZ: z1 },
      SUN_CEILING_Y
    );
  }
  corridorWalls.forEach((rect, i) =>
    pushWall(`sun-corridor-wall-${i}`, rect, SUN_CORRIDOR_CEILING_Y)
  );

  // The chamber's roof is the collapse: solid over the crack and the corners,
  // open over the ring, and a solid medallion at the centre for the eye's hatch
  // to open in. The annulus and the medallion are polar, so the graybox draws
  // them from `SUN_MEDALLION_RADIUS_M` and `chamberRadius`; these rects are the
  // rectangular remainder.
  const ceilingRects: CeilingRect[] = [
    {
      id: "sun-crack-ceiling",
      rect: {
        minX: shell.minX,
        maxX: shell.maxX,
        minZ: shell.minZ,
        maxZ: centre.z - chamberRadius,
      },
      y: SUN_CEILING_Y,
    },
    ...corridor.map((rect, i) => ({
      id: `sun-corridor-ceiling-${i}`,
      rect,
      y: SUN_CORRIDOR_CEILING_Y,
    })),
  ];

  if (SUN_MEDALLION_RADIUS_M < EYE_RADIUS_M + 1.5) {
    throw new Error(
      "Sundial layout: the ceiling medallion does not cover the eye — there is nothing for the hatch to open in"
    );
  }

  const bayFootprint: WorldRect[] = [shell, ...corridor];
  const bayBounds = unionRect(bayFootprint);

  // ── The mechanism ─────────────────────────────────────────────────────────

  const polar = (x: number, z: number) => {
    const dx = x - centre.x;
    const dz = z - centre.z;
    return { r: Math.hypot(dx, dz), theta: Math.atan2(dx, dz) };
  };

  const inApproach = (x: number, z: number) =>
    inRectClosed(northApproach, x, z) || inRectClosed(eastApproach, x, z);
  const inCorridor = (x: number, z: number) =>
    corridor.some((rect) => inRectClosed(rect, x, z));

  /**
   * The north light crack: the whole band between the interior's north edge and
   * the chamber. The graybox floors ALL of it, so all of it has to be walkable
   * — the first version allowed only a 6 m strip on the door's axis and left
   * the rest of a lit, visibly solid floor blocked. Austen walked in and hit an
   * invisible wall with the chamber in plain sight ahead of him. This module's
   * own header promises one geometry source; that was the promise breaking.
   */
  const inCrack = (x: number, z: number) =>
    z <= centre.z - chamberRadius &&
    x >= interior.minX &&
    x <= interior.maxX &&
    z >= shell.minZ - TILE;

  function blockedAt(x: number, z: number): boolean {
    if (inCorridor(x, z) || inApproach(x, z) || inCrack(x, z)) return false;
    const { r, theta } = polar(x, z);
    // Outside the chamber, off every approach and out of the crack: the rock
    // corners the round chamber leaves in a rectangular bay.
    if (r > chamberRadius) return true;
    if (r >= CROSSING_OUTER_R) return false; // the rim walk
    if (r <= CROSSING_INNER_R) return false; // the centre disc
    // The collapse ring. Open only where the spiral crosses it.
    return !onCrossing(r, theta, crossingStartTheta, CROSSING_HALF_WIDTH);
  }

  function elevationAt(x: number, z: number, fromY?: number): number {
    if (inCorridor(x, z)) return SUN_DOOR_Y;
    // The crack floor is the rim's datum, so walking off the door approach onto
    // it is a walk, not a step.
    if (inCrack(x, z) && !inApproach(x, z)) return SUN_RIM_Y;
    for (const approach of approaches) {
      if (inRectClosed(approach.rect, x, z)) return rampHeight(approach, x, z);
    }
    const { r, theta } = polar(x, z);
    if (r > chamberRadius) return SUN_RIM_Y;
    if (r >= CROSSING_OUTER_R) return SUN_RIM_Y;
    if (r <= CROSSING_INNER_R) return SUN_SUMMIT_Y;
    if (onCrossing(r, theta, crossingStartTheta, CROSSING_HALF_WIDTH)) {
      // Lerps with the wind: -0.4 where it leaves the rim, -0.2 at the disc.
      const t = (CROSSING_OUTER_R - r) / (CROSSING_OUTER_R - CROSSING_INNER_R);
      return SUN_RIM_Y + (SUN_SUMMIT_Y - SUN_RIM_Y) * t;
    }
    // Standing on a pillar cap is only possible if something else put the
    // player up there; below that height the answer is the collapsed floor.
    for (const pillar of pillars) {
      const pr = Math.hypot(x - pillar.centre.x, z - pillar.centre.z);
      if (pr <= pillar.radius) {
        if (fromY === undefined || fromY >= pillar.topY - 0.6) return pillar.topY;
      }
    }
    return SUN_RING_FLOOR_Y;
  }

  function sunElevationDeg(x: number, z: number): number {
    const { r } = polar(x, z);
    const k = Math.min(r / chamberRadius, 1);
    return SUN_ZENITH_DEG - (SUN_ZENITH_DEG - SUN_HORIZON_DEG) * k;
  }

  function sunAzimuth(x: number, z: number): number {
    return polar(x, z).theta;
  }

  const at = (r: number, theta: number): Point2 => ({
    x: centre.x + Math.sin(theta) * r,
    z: centre.z + Math.cos(theta) * r,
  });

  return {
    interior,
    shell,
    corridor,
    centre,
    chamberRadius,
    discRadius: CROSSING_INNER_R,
    ringInner: CROSSING_INNER_R,
    ringOuter: CROSSING_OUTER_R,
    pillars,
    crossingStartTheta,
    crossingEndTheta,
    approaches,
    floorRects,
    wallRects,
    ceilingRects,
    bayFootprint,
    bayBounds,
    blockedAt,
    elevationAt,
    sunElevationDeg,
    sunAzimuth,
    probes: {
      entry: { x: northDoorX, z: interior.minZ + 1.0 },
      rim: at(10.5, crossingStartTheta),
      crossingStart: at(CROSSING_OUTER_R - 0.2, crossingStartTheta),
      crossingMid: at(6.5, crossingStartTheta + CROSSING_SWEEP / 2),
      centre: { ...centre },
      // Diametrically opposite the crossing's midpoint: ring, no spiral.
      ringGap: at(6.5, crossingStartTheta + CROSSING_SWEEP / 2 + Math.PI),
      exit: { x: interior.maxX - 1.0, z: eastDoorZ },
    },
  };
}

/**
 * Closed-form test for "is this point on the spiral crossing" — no curve
 * sampling. `r(t) = 9 - 5t`, `θ(t) = θ0 + (π/2)·t`, and the offset from the
 * centreline is measured as arc length so the corridor is a constant width
 * rather than a constant angle.
 */
export function onCrossing(
  r: number,
  theta: number,
  theta0: number,
  halfWidth = CROSSING_HALF_WIDTH
): boolean {
  if (r < CROSSING_INNER_R || r > CROSSING_OUTER_R) return false;
  const t = (CROSSING_OUTER_R - r) / (CROSSING_OUTER_R - CROSSING_INNER_R);
  const expected = theta0 + CROSSING_SWEEP * t;
  return Math.abs(angleDelta(theta, expected)) * r <= halfWidth;
}

function rampHeight(floor: FloorRect, x: number, z: number): number {
  if (floor.kind === "flat") return floor.fromY;
  const alongZ = floor.kind === "ramp-z";
  const min = alongZ ? floor.rect.minZ : floor.rect.minX;
  const max = alongZ ? floor.rect.maxZ : floor.rect.maxX;
  const v = alongZ ? z : x;
  const t = max === min ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
  return floor.fromY + (floor.toY - floor.fromY) * t;
}

// ── Terrain program ─────────────────────────────────────────────────────────

export function createSundialTerrain(
  grid: MuseumGrid
): MuseumTerrainProgram | null {
  const layout = buildSundialLayout(grid);
  if (!layout) return null;

  return {
    waterlineY: WATERLINE_Y,
    elevationAt: (x, z, fromY) => layout.elevationAt(x, z, fromY),
    blockedAt: (x, z) => layout.blockedAt(x, z),
    updraftAt(x, z, y) {
      // The eye: stand at dead centre and the ground carries you to the Moon.
      const dx = x - layout.centre.x;
      const dz = z - layout.centre.z;
      if (dx * dx + dz * dz > EYE_RADIUS_M * EYE_RADIUS_M) return 0;
      return y >= EYE_TOP_Y ? 0 : EYE_SPEED;
    },
  };
}
