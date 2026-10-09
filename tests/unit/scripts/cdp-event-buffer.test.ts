import { describe, expect, it } from "vitest";
import { createEventBuffer } from "../../../scripts/lib/cdp-event-buffer.mjs";

describe("createEventBuffer", () => {
  it("starts reading from now when no cursor is given", async () => {
    const buffer = createEventBuffer();
    buffer.push("Page.screencastFrame", { n: 1 });
    expect(await buffer.read({ methods: ["Page.screencastFrame"] })).toEqual({
      cursor: 1,
      events: [],
      hasMore: false,
      truncated: false,
    });
  });

  it("returns the matching events after a cursor, in order", async () => {
    const buffer = createEventBuffer();
    buffer.push("A", { n: 1 });
    buffer.push("B", { n: 2 });
    buffer.push("A", { n: 3 });
    const batch = await buffer.read({ methods: ["A"], afterSequence: 0 });
    expect(
      batch.events.map((event: { params: { n: number } }) => event.params.n)
    ).toEqual([1, 3]);
    expect(batch.cursor).toBe(3);
    expect(batch.hasMore).toBe(false);
    const next = await buffer.read({
      methods: ["A"],
      afterSequence: batch.cursor,
    });
    expect(next.events).toEqual([]);
  });

  it("stops at the limit and moves the cursor only past what it returned", async () => {
    const buffer = createEventBuffer();
    for (let n = 1; n <= 5; n++) buffer.push("A", { n });
    const first = await buffer.read({ afterSequence: 0, limit: 2 });
    expect(first.events).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.cursor).toBe(2);
    const second = await buffer.read({
      afterSequence: first.cursor,
      limit: 10,
    });
    expect(second.events).toHaveLength(3);
    expect(second.hasMore).toBe(false);
    expect(second.cursor).toBe(5);
  });

  it("says so when it dropped events the reader had not read", async () => {
    const buffer = createEventBuffer({ capacity: 3 });
    for (let n = 1; n <= 6; n++) buffer.push("A", { n });
    expect((await buffer.read({ afterSequence: 0 })).truncated).toBe(true);
    expect((await buffer.read({ afterSequence: 3 })).truncated).toBe(false);
    expect((await buffer.read({ afterSequence: 6 })).truncated).toBe(false);
  });

  it("waits up to timeoutMs for an event that has not arrived", async () => {
    const buffer = createEventBuffer();
    const pending = buffer.read({ afterSequence: 0, timeoutMs: 500 });
    setTimeout(() => buffer.push("A", { n: 1 }), 20);
    expect((await pending).events).toHaveLength(1);
    const started = Date.now();
    const empty = await buffer.read({ afterSequence: 1, timeoutMs: 60 });
    expect(empty.events).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });
});
