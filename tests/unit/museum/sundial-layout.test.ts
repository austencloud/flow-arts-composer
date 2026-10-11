import { describe, it, expect } from "vitest";
import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";
import {
  buildSundialLayout,
  CROSSING_HALF_WIDTH,
  MIN_PILLAR_CLEARANCE,
  EYE_RADIUS_M,
  SUN_SUMMIT_Y,
  SUN_MEDALLION_RADIUS_M,
  SUN_PILLAR_RADIUS_M,
} from "#lib/features/museum/data/sundial-layout.js";

const plan = buildVulcanCaveFloorPlan();
const layout = buildSundialLayout(plan.grid)!;

/** Point at radius r, bearing theta, in world space. */
function at(r: number, theta: number) {
  return {
    x: layout.centre.x + Math.sin(theta) * r,
    z: layout.centre.z + Math.cos(theta) * r,
  };
}

describe("sundial layout", () => {
  it("builds", () => expect(layout).toBeTruthy());

  it("blocks the collapse ring everywhere except the crossing", () => {
    let blocked = 0;
    let open = 0;
    for (let i = 0; i < 720; i++) {
      const theta = (i / 720) * Math.PI * 2;
      const p = at(6.5, theta);
      layout.blockedAt(p.x, p.z) ? blocked++ : open++;
    }
    expect(open).toBeGreaterThan(0); // the crossing exists
    expect(blocked / 720).toBeGreaterThan(0.9); // and it is a slot, not a gap
  });

  it("lets you walk the whole rim", () => {
    for (let i = 0; i < 360; i++) {
      const theta = (i / 360) * Math.PI * 2;
      const p = at(10.5, theta);
      expect(layout.blockedAt(p.x, p.z)).toBe(false);
    }
  });

  it("puts the summit at +6 and the rim at -0.4", () => {
    expect(layout.elevationAt(layout.centre.x, layout.centre.z)).toBeCloseTo(
      SUN_SUMMIT_Y,
      2
    );
    const rim = at(10.5, 0);
    expect(layout.elevationAt(rim.x, rim.z)).toBeCloseTo(-0.4, 2);
  });

  it("climbs the whole way, monotonically, with no step a leg could not take", () => {
    // The room's premise after 2026-08-05: you walk UP to noon. A helix that
    // levels off, or jumps, is not a staircase.
    let previous = -Infinity;
    let biggestStep = 0;
    const SAMPLES = 400;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const r = 9 - 5 * t;
      const p = at(r, layout.crossingStartTheta + (Math.PI / 2) * t);
      const y = layout.elevationAt(p.x, p.z, previous === -Infinity ? undefined : previous);
      if (previous !== -Infinity) {
        expect(y).toBeGreaterThan(previous - 1e-9); // never descends
        biggestStep = Math.max(biggestStep, y - previous);
      }
      previous = y;
    }
    // Comfortably inside the physics provider's 0.6 m step-up tolerance, or
    // the visitor would be stopped dead partway up their own staircase.
    expect(biggestStep).toBeLessThan(0.3);
    // And it must actually arrive at the top.
    expect(previous).toBeCloseTo(SUN_SUMMIT_Y, 2);
  });

  it("makes the summit reachable only by the stair", () => {
    // Every bearing around the drum's edge except the crossing is a 10 m drop.
    let open = 0;
    for (let i = 0; i < 720; i++) {
      const theta = (i / 720) * Math.PI * 2;
      const p = at(4.6, theta);
      if (!layout.blockedAt(p.x, p.z)) open++;
    }
    expect(open).toBeGreaterThan(0);
    expect(open / 720).toBeLessThan(0.1);
  });

  it("sweeps exactly 90 degrees from rim to disc", () => {
    const d = layout.crossingEndTheta - layout.crossingStartTheta;
    expect(Math.abs(d)).toBeCloseTo(Math.PI / 2, 5);
  });

  it("puts the sun overhead at the centre and low at the rim", () => {
    expect(
      layout.sunElevationDeg(layout.centre.x, layout.centre.z)
    ).toBeCloseTo(90, 1);
    const rim = at(12, 0);
    expect(layout.sunElevationDeg(rim.x, rim.z)).toBeCloseTo(8, 1);
  });

  it("keeps the sun on the visitor's own bearing", () => {
    for (const theta of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const p = at(10, theta);
      const az = layout.sunAzimuth(p.x, p.z);
      const d = Math.atan2(Math.sin(az - theta), Math.cos(az - theta));
      expect(Math.abs(d)).toBeLessThan(1e-6);
    }
  });

  it("puts all four performers on the pillar circle, about the same centre", () => {
    const performers = plan.grid.performers.filter((p) =>
      p.id.startsWith("cave-sun-automaton-")
    );
    expect(performers).toHaveLength(4);
    for (const performer of performers) {
      const r = Math.hypot(
        performer.tileX * 0.5 - layout.centre.x,
        performer.tileY * 0.5 - layout.centre.z
      );
      expect(r).toBeCloseTo(SUN_PILLAR_RADIUS_M, 5);
    }
  });

  it("stands each performer on a pillar cap, not in the collapse", () => {
    for (const pillar of layout.pillars) {
      expect(
        layout.elevationAt(pillar.centre.x, pillar.centre.z, pillar.topY)
      ).toBeCloseTo(pillar.topY, 5);
      // ...and the ring immediately beside the cap is still the collapse.
      expect(
        layout.elevationAt(
          pillar.centre.x + pillar.radius + 0.4,
          pillar.centre.z,
          pillar.topY
        )
      ).toBeCloseTo(-4.0, 5);
    }
  });

  it("threads the crossing between the pillars, not through one", () => {
    // Walk the spiral and check the walkway's EDGE against each pillar's EDGE.
    // A pillar centre merely being off the centreline is not enough: the first
    // build passed that check while the walk ran 1.55 m into pillar T, which
    // was plainly visible from inside the room.
    for (const pillar of layout.pillars) {
      let nearest = Infinity;
      for (let i = 0; i <= 400; i++) {
        const t = i / 400;
        const r = 9 - 5 * t;
        const theta = layout.crossingStartTheta + (Math.PI / 2) * t;
        const p = at(r, theta);
        nearest = Math.min(
          nearest,
          Math.hypot(p.x - pillar.centre.x, p.z - pillar.centre.z)
        );
      }
      const gap = nearest - CROSSING_HALF_WIDTH - pillar.radius;
      expect(gap, `${pillar.id} clearance`).toBeGreaterThanOrEqual(
        MIN_PILLAR_CLEARANCE
      );
    }
  });

  it("lets you walk the whole crack, not just a strip down the middle", () => {
    // The graybox floors the entire band north of the chamber. Anything it
    // floors must be walkable, or the visitor meets an invisible wall on a lit
    // floor — which is exactly what shipped.
    const northEdge = layout.centre.z - layout.chamberRadius;
    for (let i = 0; i <= 40; i++) {
      const x =
        layout.interior.minX +
        ((layout.interior.maxX - layout.interior.minX) * i) / 40;
      for (const z of [
        layout.interior.minZ + 0.5,
        (layout.interior.minZ + northEdge) / 2,
        northEdge - 0.5,
      ]) {
        expect(layout.blockedAt(x, z), `crack at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(
          false
        );
      }
    }
  });

  it("keeps the eye under solid ceiling", () => {
    expect(SUN_MEDALLION_RADIUS_M).toBeGreaterThanOrEqual(EYE_RADIUS_M + 1.5);
  });

  it("walks a continuous route from the north door to the centre", () => {
    // Entry, the rim, both ends of the crossing and the disc must all be open,
    // and the ring opposite the crossing must not be.
    const { entry, rim, crossingStart, crossingMid, centre, ringGap, exit } =
      layout.probes;
    for (const p of [entry, rim, crossingStart, crossingMid, centre, exit]) {
      expect(layout.blockedAt(p.x, p.z)).toBe(false);
    }
    expect(layout.blockedAt(ringGap.x, ringGap.z)).toBe(true);
  });
});
