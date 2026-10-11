import { afterEach, describe, expect, it, vi } from "vitest";
import { QualityTierDetector } from "#lib/shared/3d/effects/quality/quality-tier-detector.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";

describe("QualityTierDetector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns HIGH for desktop-class capabilities", () => {
    const detector = new QualityTierDetector();
    const tier = detector.detectFromCapabilities({
      maxTextureUnits: 16,
      floatTextures: true,
      hardwareConcurrency: 12,
      isWebGPU: false,
    });
    expect(tier).toBe(QualityTier.HIGH);
  });

  it("returns MEDIUM for mid-range capabilities", () => {
    const detector = new QualityTierDetector();
    const tier = detector.detectFromCapabilities({
      maxTextureUnits: 8,
      floatTextures: true,
      hardwareConcurrency: 4,
      isWebGPU: false,
    });
    expect(tier).toBe(QualityTier.MEDIUM);
  });

  it("returns LOW for weak capabilities", () => {
    const detector = new QualityTierDetector();
    const tier = detector.detectFromCapabilities({
      maxTextureUnits: 4,
      floatTextures: false,
      hardwareConcurrency: 2,
      isWebGPU: false,
    });
    expect(tier).toBe(QualityTier.LOW);
  });

  it("uses renderer capabilities instead of blanket mobile downgrading", () => {
    vi.stubGlobal("navigator", {
      hardwareConcurrency: 8,
      userAgent: "Mozilla/5.0 (Linux; Android 16) Mobile",
    });

    const detector = new QualityTierDetector();
    const tier = detector.detectFromRenderer({
      capabilities: {
        maxTextures: 16,
      },
      extensions: {
        has: (extensionName: string) =>
          extensionName === "EXT_color_buffer_float",
      },
    });

    expect(tier).toBe(QualityTier.HIGH);
  });

  it("detects the worker viewer tier without retaining a main-thread context", () => {
    const loseContext = vi.fn();
    const getContext = vi.fn(() => ({
      MAX_TEXTURE_IMAGE_UNITS: 0x8872,
      getParameter: () => 16,
      getExtension: (name: string) =>
        name === "EXT_color_buffer_float"
          ? {}
          : name === "WEBGL_lose_context"
            ? { loseContext }
            : null,
    }));
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          readonly width: number,
          readonly height: number
        ) {}
        getContext = getContext;
      }
    );
    vi.stubGlobal("navigator", { hardwareConcurrency: 12 });

    const detector = new QualityTierDetector();
    expect(detector.detectFromBrowserCapabilities()).toBe(QualityTier.HIGH);
    expect(detector.detectFromBrowserCapabilities()).toBe(QualityTier.HIGH);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("allows manual override", () => {
    const detector = new QualityTierDetector();
    detector.setOverride(QualityTier.LOW);
    expect(detector.currentTier).toBe(QualityTier.LOW);
  });

  it("clears override to return detected tier", () => {
    const detector = new QualityTierDetector();
    detector.detectFromCapabilities({
      maxTextureUnits: 16,
      floatTextures: true,
      hardwareConcurrency: 12,
      isWebGPU: false,
    });
    detector.setOverride(QualityTier.LOW);
    detector.clearOverride();
    expect(detector.currentTier).toBe(QualityTier.HIGH);
  });
});
