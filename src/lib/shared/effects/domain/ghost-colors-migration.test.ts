import { describe, expect, it } from "vitest";
import {
  migrateEffectsConfig,
  normalizeLegacyEffectIntentColors,
} from "./migrations";

describe("Ghost color retirement", () => {
  it("drops saved Ghost hand colors because ghosts draw the prop's own look", () => {
    const migrated = migrateEffectsConfig({
      version: 38,
      trails: {
        leftColor: "#112233",
        rightColor: "#445566",
      },
      ghost: {
        leftColor: "#3b82f6",
        rightColor: "#ef4444",
        intensity: 0.7,
        decay: 6,
        interval: 0.4,
      },
    });

    expect(migrated.ghost).toEqual({ intensity: 0.7, decay: 6, interval: 0.4 });
    expect(migrated.trails.leftColor).toBe("#112233");
  });

  it("strips hand colors from a stored Ghost personal default", () => {
    expect(
      normalizeLegacyEffectIntentColors("ghost", {
        blueColor: "#111111",
        rightColor: "#222222",
        intensity: 0.5,
      })
    ).toEqual({ intensity: 0.5 });
  });
});
