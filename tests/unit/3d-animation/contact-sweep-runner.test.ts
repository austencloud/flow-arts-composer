import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { runContactCorrectSweep } from "$lib/shared/3d/diagnostics/contact-correct/contact-sweep-runner";

const frame = {
  authoredEndpoints: [new Vector3(), new Vector3(1, 0, 0)] as const,
  renderedEndpoints: [new Vector3(), new Vector3(1, 0, 0)] as const,
  thumbToPinkyAxis: new Vector3(1, 0, 0),
  meshAudit: {
    status: "available" as const,
    maximumPenetrationM: 0,
    affectedRegions: [],
    testedTriangles: 1,
    excludedPalmTriangles: 0,
    reason: null,
    interiorContainment: "unavailable" as const,
  },
  body: {
    leftHand: new Vector3(),
    rightHand: new Vector3(),
    leftElbow: new Vector3(),
    rightElbow: new Vector3(),
    head: new Vector3(),
    rootRotation: new Quaternion(),
  },
};

describe("contact-correct sweep runner", () => {
  it("keeps every requested intermediate phase in the result", async () => {
    const run = await runContactCorrectSweep({
      phases: [0, 0.5, 1],
      sample: async () => frame,
    });
    expect(run).toMatchObject({ status: "complete", reason: null });
    expect(run.samples.map((sample) => sample.phase)).toEqual([0, 0.5, 1]);
  });

  it("records cancellation instead of certifying a partial sweep", async () => {
    const controller = new AbortController();
    const run = await runContactCorrectSweep({
      phases: [0, 0.5],
      signal: controller.signal,
      sample: async () => {
        controller.abort();
        return frame;
      },
    });
    expect(run).toMatchObject({ status: "cancelled", reason: "cancelled" });
    expect(run.samples).toHaveLength(1);
  });

  it("does not sample after an already-aborted signal and records callback failures", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = await runContactCorrectSweep({
      phases: [0],
      signal: controller.signal,
      sample: async () => frame,
    });
    expect(cancelled).toMatchObject({ status: "cancelled", samples: [] });
    const failed = await runContactCorrectSweep({
      phases: [0],
      sample: async () => {
        throw new Error("test");
      },
    });
    expect(failed).toMatchObject({
      status: "failed",
      reason: "sample-threw:0",
    });
  });

  it("aborts a never-settling sample at the shared deadline and retains earlier evidence", async () => {
    let sawAbort = false;
    const run = await runContactCorrectSweep({
      phases: [0, 0.5],
      maxDurationMs: 15,
      sample: async (phase, signal) => {
        if (phase === 0) return frame;
        return new Promise(() => {
          signal.addEventListener(
            "abort",
            () => {
              sawAbort = true;
            },
            { once: true }
          );
        });
      },
    });
    expect(run).toMatchObject({
      status: "budget-exhausted",
      reason: "60-second-budget",
    });
    expect(run.samples.map((sample) => sample.phase)).toEqual([0]);
    expect(sawAbort).toBe(true);
  });

  it("does not certify a last frame that resolves after the deadline", async () => {
    const run = await runContactCorrectSweep({
      phases: [0],
      maxDurationMs: 5,
      sample: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return frame;
      },
    });
    expect(run).toMatchObject({ status: "budget-exhausted" });
    expect(run.samples).toHaveLength(0);
  });
});
