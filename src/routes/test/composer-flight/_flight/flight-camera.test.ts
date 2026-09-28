import { describe, expect, it } from "vitest";
import {
  AHEAD_FADE,
  FLIGHT_PERSPECTIVE,
  PASS_FADE,
  STOP_SPACING,
  activeStop,
  cameraAt,
  departOffset,
  flowPose,
  laneOffset,
  planStops,
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

describe("flowPose", () => {
  it("rests a section flat while it crosses the reading band", () => {
    expect(flowPose(100, 700, 1000)).toEqual({ z: 0, opacity: 1 });
    // A section taller than the viewport stays flat while it fills it.
    expect(flowPose(-900, 1800, 1000)).toEqual({ z: 0, opacity: 1 });
  });

  it("pushes an approaching section back and fades it", () => {
    const near = flowPose(900, 1500, 1000);
    const far = flowPose(1300, 1900, 1000);
    expect(near.z).toBeLessThan(0);
    expect(far.z).toBeLessThan(near.z);
    expect(far.opacity).toBeLessThan(near.opacity);
  });

  it("flies a leaving section past without crossing the camera plane", () => {
    const leaving = flowPose(-900, 50, 1000);
    expect(leaving.z).toBeGreaterThan(0);
    expect(flowPose(-5000, -4000, 1000).z).toBeLessThan(FLIGHT_PERSPECTIVE);
    expect(flowPose(-5000, -4000, 1000).opacity).toBe(0);
  });
});
