import { describe, it, expect } from "vitest";
import { migrateEffectsConfig } from "./migrations";
import { EFFECTS_CONFIG_VERSION } from "./effects-config";
import { DEFAULT_EFFECTS_CONFIG } from "./defaults";

describe("migrateEffectsConfig", () => {
  it("migrates v1 → current with default zap colors", () => {
    const v1 = { version: 1 };
    const out = migrateEffectsConfig(v1);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.zap.leftColor).toBe("#88ccff");
    expect(out.zap.rightColor).toBe("#88ccff");
  });

  it("migrates v2 zap.color to v3 zap.leftColor + rightColor", () => {
    const v2 = {
      version: 2,
      zap: {
        intensity: 0.9,
        color: "#ff00ff",
        frequency: 10,
        mode: "arc",
        branching: 0.4,
      },
    };
    const out = migrateEffectsConfig(v2);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.zap.leftColor).toBe("#ff00ff");
    expect(out.zap.rightColor).toBe("#ff00ff");
    expect((out.zap as any).color).toBeUndefined();
  });

  it("leaves a current-version zap untouched", () => {
    const current = {
      version: EFFECTS_CONFIG_VERSION,
      zap: {
        intensity: 0.5,
        leftColor: "#aaaaaa",
        rightColor: "#bbbbbb",
        frequency: 5,
        mode: "arc",
        branching: 0.2,
      },
    };
    const out = migrateEffectsConfig(current);
    expect(out.zap.leftColor).toBe("#aaaaaa");
    expect(out.zap.rightColor).toBe("#bbbbbb");
  });

  it("migrates v3 sparkles.rainbow=true to v4 colorMode=rainbow", () => {
    const v3 = {
      version: 3,
      sparkles: {
        rate: 0.6,
        size: 0.4,
        lifetime: 1.0,
        color: "#ff00ff",
        rainbow: true,
      },
    };
    const out = migrateEffectsConfig(v3);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.sparkles.colorMode).toBe("rainbow");
    expect(out.sparkles.color).toBe("#ff00ff");
    expect((out.sparkles as any).rainbow).toBeUndefined();
    expect(out.sparkles.palette).toEqual(["#fbbf24", "#f59e0b", "#fde047"]);
    expect(out.sparkles.spread).toBe(8);
    expect(out.sparkles.gravity).toBe(0.3);
    expect(out.sparkles.mode).toBe("stream");
  });

  it("migrates v3 sparkles.rainbow=false to v4 colorMode=solid", () => {
    const v3 = {
      version: 3,
      sparkles: {
        rate: 0.5,
        size: 0.5,
        lifetime: 1.2,
        color: "#fbbf24",
        rainbow: false,
      },
    };
    const out = migrateEffectsConfig(v3);
    expect(out.sparkles.colorMode).toBe("solid");
    expect((out.sparkles as any).rainbow).toBeUndefined();
  });

  it("leaves a current-version v4 sparkles untouched", () => {
    const v4 = {
      version: EFFECTS_CONFIG_VERSION,
      sparkles: {
        rate: 0.7,
        size: 0.6,
        lifetime: 2.0,
        color: "#67e8f9",
        palette: ["#aaa", "#bbb", "#ccc"],
        colorMode: "palette" as const,
        spread: 12,
        gravity: 0.8,
        mode: "burst" as const,
      },
    };
    const out = migrateEffectsConfig(v4);
    expect(out.sparkles.colorMode).toBe("palette");
    expect(out.sparkles.palette).toEqual(["#aaa", "#bbb", "#ccc"]);
    expect(out.sparkles.mode).toBe("burst");
  });

  it("migrates v4 motion to v5 shape, then v5 motion is discarded in v6 with fresh echo defaults", () => {
    // v4 motion block flows through the v4→v5 expander, then the v5→v6
    // migration discards it and reseeds echo defaults. The intermediate
    // motion shape is irrelevant to the final output.
    const v4 = {
      version: 4,
      motion: { blur: 0.6, speedLines: 0.8, threshold: 0.3 },
    };
    const out = migrateEffectsConfig(v4);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect((out as any).motion).toBeUndefined();
    expect(out.ghost.intensity).toBe(0.7);
    expect(out.ghost.decay).toBe(4);
    expect(out.ghost.interval).toBe(0.5);
  });

  it("migrates v5 motion block to v6 echo with fresh defaults", () => {
    const v5 = {
      version: 5,
      motion: {
        blur: 0.6,
        speedLines: 0.8,
        threshold: 0.3,
        color: "#ff0",
        colorMode: "solid" as const,
        length: 0.7,
        count: 8,
      },
    };
    const out = migrateEffectsConfig(v5);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect((out as any).motion).toBeUndefined();
    expect(out.ghost.intensity).toBe(0.7);
    expect(out.ghost.decay).toBe(4);
    // v28 strips echo to its three live fields; the formerly-unused interval is
    // reseeded to the Density default.
    expect(out.ghost.interval).toBe(0.5);
  });

  it("migrates v5 tipEffectMap motion entries to ghost (via echo)", () => {
    const v5 = {
      version: 5,
      tipEffectMap: {
        "*": { effect: "motion" },
        "0": { effect: "motion" },
        "1-0": { effect: "sparkles" },
      },
    };
    const out = migrateEffectsConfig(v5);
    expect(out.tipEffectMap["*"]?.effect).toBe("ghost");
    expect(out.tipEffectMap["0"]?.effect).toBe("ghost");
    expect(out.tipEffectMap["1-0"]?.effect).toBe("sparkles");
  });

  it("migrates v5 activePresets.motion → ghost (via echo)", () => {
    const v5 = {
      version: 5,
      activePresets: {
        motion: "motion-anime",
        sparkles: "sparkles-fairy-dust",
      },
    };
    const out = migrateEffectsConfig(v5);
    expect((out.activePresets as any).motion).toBeUndefined();
    expect((out.activePresets as any).echo).toBeUndefined();
    expect(out.activePresets.ghost).toBe("motion-anime");
    expect(out.activePresets.sparkles).toBe("sparkles-fairy-dust");
  });

  it("migrates v6 bloom stub to v7 per-tip halo shape", () => {
    // Old stub: {intensity, threshold, radius(0-1 normalized)}.
    // New: {intensity, radius(8-200 px), color, palette, colorMode, falloff, pulse, pulseRate}.
    const v6 = {
      version: 6,
      bloom: { intensity: 0.6, threshold: 0.8, radius: 0.5 },
    };
    const out = migrateEffectsConfig(v6);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.bloom.intensity).toBe(0.6); // preserved
    // old 0.5 → 0.5*200+8 = 108
    expect(out.bloom.radius).toBe(108);
    expect((out.bloom as any).threshold).toBeUndefined();
    expect(out.bloom.color).toBe("#f472b6");
    expect(out.bloom.palette).toEqual(["#f472b6", "#fbbf24", "#22d3ee"]);
    // v7 seeds colorMode "solid"; the v16→v17 lens-bloom remap then flips that
    // default-echo to "prop-matched" (migrate() runs the full chain).
    expect(out.bloom.colorMode).toBe("prop-matched");
    expect(out.bloom.falloff).toBe("smooth");
    expect(out.bloom.pulse).toBe(0);
    expect(out.bloom.pulseRate).toBe(1);
  });

  it("clamps v6 bloom radius at the 8-200 px bounds during v7 migration", () => {
    const outLow = migrateEffectsConfig({
      version: 6,
      bloom: { intensity: 0.5, threshold: 0.7, radius: 0 },
    });
    expect(outLow.bloom.radius).toBe(8);
    const outHigh = migrateEffectsConfig({
      version: 6,
      bloom: { intensity: 0.5, threshold: 0.7, radius: 1 },
    });
    expect(outHigh.bloom.radius).toBe(200);
  });

  it("leaves v6 tipEffectMap entries pointing at bloom valid through v7 migration", () => {
    const v6 = {
      version: 6,
      tipEffectMap: {
        "*": { effect: "bloom" },
        "1-1": { effect: "sparkles" },
      },
      bloom: { intensity: 0.4, threshold: 0.5, radius: 0.25 },
    };
    const out = migrateEffectsConfig(v6);
    expect(out.tipEffectMap["*"]?.effect).toBe("bloom");
    expect(out.tipEffectMap["1-1"]?.effect).toBe("sparkles");
    expect(out.bloom.radius).toBe(58); // 0.25*200+8
  });

  it("leaves a current-version v7 bloom untouched", () => {
    const v7 = {
      version: EFFECTS_CONFIG_VERSION,
      bloom: {
        intensity: 0.9,
        radius: 40,
        color: "#ff00ff",
        palette: ["#aaa", "#bbb", "#ccc"],
        colorMode: "palette" as const,
        falloff: "ring" as const,
        pulse: 0.5,
        pulseRate: 2,
      },
    };
    const out = migrateEffectsConfig(v7);
    expect(out.bloom.intensity).toBe(0.9);
    expect(out.bloom.radius).toBe(40);
    expect(out.bloom.colorMode).toBe("palette");
    expect(out.bloom.falloff).toBe("ring");
    expect(out.bloom.palette).toEqual(["#aaa", "#bbb", "#ccc"]);
  });

  it("leaves a current-version ghost untouched", () => {
    const current = {
      version: EFFECTS_CONFIG_VERSION,
      ghost: { intensity: 0.9, decay: 6, interval: 0.5 },
    };
    const out = migrateEffectsConfig(current);
    expect(out.ghost.intensity).toBe(0.9);
    expect(out.ghost.decay).toBe(6);
    expect(out.ghost.interval).toBe(0.5);
  });

  it("migrates v8 → v9 by seeding default bubbles intent", () => {
    const v8 = {
      version: 8,
      // No bubbles block - must seed from defaults.
    };
    const out = migrateEffectsConfig(v8);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.bubbles).toBeDefined();
    expect(out.bubbles.palette).toBe("soap");
    expect(out.bubbles.ambientEmission).toBeGreaterThan(0);
    expect(out.bubbles.motionEmission).toBeGreaterThan(0);
    expect(out.bubbles.buoyancy).toBeGreaterThan(0);
    expect(out.bubbles.trackingMode).toBe("both_ends");
    expect(out.activePresets.bubbles).toBe(null);
  });

  it("preserves existing bubbles values through v8 → v9 merge", () => {
    const v8 = {
      version: 8,
      bubbles: {
        palette: "oil" as const,
        customColor: "#ff00ff",
        ambientEmission: 0.9,
        motionEmission: 0.1,
        intensity: 0.8,
        sizeJitter: 0.6,
        buoyancy: 0.7,
        trackingMode: "left_end" as const,
      },
    };
    const out = migrateEffectsConfig(v8);
    expect(out.bubbles.palette).toBe("oil");
    expect(out.bubbles.ambientEmission).toBe(0.9);
    expect(out.bubbles.buoyancy).toBe(0.7);
    expect(out.bubbles.trackingMode).toBe("left_end");
  });

  it("migrates v9 → v10 by seeding default petals intent", () => {
    const v9 = {
      version: 9,
      // No petals block - must seed from defaults.
    };
    const out = migrateEffectsConfig(v9);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.petals).toBeDefined();
    expect(out.petals.palette).toBe("blossom");
    expect(out.petals.ambientEmission).toBeGreaterThan(0);
    expect(out.petals.motionEmission).toBeGreaterThan(0);
    expect(out.petals.swayAmplitude).toBeGreaterThan(0);
    expect(out.petals.fallSpeed).toBeGreaterThan(0);
    expect(out.petals.trackingMode).toBe("both_ends");
    expect(out.activePresets.petals).toBe(null);
  });

  it("preserves existing petals values through v9 → v10 merge", () => {
    const v9 = {
      version: 9,
      petals: {
        palette: "autumn" as const,
        customColor: "#ff8800",
        ambientEmission: 0.8,
        motionEmission: 0.2,
        intensity: 0.9,
        swayAmplitude: 0.9,
        fallSpeed: 0.7,
        trackingMode: "right_end" as const,
      },
    };
    const out = migrateEffectsConfig(v9);
    expect(out.petals.palette).toBe("autumn");
    expect(out.petals.ambientEmission).toBe(0.8);
    expect(out.petals.swayAmplitude).toBe(0.9);
    expect(out.petals.fallSpeed).toBe(0.7);
    expect(out.petals.trackingMode).toBe("right_end");
  });

  it("migrates v10 → v11 by seeding default smoke intent", () => {
    const v10 = {
      version: 10,
      // No smoke block - must seed from defaults.
    };
    const out = migrateEffectsConfig(v10);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.smoke).toBeDefined();
    expect(out.smoke.palette).toBe("incense");
    expect(out.smoke.ambientEmission).toBeGreaterThan(0);
    expect(out.smoke.motionEmission).toBeGreaterThan(0);
    expect(out.smoke.curlStrength).toBeGreaterThan(0);
    expect(out.smoke.riseSpeed).toBeGreaterThan(0);
    expect(out.smoke.trackingMode).toBe("both_ends");
    expect(out.activePresets.smoke).toBe(null);
  });

  it("preserves existing smoke values through v10 → v11 merge", () => {
    const v10 = {
      version: 10,
      smoke: {
        palette: "genie" as const,
        customColor: "#a060ff",
        ambientEmission: 0.2,
        motionEmission: 1.0,
        intensity: 0.7,
        curlStrength: 0.9,
        riseSpeed: 0.8,
        trackingMode: "right_end" as const,
      },
    };
    const out = migrateEffectsConfig(v10);
    expect(out.smoke.palette).toBe("genie");
    expect(out.smoke.motionEmission).toBe(1.0);
    expect(out.smoke.curlStrength).toBe(0.9);
    expect(out.smoke.riseSpeed).toBe(0.8);
    expect(out.smoke.trackingMode).toBe("right_end");
  });

  it("v10 → v11 migration does not touch tipEffectMap entries", () => {
    const v10 = {
      version: 10,
      tipEffectMap: {
        "*": { effect: "petals" },
        "0-0": { effect: "bubbles" },
      },
    };
    const out = migrateEffectsConfig(v10);
    expect(out.tipEffectMap["*"]?.effect).toBe("petals");
    expect(out.tipEffectMap["0-0"]?.effect).toBe("bubbles");
  });

  it("migrates v11 → v12 by seeding default ink intent", () => {
    const v11 = {
      version: 11,
      // No ink block - must seed from defaults.
    };
    const out = migrateEffectsConfig(v11);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.ink).toEqual(DEFAULT_EFFECTS_CONFIG.ink);
    expect(out.activePresets.ink).toBe(null);
  });

  it("preserves existing ink values through v11 → v12 merge", () => {
    const v11 = {
      version: 11,
      ink: {
        palette: "neon" as const,
        customColor: "#ff2080",
        ambientEmission: 0.1,
        motionEmission: 1.0,
        intensity: 0.9,
        viscosity: 0.2,
        splatterIntensity: 0.4,
        trackingMode: "right_end" as const,
      },
    };
    const out = migrateEffectsConfig(v11);
    expect(out.ink.palette).toBe("neon");
    expect(out.ink.motionEmission).toBe(1.0);
    expect(out.ink.viscosity).toBe(0.2);
    expect(out.ink.trackingMode).toBe("right_end");
  });

  it("v11 → v12 migration does not touch tipEffectMap entries", () => {
    const v11 = {
      version: 11,
      tipEffectMap: {
        "*": { effect: "smoke" },
        "0-0": { effect: "petals" },
      },
    };
    const out = migrateEffectsConfig(v11);
    expect(out.tipEffectMap["*"]?.effect).toBe("smoke");
    expect(out.tipEffectMap["0-0"]?.effect).toBe("petals");
  });

  it("migrates pre-v16 led.brightness 5 (stale old default) to 3", () => {
    const v15 = {
      version: 15,
      led: {
        brightness: 5,
        patternId: "rainbow",
        patternSpeed: 2.0,
        primaryColor: "#ff0000",
        secondaryColor: "#00ff00",
        colorMode: "unified" as const,
      },
    };
    const out = migrateEffectsConfig(v15);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    // v16 remapped the stale 5 to 3; v36 then carried it into look.brightness.
    expect(out.led.look.brightness).toBe(3);
    // The spectrum pattern family became a 200-LED pixel staff.
    expect(out.led.device).toEqual({ kind: "pixel-staff", ledCount: 200 });
    expect(out.led.pattern).toMatchObject({
      source: "generator",
      generatorId: "rainbow-sweep",
    });
  });

  it("preserves a deliberate pre-v16 led.brightness 1-4", () => {
    const v15 = {
      version: 15,
      led: {
        brightness: 2,
        patternId: "solid",
        patternSpeed: 1.0,
        primaryColor: "#00ff88",
        secondaryColor: "#ffffff",
        colorMode: "unified" as const,
      },
    };
    const out = migrateEffectsConfig(v15);
    expect(out.led.look.brightness).toBe(2);
  });

  it("preserves a deliberate post-v16 led.brightness 5", () => {
    const current = {
      version: 16,
      led: {
        brightness: 5,
        patternId: "solid",
        patternSpeed: 1.0,
        primaryColor: "#00ff88",
        secondaryColor: "#ffffff",
        colorMode: "unified" as const,
      },
    };
    const out = migrateEffectsConfig(current);
    expect(out.led.look.brightness).toBe(5);
  });

  it("migrates pre-v17 bloom stale old defaults (intensity 0.95, colorMode solid)", () => {
    const v16 = {
      version: 16,
      bloom: {
        intensity: 0.95,
        radius: 90,
        color: "#f472b6",
        palette: ["#f472b6", "#fbbf24", "#22d3ee"],
        colorMode: "solid" as const,
        falloff: "smooth" as const,
        pulse: 0,
        pulseRate: 1,
      },
    };
    const out = migrateEffectsConfig(v16);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.bloom.intensity).toBe(0.6);
    expect(out.bloom.colorMode).toBe("prop-matched");
    // Lens-bloom fields fill from defaults via the merge.
    expect(out.bloom.streak).toBeGreaterThan(0);
    expect(out.bloom.afterglow).toBeGreaterThan(0);
  });

  it("preserves a deliberate pre-v17 bloom (non-default intensity + non-solid mode)", () => {
    const v16 = {
      version: 16,
      bloom: {
        intensity: 0.8,
        radius: 90,
        color: "#f472b6",
        palette: ["#f472b6", "#fbbf24", "#22d3ee"],
        colorMode: "palette" as const,
        falloff: "smooth" as const,
        pulse: 0,
        pulseRate: 1,
      },
    };
    const out = migrateEffectsConfig(v16);
    expect(out.bloom.intensity).toBe(0.8);
    expect(out.bloom.colorMode).toBe("palette");
  });

  it("preserves a deliberate post-v17 bloom (intensity 0.95 / solid)", () => {
    const current = {
      version: EFFECTS_CONFIG_VERSION,
      bloom: {
        intensity: 0.95,
        radius: 90,
        color: "#f472b6",
        palette: ["#f472b6", "#fbbf24", "#22d3ee"],
        colorMode: "solid" as const,
        falloff: "smooth" as const,
        pulse: 0,
        pulseRate: 1,
        streak: 0.55,
        spikes: 0.6,
        afterglow: 0.5,
      },
    };
    const out = migrateEffectsConfig(current);
    expect(out.bloom.intensity).toBe(0.95);
    expect(out.bloom.colorMode).toBe("solid");
  });

  it("removes retired Aurora state from saved Bloom configurations", () => {
    const saved = {
      version: 34,
      bloom: {
        ...DEFAULT_EFFECTS_CONFIG.bloom,
        chromatic: 0.9,
      },
      activePresets: { bloom: "bloom-prism" },
    };
    const out = migrateEffectsConfig(saved);

    expect(out.activePresets.bloom).toBeNull();
    expect("chromatic" in out.bloom).toBe(false);
  });

  it("deep-merges a partial pulse block over defaults", () => {
    const v15 = {
      version: 15,
      pulse: { intensity: 0.9 },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = migrateEffectsConfig(v15 as any);
    expect(out.pulse.intensity).toBe(0.9);
    expect(out.pulse.trigger).toBe("beat");
    expect(out.pulse.palette).toBe("sonar");
  });

  describe("v39 → v40 Pulse solid tint", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const migrate = (pulse: Record<string, unknown>, activePresets: any = {}) =>
      migrateEffectsConfig({ version: 39, pulse, activePresets } as never);

    it("moves the untouched factory look to prop colors", () => {
      const out = migrate({ colorMode: "solid", palette: "sonar", color: "#38BDF8" });
      expect(out.pulse.colorMode).toBe("prop-matched");
      expect("color" in out.pulse).toBe(false);
    });

    it("keeps a tint someone picked as the custom shade", () => {
      const out = migrate({ colorMode: "solid", palette: "ember", color: "#ff00aa" });
      expect(out.pulse.colorMode).toBe("solid");
      expect(out.pulse.palette).toBe("custom");
      expect(out.pulse.customColor).toBe("#ff00aa");
      expect("color" in out.pulse).toBe(false);
    });

    it("keeps a chosen palette or look solid", () => {
      expect(migrate({ colorMode: "solid", palette: "ember", color: "#38bdf8" }).pulse).toMatchObject({
        colorMode: "solid",
        palette: "ember",
      });
      const look = migrate(
        { colorMode: "solid", palette: "sonar", color: "#38bdf8" },
        { pulse: "pulse-sonar" },
      );
      expect(look.pulse.colorMode).toBe("solid");
    });

    it("treats a block without a color mode as the old solid default", () => {
      const out = migrate({ palette: "void", color: "#38bdf8" });
      expect(out.pulse.colorMode).toBe("solid");
      expect(out.pulse.palette).toBe("void");
    });

    it("leaves other color modes alone", () => {
      const out = migrate({ colorMode: "rainbow", palette: "sonar", color: "#ff00aa" });
      expect(out.pulse.colorMode).toBe("rainbow");
      expect(out.pulse.palette).toBe("sonar");
      expect("color" in out.pulse).toBe(false);
    });
  });

  it("migrates v21 → v22 by seeding fire.brightness default", () => {
    const v21 = {
      version: 21,
      fire: {
        intensity: 0.7,
        colorBlend: 0.5,
        turbulence: 0.5,
        colorCurve: null,
        propColors: null,
        customColors: null,
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = migrateEffectsConfig(v21 as any);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    // brightness is a net-new field, seeded from the current default (0.5,
    // tamed-woodfire — see defaults.ts fire).
    expect(out.fire.brightness).toBe(0.5);
    // The rest of the user's fire settings survive the merge.
    expect(out.fire.intensity).toBe(0.7);
    expect(out.fire.turbulence).toBe(0.5);
  });

  it("preserves a deliberate fire.brightness through the merge", () => {
    const current = {
      version: EFFECTS_CONFIG_VERSION,
      fire: {
        intensity: 0.7,
        brightness: 0.35,
        colorBlend: 0.5,
        turbulence: 0.5,
        colorCurve: null,
        propColors: null,
        customColors: null,
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = migrateEffectsConfig(current as any);
    expect(out.fire.brightness).toBe(0.35);
  });

  it("migrates saved Fire settings to the natural style", () => {
    const v32 = {
      version: 32,
      fire: {
        intensity: 0.82,
        brightness: 0.6,
        colorBlend: 0,
        turbulence: 0.7,
        colorCurve: null,
        propColors: null,
        customColors: null,
      },
    };
    const out = migrateEffectsConfig(v32);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.fire.renderingStyle).toBe("natural");
    expect(out.fire.intensity).toBe(0.82);
  });

  it("preserves a saved Liquid Fire style", () => {
    const current = {
      ...DEFAULT_EFFECTS_CONFIG,
      fire: {
        ...DEFAULT_EFFECTS_CONFIG.fire,
        renderingStyle: "liquid" as const,
      },
    };
    expect(migrateEffectsConfig(current).fire.renderingStyle).toBe("liquid");
  });

  it("migrates Bloom to an independent live core and retires Ring", () => {
    const v33 = {
      ...DEFAULT_EFFECTS_CONFIG,
      version: 33,
      bloom: {
        ...DEFAULT_EFFECTS_CONFIG.bloom,
        coreStrength: undefined,
        falloff: "ring" as const,
      },
    };

    const out = migrateEffectsConfig(v33);
    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.bloom.coreStrength).toBe(
      DEFAULT_EFFECTS_CONFIG.bloom.coreStrength
    );
    expect(out.bloom.falloff).toBe("smooth");
  });

  it("preserves a deliberate Bloom core strength", () => {
    const current = {
      ...DEFAULT_EFFECTS_CONFIG,
      bloom: {
        ...DEFAULT_EFFECTS_CONFIG.bloom,
        coreStrength: 0.82,
      },
    };

    expect(migrateEffectsConfig(current).bloom.coreStrength).toBe(0.82);
  });

  it("restores literal blue/red trail colors and drops ghost colors from v37", () => {
    const out = migrateEffectsConfig({
      version: 37,
      trails: { blueColor: "#112233", redColor: "#445566" },
      ghost: { blueColor: "#778899", redColor: "#aabbcc" },
    });

    expect(out.version).toBe(EFFECTS_CONFIG_VERSION);
    expect(out.trails).toMatchObject({
      leftColor: "#112233",
      rightColor: "#445566",
    });
    expect(out.trails).not.toHaveProperty("blueColor");
    expect(out.ghost).not.toHaveProperty("leftColor");
    expect(out.ghost).not.toHaveProperty("rightColor");
    expect(out.ghost).not.toHaveProperty("redColor");
  });
});
