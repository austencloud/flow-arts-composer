import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { EffectSystem } from "#lib/shared/animation-engine/services/managers/effect-system.js";

describe("EffectSystem fire brightness", () => {
  it("copies semantic brightness into the 2D renderer config during initialization", () => {
    const system = new EffectSystem({} as never, {
      lifecycleManager: {} as never,
    });
    const config = {
      ...DEFAULT_EFFECTS_CONFIG,
      fire: {
        ...DEFAULT_EFFECTS_CONFIG.fire,
        brightness: 0.83,
      },
    };

    system.initPrevState(config as never);

    expect(system.getFireConfig().brightness).toBe(0.83);
  });

  it("maps the Liquid Fire intent to the preserved renderer profile", () => {
    const system = new EffectSystem({} as never, {
      lifecycleManager: {} as never,
    });
    const config = {
      ...DEFAULT_EFFECTS_CONFIG,
      fire: {
        ...DEFAULT_EFFECTS_CONFIG.fire,
        renderingStyle: "liquid" as const,
      },
    };

    system.initPrevState(config as never);

    expect(system.getFireConfig().renderingProfile).toBe("legacy");
  });
});
