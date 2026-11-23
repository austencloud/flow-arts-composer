import { describe, expect, it } from "vitest";
import { orderQuizRounds } from "./hand-motions-quiz-order";

const ALL = ["shift", "dash", "dual-shift", "cross-shift", "dual-dash", "static"];

describe("orderQuizRounds", () => {
  it("never opens on static and keeps three rounds ahead of it", () => {
    for (let i = 0; i < 2000; i++) {
      const order = orderQuizRounds(ALL);
      expect(order).toHaveLength(ALL.length);
      expect([...order].sort()).toEqual([...ALL].sort());
      expect(order.indexOf("static")).toBeGreaterThanOrEqual(3);
    }
  });

  it("can still place static anywhere after the first three", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(orderQuizRounds(ALL).indexOf("static"));
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it("puts static last when fewer than three others remain", () => {
    for (let i = 0; i < 200; i++) {
      expect(orderQuizRounds(["static", "dash"]).at(-1)).toBe("static");
      expect(orderQuizRounds(["static", "dash", "shift"]).at(-1)).toBe("static");
    }
    expect(orderQuizRounds(["static"])).toEqual(["static"]);
  });

  it("leaves a set without static alone", () => {
    expect(orderQuizRounds(["a", "b"]).sort()).toEqual(["a", "b"]);
  });
});
