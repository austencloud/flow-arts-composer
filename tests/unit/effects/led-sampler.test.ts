import { describe, expect, it } from "vitest";
import {
  LedSampler,
  patternFrameIndex,
  type LedSamplerConfig,
} from "$lib/shared/animation-engine/services/led-sampler";
import {
  DEFAULT_LED_CONFIG,
  LED_BRIGHTNESS_LEVELS,
  PATTERN_MATERIALIZE_BRIGHTNESS,
  type LedOverlayConfig,
} from "$lib/shared/animation-engine/domain/types/led-types";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";

const SAMPLER_CONFIG: LedSamplerConfig = {
  canvasSize: 950,
  leftPropDimensions: { width: 252.8, height: 77.8 },
  rightPropDimensions: { width: 252.8, height: 77.8 },
  leftPropType: "staff",
  rightPropType: "staff",
};

function prop(angle: number): PropState {
  return {
    centerPathAngle: angle,
    staffRotationAngle: angle,
  } as PropState;
}

/** The sampler skips its warmup frames before it emits anything. */
function warmedSampler(imageLoader?: ConstructorParameters<typeof LedSampler>[0]) {
  const sampler = new LedSampler(imageLoader);
  for (let i = 0; i < 3; i++) {
    sampler.update(prop(0), prop(Math.PI), SAMPLER_CONFIG, 0, DEFAULT_LED_CONFIG);
  }
  return sampler;
}

function config(patch: Partial<LedOverlayConfig>): LedOverlayConfig {
  return { ...structuredClone(DEFAULT_LED_CONFIG), enabled: true, ...patch };
}

function solidWhite(brightnessLevel = 5): LedOverlayConfig {
  return config({
    pattern: {
      source: "generator",
      generatorId: "solid",
      params: {
        primaryColor: { r: 255, g: 255, b: 255 },
        speed: 1,
        brightness: PATTERN_MATERIALIZE_BRIGHTNESS,
      },
    },
    look: { ...DEFAULT_LED_CONFIG.look, brightness: brightnessLevel },
  });
}

describe("patternFrameIndex", () => {
  it("walks the loop once per cycle duration", () => {
    expect(patternFrameIndex(0, 3, 180)).toBe(0);
    expect(patternFrameIndex(1500, 3, 180)).toBe(90);
    // A full cycle wraps back to the start rather than running off the end.
    expect(patternFrameIndex(3000, 3, 180)).toBe(0);
  });

  it("never returns an out-of-range frame", () => {
    expect(patternFrameIndex(2999.999, 3, 180)).toBeLessThan(180);
    expect(patternFrameIndex(-500, 3, 180)).toBeGreaterThanOrEqual(0);
    expect(patternFrameIndex(1000, 3, 0)).toBe(0);
  });
});

describe("LedSampler device handling", () => {
  it("emits two LEDs per prop for a capsule", () => {
    const leds = warmedSampler().update(
      prop(0),
      prop(Math.PI),
      SAMPLER_CONFIG,
      0,
      solidWhite()
    );

    expect(leds).toHaveLength(4);
    expect(leds.map((led) => led.propIndex)).toEqual([0, 0, 1, 1]);
    expect(leds.map((led) => led.ledIndex)).toEqual([0, 1, 0, 1]);
  });

  it("spans a pixel staff between the same two tracked endpoints", () => {
    const sampler = warmedSampler();
    const capsule = sampler
      .update(prop(0.4), null, SAMPLER_CONFIG, 0, solidWhite())
      .map((led) => ({ x: led.x, y: led.y }));

    const staff = sampler.update(
      prop(0.4),
      null,
      SAMPLER_CONFIG,
      0,
      config({
        ...solidWhite(),
        device: { kind: "pixel-staff", ledCount: 32 },
      })
    );

    expect(staff).toHaveLength(32);
    // Endpoints coincide with the capsule's two LEDs; the rest interpolate.
    expect(staff[0]!.x).toBeCloseTo(capsule[0]!.x, 6);
    expect(staff[0]!.y).toBeCloseTo(capsule[0]!.y, 6);
    expect(staff[31]!.x).toBeCloseTo(capsule[1]!.x, 6);
    expect(staff[31]!.y).toBeCloseTo(capsule[1]!.y, 6);

    const mid = staff[15]!;
    expect(mid.x).toBeGreaterThan(Math.min(staff[0]!.x, staff[31]!.x));
    expect(mid.x).toBeLessThan(Math.max(staff[0]!.x, staff[31]!.x));
  });

  it("keeps tip-effect assignment resolvable by mapping each LED to a shaft end", () => {
    const leds = warmedSampler().update(
      prop(0),
      null,
      SAMPLER_CONFIG,
      0,
      config({
        ...solidWhite(),
        device: { kind: "pixel-staff", ledCount: 32 },
      })
    );

    expect(new Set(leds.map((led) => led.endpointIndex))).toEqual(new Set([0, 1]));
    expect(leds[0]!.endpointIndex).toBe(0);
    expect(leds[31]!.endpointIndex).toBe(1);
  });
});

describe("LedSampler color", () => {
  it("colors both ends of each hand from its own Prop Colors slot", () => {
    const leds = warmedSampler().update(
      prop(0),
      prop(Math.PI),
      SAMPLER_CONFIG,
      0,
      DEFAULT_LED_CONFIG
    );

    expect(
      leds.map(({ r, g, b }) => [r, g, b].map((v) => Math.round(v * 255)))
    ).toEqual([
      [33, 150, 243],
      [33, 150, 243],
      [244, 67, 54],
      [244, 67, 54],
    ]);
  });

  it("uses chosen prop colors for both ends of their respective hands", () => {
    const leds = warmedSampler().update(
      prop(0),
      prop(Math.PI),
      { ...SAMPLER_CONFIG, primaryPropColors: { left: "#12ab34", right: "#ef5678" } },
      0,
      DEFAULT_LED_CONFIG
    );

    expect(
      leds.map(({ r, g, b }) => [r, g, b].map((v) => Math.round(v * 255)))
    ).toEqual([
      [18, 171, 52],
      [18, 171, 52],
      [239, 86, 120],
      [239, 86, 120],
    ]);
  });

  it("keeps an entire pixel staff in its hand's chosen color", () => {
    const leds = warmedSampler().update(
      prop(0),
      prop(Math.PI),
      { ...SAMPLER_CONFIG, primaryPropColors: { left: "#00ff00", right: "#ff00ff" } },
      0,
      config({ device: { kind: "pixel-staff", ledCount: 32 } })
    );

    expect(leds).toHaveLength(64);
    expect(leds.slice(0, 32).every(({ r, g, b }) => r === 0 && g === 1 && b === 0)).toBe(true);
    expect(leds.slice(32).every(({ r, g, b }) => r === 1 && g === 0 && b === 1)).toBe(true);
  });

  it("emits the pattern color unscaled, whatever the brightness level", () => {
    // Brightness is a flux term the renderer applies once, to prop flux. The
    // sampler applying it too squared it, so a level-5 strip came out 25x.
    const sampler = warmedSampler();

    const full = sampler.update(prop(0), null, SAMPLER_CONFIG, 0, solidWhite(5));
    expect(full[0]!.r).toBeCloseTo(1, 5);

    const dim = sampler.update(prop(0), null, SAMPLER_CONFIG, 0, solidWhite(1));
    expect(dim[0]!.r).toBeCloseTo(1, 5);
  });

  it("leaves LedSample.brightness at 1 so the renderer never re-applies the level", () => {
    const leds = warmedSampler().update(
      prop(0),
      null,
      SAMPLER_CONFIG,
      0,
      solidWhite(2)
    );
    expect(leds.every((led) => led.brightness === 1)).toBe(true);
  });

  it("falls back to prop-colors for an unknown generator id rather than going dark", () => {
    const leds = warmedSampler().update(
      prop(0),
      null,
      SAMPLER_CONFIG,
      0,
      config({
        pattern: {
          source: "generator",
          generatorId: "no-such-generator",
          params: {
            primaryColor: { r: 255, g: 0, b: 0 },
            speed: 1,
            brightness: PATTERN_MATERIALIZE_BRIGHTNESS,
          },
        },
      })
    );

    expect(leds.some((led) => led.r + led.g + led.b > 0)).toBe(true);
  });
});

describe("LedSampler image source", () => {
  const IMAGE_CONFIG = config({
    device: { kind: "pixel-staff", ledCount: 32 },
    pattern: { source: "image", libraryEntryId: "entry-1" },
    look: { ...DEFAULT_LED_CONFIG.look, brightness: 5 },
  });

  function whiteImage(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    return { width, height, data, colorSpace: "srgb" } as ImageData;
  }

  it("renders black until the image resolves, then takes its colors", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loader = async (id: string): Promise<ImageData | null> => {
      expect(id).toBe("entry-1");
      await gate;
      return whiteImage(8, 8);
    };

    const sampler = warmedSampler(loader);

    const before = sampler.update(prop(0), null, SAMPLER_CONFIG, 0, IMAGE_CONFIG);
    expect(before).toHaveLength(32);
    expect(before.every((led) => led.r === 0 && led.g === 0 && led.b === 0)).toBe(
      true
    );

    release!();
    await gate;
    // Let the materializer's own continuation run.
    await Promise.resolve();
    await Promise.resolve();

    const after = sampler.update(prop(0), null, SAMPLER_CONFIG, 0, IMAGE_CONFIG);
    expect(after).toHaveLength(32);
    expect(after.every((led) => led.r > 0 && led.g > 0 && led.b > 0)).toBe(true);
  });

  it("stays black when the image cannot be loaded", async () => {
    const sampler = warmedSampler(async () => null);

    sampler.update(prop(0), null, SAMPLER_CONFIG, 0, IMAGE_CONFIG);
    await Promise.resolve();
    await Promise.resolve();

    const leds = sampler.update(prop(0), null, SAMPLER_CONFIG, 0, IMAGE_CONFIG);
    expect(leds.every((led) => led.r === 0 && led.g === 0 && led.b === 0)).toBe(
      true
    );
  });
});
