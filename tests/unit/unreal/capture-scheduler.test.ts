import { describe, expect, it } from "vitest";
import { Scheduler } from "../../../node_modules/@threlte/core/dist/frame-scheduling/Scheduler.js";
import { captureClockOrigin, primeCaptureScheduler, runCaptureScheduler } from "../../../src/routes/test/flow-fest-native-export/capture-scheduler";
import { assertCaptureGripAttachment, captureGripAttachment } from "../../../src/routes/test/flow-fest-native-export/capture-grip";

describe("consecutive native capture clocks", () => {
  it("primes the first rig frame to 30 fps after slow asset loading", () => {
    const deltas: number[] = [];
    const scheduler = new Scheduler();
    scheduler.createStage("capture").createTask("rig", (delta) => deltas.push(delta));
    const origin = primeCaptureScheduler(scheduler, performance.now() + 5000);
    expect(deltas).toEqual([]);
    runCaptureScheduler(scheduler, origin + 1000 / 30);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toBeCloseTo(1 / 30, 12);
    const nextOrigin = primeCaptureScheduler(scheduler, origin - 90);
    expect(nextOrigin).toBe(origin + 1000 / 30);
    runCaptureScheduler(scheduler, nextOrigin + 1000 / 30);
    expect(deltas[1]).toBeCloseTo(1 / 30, 12);
  });

  it("keeps IK time forward across staff, buugeng, poi and mounted rig remounts", () => {
    let previous = 100;
    let weight = 0;
    const deltas: number[] = [];
    const scheduler = { run(time: number) {
      const delta = Math.min((time - previous) / 1000, 0.1);
      deltas.push(delta);
      weight += (1 - weight) * (1 - Math.exp(-delta / 0.3));
      previous = time;
    } };
    for (const family of ["staff", "buugeng", "poi", "mounted"]) {
      weight = 0; // Each keyed avatar starts a new IK blend.
      const origin = captureClockOrigin(scheduler, 101);
      for (let frame = 1; frame <= 163; frame++) {
        const time = origin + frame * (1000 / 30);
        runCaptureScheduler(scheduler, time);
        runCaptureScheduler(scheduler, time); // Same-time settling pass.
        expect(weight, `${family} frame ${frame}`).toBeGreaterThan(0);
      }
    }
    expect(deltas.every((delta) => delta >= 0)).toBe(true);
  });

  it("rejects reversal and nonfinite time without advancing the scheduler", () => {
    const times: number[] = [];
    const scheduler = { run(time: number) { times.push(time); } };
    runCaptureScheduler(scheduler, 5000);
    expect(() => runCaptureScheduler(scheduler, 100)).toThrow("monotonic");
    expect(() => runCaptureScheduler(scheduler, NaN)).toThrow("monotonic");
    expect(times).toEqual([5000]);
    expect(captureClockOrigin({ run() {} }, 100)).toBe(100);
  });
});

describe("measured capture grip attachment", () => {
  const point = () => ({ x: 0, y: 1, z: 0 });
  const diagnostics = () => ({ gripRelaxation: 0.25, leftPalm: point(), rightPalm: point(), renderedBlueGrip: point(), renderedRedGrip: point() });

  it("requires fresh actual palms and rendered grips, independently of exported wrist fields", () => {
    const source = diagnostics();
    const snapshot = captureGripAttachment(source);
    expect(snapshot.gripRelaxation).toBe(0.25);
    source.leftPalm.x = 1;
    expect(() => assertCaptureGripAttachment(snapshot, true)).not.toThrow();
    expect(() => assertCaptureGripAttachment(snapshot, false)).toThrow("fresh");
    expect(() => assertCaptureGripAttachment(captureGripAttachment(source), true)).toThrow("detached");
    expect(() => assertCaptureGripAttachment(captureGripAttachment(source), true, [true, true], { frame: 7, score: 0.25 }))
      .toThrow(/frame 7, score 0\.250000; palm=\[/);
    expect(() => assertCaptureGripAttachment(captureGripAttachment({ ...source, leftPalm: null }), true)).toThrow("measured left");
    source.leftPalm.x = NaN;
    expect(() => assertCaptureGripAttachment(captureGripAttachment(source), true)).toThrow("measured left");
  });

  it("rejects a detached prop even when both wrists are available", () => {
    const source = diagnostics();
    source.renderedRedGrip.z = 0.003;
    expect(() => assertCaptureGripAttachment(captureGripAttachment(source), true)).toThrow("right palm");
  });
});
