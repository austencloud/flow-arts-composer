import { describe, expect, it } from "vitest";
import { playerCanvasBox } from "./playback-poster";

// Canvas boxes measured in the running player (2026-11-12), relative to the
// stage. A drift here means the poster lands somewhere the canvas does not.
describe("playerCanvasBox", () => {
  it("matches the player on a phone (412 by 915)", () => {
    const box = playerCanvasBox(410, 632)!;
    expect(box.left).toBeCloseTo(12, 0);
    expect(Math.abs(box.top - 55)).toBeLessThan(1);
    expect(box.size).toBeCloseTo(386, 0);
  });

  it("matches the player on an unfolded Fold (707 by 772)", () => {
    const box = playerCanvasBox(705, 579)!;
    expect(box.left).toBeCloseTo(131, 0);
    expect(box.top).toBeCloseTo(4, 0);
    expect(box.size).toBeCloseTo(444, 0);
  });

  it("leaves the rail closed on a short stage", () => {
    const box = playerCanvasBox(600, 300)!;
    expect(box.size).toBe(300 - 12 - 44);
  });

  it("has nothing to show in a stage with no room", () => {
    expect(playerCanvasBox(10, 40)).toBeNull();
  });
});
