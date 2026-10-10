import { describe, it, expect } from "vitest";
import { migrateEffectsConfig } from "#lib/shared/effects/domain/migrations.js";
import { EFFECTS_CONFIG_VERSION } from "#lib/shared/effects/domain/effects-config.js";

describe("animal migration (v30 serpent-split + v31 id rename)", () => {
  it("moves a serpent silk config into animal and resets silk to ribbon", () => {
    const raw = {
      version: 29,
      silk: {
        form: "serpent",
        creature: "dragon",
        palette: "ember",
        customColor: "#ff6000",
        intensity: 0.9,
        width: 0.6,
        bodyLength: 0.7,
        slither: 0.45,
        trackingMode: "right_end",
        duration: 0.5,
        flutter: 0.3,
        tautness: 0.5,
      },
      tipEffectMap: { "0:0": { effect: "silk" } },
      activePresets: { silk: "silk-dragon" },
      activeEffect: "silk",
    };
    const out = migrateEffectsConfig(raw);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    // Animal received the creature fields.
    expect(out.animal.creature).toBe("dragon");
    expect(out.animal.palette).toBe("ember");
    expect(out.animal.bodyLength).toBeCloseTo(0.7);
    // Silk is back to ribbon (no serpent fields survive).
    expect((out.silk as Record<string, unknown>).form).toBeUndefined();
    // Tip + active state re-pointed at animal.
    expect(out.tipEffectMap["0:0"]!.effect).toBe("animal");
    expect(out.activePresets.animal).toBe("animal-dragon");
    expect(out.activeEffect).toBe("animal");
  });

  it("leaves a ribbon silk config as silk", () => {
    const raw = {
      version: 29,
      silk: { form: "ribbon", palette: "satin", intensity: 0.7 },
      tipEffectMap: { "0:0": { effect: "silk" } },
      activePresets: { silk: "silk-classic" },
      activeEffect: "silk",
    };
    const out = migrateEffectsConfig(raw);
    expect(out.tipEffectMap["0:0"]!.effect).toBe("silk");
    expect(out.activeEffect).toBe("silk");
    expect(out.activePresets.silk).toBe("silk-classic");
  });

  it("neutralizes persisted frost usage", () => {
    const raw = {
      version: 29,
      tipEffectMap: { "0:0": { effect: "frost" }, "1:0": { effect: "trails" } },
      activePresets: { frost: "frost-classic" },
      activeEffect: "frost",
    };
    const out = migrateEffectsConfig(raw);
    expect(out.tipEffectMap["0:0"]).toBeUndefined();
    expect(out.tipEffectMap["1:0"]!.effect).toBe("trails");
    // The persisted "frost-classic" pick is cleared; the dormant frost slot
    // resolves back to its default (null), not the stale preset id.
    expect((out.activePresets as Record<string, unknown>).frost).toBeNull();
    expect(out.activeEffect).toBe("none");
  });

  it("renames a legacy interim 'menagerie' id to 'animal' (v31)", () => {
    // Interim dev builds stamped v30 with the effect under id "menagerie".
    const raw = {
      version: 30,
      menagerie: { creature: "caterpillar", palette: "velvet", intensity: 0.8 },
      tipEffectMap: { "0:0": { effect: "menagerie" } },
      activePresets: { menagerie: "menagerie-caterpillar" },
      activeEffect: "menagerie",
    } as Record<string, unknown>;
    const out = migrateEffectsConfig(raw);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.animal.creature).toBe("caterpillar");
    expect((out as Record<string, unknown>).menagerie).toBeUndefined();
    expect(out.tipEffectMap["0:0"]!.effect).toBe("animal");
    expect(out.activePresets.animal).toBe("animal-caterpillar");
    expect((out.activePresets as Record<string, unknown>).menagerie).toBeUndefined();
    expect(out.activeEffect).toBe("animal");
  });

  it("passes a current-version config through unchanged", () => {
    const raw = { version: EFFECTS_CONFIG_VERSION, activeEffect: "silk" };
    const out = migrateEffectsConfig(raw);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.activeEffect).toBe("silk");
  });
});
