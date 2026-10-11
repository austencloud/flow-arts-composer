import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { tilePainterFor } from "./tile-registry";

/** Tiles with their own purpose-built component in EffectPresetThumbnail. */
const LEGACY_TILES = new Set(["trails", "fire", "led", "charcoal", "bloom"]);
/** Retired from the strip; keeps the generic look card. */
const NO_TILE = new Set(["frost"]);

describe("tile registry", () => {
  it("has a portrait painter for every effect that is not legacy-tiled or retired", () => {
    for (const effectType of Object.keys(DEFAULT_EFFECTS_CONFIG)) {
      if (effectType === "version" || LEGACY_TILES.has(effectType)) continue;
      const painter = tilePainterFor(effectType);
      if (NO_TILE.has(effectType)) expect(painter, effectType).toBeNull();
      else expect(painter, effectType).not.toBeNull();
    }
  });
});
