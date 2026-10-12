import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import {
  countLit,
  makeTileCanvas,
  samePixels,
  tilePixels,
} from "./tile-test-utils";
import { type GhostTileSprite, paintGhostTile } from "./ghost-tile";

function fakeStaff(fill: string): GhostTileSprite {
  const c = document.createElement("canvas");
  c.width = 252;
  c.height = 78;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 28, 252, 22);
  ctx.fillRect(0, 2, 18, 74);
  ctx.fillRect(234, 2, 18, 74);
  return { image: c, width: 252, height: 78, color: fill };
}

describe("ghost tile", () => {
  it("paints the default ghost from a sprite, deterministically", () => {
    const sprite = fakeStaff("#2e3192");
    const a = makeTileCanvas();
    const b = makeTileCanvas();
    paintGhostTile(a, DEFAULT_EFFECTS_CONFIG.ghost, sprite);
    paintGhostTile(b, DEFAULT_EFFECTS_CONFIG.ghost, sprite);
    const pa = tilePixels(a);
    expect(countLit(pa)).toBeGreaterThan(200);
    expect(samePixels(pa, tilePixels(b))).toBe(true);
  });

  it("shows more poses at higher density", () => {
    const sprite = fakeStaff("#2e3192");
    const sparse = makeTileCanvas();
    const dense = makeTileCanvas();
    paintGhostTile(
      sparse,
      { ...DEFAULT_EFFECTS_CONFIG.ghost, interval: 0 },
      sprite
    );
    paintGhostTile(
      dense,
      { ...DEFAULT_EFFECTS_CONFIG.ghost, interval: 1 },
      sprite
    );
    expect(countLit(tilePixels(dense), 60)).toBeGreaterThan(
      countLit(tilePixels(sparse), 60)
    );
  });

  it("paints only the ground when no sprite is available", () => {
    const ctx = makeTileCanvas();
    expect(() =>
      paintGhostTile(ctx, DEFAULT_EFFECTS_CONFIG.ghost, null)
    ).not.toThrow();
    expect(countLit(tilePixels(ctx))).toBe(0);
  });
});
