import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { tilePainterFor } from "./tile-registry";

/** Tiles with their own purpose-built component in EffectPresetThumbnail. */
const LEGACY_TILES = new Set(["trails", "fire", "led", "charcoal", "bloom"]);
/** Retired from the strip; keeps the generic look card. */
const NO_TILE = new Set(["frost"]);

describe("tile registry", () => {
  it("has a portrait painter for every effect that is not legacy-tiled or retired", () => {
    // activePresets has exactly one key per effect type; the top-level config
    // also carries non-effect keys (version, tipEffectMap, overrides).
    for (const effectType of Object.keys(DEFAULT_EFFECTS_CONFIG.activePresets)) {
      if (LEGACY_TILES.has(effectType)) continue;
      const painter = tilePainterFor(effectType);
      if (NO_TILE.has(effectType)) expect(painter, effectType).toBeNull();
      else expect(painter, effectType).not.toBeNull();
    }
  });
});
