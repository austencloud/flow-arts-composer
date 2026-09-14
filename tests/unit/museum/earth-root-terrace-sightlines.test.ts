/**
 * The Root Terrace's sightline acceptance criterion, as an executable check.
 *
 * The first cut of this room put the visitor on a terrace 5.2 m above the
 * rootbed and never let them closer: every case read at 9-18 m and 12-36
 * degrees below the horizon. That is a diorama. The regrade's criterion, and
 * the reason the catwalk exists at all, is:
 *
 *   from the place the room asks you to stand and work a case, that case is
 *   no further than 6.00 m, no steeper than 25 degrees below the horizon, and
 *   nothing in the room crosses the line to its feet.
 *
 * The last clause is the one that is easy to get wrong, and did get it wrong
 * once already: an earlier arrangement of these decks was checked against the
 * RAILS only and passed, while the walkway itself - a deck cantilevered over
 * the bed at +1.43 where the overlook's foot-ray passed at +1.27 - cut the
 * view of the near case in half. So the sweep below tests every edge of every
 * floor rect, walkway decks included, not the rail lines.
 *
 * An occluder is modelled as its deck plus RAIL_HEIGHT: a deck edge you can
 * stand at is railed, and the rail is the tallest thing on it.
 */
import { describe, expect, it } from "vitest";
import { buildVulcanCaveFloorPlan } from "$lib/features/museum/data/vulcan-cave-floor-plan";
import {
  BED_Y,
  EYE_ABOVE_FLOOR,
  GALLERY_Y,
  OVERLOOK_Y,
  PROP_CENTRE_ABOVE_FEET,
  RAIL_HEIGHT,
  buildEarthRootTerraceLayout,
  heightOnFloor,
  type EarthRootTerraceLayout,
} from "$lib/features/museum/data/earth-root-terrace-terrain";
import { inRectClosed, type Point2 } from "$lib/features/museum/data/drowned-gallery-terrain";

/** The criterion, in the units the room is measured in. */
const MAX_LINE_OF_SIGHT_M = 6.0;
const MAX_DEPRESSION_DEG = 25;

const layout = buildEarthRootTerraceLayout(buildVulcanCaveFloorPlan().grid)!;
const PROP_Y = BED_Y + PROP_CENTRE_ABOVE_FEET;

interface Read {
  plan: number;
  lineOfSight: number;
  depressionDeg: number;
}

function readOf(eye: Point2, eyeY: number, target: Point2): Read {
  const plan = Math.hypot(target.x - eye.x, target.z - eye.z);
  const drop = eyeY - PROP_Y;
  return {
    plan,
    lineOfSight: Math.hypot(plan, drop),
    depressionDeg: (Math.atan2(drop, plan) * 180) / Math.PI,
  };
}

/**
 * The tightest clearance any floor rect's edge leaves under the ray from an
 * eye to a point on the bed. Positive means the ray passes over every rail;
 * negative means something in the room is in the way.
 *
 * Every edge of every rect is swept, so a walkway that hangs between the eye
 * and the performer is caught the same way a rail is.
 */
function worstClearance(
  eye: Point2,
  eyeY: number,
  target: Point2,
  targetY: number
): { metres: number; occluder: string } {
  let metres = Infinity;
  let occluder = "nothing crosses the ray";
  for (const floor of layout.floorRects) {
    const edges: { axis: "x" | "z"; at: number }[] = [
      { axis: "z", at: floor.rect.minZ },
      { axis: "z", at: floor.rect.maxZ },
      { axis: "x", at: floor.rect.minX },
      { axis: "x", at: floor.rect.maxX },
    ];
    for (const edge of edges) {
      const from = edge.axis === "z" ? eye.z : eye.x;
      const to = edge.axis === "z" ? target.z : target.x;
      if (Math.abs(to - from) < 1e-9) continue;
      const t = (edge.at - from) / (to - from);
      // Only crossings strictly between the eye and the target block it.
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      const hit = { x: eye.x + t * (target.x - eye.x), z: eye.z + t * (target.z - eye.z) };
      if (!inRectClosed(floor.rect, hit.x, hit.z)) continue;
      const rayY = eyeY + t * (targetY - eyeY);
      const railTopY = heightOnFloor(floor, hit.x, hit.z) + RAIL_HEIGHT;
      if (rayY - railTopY < metres) {
        metres = rayY - railTopY;
        occluder = `${floor.id} ${edge.axis}=${edge.at.toFixed(2)} rail top ${railTopY.toFixed(3)}`;
      }
    }
  }
  return { metres, occluder };
}

describe("Root Terrace sightlines", () => {
  it("puts every case within 6 m and 25 degrees of its own console", () => {
    expect(layout.consoles).toHaveLength(3);
    for (const panel of layout.consoles) {
      const station = layout.stations.find((s) => s.letter === panel.letter)!;
      const read = readOf(panel.stand, GALLERY_Y + EYE_ABOVE_FLOOR, station.centre);
      expect(read.lineOfSight, `${panel.letter} line of sight`).toBeLessThanOrEqual(
        MAX_LINE_OF_SIGHT_M
      );
      expect(read.depressionDeg, `${panel.letter} depression`).toBeLessThanOrEqual(
        MAX_DEPRESSION_DEG
      );
      // And not so close it is looking down on the top of a head: below 10
      // degrees the props leave the frame, above 25 the performer does.
      expect(read.depressionDeg, `${panel.letter} depression`).toBeGreaterThan(10);
    }
  });

  it("leaves the foot line clear from every console, over its own rail", () => {
    for (const panel of layout.consoles) {
      const station = layout.stations.find((s) => s.letter === panel.letter)!;
      for (const [name, targetY] of [
        ["feet", BED_Y],
        ["prop centre", PROP_Y],
      ] as const) {
        const clearance = worstClearance(
          panel.stand,
          GALLERY_Y + EYE_ABOVE_FLOOR,
          station.centre,
          targetY
        );
        expect(
          clearance.metres,
          `console ${panel.letter} -> ${name}: ${clearance.occluder}`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the overlook's whole vista clear of the catwalk below it", () => {
    // This is the check the earlier arrangement failed. The catwalk hangs
    // between the overlook and the bed; if it sits too high or too far south,
    // its rail cuts the feet off every case seen from up here.
    const eyeY = OVERLOOK_Y + EYE_ABOVE_FLOOR;
    const eyes: Point2[] = [
      { x: layout.overlook.minX + 0.5, z: layout.overlook.maxZ - 0.5 },
      { x: layout.overlook.minX + 1.0, z: layout.overlook.maxZ - 0.5 },
      { x: (layout.overlook.minX + layout.overlook.maxX) / 2, z: layout.overlook.maxZ - 0.5 },
      { x: layout.overlook.maxX - 0.5, z: layout.overlook.maxZ - 0.5 },
    ];
    for (const eye of eyes) {
      expect(inRectClosed(layout.overlook, eye.x, eye.z), `eye ${eye.x},${eye.z}`).toBe(true);
      for (const station of layout.stations) {
        for (const [name, targetY] of [
          ["feet", BED_Y],
          ["prop centre", PROP_Y],
        ] as const) {
          const clearance = worstClearance(eye, eyeY, station.centre, targetY);
          expect(
            clearance.metres,
            `overlook x=${eye.x.toFixed(2)} -> ${station.letter} ${name}: ${clearance.occluder}`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps all three cases visible from the ensemble landing", () => {
    const { eye, eyeY } = layout.ensemble;
    for (const station of layout.stations) {
      for (const [name, targetY] of [
        ["feet", BED_Y],
        ["prop centre", PROP_Y],
      ] as const) {
        const clearance = worstClearance(eye, eyeY, station.centre, targetY);
        expect(
          clearance.metres,
          `ensemble -> ${station.letter} ${name}: ${clearance.occluder}`
        ).toBeGreaterThan(0);
      }
    }
    // The near case is the one the landing is for; the far two nest behind it.
    const reads = layout.stations.map((s) => readOf(eye, eyeY, s.centre));
    expect(reads[2]!.lineOfSight).toBeLessThanOrEqual(MAX_LINE_OF_SIGHT_M);
    expect(reads[2]!.depressionDeg).toBeLessThanOrEqual(MAX_DEPRESSION_DEG);
  });

  it("beats the terrace it replaced on both numbers, from the same wall", () => {
    // The room this regrade replaced walked a terrace at +2.8 whose rail line
    // stood 0.6 m in from its south edge, on the bed's north face. Measuring
    // the old geometry against the new console positions is the whole case
    // for the change, so it is asserted rather than asserted-about.
    const OLD_TERRACE_Y = 2.8;
    const oldEyeY = OLD_TERRACE_Y + EYE_ABOVE_FLOOR;
    for (const panel of layout.consoles) {
      const station = layout.stations.find((s) => s.letter === panel.letter)!;
      const oldRead = readOf(
        { x: station.centre.x, z: layout.bed.minZ - 0.6 },
        oldEyeY,
        station.centre
      );
      const now = readOf(panel.stand, GALLERY_Y + EYE_ABOVE_FLOOR, station.centre);
      expect(oldRead.lineOfSight, `${panel.letter} was`).toBeGreaterThan(MAX_LINE_OF_SIGHT_M);
      expect(oldRead.depressionDeg, `${panel.letter} was`).toBeGreaterThan(MAX_DEPRESSION_DEG);
      expect(now.lineOfSight).toBeLessThan(oldRead.lineOfSight);
      expect(now.depressionDeg).toBeLessThan(oldRead.depressionDeg);
    }
  });
});

/** Named so a failure message can say which layout it measured. */
export type { EarthRootTerraceLayout };
