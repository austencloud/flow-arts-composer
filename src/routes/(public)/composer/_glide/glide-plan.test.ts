import { describe, expect, it } from "vitest";
import {
  GLIDE_PERSPECTIVE,
  glidePose,
  glideTarget,
  landingOffset,
  nearestStop,
  planStops,
  restPan,
} from "./glide-plan";

// Three stops on a 900px stage: the middle one is 400px too tall.
const plan = planStops({
  heights: [800, 1300, 600],
  room: 900,
  travel: 1000,
  hold: 200,
});

describe("planStops", () => {
  it("pans only the stops that overflow the stage", () => {
    expect(plan.pans).toEqual([0, 400, 0]);
  });

  it("rests each stop after the previous rest, pan and travel", () => {
    expect(plan.docks).toEqual([0, 1200, 2800]);
    expect(plan.length).toBe(3000);
  });
});

describe("glidePose", () => {
  it("rests a stop flat and fully shown", () => {
    expect(glidePose(0).z).toBeCloseTo(0);
    expect(glidePose(0).opacity).toBe(1);
  });

  it("waits unseen just ahead and leaves unseen just behind", () => {
    expect(glidePose(1).z).toBeLessThan(0);
    expect(glidePose(1).opacity).toBe(0);
    expect(glidePose(-1).z).toBeGreaterThan(0);
    expect(glidePose(-1).z).toBeLessThan(GLIDE_PERSPECTIVE / 4);
    expect(glidePose(-1).opacity).toBe(0);
  });

  it("never shows two stops' text at once, in either direction", () => {
    for (let step = 0; step <= 100; step += 1) {
      const p = step / 100;
      const forward = Math.min(glidePose(-p).opacity, glidePose(1 - p).opacity);
      const back = Math.min(glidePose(p).opacity, glidePose(p - 1).opacity);
      expect(forward).toBeLessThan(0.1);
      expect(back).toBeLessThan(0.1);
    }
  });
});

describe("glideTarget", () => {
  it("stays on a stop within its hold and while it pans", () => {
    expect(glideTarget(plan, 0, 150)).toBeNull();
    expect(glideTarget(plan, 1, 1000)).toBeNull();
    expect(glideTarget(plan, 1, 1500)).toBeNull();
    expect(glideTarget(plan, 1, 1800)).toBeNull();
  });

  it("glides one stop once the scroll leaves the rest", () => {
    expect(glideTarget(plan, 0, 201)).toBe(1);
    expect(glideTarget(plan, 1, 1801)).toBe(2);
    expect(glideTarget(plan, 1, 999)).toBe(0);
  });

  it("goes further when the scroll went further", () => {
    expect(glideTarget(plan, 0, 2900)).toBe(2);
    expect(glideTarget(plan, 2, 0)).toBe(0);
  });

  it("lets the page run on past the last stop", () => {
    expect(glideTarget(plan, 2, 3100)).toBeNull();
  });
});

describe("nearestStop", () => {
  it("picks the stop whose rest is closest", () => {
    expect(nearestStop(plan, 2000)).toBe(1);
    expect(nearestStop(plan, 2500)).toBe(2);
    expect(nearestStop(plan, 1300)).toBe(1);
  });
});

describe("landing", () => {
  it("lands on a stop at a pan it can show", () => {
    expect(landingOffset(plan, 1, 0)).toBe(1200);
    expect(landingOffset(plan, 1, 9999)).toBe(1600);
    expect(restPan(plan, 1, 1450)).toBe(250);
    expect(restPan(plan, 1, 900)).toBe(0);
  });
});
