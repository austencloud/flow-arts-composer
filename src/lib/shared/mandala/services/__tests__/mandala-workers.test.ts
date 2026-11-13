// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  createMandalaWorkers,
  type MandalaWorkerLike,
} from "../mandala-workers";
import { doMandalaWork } from "../mandala-measure-work";
import { measureDistancesOn } from "../mandala-distance-runner";
import { allPairs, measurePairSteps } from "../mandala-family-distance";
import { shapeOutline } from "../mandala-family";
import type { MandalaPaths, MandalaPoint } from "../../domain/mandala-types";

/** A worker that does its task in place, a tick later, as a real one would. */
function inPlaceWorker(options: { fail?: boolean } = {}): MandalaWorkerLike {
  const worker: MandalaWorkerLike = {
    onmessage: null,
    onerror: null,
    terminate() {},
    postMessage(message) {
      setTimeout(() => {
        if (options.fail) {
          worker.onerror?.(new Event("error"));
          return;
        }
        const { result } = doMandalaWork(message.task, (share) =>
          worker.onmessage?.({
            data: { id: message.id, type: "progress", share },
          } as MessageEvent)
        );
        worker.onmessage?.({
          data: { id: message.id, type: "done", result },
        } as MessageEvent);
      }, 0);
    },
  };
  return worker;
}

const paths = (left: MandalaPoint[][]): MandalaPaths => ({
  left: left.map((p, tipIndex) => ({ d: "", tipIndex, beats: [p] })),
  right: [],
  purple: [],
});

/** A lopsided figure, so each one differs from the next. */
function comma(radius: number, angle: number): MandalaPoint[] {
  return Array.from({ length: 61 }, (_, i) => {
    const t = i / 60;
    const a = angle + t * 1.5 * Math.PI;
    const r = radius * (0.35 + 0.65 * t);
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

describe("the mandala workers", () => {
  it("measures pairs split across workers and puts every distance back in its place", async () => {
    const outlines = Array.from({ length: 9 }, (_, i) =>
      shapeOutline(paths([comma(40 + 7 * i, i * 0.7)]))
    );
    const pairs = allPairs(outlines.length);
    const expected = new Float32Array(pairs.length >> 1);
    const steps = measurePairSteps(outlines, pairs, expected);
    while (!steps.next().done) {
      // run to the end
    }

    let started = 0;
    const workers = createMandalaWorkers({
      size: 3,
      start: () => {
        started++;
        return inPlaceWorker();
      },
    });
    const shares: number[] = [];
    const got = await measureDistancesOn(workers, { minPairsPerTask: 1 })(
      { outlines, pairs },
      { onProgress: (share) => shares.push(share) }
    );

    expect(started).toBe(3);
    expect(Array.from(got)).toEqual(Array.from(expected));
    expect(shares.at(-1)).toBeCloseTo(1, 5);
  });

  it("refuses every task once a worker fails, so the page does the work", async () => {
    const workers = createMandalaWorkers({
      size: 2,
      start: () => inPlaceWorker({ fail: true }),
    });
    const outline = shapeOutline(paths([comma(40, 0)]));
    const first = workers.run(() => ({
      type: "distances",
      outlines: [outline, outline],
      pairs: new Uint32Array([0, 1]),
    }));
    await expect(first).rejects.toThrow();
    expect(workers.broken).toBe(true);
    await expect(
      workers.run(() => ({ type: "signatures", steps: "[]" }))
    ).rejects.toThrow();
  });

  it("drops a task when its job is dropped", async () => {
    const workers = createMandalaWorkers({
      size: 1,
      start: () => inPlaceWorker(),
    });
    const controller = new AbortController();
    const outline = shapeOutline(paths([comma(40, 0)]));
    const task = workers.run(
      () => ({
        type: "distances",
        outlines: [outline, outline],
        pairs: new Uint32Array([0, 1]),
      }),
      { signal: controller.signal }
    );
    controller.abort(new Error("dropped"));
    await expect(task).rejects.toThrow("dropped");
    // The pool still works after a dropped task.
    const next = await workers.run(() => ({
      type: "signatures",
      steps: "[[]]",
    }));
    expect(next.type).toBe("signatures");
  });
});
