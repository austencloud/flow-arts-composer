import { describe, it, expect, vi } from "vitest";

// Same light stub as prop-type-manager.triangle-grip.test.ts.
vi.mock("../svg-generator", () => ({
  getBaseMotionColors: () => ({ left: "#1111ff", right: "#ff1111" }),
}));

import { PropTypeManager } from "../prop-type-manager";

/**
 * An export loads its prop textures once, before the first frame, and the
 * per-frame props.fanAppearance arrives too late to change them. A clip that
 * asks for the Sense Fan while the viewer's own setting is the fire fan must
 * still load the Sense art, for the base pair and every tunnel copy.
 */

function makeState() {
  let left = "fan";
  let right = "fan";
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

describe("PropTypeManager export fan build", () => {
  it("loads the pinned build, not the viewer's, for the pair and the tunnel", async () => {
    const propTextureService = {
      state: {
        leftDimensions: { width: 200, height: 200 },
        rightDimensions: { width: 200, height: 200 },
      },
      loadPropTextures: vi.fn().mockResolvedValue(undefined),
    };
    const renderer = {
      loadAdditionalLayerPropTextures: vi.fn().mockResolvedValue(undefined),
    };
    const ptm = new PropTypeManager();
    ptm.wire({
      settingsService: {
        currentSettings: {
          propType: "fan",
          leftPropType: "fan",
          rightPropType: "fan",
          fanAppearance: { build: "fire", frameColor: "black", cover: "bare" },
        },
      } as any,
      propTextureService: propTextureService as any,
      trailCapturer: null,
      renderLoopService: null,
      precomputationService: null,
      propTypeChangeService: null,
      fireTipTracker: null,
      animationRenderer: renderer as any,
    });
    ptm.propTypeOverrideLeft = "fan";
    ptm.propTypeOverrideRight = "fan";
    ptm.pinFanAppearance({
      build: "sense",
      frameColor: "black",
      cover: "bare",
    });

    await ptm.loadPropTextures(makeState(), true, null, true);
    await ptm.preloadAdditionalLayerTextures(1, false, "fan");

    expect(propTextureService.loadPropTextures).toHaveBeenCalledWith(
      "fan__sense",
      "fan__sense",
      true,
      null
    );
    expect(renderer.loadAdditionalLayerPropTextures).toHaveBeenCalledWith(
      0,
      "fan__sense",
      "fan__sense",
      expect.any(String),
      expect.any(String)
    );
  });
});
