import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  directedAxisErrorDeg,
  endpointContinuityM,
  gradeContactSweep,
  measureContactSweepFrame,
} from "$lib/shared/3d/diagnostics/contact-correct/contact-sweep-metrics";

const availableAudit = {
  status: "available" as const,
  maximumPenetrationM: 0,
  affectedRegions: [],
  testedTriangles: 1,
  excludedPalmTriangles: 0,
  reason: null,
  interiorContainment: "unavailable" as const,
};
const unavailableAudit = {
  ...availableAudit,
  status: "unavailable" as const,
  maximumPenetrationM: null,
  reason: "no-skinned-mesh",
};
const containedAudit = {
  ...availableAudit,
  interiorContainment: "contained" as const,
};
const frame = (x = 0, meshAudit = availableAudit) => ({
  authoredEndpoints: [new Vector3(x, 0, 0), new Vector3(x + 1, 0, 0)] as const,
  renderedEndpoints: [new Vector3(x, 0, 0), new Vector3(x + 1, 0, 0)] as const,
  thumbToPinkyAxis: new Vector3(1, 0, 0),
  meshAudit,
  body: {
    leftHand: new Vector3(x, 0, 0),
    rightHand: new Vector3(x, 0, 0),
    leftElbow: new Vector3(x, 0, 0),
    rightElbow: new Vector3(x, 0, 0),
    head: new Vector3(x, 0, 0),
    rootRotation: new Quaternion(),
  },
});

describe("contact sweep metrics", () => {
  it("keeps directed axes directed instead of accepting the reversed thumb/pinky axis", () => {
    expect(
      directedAxisErrorDeg(
        new Vector3(1, 0, 0),
        new Vector3(),
        new Vector3(1, 0, 0)
      )
    ).toBeCloseTo(0);
    expect(
      directedAxisErrorDeg(
        new Vector3(-1, 0, 0),
        new Vector3(),
        new Vector3(1, 0, 0)
      )
    ).toBeCloseTo(180);
  });

  it("marks unavailable mesh evidence as unavailable rather than zero penetration", () => {
    const metrics = measureContactSweepFrame(frame(0, unavailableAudit));
    expect(metrics.meshAvailable).toBe(false);
    expect(metrics.meshPenetrationM).toBeNull();
  });

  it("reports a failing intermediate displacement even when endpoint frames agree", () => {
    const first = frame(0);
    const intermediate = frame(0.4);
    const last = frame(0);
    expect(endpointContinuityM(first, last)).toBe(0);
    expect(endpointContinuityM(first, intermediate)).toBeCloseTo(0.4);
    expect(endpointContinuityM(intermediate, last)).toBeCloseTo(0.4);
    const grade = gradeContactSweep([first, intermediate, last], {
      endpointDriftM: 0.0005,
      directedAxisDeg: 2,
      continuityM: 0.01,
      requireVolumetricMesh: false,
    });
    expect(grade.verdict).toBe("fail");
    expect(grade.failingMetrics).toEqual(["body-continuity", "continuity"]);
  });

  it("fails a fully contained staff even when surface penetration is zero", () => {
    const grade = gradeContactSweep([frame(0, containedAudit)], {
      endpointDriftM: 0.0005,
      directedAxisDeg: 2,
      continuityM: 0.01,
    });
    expect(grade).toMatchObject({
      verdict: "fail",
      failingMetrics: ["mesh-contained"],
    });
  });
});
