/**
 * The Air chimney — Vulcan Cave air bay.
 *
 * Same contract as the fire and water bays: pure geometry that, given the
 * compiled cave grid, derives world-space elevation zones, blocked regions and
 * EVERY rect the graybox renders for the air bay. The physics provider consumes
 * elevationAt/blockedAt/updraftAt; the graybox reads the same rect lists. One
 * geometry source — a rect the graybox draws that this module does not know
 * about is a bug by construction.
 *
 * ── Why this is not the prototype's plan ────────────────────────────────────
 *
 * The feel-prototype built Plan B literally: an 18 m ramp climbing to +4.6,
 * then a lift for the last 3.8 m. Walking it killed the idea. Austen,
 * 2026-08-05: *"why would I go up the ramp to get to the airlift — the airlift
 * is demonstrating me how I can lift."* He is right, and the error was in the
 * concept, not the code. Air is the one room whose element moves the visitor,
 * so the lift cannot be the dessert at the end of a climb — it has to BE the
 * way you get around. A ramp doing four fifths of the work says the opposite.
 *
 * So: there is no ramp. The floor is open, the shaft is the room, and every
 * metre of vertical travel is air. You walk into the rise column and it takes
 * you up past three performers at eye level; you walk into the sink column and
 * it sets you down. Air lifts, air lowers, feet do the flat.
 *
 * The prototype's other scars are gone too. The head-height rock rims existed
 * only because `elevationAt` was 2D and the physics clamp treated its answer as
 * a minimum, so anyone walking under a ledge was teleported on top of it; the
 * rims were fences hiding that bug, and they were also the "big wall" standing
 * between the door and the room. `elevationAt` now takes the player's foot
 * height and returns the surface they could actually be standing on, so ledges
 * simply have space underneath and this module blocks NOTHING. The three
 * height-marker posts are gone as well — they were scaffolding to read the rise
 * against, and they read as meaningless pillars in a finished room.
 *
 * There is not one absolute world coordinate in this file: every offset is
 * metres measured from a compiled room bound or a real door tile span.
 */
import type {
  MuseumGrid,
  MuseumTerrainProgram,
} from "../domain/museum-grid-types";
import { STANDING_Y } from "../services/museum-physics-provider";
import {
  TILE_METRES,
  WALL_THICKNESS,
  WATERLINE_Y,
  bandRects,
  doorSpan,
  inRectClosed,
  spansExcluding,
  unionRect,
  type CeilingRect,
  type FloorRect,
  type Point2,
  type WallRect,
  type WorldRect,
} from "./drowned-gallery-terrain";

const TILE = TILE_METRES;
const HALF = TILE / 2;


export const AIR_ROOM_ID = "cave-air";
export const EARTH_ROOM_ID = "cave-earth";

// ── Datums (metres; museum floor = 0) ───────────────────────────────────────

/** Both doors and the whole open floor sit on the museum datum. */
export const AIR_FLOOR_Y = 0;

/** The overlook, and the height the rise column delivers to. */
export const OVERLOOK_Y = 9.0;

/**
 * The three performer ledges, low → high. Spaced across the rise rather than
 * bunched, so each pair arrives at eye level with clear air before the next —
 * the eye-level pairing is the entire reason the room is vertical.
 */
export const LEDGE_YS = [2.4, 5.0, 7.6] as const;

export const AIR_CEILING_Y = 13.0;
export const CORRIDOR_CEILING_Y = 2.6;

/** The rise the room is built around: floor to overlook, on air alone. */
export const UPDRAFT_RISE_METRES = OVERLOOK_Y - AIR_FLOOR_Y;

/**
 * Steady-state lift speed inside the rise column. The prototype measured 1.0
 * m/s over 3.8 m and Austen has not yet said whether that rate feels like a
 * reveal; it is deliberately one constant so re-tuning is a one-line change.
 */
export const UPDRAFT_SPEED = 1.0;

/**
 * Descent speed in the sink column. Faster than the rise because coming down is
 * transit, not the reveal — but still a controlled sink, not a fall.
 */
export const SINK_SPEED = 1.6;

/**
 * Ceiling of the rise, expressed in PLAYER position (feet + STANDING_Y) because
 * that is what the physics provider hands to updraftAt. Above it the column is
 * still air and ordinary gravity settles the player onto the overlook — there
 * is no hovering past the top by standing still.
 */
export const UPDRAFT_CEILING_PLAYER_Y = OVERLOOK_Y + STANDING_Y;

// ── Programme metrics (metres) ──────────────────────────────────────────────

/** Metres from the interior's north edge to the rise column's centre. */
const RISE_CENTRE_FROM_NORTH = 7.0;
const RISE_RADIUS = 2.6;

/** The overlook the rise delivers onto, immediately south of the column. */
const OVERLOOK_WIDTH = 7.0;
const OVERLOOK_DEPTH = 4.5;

/** The sink column, south of the overlook and on the way to the Sun door. */
const SINK_RADIUS = 2.0;

/**
 * Performer ledges are positioned from the COLUMN, not from the walls. That
 * matters: measured from the wall, a room 8 m wider than intended pushes the
 * performers 8 m further away and the eye-level read — the entire reason this
 * room is vertical — quietly dies. `LEDGE_GAP` is the open air between the
 * column's edge and the ledge's inner edge, and it is the room's barrier.
 */
const LEDGE_GAP = 2.0;
const LEDGE_DEPTH = 3.5;
/** How far in from its inner edge the performer stands — close to the shaft. */
const PERFORMER_INSET = 1.2;

/**
 * All three ledges hang off the SAME wall, staggered along Z so they climb away
 * from the door as a diagonal.
 *
 * They alternated west/east at first, on the theory that the rise should turn
 * the visitor. In the room that was wrong twice over: at ~6 m to either side the
 * ledges sat outside the view cone entirely, so from the floor you could not see
 * a single performer, and riding the shaft meant whipping 180° between one pair
 * and the next. On one side they read as three lit stages rising away — the
 * "three heights, one beat" frame the concept asks for is simply there when you
 * walk in — and the ride only ever asks the visitor to look left.
 */
const LEDGE_WALLS = ["west", "west", "west"] as const;
/** Metres each ledge is offset along Z, low → high, so they climb diagonally. */
const LEDGE_Z_STAGGER = [-2.2, 0, 2.2] as const;

/**
 * Where the three performers stand, in interior metres, derived from the SAME
 * constants the ledge rects come from. The floor plan feeds these through
 * `interiorOffsetFraction` exactly as Fire does, so a station anchor can never
 * drift off the shelf the graybox renders under it.
 */
export function airLedgeStationOffsets(
  interiorWidth: number
): { xMetres: number; zMetres: number; y: number; facing: "east" | "west" }[] {
  const columnX = interiorWidth / 2;
  const innerEdge = RISE_RADIUS + LEDGE_GAP;
  return LEDGE_YS.map((y, i) => {
    const wall = LEDGE_WALLS[i]!;
    return {
      xMetres:
        wall === "west"
          ? columnX - innerEdge - PERFORMER_INSET
          : columnX + innerEdge + PERFORMER_INSET,
      zMetres: RISE_CENTRE_FROM_NORTH + LEDGE_Z_STAGGER[i]!,
      y,
      // Each pair faces the shaft, which is where the visitor rises past them.
      facing: wall === "west" ? ("east" as const) : ("west" as const),
    };
  });
}


export interface AirLedge {
  id: string;
  rect: WorldRect;
  /** Top surface of the ledge; the performer stands here. */
  y: number;
  wall: "west" | "east";
  /** Where the performer stands, so the station anchor and the rock agree. */
  anchor: Point2;
}

export interface AirChimneyLayout {
  /** Interior world rect of the air chamber. */
  air: WorldRect;
  /** Full wing footprint including its wall ring — the rendered floor slab. */
  shell: WorldRect;
  /** Corridor tiles between the Earth south door and the air north door. */
  corridor: WorldRect[];

  /** The rise column: floor → overlook, the room's whole ascent. */
  riseCentre: Point2;
  riseRadius: number;
  /** The sink column: overlook → floor, the way back down. */
  sinkCentre: Point2;
  sinkRadius: number;

  /** The +9.0 ledge the rise delivers onto. */
  overlook: WorldRect;
  /** Three performer ledges, low → high, alternating walls. */
  ledges: AirLedge[];

  floorRects: FloorRect[];
  wallRects: WallRect[];
  ceilingRects: CeilingRect[];

  /** What the bay owns — its room plus the corridor it draws. The cave composer
   *  routes terrain queries by THIS, never by `bayBounds`. */
  bayFootprint: WorldRect[];
  /** Union bbox of the air bay. The terrain answers only inside it. */
  bayBounds: WorldRect;

  probes: {
    entry: Point2;
    /** Standing in the rise column at floor level. */
    rise: Point2;
    /** On the overlook at +9.0. */
    overlook: Point2;
    /** Standing in the sink column. */
    sink: Point2;
    /** Open floor directly beneath the overlook — must stay at datum. */
    underOverlook: Point2;
    /** Open floor directly beneath the lowest ledge — must stay at datum. */
    underLedge: Point2;
    /** The walk from the sink column to the Sun door. */
    exit: Point2;
  };
}


const cx = (r: WorldRect) => (r.minX + r.maxX) / 2;
const cz = (r: WorldRect) => (r.minZ + r.maxZ) / 2;
const centre = (r: WorldRect): Point2 => ({ x: cx(r), z: cz(r) });

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


export function buildAirChimneyLayout(grid: MuseumGrid): AirChimneyLayout | null {
  const airWing = grid.wings.find((w) => w.id === AIR_ROOM_ID);
  const earthWing = grid.wings.find((w) => w.id === EARTH_ROOM_ID);
  // The neighbour is optional. It is read only to span the corridor between the
  // two rooms, and the room picker can isolate this room on its own - a grid
  // with no neighbour has no such corridor. Requiring it returned null, which
  // left the wing component with a collapsed origin: the shell mounted at the
  // world origin instead of around the visitor, and the isolated room rendered
  // black with no error. Same fault, same fix, as the Root Terrace.
  if (!airWing) return null;

  const shell = outerWorldRect(airWing.bounds);
  const air: WorldRect = {
    minX: shell.minX + TILE,
    maxX: shell.maxX - TILE,
    minZ: shell.minZ + TILE,
    maxZ: shell.maxZ - TILE,
  };
  const northDoor = doorSpan(grid, AIR_ROOM_ID, "north");
  const southDoor = doorSpan(grid, AIR_ROOM_ID, "south");
  if (!northDoor || !southDoor) {
    throw new Error(
      "Air chimney layout: a door on the air route is missing from the compiled grid"
    );
  }

  // ── The shaft. Centred on the interior's width so the room reads as a
  // chimney rather than a corridor with a lift bolted to one side.
  const riseCentre: Point2 = {
    x: cx(air),
    z: air.minZ + RISE_CENTRE_FROM_NORTH,
  };

  // ── The overlook, immediately south of the column so cresting and stepping
  // off are the same motion. Disjoint from the column footprint by
  // construction: the column's south edge IS the overlook's north edge.
  const overlook: WorldRect = {
    minX: riseCentre.x - OVERLOOK_WIDTH / 2,
    maxX: riseCentre.x + OVERLOOK_WIDTH / 2,
    minZ: riseCentre.z + RISE_RADIUS,
    maxZ: riseCentre.z + RISE_RADIUS + OVERLOOK_DEPTH,
  };

  // ── The sink column, hanging off the overlook's south edge. Walking south off
  // the overlook drops you into it, and it sets you down beside the Sun door.
  const sinkCentre: Point2 = {
    x: riseCentre.x,
    z: overlook.maxZ + SINK_RADIUS * 0.5,
  };

  if (sinkCentre.z + SINK_RADIUS > air.maxZ) {
    throw new Error(
      "Air chimney layout: the shaft, overlook and sink column overrun the air chamber — deepen cave-air"
    );
  }

  // ── Performer ledges, low → high, alternating walls so the rise turns you.
  // Each runs from its wall inward to a fixed gap off the column, so the
  // performer's distance from the shaft is a constant of the design rather than
  // a side effect of how wide the room compiled.
  const ledges: AirLedge[] = LEDGE_YS.map((y, i) => {
    const wall = LEDGE_WALLS[i]!;
    const zCentre = riseCentre.z + LEDGE_Z_STAGGER[i]!;
    const minZ = zCentre - LEDGE_DEPTH / 2;
    const maxZ = zCentre + LEDGE_DEPTH / 2;
    const rect: WorldRect =
      wall === "west"
        ? {
            minX: air.minX,
            maxX: riseCentre.x - RISE_RADIUS - LEDGE_GAP,
            minZ,
            maxZ,
          }
        : {
            minX: riseCentre.x + RISE_RADIUS + LEDGE_GAP,
            maxX: air.maxX,
            minZ,
            maxZ,
          };
    const anchor: Point2 = {
      x:
        wall === "west"
          ? rect.maxX - PERFORMER_INSET
          : rect.minX + PERFORMER_INSET,
      z: cz(rect),
    };
    return { id: `air-ledge-${i}`, rect, y, wall, anchor };
  });

  // The void between column and ledge is the barrier. If a future edit narrows
  // the room or fattens the column until that gap closes, the performers become
  // reachable and the room loses its whole premise — so it is asserted, not
  // assumed.
  const ledgeGap = ledges.reduce((min, ledge) => {
    const gap =
      ledge.wall === "west"
        ? riseCentre.x - RISE_RADIUS - ledge.rect.maxX
        : ledge.rect.minX - (riseCentre.x + RISE_RADIUS);
    return Math.min(min, gap);
  }, Number.POSITIVE_INFINITY);
  if (ledgeGap < 1.8) {
    throw new Error(
      `Air chimney layout: only ${ledgeGap.toFixed(2)} m of open air between the rise column and a performer ledge — the void is the barrier and it must stay uncrossable`
    );
  }

  // ── Corridor from Earth. Earth and Air both suppress their tile geometry, so
  // the corridor between them is suppressed too and this module owns it — from
  // Earth's south wall row down to Air's own north wall. Earth's door tiles sit
  // on that wall row and Earth's interior rects stop one row short of them, so
  // the band has to start there or the doorway belongs to nobody. (Fire and
  // Earth own their inbound corridors from the neighbour's wall column the
  // same way.)
  const ab = airWing.bounds;
  const eb = earthWing?.bounds;
  const corridorTxMin = eb ? Math.min(eb.x, ab.x) - 2 : 0;
  const corridorTxMax = eb ? Math.max(eb.x + eb.width, ab.x + ab.width) + 2 : 0;
  const corridor = eb
    ? bandRects(
        grid,
        corridorTxMin,
        corridorTxMax,
        eb.y + eb.height - 1,
        ab.y,
        (t) => t === "corridor" || t === "door"
      )
    : [];
  const corridorWalls = eb
    ? bandRects(
        grid,
        corridorTxMin,
        corridorTxMax,
        eb.y + eb.height,
        ab.y - 1,
        (t) => t === "wall"
      )
    : [];

  // ── Floor rects. Ordered high → low, because elevationAt walks this list and
  // picks the first surface at or below the player's feet: the raised ledges
  // must be offered before the datum slab that runs under all of them.
  const floorRects: FloorRect[] = [
    ...ledges.map((ledge) => ({
      id: ledge.id,
      rect: ledge.rect,
      kind: "flat" as const,
      fromY: ledge.y,
      toY: ledge.y,
    })),
    {
      id: "air-overlook",
      rect: overlook,
      kind: "flat",
      fromY: OVERLOOK_Y,
      toY: OVERLOOK_Y,
    },
    ...corridor.map((rect, i) => ({
      id: `air-corridor-${i}`,
      rect,
      kind: "flat" as const,
      fromY: AIR_FLOOR_Y,
      toY: AIR_FLOOR_Y,
    })),
    // The datum floor under everything: the arrival, the walk to the Sun door,
    // the ground beneath the ledges, and the landing for anyone who steps out
    // of a column mid-travel.
    {
      id: "air-shell-floor",
      rect: shell,
      kind: "flat",
      fromY: AIR_FLOOR_Y,
      toY: AIR_FLOOR_Y,
    },
  ];

  // ── Wall rects: envelope with gaps derived from real door tiles ───────────
  const baseY = AIR_FLOOR_Y - 1.0;
  const wallRects: WallRect[] = [];
  const pushWall = (id: string, rect: WorldRect, top: number) => {
    if (rect.maxX - rect.minX > 0.01 && rect.maxZ - rect.minZ > 0.01) {
      wallRects.push({ id, rect, baseY, topY: top });
    }
  };

  for (const [x0, x1] of spansExcluding(shell.minX, shell.maxX, [northDoor])) {
    pushWall(
      `air-north-${x0.toFixed(2)}`,
      { minX: x0, maxX: x1, minZ: shell.minZ - WALL_THICKNESS, maxZ: shell.minZ },
      AIR_CEILING_Y
    );
  }
  for (const [x0, x1] of spansExcluding(shell.minX, shell.maxX, [southDoor])) {
    pushWall(
      `air-south-${x0.toFixed(2)}`,
      { minX: x0, maxX: x1, minZ: shell.maxZ, maxZ: shell.maxZ + WALL_THICKNESS },
      AIR_CEILING_Y
    );
  }
  pushWall(
    "air-west",
    {
      minX: shell.minX - WALL_THICKNESS,
      maxX: shell.minX,
      minZ: shell.minZ - WALL_THICKNESS,
      maxZ: shell.maxZ + WALL_THICKNESS,
    },
    AIR_CEILING_Y
  );
  pushWall(
    "air-east",
    {
      minX: shell.maxX,
      maxX: shell.maxX + WALL_THICKNESS,
      minZ: shell.minZ - WALL_THICKNESS,
      maxZ: shell.maxZ + WALL_THICKNESS,
    },
    AIR_CEILING_Y
  );
  corridorWalls.forEach((rect, i) =>
    pushWall(`air-corridor-wall-${i}`, rect, CORRIDOR_CEILING_Y)
  );

  const ceilingRects: CeilingRect[] = [
    { id: "air-ceiling", rect: shell, y: AIR_CEILING_Y },
    ...corridor.map((rect, i) => ({
      id: `air-corridor-ceiling-${i}`,
      rect,
      y: CORRIDOR_CEILING_Y,
    })),
  ];

  const bayFootprint: WorldRect[] = [shell, ...corridor];
  const bayBounds = unionRect(bayFootprint);

  return {
    air,
    shell,
    corridor,
    riseCentre,
    riseRadius: RISE_RADIUS,
    sinkCentre,
    sinkRadius: SINK_RADIUS,
    overlook,
    ledges,
    floorRects,
    wallRects,
    ceilingRects,
    bayFootprint,
    bayBounds,
    probes: {
      entry: { x: cx(shell), z: shell.minZ + 1.0 },
      rise: { ...riseCentre },
      overlook: centre(overlook),
      sink: { ...sinkCentre },
      underOverlook: centre(overlook),
      underLedge: centre(ledges[0]!.rect),
      exit: { x: cx(air), z: air.maxZ - 1.0 },
    },
  };
}

// ── Terrain program ─────────────────────────────────────────────────────────

export function createAirChimneyTerrain(
  grid: MuseumGrid
): MuseumTerrainProgram | null {
  const layout = buildAirChimneyLayout(grid);
  if (!layout) return null;

  const { floorRects, riseCentre, riseRadius, sinkCentre, sinkRadius } = layout;
  const riseRadiusSq = riseRadius * riseRadius;
  const sinkRadiusSq = sinkRadius * sinkRadius;

  /**
   * How far above the feet a surface may sit and still be steppable. Covers
   * kerbs and the seam where a ramp meets its landing without being deep enough
   * to let anyone step onto a ledge metres overhead.
   */
  const STEP_UP = 0.6;

  const heightOn = (floor: FloorRect, x: number, z: number): number => {
    if (floor.kind === "flat") return floor.fromY;
    const alongZ = floor.kind === "ramp-z";
    const min = alongZ ? floor.rect.minZ : floor.rect.minX;
    const max = alongZ ? floor.rect.maxZ : floor.rect.maxX;
    const v = alongZ ? z : x;
    const t = max === min ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
    return floor.fromY + (floor.toY - floor.fromY) * t;
  };

  return {
    waterlineY: WATERLINE_Y,
    elevationAt(x, z, fromY) {
      // Without a foot height the answer is the first (highest) surface, which
      // is what spawn and teleport want and what every pre-Air bay assumed.
      if (fromY === undefined) {
        for (const floor of floorRects) {
          if (inRectClosed(floor.rect, x, z)) return heightOn(floor, x, z);
        }
        return AIR_FLOOR_Y;
      }
      // With one, the surface is the highest candidate the player could be
      // standing on. This is what lets the room have ledges overhead and open
      // floor beneath them instead of rock rims fencing every raised edge.
      let best = AIR_FLOOR_Y;
      let found = false;
      for (const floor of floorRects) {
        if (!inRectClosed(floor.rect, x, z)) continue;
        const y = heightOn(floor, x, z);
        if (y > fromY + STEP_UP) continue;
        if (!found || y > best) {
          best = y;
          found = true;
        }
      }
      return found ? best : AIR_FLOOR_Y;
    },
    blockedAt() {
      // Nothing. The room's only barrier is open air, and the elevation seam is
      // Y-aware, so no rock rim has to stand in for a missing dimension.
      return false;
    },
    updraftAt(x, z, y) {
      const rdx = x - riseCentre.x;
      const rdz = z - riseCentre.z;
      if (rdx * rdx + rdz * rdz <= riseRadiusSq) {
        return y >= UPDRAFT_CEILING_PLAYER_Y ? 0 : UPDRAFT_SPEED;
      }
      const sdx = x - sinkCentre.x;
      const sdz = z - sinkCentre.z;
      if (sdx * sdx + sdz * sdz <= sinkRadiusSq) {
        // Below standing height on the floor there is nothing left to lower.
        return y <= AIR_FLOOR_Y + STANDING_Y + 0.01 ? 0 : -SINK_SPEED;
      }
      return 0;
    },
  };
}
