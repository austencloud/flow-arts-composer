import { describe, it, expect } from "vitest";
import { computeCovenLayout, type CovenSlot } from "#lib/features/coven-hub/domain/coven-hub-layout.js";

describe("computeCovenLayout", () => {
  it("places the seed coven at the origin", () => {
    const slots = computeCovenLayout(["fire", "water"]);
    const seed = slots.find((s) => s.kind === "seed")!;
    expect(seed.x).toBe(0);
    expect(seed.z).toBe(0);
    expect(seed.effectId).toBeNull();
  });

  it("rings satellites around the origin, one per effect", () => {
    const slots = computeCovenLayout(["fire", "water", "led"]);
    const sats = slots.filter((s) => s.kind === "satellite");
    expect(sats.map((s) => s.effectId)).toEqual(["fire", "water", "led"]);
    for (const s of sats) {
      const r = Math.hypot(s.x, s.z);
      expect(r).toBeGreaterThan(0);
    }
  });

  it("spaces adjacent satellites at least the footprint apart", () => {
    const slots = computeCovenLayout(["fire", "water", "led", "echo", "bloom", "zap"]);
    const sats = slots.filter((s) => s.kind === "satellite");
    for (let i = 0; i < sats.length; i++) {
      const a = sats[i];
      const b = sats[(i + 1) % sats.length];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(8);
    }
  });

  it("grows ring radius with count so spacing holds", () => {
    const small = computeCovenLayout(["a", "b", "c"]);
    const big = computeCovenLayout(Array.from({ length: 16 }, (_, i) => `e${i}`));
    const rSmall = Math.hypot(small[1].x, small[1].z);
    const rBig = Math.hypot(big[1].x, big[1].z);
    expect(rBig).toBeGreaterThan(rSmall);
  });

  it("returns a stable id per slot", () => {
    const slots = computeCovenLayout(["fire"]);
    expect(slots.find((s) => s.kind === "seed")!.id).toBe("coven-seed");
    expect(slots.find((s) => s.kind === "satellite")!.id).toBe("coven-fire");
  });
});
