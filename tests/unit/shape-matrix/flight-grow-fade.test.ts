import { describe, expect, it } from "vitest";

import { flightGrowFade } from "@tka/shape-engine/services/flight-grow-fade.js";

describe("flightGrowFade", () => {
  // A flight passes duration 0 to everything that appears or leaves in the
  // frame it captures. Measuring the node there forced a style and layout pass
  // inside the view transition's update callback, on the tap's critical path.
  it("touches nothing on the node when a flight sets the duration to zero", () => {
    const touched: string[] = [];
    const node = new Proxy(
      {},
      {
        get: (_target, key) => {
          touched.push(String(key));
          return undefined;
        },
      }
    ) as HTMLElement;

    expect(flightGrowFade(node, { duration: 0 })).toEqual({ duration: 0 });
    expect(touched).toEqual([]);
  });
});
