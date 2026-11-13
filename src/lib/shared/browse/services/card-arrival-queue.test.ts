import { beforeEach, describe, expect, it, vi } from "vitest";
import { STAGGER } from "#lib/shared/transitions/transitions.js";

// The queue's turn order and pacing can't be seen in a test of one card, and
// a lost turn would only show as a card that never draws.

let frames: FrameRequestCallback[] = [];
let now = 0;

function runFrame(advanceMs = 16): void {
  now += advanceMs;
  const due = frames;
  frames = [];
  for (const callback of due) callback(now);
}

async function freshQueue() {
  vi.resetModules();
  return import("./card-arrival-queue.js");
}

beforeEach(() => {
  frames = [];
  now = 1000;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frames = [];
  });
});

describe("queueArrivalStart", () => {
  it("starts cards top row first, left to right, one per turn", async () => {
    const { queueArrivalStart } = await freshQueue();
    const started: string[] = [];
    const card = (name: string, top: number, left: number) =>
      queueArrivalStart({
        top,
        left,
        start: () => {
          started.push(name);
          return true;
        },
      });
    card("row2-left", 300, 0);
    card("row1-right", 2, 200);
    card("row1-left", 0, 0);

    runFrame();
    expect(started).toEqual(["row1-left"]);
    for (let i = 0; i < 20; i++) runFrame();
    expect(started).toEqual(["row1-left", "row1-right", "row2-left"]);
  });

  it("keeps starts at least a stagger apart", async () => {
    const { queueArrivalStart } = await freshQueue();
    const startedAt: number[] = [];
    for (let i = 0; i < 3; i++) {
      queueArrivalStart({
        top: 0,
        left: i,
        start: () => {
          startedAt.push(now);
          return true;
        },
      });
    }
    for (let i = 0; i < 20; i++) runFrame();
    expect(startedAt).toHaveLength(3);
    expect(startedAt[1]! - startedAt[0]!).toBeGreaterThanOrEqual(STAGGER.normal);
    expect(startedAt[2]! - startedAt[1]!).toBeGreaterThanOrEqual(STAGGER.normal);
  });

  it("passes a declined turn straight to the next card", async () => {
    const { queueArrivalStart } = await freshQueue();
    const started: string[] = [];
    queueArrivalStart({ top: 0, left: 0, start: () => false });
    queueArrivalStart({
      top: 0,
      left: 100,
      start: () => {
        started.push("second");
        return true;
      },
    });
    runFrame();
    expect(started).toEqual(["second"]);
  });

  it("never starts a card that left before its turn", async () => {
    const { queueArrivalStart } = await freshQueue();
    const start = vi.fn(() => true);
    const leave = queueArrivalStart({ top: 0, left: 0, start });
    leave();
    for (let i = 0; i < 5; i++) runFrame();
    expect(start).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });
});
