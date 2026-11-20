// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { EFFECTS } from "#lib/shared/effects/domain/effect-meta.js";
import { getRegistration } from "../effect-registry";
import { formatForPictureWidth } from "../picture-format";
import { paintBloomSmall } from "./bloom-small";
import { paintGhostTile } from "./ghost-tile";
import {
  LEGIBILITY_FLOOR,
  measureLegibility,
  type Legibility,
} from "./tile-legibility";
import { tilePainterFor } from "./tile-registry";
import { makeTileCanvas, tilePixels } from "./tile-test-utils";

/**
 * The phone list shows an effect's `tile` picture 52 wide. Every effect picture
 * painted on a 2D canvas must clear the floor `tile-legibility.ts` takes from
 * the pictures that read well there (default look for all of them, every look
 * for the five that were reworked for it: Smoke, Bubbles, Pulse, Animal, Bloom),
 * so a new effect, or a new look of one of those five, cannot arrive too dim to
 * read.
 */
const CANVAS_PAINTED = [
  "zap",
  "sparkles",
  "ghost",
  "goo",
  "bubbles",
  "petals",
  "smoke",
  "ink",
  "silk",
  "animal",
  "pulse",
  "bloom",
] as const;

/** Painted by a pure painter of its own, not through the tile registry. */
const OWN_PAINTER = new Set(["bloom"]);

/** Drawn inside Svelte components (looked at on the proof page, not here), or with no picture. */
const NOT_PAINTED_HERE = new Set([
  "fire",
  "trails",
  "charcoal",
  "led",
  "frost",
]);

/** Held to the floor in every look, not just the default. */
const EVERY_LOOK = new Set(["smoke", "bubbles", "pulse", "animal", "bloom"]);

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

async function measureTile(effect: string, patch: object): Promise<Legibility> {
  const ctx = makeTileCanvas("tile");
  const intent = {
    ...(DEFAULT_EFFECTS_CONFIG as unknown as Record<string, object>)[effect],
    ...patch,
  };
  if (effect === "bloom") {
    paintBloomSmall(ctx, patch as never, "tile");
  } else if (effect === "ghost") {
    paintGhostTile(ctx, intent as never, staff("#4a5bd8") as never, "tile");
  } else {
    await tilePainterFor(effect)!(ctx, intent as never, {
      propType: null,
      isStale: () => false,
      format: "tile",
    });
  }
  const { width, height } = ctx.canvas;
  return measureLegibility(tilePixels(ctx), width, height);
}

describe("tile pictures read at 52 wide", () => {
  it("every roster effect has a canvas painter or is named as drawn elsewhere", () => {
    for (const { id } of EFFECTS) {
      if (id === "none") continue;
      const accounted =
        (CANVAS_PAINTED as readonly string[]).includes(id) ||
        NOT_PAINTED_HERE.has(id);
      expect(accounted, `${id} needs a legibility check`).toBe(true);
    }
    for (const id of CANVAS_PAINTED)
      if (!OWN_PAINTER.has(id)) expect(tilePainterFor(id), id).not.toBeNull();
  });

  for (const effect of CANVAS_PAINTED) {
    it(`${effect} clears the floor${EVERY_LOOK.has(effect) ? " in every look" : ""}`, async () => {
      const presets = getRegistration(effect)?.presetGroup.presets ?? [];
      // The list shows the first look when none is picked (`effectCatalogLooks`).
      const shown = EVERY_LOOK.has(effect) ? presets : presets.slice(0, 1);
      const patches = shown.length
        ? shown.map((preset) => ({
            name: preset.id,
            patch: preset.patch ?? {},
          }))
        : [{ name: "default", patch: {} }];
      for (const { name, patch } of patches) {
        const m = await measureTile(effect, patch);
        const label = `${effect}/${name} reach ${m.reach.toFixed(2)} cover ${m.coverage.toFixed(3)}`;
        const floor = LEGIBILITY_FLOOR;
        expect(m.reach, label).toBeGreaterThanOrEqual(floor.reach);
        expect(m.coverage, label).toBeGreaterThanOrEqual(floor.coverage);
      }
    });
  }
});

describe("formatForPictureWidth", () => {
  it("gives the phone grid's 52 to 69 wide pictures the tile, and big look cards the card", () => {
    for (const w of [52, 69, 74, 88, 130])
      expect(formatForPictureWidth(w)).toBe("tile");
    for (const w of [131, 304, 720])
      expect(formatForPictureWidth(w)).toBe("card");
    expect(formatForPictureWidth(0)).toBe("card");
  });
});
