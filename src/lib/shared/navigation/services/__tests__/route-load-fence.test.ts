/**
 * The deferred-navigation half of the `/sequence/[id]` contract.
 *
 * Keying the page component on its route id remounts the viewer when the
 * parameter changes, but a remount cannot recall a lookup the outgoing instance
 * already started. These cases are the ones that produced the defect: a slow
 * resolution landing after the URL moved on, and a resolution landing after the
 * host was torn down.
 */
import { describe, expect, it } from "vitest";

import { createRouteLoadFence } from "../route-load-fence";

/** A resolution whose reply is handed back on demand, like a slow lookup. */
function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

describe("createRouteLoadFence", () => {
  it("lets the only run write", () => {
    const fence = createRouteLoadFence();
    const run = fence.begin();

    expect(fence.isStale(run)).toBe(false);
  });

  it("stales a run as soon as a later one begins", () => {
    const fence = createRouteLoadFence();
    const first = fence.begin();
    const second = fence.begin();

    expect(fence.isStale(first)).toBe(true);
    expect(fence.isStale(second)).toBe(false);
  });

  it("drops a resolution that lands after the route moved on", async () => {
    const fence = createRouteLoadFence();
    const slow = deferred<string>();
    const fast = deferred<string>();
    let rendered: string | null = null;

    const load = async (
      source: Promise<string>,
      run: number
    ): Promise<void> => {
      const sequence = await source;
      if (fence.isStale(run)) return;
      rendered = sequence;
    };

    // Share link A starts resolving, then the user navigates to B.
    const a = load(slow.promise, fence.begin());
    const b = load(fast.promise, fence.begin());

    fast.settle("sequence-B");
    await b;
    expect(rendered).toBe("sequence-B");

    // A's lookup finally answers. It describes the previous URL.
    slow.settle("sequence-A");
    await a;
    expect(rendered).toBe("sequence-B");
  });

  it("drops a resolution that lands after the host is disposed", async () => {
    const fence = createRouteLoadFence();
    const pending = deferred<string>();
    let rendered: string | null = null;

    const run = fence.begin();
    const load = (async () => {
      const sequence = await pending.promise;
      if (fence.isStale(run)) return;
      rendered = sequence;
    })();

    fence.dispose();
    pending.settle("sequence-A");
    await load;

    expect(rendered).toBeNull();
  });

  it("stays disposed even when a new run begins", () => {
    const fence = createRouteLoadFence();
    fence.dispose();

    expect(fence.isStale(fence.begin())).toBe(true);
  });
});
