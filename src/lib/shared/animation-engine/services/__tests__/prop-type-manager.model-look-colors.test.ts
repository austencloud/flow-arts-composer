import { describe, it, expect, vi } from "vitest";

// getBaseMotionColors pulls the SVG generator chain; stub it to keep the
// import light, same as prop-type-manager.triangle-grip.test.ts.
vi.mock("../svg-generator", () => ({
  getBaseMotionColors: () => ({ left: "#1111ff", right: "#ff1111" }),
}));

import { PropTypeManager } from "../prop-type-manager";

/**
 * The 3D model look is one setting for every 2D surface. Pictographs paint
 * the model capture in the viewer's chosen colors, so the animator must too:
 * custom colors are no reason to fall back to the notation artwork, and a
 * tunnel copy must wear the same look as the pair it copies.
 */

const CUSTOM = { left: "#5c6402", right: "#ed1c24" };

function makeState(initialLeft: string, initialRight: string) {
  let left = initialLeft;
  let right = initialRight;
  return {
    get currentLeftPropType() {
      return left;
    },
    get currentRightPropType() {
      return right;
    },
    setLeftPropType: (v: string) => {
      left = v;
    },
    setRightPropType: (v: string) => {
      right = v;
    },
    setLegacyPropType: () => {},
    setLeftPropDimensions: () => {},
    setRightPropDimensions: () => {},
    isInitialized: true,
  } as any;
}

function makeManager() {
  const renderer = {
    prepareLeftPropCrossfade: vi.fn(),
    prepareRightPropCrossfade: vi.fn(),
    startLeftPropCrossfade: vi.fn(),
    startRightPropCrossfade: vi.fn(),
    loadAdditionalLayerPropTextures: vi.fn().mockResolvedValue(undefined),
  };
  const propTextureService = {
    state: {
      leftDimensions: { width: 262.6, height: 135.9 },
      rightDimensions: { width: 262.6, height: 135.9 },
    },
    loadPropTextures: vi.fn().mockResolvedValue(undefined),
  };
  const ptm = new PropTypeManager();
  ptm.wire({
    settingsService: {
      currentSettings: { propArtwork: "model", primaryPropColors: CUSTOM },
    } as any,
    propTextureService: propTextureService as any,
    trailCapturer: null,
    renderLoopService: null,
    precomputationService: null,
    propTypeChangeService: null,
    fireTipTracker: null,
    animationRenderer: renderer as any,
  });
  return { ptm, renderer, propTextureService };
}

const getFrameParams = () => ({}) as never;

describe("PropTypeManager model look with chosen colors", () => {
  it.each(["primaryPropColors", "tunnelPropColors"] as const)(
    "keeps the model capture when %s are set",
    async (colorSource) => {
      const { ptm, propTextureService } = makeManager();

      ptm.handleOverrides(
        {
          leftPropType: "buugeng",
          rightPropType: "buugeng",
          [colorSource]: CUSTOM,
        } as any,
        makeState("staff", "staff"),
        getFrameParams,
        true
      );

      await vi.waitFor(() =>
        expect(propTextureService.loadPropTextures).toHaveBeenCalled()
      );
      expect(propTextureService.loadPropTextures).toHaveBeenLastCalledWith(
        "buugeng__model",
        "buugeng__model",
        true,
        CUSTOM
      );
    }
  );

  it("boots in the model look when the override lands before settings", async () => {
    // Canvas boot order: the first update registers the override before the
    // services load, then the first texture load runs before wire().
    const ptm = new PropTypeManager();
    const state = makeState("staff", "staff");
    ptm.handleOverrides(
      { leftPropType: "buugeng", rightPropType: "buugeng" } as any,
      state,
      getFrameParams,
      true
    );

    const propTextureService = {
      state: {
        leftDimensions: { width: 262.6, height: 135.9 },
        rightDimensions: { width: 262.6, height: 135.9 },
      },
      loadPropTextures: vi.fn().mockResolvedValue(undefined),
    };
    ptm.updateRefs({
      settingsService: { currentSettings: { propArtwork: "model" } } as any,
      propTextureService: propTextureService as any,
    });
    await ptm.loadPropTextures(state, true);

    expect(propTextureService.loadPropTextures).toHaveBeenCalledWith(
      "buugeng__model",
      "buugeng__model",
      true,
      null
    );
  });

  it("draws tunnel copies in the same look as the base pair", async () => {
    const { ptm, renderer } = makeManager();
    (ptm as any).propLook = "model";

    ptm.handleAdditionalLayers(
      { additionalLayers: [{ leftProp: {}, rightProp: {} }] } as any,
      makeState("doublestar", "doublestar"),
      getFrameParams,
      true
    );

    await vi.waitFor(() =>
      expect(renderer.loadAdditionalLayerPropTextures).toHaveBeenCalled()
    );
    expect(renderer.loadAdditionalLayerPropTextures).toHaveBeenCalledWith(
      0,
      "doublestar__model",
      "doublestar__model",
      expect.any(String),
      expect.any(String)
    );
  });

  it("exports tunnel copies in the same look as the base pair", async () => {
    const { ptm, renderer } = makeManager();
    (ptm as any).propLook = "model";

    await ptm.preloadAdditionalLayerTextures(1, true, "doublestar");

    expect(renderer.loadAdditionalLayerPropTextures).toHaveBeenCalledWith(
      0,
      "doublestar__model",
      "doublestar__model",
      expect.any(String),
      expect.any(String)
    );
  });
});
