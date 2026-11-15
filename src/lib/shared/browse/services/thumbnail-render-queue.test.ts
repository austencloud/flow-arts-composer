import { describe, expect, it } from "vitest";
import {
  PREPARE_AHEAD_PRIORITY,
  ThumbnailRenderQueue,
  VISITOR_ASKED_PRIORITY,
} from "./thumbnail-render-queue";

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

describe("thumbnail render queue priority", () => {
  function setup() {
    const queue = new ThumbnailRenderQueue();
    queue.setMaxConcurrent(1);
    const order: string[] = [];
    const running = gate();
    const task = (id: string) => async () => {
      order.push(id);
      return id;
    };
    // Occupies the only slot until released.
    const first = queue.enqueue("running", async () => {
      order.push("running");
      await running.promise;
    });
    return { queue, order, running, first, task };
  }

  it("runs a visitor-asked task before queued position-based ones", async () => {
    const { queue, order, running, first, task } = setup();
    const a = queue.enqueue("a", task("a"), { priority: 120 });
    const b = queue.enqueue("b", task("b"), { priority: 640 });
    const tapped = queue.enqueue("tapped", task("tapped"), {
      priority: VISITOR_ASKED_PRIORITY,
    });
    running.open();
    await Promise.all([first, a, b, tapped]);
    expect(order).toEqual(["running", "tapped", "a", "b"]);
  });

  it("leaves a running task alone and takes the next slot", async () => {
    const { queue, order, running, first, task } = setup();
    const tapped = queue.enqueue("tapped", task("tapped"), {
      priority: VISITOR_ASKED_PRIORITY,
    });
    expect(queue.getStats().activeIds).toEqual(["running"]);
    running.open();
    await Promise.all([first, tapped]);
    expect(order).toEqual(["running", "tapped"]);
  });

  it("sorts prepare-ahead work after every position", async () => {
    const { queue, order, running, first, task } = setup();
    const ahead = queue.enqueue("ahead", task("ahead"), {
      priority: PREPARE_AHEAD_PRIORITY,
    });
    const low = queue.enqueue("low", task("low"), { priority: 5000 });
    running.open();
    await Promise.all([first, ahead, low]);
    expect(order).toEqual(["running", "low", "ahead"]);
  });

  it("moves a queued prepare-ahead task forward when a tap joins it", async () => {
    const { queue, order, running, first, task } = setup();
    const ahead = queue.enqueue("next", task("next"), {
      priority: PREPARE_AHEAD_PRIORITY,
    });
    const a = queue.enqueue("a", task("a"), { priority: 120 });
    const joined = queue.enqueue("next", task("next-again"), {
      priority: VISITOR_ASKED_PRIORITY,
    });
    running.open();
    await Promise.all([first, ahead, a, joined]);
    expect(order).toEqual(["running", "next", "a"]);
  });
});
