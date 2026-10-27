import { describe, expect, it, vi } from "vitest";
import {
  LOW_BACKING_PX,
  LOW_FRAME_MS,
  TIER_FRAMES,
  backingRatio,
  chooseScene,
  createTierWatch,
  deviceTier,
  fontDue,
  frameDue,
  lowTierState,
} from "./overture-budget";

describe("the tier", () => {
  it("is low on a device with few cores or little memory", () => {
    expect(deviceTier("auto", { cores: 4, memoryGb: 8 })).toBe("low");
    expect(deviceTier("auto", { cores: 8, memoryGb: 4 })).toBe("low");
    expect(deviceTier("auto", { cores: 2 })).toBe("low");
    expect(deviceTier("auto", { cores: 8, memoryGb: 8 })).toBe("full");
    // deviceMemory is missing outside Chromium: cores decide alone.
    expect(deviceTier("auto", { cores: 12 })).toBe("full");
    expect(deviceTier(undefined, {})).toBe("full");
  });

  it("follows a forced setting whatever the device says", () => {
    expect(deviceTier("full", { cores: 2, memoryGb: 1 })).toBe("full");
    expect(deviceTier("low", { cores: 32, memoryGb: 16 })).toBe("low");
  });

  it("drops to low once when the first frames average too slow", () => {
    const watch = createTierWatch("auto");
    const answers = [20, 14, 9, 13, 11, 30, 30].map((ms) => watch.frame(ms));
    // Five frames averaging 13.4 ms: the fifth says drop, nothing after.
    expect(answers.indexOf(true)).toBe(TIER_FRAMES - 1);
    expect(answers.filter(Boolean)).toHaveLength(1);
  });

  it("keeps full when the first frames are quick, and never overrides a forced tier", () => {
    const quick = createTierWatch("auto");
    expect([3, 4, 5, 4, 3, 40, 40].some((ms) => quick.frame(ms))).toBe(false);
    const forced = createTierWatch("full");
    expect([40, 40, 40, 40, 40].some((ms) => forced.frame(ms))).toBe(false);
  });
});

describe("the low tier's drawing", () => {
  it("draws at dpr 1 at most, and no more than 480 px across the mandala", () => {
    expect(backingRatio("full", 3, 560)).toBe(2);
    expect(backingRatio("full", 1.25, 560)).toBe(1.25);
    expect(backingRatio("low", 3, 300)).toBe(1);
    expect(backingRatio("low", 2, 560) * 560).toBeCloseTo(LOW_BACKING_PX);
    expect(backingRatio("low", 0, 200)).toBe(1);
  });

  it("draws every other frame of a 60 Hz display", () => {
    let last: number | null = null;
    let drawnFrames = 0;
    for (let i = 0; i < 60; i++) {
      const t = (i * 1000) / 60;
      if (frameDue("low", t, last)) {
        last = t;
        drawnFrames++;
      }
    }
    expect(drawnFrames).toBe(30);
    expect(frameDue("full", 1, 0)).toBe(true);
    expect(frameDue("low", LOW_FRAME_MS, 0)).toBe(true);
  });

  it("halves the sparks and turns the glow off", () => {
    expect(lowTierState({ maxSparks: 96, glow: true })).toEqual({
      maxSparks: 48,
      glow: false,
    });
  });
});

describe("the fetches", () => {
  const scene = { id: "a" };
  const isScene = (v: unknown): v is typeof scene =>
    typeof v === "object" && v !== null && "id" in v;

  it("never fetches the pool when the snapshot is good", async () => {
    const fetch = vi.fn();
    const chosen = await chooseScene({
      snapshot: JSON.stringify(scene),
      pool: "/pool.json",
      rotation: 0,
      valid: isScene,
      fetch,
    });
    expect(chosen).toEqual(scene);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches the pool at low priority when the snapshot is missing or bad", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ v: 1, scenes: [{ id: "x" }, { id: "y" }, 7] })
        )
    );
    const chosen = await chooseScene({
      snapshot: "{not json",
      pool: "/pool.json",
      rotation: 3,
      valid: isScene,
      fetch,
    });
    expect(chosen).toEqual({ id: "y" });
    expect(fetch).toHaveBeenCalledWith(
      "/pool.json",
      expect.objectContaining({ priority: "low" })
    );
  });

  it("gives up quietly when the pool fails", async () => {
    const failing = await chooseScene({
      snapshot: null,
      pool: "/pool.json",
      rotation: 0,
      valid: isScene,
      fetch: async () => new Response("", { status: 404 }),
    });
    expect(failing).toBeNull();
  });

  it("asks for the font halfway through the first beat, or at once when still", () => {
    expect(fontDue(0, 8, false)).toBe(false);
    expect(fontDue(0.06, 8, false)).toBe(false);
    expect(fontDue(0.0625, 8, false)).toBe(true);
    expect(fontDue(0, 8, true)).toBe(true);
  });
});
