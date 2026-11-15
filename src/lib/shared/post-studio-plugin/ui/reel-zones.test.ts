import { describe, expect, it } from "vitest";
import { REEL_FRAME, REEL_ZONES } from "./reel-zones";
import { REELS_COVERED } from "./reels-preview.svelte";

describe("reel zones", () => {
  it("keeps every zone inside the frame", () => {
    for (const z of Object.values(REEL_ZONES)) {
      expect(z.x0).toBeGreaterThanOrEqual(0);
      expect(z.y0).toBeGreaterThanOrEqual(0);
      expect(z.x1).toBeLessThanOrEqual(REEL_FRAME.width);
      expect(z.y1).toBeLessThanOrEqual(REEL_FRAME.height);
      expect(z.x1).toBeGreaterThan(z.x0);
      expect(z.y1).toBeGreaterThan(z.y0);
    }
  });

  it("makes the home feed window exactly 4:5", () => {
    const w = REEL_ZONES.feedWindow;
    expect(w.x1 - w.x0).toBe(1080);
    expect(w.y1 - w.y0).toBe(1350);
  });

  it("starts the buttons column at x 915 or later", () => {
    expect(REEL_ZONES.buttons.x0).toBeGreaterThanOrEqual(915);
  });

  it("pins the covered shares auto frame depends on", () => {
    expect(REELS_COVERED.top).toBe(140 / 1920);
    expect(REELS_COVERED.bottom).toBe(360 / 1920);
  });
});
