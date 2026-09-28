import { describe, expect, it } from "vitest";
import {
  AHEAD_FADE,
  FLIGHT_PERSPECTIVE,
  PASS_FADE,
  STOP_SPACING,
  activeStop,
  cameraAt,
  departOffset,
  glidePose,
  glideTarget,
  landingOffset,
  laneOffset,
  nearestStop,
  planStops,
  restPan,
  settleOffset,
  stopPose,
} from "./flight-camera";

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

  it("docks each stop after the previous rest, pan and flight", () => {
    expect(plan.docks).toEqual([0, 1200, 2800]);
    expect(plan.length).toBe(3000);
  });
});

describe("cameraAt", () => {
  it("rests on the first stop through its hold", () => {
    expect(cameraAt(plan, 0).position).toBe(0);
    expect(cameraAt(plan, 200).position).toBe(0);
  });

  it("flies linearly between stops", () => {
    expect(cameraAt(plan, 700).position).toBeCloseTo(0.5);
    expect(cameraAt(plan, 1200).position).toBe(1);
  });

  it("counts a landing a device pixel short of a dock as arrived", () => {
    expect(cameraAt(plan, 1199.67).position).toBe(1);
    expect(settleOffset(plan, 1199.67, 1)).toBeNull();
    expect(cameraAt(plan, 1198).position).toBeLessThan(1);
  });

  it("pans a tall stop before the camera leaves it", () => {
    const midPan = cameraAt(plan, 1400);
    expect(midPan.position).toBe(1);
    expect(midPan.pans[1]).toBe(200);
    expect(cameraAt(plan, departOffset(plan, 1)).position).toBe(1);
    expect(cameraAt(plan, departOffset(plan, 1) + 500).position).toBeCloseTo(
      1.5
    );
  });

  it("keeps a stop left behind at the end of its pan", () => {
    const past = cameraAt(plan, 2500);
    expect(past.pans).toEqual([0, 400, 0]);
  });

  it("clamps beyond either end of the flight", () => {
    expect(cameraAt(plan, -300).position).toBe(0);
    expect(cameraAt(plan, 9000).position).toBe(2);
  });

  it("marks the nearer stop as current mid-flight", () => {
    expect(activeStop(cameraAt(plan, 600).position)).toBe(0);
    expect(activeStop(cameraAt(plan, 800).position)).toBe(1);
  });
});

describe("settleOffset", () => {
  it("leaves a resting camera alone", () => {
    expect(settleOffset(plan, 100, 1)).toBeNull();
    expect(settleOffset(plan, 1500, -1)).toBeNull();
  });

  it("finishes a flight in the direction it was moving", () => {
    // One small step forward still commits to the next stop.
    expect(settleOffset(plan, 260, 1)).toBe(1200);
    // A step back from stop 2 returns to the bottom of tall stop 1.
    expect(settleOffset(plan, 2700, -1)).toBe(1600);
  });

  it("picks the nearer stop when the direction is unknown", () => {
    expect(settleOffset(plan, 400, 0)).toBe(0);
    expect(settleOffset(plan, 1000, 0)).toBe(1200);
  });
});

describe("stopPose", () => {
  it("rests the docked stop in the stage plane", () => {
    expect(stopPose(0)).toMatchObject({ z: 0, opacity: 1, docked: true });
  });

  it("fades stops out ahead and removes them past the fade", () => {
    expect(stopPose(1).z).toBe(-STOP_SPACING);
    expect(stopPose(1).opacity).toBeGreaterThan(0);
    expect(stopPose(AHEAD_FADE).present).toBe(false);
  });

  it("never lets a visible stop pass the camera plane", () => {
    for (let relative = 0; relative > -PASS_FADE; relative -= 0.05) {
      expect(stopPose(relative).z).toBeLessThan(FLIGHT_PERSPECTIVE);
    }
    expect(stopPose(-PASS_FADE).present).toBe(false);
  });
});

describe("laneOffset", () => {
  it("centres whichever stop the camera rests on", () => {
    for (const index of [0, 1, 2, 3]) {
      expect(laneOffset(index, index)).toEqual({ x: 0, y: 0 });
    }
  });

  it("puts the next stop to one side of the path", () => {
    expect(laneOffset(1, 0).x).not.toBe(0);
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
    expect(glidePose(-1).z).toBeLessThan(FLIGHT_PERSPECTIVE / 4);
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
