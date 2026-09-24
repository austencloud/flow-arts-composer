import { describe, expect, it } from "vitest";
import {
  computeFireEmissionMultiplier,
  computeFireCoolingRate,
  computeFireStepDissipation,
  computeFireTemperatureDissipation,
  computeFireVisualCacheKey,
  computeFirePresentationResolution,
  shouldUseMacCormackScalars,
} from "$lib/shared/animation-engine/services/fire/web-gl-fire-renderer";
import {
  computeFireFrameCacheCapacity,
  hasReachedFireFrameCacheCapacity,
  canPromoteFireFrameRecording,
  FireFrameCache,
} from "$lib/shared/animation-engine/services/fire/fire-frame-cache";
import { DEFAULT_FIRE_CONFIG } from "$lib/shared/animation-engine/domain/types/fire-types";
import {
  BLOOM_COMPOSITE_FRAG,
  DISPLAY_FRAG,
  PROP_VISIBILITY_MATTE_FRAG,
} from "$lib/shared/animation-engine/services/fire/fluid-shader-sources";
import { computeFirePropVisibilityScale } from "$lib/shared/animation-engine/services/fire/fire-prop-visibility";

describe("2D fire quality controls", () => {
  it("reconstructs HDR fire above the simulation grid without unbounded targets", () => {
    expect(computeFirePresentationResolution(840, 840)).toEqual([896, 896]);
    expect(computeFirePresentationResolution(1900, 1900)).toEqual([1024, 1024]);
    expect(computeFirePresentationResolution(950, 475)).toEqual([960, 512]);
    expect(computeFirePresentationResolution(950, 950, 128)).toEqual([
      512, 512,
    ]);
    expect(computeFirePresentationResolution(950, 950, 128, "legacy")).toEqual([
      128, 128,
    ]);
  });

  it("normalizes dissipation to elapsed time instead of frame count", () => {
    expect(computeFireStepDissipation(0.95, 1 / 60)).toBeCloseTo(0.95, 8);
    expect(computeFireStepDissipation(0.95, 1 / 120)).toBeCloseTo(
      Math.sqrt(0.95),
      8
    );
    expect(computeFireStepDissipation(0.95, 2 / 60)).toBeCloseTo(0.95 ** 2, 8);
  });

  it("maps the semantic brightness midpoint to legacy emission", () => {
    expect(computeFireEmissionMultiplier(0.5)).toBeCloseTo(1, 8);
    expect(computeFireEmissionMultiplier(0)).toBeCloseTo(0.35, 8);
    expect(computeFireEmissionMultiplier(1)).toBeCloseTo(1.65, 8);
    expect(computeFireEmissionMultiplier(99)).toBeCloseTo(1.65, 8);
  });

  it("keeps corrected scalar transport adaptive and preserves the legacy profile", () => {
    expect(shouldUseMacCormackScalars(undefined, 1)).toBe(true);
    expect(shouldUseMacCormackScalars("cinematic", 4)).toBe(true);
    expect(shouldUseMacCormackScalars("cinematic", 5)).toBe(false);
    expect(shouldUseMacCormackScalars("legacy", 1)).toBe(false);
  });

  it("lets cinematic heat form a wake without changing Liquid Fire's decay", () => {
    expect(computeFireTemperatureDissipation(0.93, "legacy")).toBe(0.93);
    expect(computeFireTemperatureDissipation(0.93, "cinematic")).toBe(0.972);
    expect(computeFireTemperatureDissipation(0.99, "cinematic")).toBe(0.99);
    expect(computeFireCoolingRate(4, false)).toBe(4);
    expect(computeFireCoolingRate(4, true)).toBe(1.6);
  });

  it("keeps the transported white-hot interior narrower than the orange body", () => {
    const transportedCoreIndex = DISPLAY_FRAG.indexOf("float transportedCore");
    const coreIndex = DISPLAY_FRAG.indexOf("float whiteCore");
    expect(transportedCoreIndex).toBeGreaterThan(-1);
    expect(coreIndex).toBeGreaterThan(transportedCoreIndex);
    expect(DISPLAY_FRAG).toContain(
      "float colorHeat = u_useReaction > 0.5 ? fireIntensity * 1.18"
    );
    expect(DISPLAY_FRAG).toContain(
      "float hotVolume = smoothstep(1.15, 2.8, fireIntensity)"
    );
    expect(
      DISPLAY_FRAG.indexOf(
        "hotVolume * hotVolume * hotVolume",
        transportedCoreIndex
      )
    ).toBeGreaterThan(transportedCoreIndex);
    expect(
      DISPLAY_FRAG.indexOf("deepInterior * deepInterior", transportedCoreIndex)
    ).toBeGreaterThan(transportedCoreIndex);
    expect(
      DISPLAY_FRAG.indexOf("coreTint * whiteCore * 2.3", coreIndex)
    ).toBeGreaterThan(coreIndex);
    expect(DISPLAY_FRAG.indexOf("fragColor", coreIndex)).toBeGreaterThan(
      coreIndex
    );
  });

  it("retains a dense, field-advected ember envelope around the hot core", () => {
    const envelopeIndex = DISPLAY_FRAG.indexOf("float emberEnvelope");
    expect(envelopeIndex).toBeGreaterThan(-1);
    expect(
      DISPLAY_FRAG.indexOf("transportedDetail", envelopeIndex)
    ).toBeGreaterThan(envelopeIndex);
    expect(DISPLAY_FRAG).toContain("float opticalAlpha = 1.0 - exp(");
    expect(DISPLAY_FRAG).toContain(
      "trailAlpha = max(trailAlpha, opticalAlpha)"
    );
    expect(DISPLAY_FRAG).toContain("float edgeDensity");
    expect(DISPLAY_FRAG).toContain("opticalAlpha *= edgeDensity");
    expect(DISPLAY_FRAG).not.toContain(
      "trailAlpha *= mix(0.58, 0.76, thermalBoundary)"
    );
  });

  it("limits independent wick geometry to Liquid Fire", () => {
    const wickLayer = DISPLAY_FRAG.slice(
      DISPLAY_FRAG.indexOf("// --- Layer 2: Liquid Fire wick cores ---")
    );

    expect(wickLayer).toContain("if (u_useReaction < 0.5) {");
    expect(wickLayer).toContain(
      "// Liquid Fire keeps the original circular source presentation intact."
    );
    expect(wickLayer).not.toContain("vec4 tipShape");
    expect(wickLayer).not.toContain("float tongueLength");
    expect(wickLayer).not.toContain("float flameCore");
  });

  it("keeps Natural Fire's bright center inside transported heat", () => {
    const coreIndex = DISPLAY_FRAG.indexOf("float whiteCore = transportedCore;");
    const liquidIndex = DISPLAY_FRAG.indexOf(
      "// --- Layer 2: Liquid Fire wick cores ---"
    );

    expect(coreIndex).toBeGreaterThan(-1);
    expect(coreIndex).toBeLessThan(liquidIndex);
    expect(DISPLAY_FRAG).not.toContain("ignitionCore");
    expect(DISPLAY_FRAG).not.toContain("u_tipShapes");
  });

  it("protects prop readability only when foreground fire becomes dense", () => {
    expect(computeFirePropVisibilityScale(0.5, 0.3, 1, 0)).toBe(1);
    expect(computeFirePropVisibilityScale(1, 2, 0, 0)).toBe(1);
    expect(computeFirePropVisibilityScale(1, 2, 1, 0)).toBeCloseTo(0.46, 8);
    expect(computeFirePropVisibilityScale(1, 2, 1, 1)).toBeGreaterThan(0.84);
  });

  it("composites dense fire against the exact painted prop silhouette", () => {
    expect(PROP_VISIBILITY_MATTE_FRAG).toContain(
      "texture(u_propSprite, vec2(spriteUv.x, 1.0 - spriteUv.y))"
    );
    expect(PROP_VISIBILITY_MATTE_FRAG).toContain(
      "fragColor = vec4(sprite.rgb * matte, matte)"
    );
    expect(PROP_VISIBILITY_MATTE_FRAG).toContain("if (u_flipped > 0.5)");
    expect(BLOOM_COMPOSITE_FRAG).toContain(
      "vec4 propVisibility = texture(u_propVisibilityMatte, v_uv)"
    );
    expect(BLOOM_COMPOSITE_FRAG).toContain(
      "float propVisibilityScale = mix(1.0, capScale, protection)"
    );
    expect(BLOOM_COMPOSITE_FRAG).toContain("1.0 - tipFreedom * 0.72");
    expect(BLOOM_COMPOSITE_FRAG).toContain("combined *= propVisibilityScale");
    expect(BLOOM_COMPOSITE_FRAG).toContain(
      "mapped = mix(mapped, heatedPropColor, propHeatBlend)"
    );
  });
});

describe("2D fire frame-cache budget", () => {
  function recordingCache(frameTimes: number[]): FireFrameCache {
    // This test deliberately enters the cache at its recording boundary: no
    // WebGL rendering is needed to verify whether an incomplete loop can ever
    // become reusable playback.
    return Object.assign(Object.create(FireFrameCache.prototype), {
      gl: { deleteFramebuffer() {}, deleteTexture() {} },
      state: "recording",
      frames: [],
      frameTimes,
      frameIndex: frameTimes.length,
      totalFrames: frameTimes.length,
      texturePool: [],
      texturePoolSize: 0,
      recordingFBO: null,
      recordingTexture: null,
      copyFBO: null,
      maxFrames: 127,
      loopDuration: 0,
      configHash: "fire",
    }) as FireFrameCache;
  }

  it("reserves the recording target and caps HDR frame allocation", () => {
    const budget = 64 * 1024 * 1024;
    expect(computeFireFrameCacheCapacity(128, 128, budget)).toBe(511);
    expect(computeFireFrameCacheCapacity(192, 192, budget)).toBe(226);
    expect(computeFireFrameCacheCapacity(256, 256, budget)).toBe(127);
  });

  it("bypasses recording at the exact capacity boundary", () => {
    expect(hasReachedFireFrameCacheCapacity(126, 127)).toBe(false);
    expect(hasReachedFireFrameCacheCapacity(127, 127)).toBe(true);
    expect(hasReachedFireFrameCacheCapacity(0, 0)).toBe(true);
  });

  it("only promotes a recording when an actual boundary follows its final frame", () => {
    expect(canPromoteFireFrameRecording([0, 0.0167, 3.9833], 4)).toBe(true);
    // The observed gap-created fragment has no early phase sample, so it
    // cannot become playback even if a later real boundary occurs.
    expect(
      canPromoteFireFrameRecording([2.816, 3, 3.983], 4)
    ).toBe(false);
    expect(canPromoteFireFrameRecording([0, 16.7], 16.7)).toBe(false);
    expect(canPromoteFireFrameRecording([0, 2, 1], 4)).toBe(false);
  });

  it("drops a partial recording at the loop boundary instead of warming it", () => {
    const partial = recordingCache([2.816, 3, 3.983]);
    partial.onLoopDetected(4);
    expect(partial.isWarm()).toBe(false);
    expect(partial.isRecording()).toBe(false);

    const complete = recordingCache([0.016, 2, 3.983]);
    complete.onLoopDetected(4);
    expect(complete.isWarm()).toBe(true);
  });

  it("invalidates when every renderer-visible control changes", () => {
    const base = {
      ...DEFAULT_FIRE_CONFIG,
      brightness: 0.5,
      colorBlend: 0,
      turbulence: 0.5,
      bloomStrength: 0.08,
    };
    const input = {
      playbackSpeed: 1,
      sequenceContentHash: "sequence-a",
      propColors: [{ r: 1, g: 0.25, b: 0.1 }],
    };
    const key = computeFireVisualCacheKey(base, input);

    expect(
      computeFireVisualCacheKey({ ...base, brightness: 0.7 }, input)
    ).not.toBe(key);
    expect(
      computeFireVisualCacheKey({ ...base, turbulence: 0.7 }, input)
    ).not.toBe(key);
    expect(
      computeFireVisualCacheKey({ ...base, bloomStrength: 0.12 }, input)
    ).not.toBe(key);
    expect(
      computeFireVisualCacheKey(base, {
        ...input,
        propColors: [{ r: 0.1, g: 0.25, b: 1 }],
      })
    ).not.toBe(key);
  });
});
