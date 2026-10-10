import { describe, expect, it } from "vitest";

import { createSessionQueue, REQUEUE_DISTANCE, MAX_ATTEMPTS } from "#lib/features/lab/pronunciation-recorder/domain/session-queue.js";
import { createAbortMonitor, ABORT_CONSECUTIVE_FAILURES } from "#lib/features/lab/pronunciation-recorder/domain/session-abort.js";

const WORDS = Array.from({ length: 20 }, (_, index) => `w${index}`);

describe("createSessionQueue", () => {
  it("hands out words in order and shows the next one", () => {
    const queue = createSessionQueue(WORDS);

    expect(queue.current).toBe("w0");
    expect(queue.next).toBe("w1");
    queue.accept();
    expect(queue.current).toBe("w1");
  });

  it("re-queues at a distance rather than immediately", () => {
    // Re-reading the failed word straight away gives it the same run-up that
    // just failed. Eight places later it lands in a different rhythm and still
    // inside the same sitting.
    const queue = createSessionQueue(WORDS);
    queue.requeue();

    expect(queue.current).toBe("w1");
    const seen: string[] = [];
    while (queue.current && seen.length < 12) {
      seen.push(queue.current);
      queue.accept();
    }
    expect(seen[REQUEUE_DISTANCE - 1]).toBe("w0");
  });

  it("puts a late failure at the end when fewer words remain than the distance", () => {
    const queue = createSessionQueue(["a", "b"]);
    queue.requeue();

    expect(queue.current).toBe("b");
    queue.accept();
    expect(queue.current).toBe("a");
  });

  it("retires a word after three attempts and reports it", () => {
    const queue = createSessionQueue(["a"]);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) queue.requeue();

    expect(queue.current).toBeNull();
    expect(queue.retired).toEqual(["a"]);
  });

  it("counts only accepted words as completed", () => {
    const queue = createSessionQueue(WORDS);
    queue.accept();
    queue.requeue();
    queue.accept();

    expect(queue.completed).toBe(2);
  });
});

describe("createAbortMonitor", () => {
  it("aborts when the opening of the session is mostly failures", () => {
    // Three failures in the first eight words is a wrong device or a wrong
    // gain, and no number of re-queues fixes either one.
    const monitor = createAbortMonitor();
    monitor.record("fail");
    monitor.record("ok");
    monitor.record("fail");
    monitor.record("ok");
    expect(monitor.reason).toBeNull();
    monitor.record("fail");

    expect(monitor.reason).toBe("early-failures");
  });

  it("aborts on a consecutive run later in the session", () => {
    const monitor = createAbortMonitor();
    for (let index = 0; index < 12; index++) monitor.record("ok");
    for (let index = 0; index < ABORT_CONSECUTIVE_FAILURES; index++) monitor.record("fail");

    expect(monitor.reason).toBe("consecutive-failures");
  });

  it("does not abort on the same failure count spread across a long session", () => {
    // Occasional failures are the design working. Only a run or a bad opening
    // means the rig is broken.
    const monitor = createAbortMonitor();
    for (let index = 0; index < 60; index++) {
      monitor.record(index % 7 === 0 && index > 8 ? "fail" : "ok");
    }

    expect(monitor.reason).toBeNull();
  });

  it("clears the consecutive run on a good read", () => {
    const monitor = createAbortMonitor();
    for (let index = 0; index < 12; index++) monitor.record("ok");
    monitor.record("fail");
    monitor.record("fail");
    monitor.record("fail");
    monitor.record("ok");
    monitor.record("fail");
    monitor.record("fail");

    expect(monitor.reason).toBeNull();
  });
});
