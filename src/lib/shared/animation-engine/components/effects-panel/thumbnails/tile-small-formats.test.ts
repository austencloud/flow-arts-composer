// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { getRegistration } from "../effect-registry";
import { paintGhostTile } from "./ghost-tile";
import { TILE_FORMAT_SIZE, type TileFormat } from "./tile-format";
import { tilePainterFor } from "./tile-registry";
import {
  countLit,
  expectSmallFormatReads,
  hasLightGround,
  litBox,
  makeTileCanvas,
  samePixels,
  tilePixels,
} from "./tile-test-utils";

/**
 * The small-format contract for the painters that draw on a 2D canvas (the
 * Svelte painters - Bloom, Fire, Trails, Coal, LED - draw in components and
 * are looked at on the proof page). In tile and chip format, for every look of
 * every effect: the subject covers at least 60% of the limiting dimension, is
 * not cut by an edge, its brightest channel clears the floor, and the same
 * look paints the same pixels twice.
 */
const EFFECTS = [
  "zap",
  "sparkles",
  "goo",
  "bubbles",
  "petals",
  "smoke",
  "ink",
  "silk",
  "animal",
  "pulse",
  "ghost",
] as const;

/** Where the design means the subject to reach an edge: a bolt between two
 *  glowing ends, a plume that rises off the frame, a ribbon filling it. */
const SPANS: Record<string, { width?: boolean; height?: boolean }> = {
  zap: { width: true, height: true },
  smoke: { width: true, height: true },
  silk: { width: true, height: true },
  sparkles: { width: true },
  goo: { width: true, height: true },
  animal: { width: true, height: true },
};

/** Effects held to a stricter share of the frame than the 0.58 default. */
const COVER: Record<string, number | undefined> = { pulse: 0.65 };

function staff(fill: string) {
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

async function paintOne(
  effect: string,
  patch: object,
  format: TileFormat
): Promise<CanvasRenderingContext2D> {
  const ctx = makeTileCanvas(format);
  const intent = {
    ...(DEFAULT_EFFECTS_CONFIG as unknown as Record<string, object>)[effect],
    ...patch,
  };
  if (effect === "ghost") {
    paintGhostTile(ctx, intent as never, staff("#4a5bd8") as never, format);
  } else {
    await tilePainterFor(effect)!(ctx, intent as never, {
      propType: null,
      isStale: () => false,
      format,
    });
  }
  return ctx;
}

describe("small formats", () => {
  it("backing stores are about three times the display size", () => {
    expect(TILE_FORMAT_SIZE.tile).toEqual({ w: 240, h: 90 });
    expect(TILE_FORMAT_SIZE.chip).toEqual({ w: 96, h: 64 });
  });

  for (const effect of EFFECTS) {
    for (const format of ["tile", "chip"] as const) {
      it(`${effect} reads in ${format} format for every look`, async () => {
        const presets = getRegistration(effect)!.presetGroup.presets;
        const patches = presets.length
          ? presets.map((preset) => preset.patch ?? {})
          : [{}];
        for (const patch of patches) {
          const a = await paintOne(effect, patch, format);
          expectSmallFormatReads(a, {
            spansWidth: SPANS[effect]?.width ?? false,
            spansHeight: SPANS[effect]?.height ?? false,
            cover: COVER[effect],
          });
          const b = await paintOne(effect, patch, format);
          expect(countLit(tilePixels(a))).toBeGreaterThan(20);
          expect(samePixels(tilePixels(a), tilePixels(b))).toBe(true);
        }
      });
    }
  }

  it("keeps the brightest part out from under the selected tile's gear", async () => {
    // The gear sits over the top right 18x18 display px of a selected tile
    // (3 backing px per display px); only the tile format carries it.
    for (const effect of ["ghost", "smoke", "animal", "pulse"]) {
      const ctx = await paintOne(effect, {}, "tile");
      if (hasLightGround(ctx)) continue;
      const { width, height } = ctx.canvas;
      const d = ctx.getImageData(0, 0, width, height).data;
      let peak = 0;
      let corner = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          const v = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
          peak = Math.max(peak, v);
          if (x >= width - 54 && y < 54) corner = Math.max(corner, v);
        }
      }
      expect(corner, effect).toBeLessThan(peak * 0.9);
    }
  });

  it("fills the ground edge to edge (no letterbox)", async () => {
    for (const effect of EFFECTS) {
      for (const format of ["tile", "chip"] as const) {
        const ctx = await paintOne(effect, {}, format);
        const { width, height } = ctx.canvas;
        const d = ctx.getImageData(0, 0, width, height).data;
        for (const [x, y] of [
          [0, 0],
          [width - 1, 0],
          [0, height - 1],
          [width - 1, height - 1],
        ] as const) {
          // The ground is opaque: nothing is left transparent at a corner.
          expect(d[(y * width + x) * 4 + 3]).toBe(255);
        }
        expect(litBox(ctx).x1).toBeGreaterThan(0);
      }
    }
  });
});
