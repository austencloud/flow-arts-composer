import { describe, expect, it, vi } from "vitest";

vi.mock("../svg-generator", () => ({
  getBaseMotionColors: () => ({ left: "#1111ff", right: "#ff1111" }),
}));

import { PropTypeManager } from "../prop-type-manager";

/**
 * Custom prop colors are a pictograph recolor. A viewer with them set who
 * picked the 3D model look saw the model tile selected while the canvas kept
 * drawing the recolored pictograph, because any base color pair forced the
 * pictograph artwork. Only exact tunnel colors, which every copy must match,
 * still need the recolorable artwork.
 */

const CUSTOM = { left: "#8b5cf6", right: "#3b82f6" };

function makeState(left = "doublestar", right = "doublestar") {
  let currentLeft = left;
  let currentRight = right;
  return {
    get currentLeftPropType() {
      return currentLeft;
    },
    get currentRightPropType() {
      return currentRight;
    },
    setLeftPropType: (value: string) => {
      currentLeft = value;
    },
    setRightPropType: (value: string) => {
      currentRight = value;
    },
    setLegacyPropType: () => {},
    setLeftPropDimensions: () => {},
    setRightPropDimensions: () => {},
    isInitialized: true,
  } as never;
}

function makeManager(propArtwork: "model" | "pictograph" = "model") {
  const loadPropTextures = vi.fn().mockResolvedValue(undefined);
  const manager = new PropTypeManager();
  manager.wire({
    settingsService: {
      currentSettings: {
        leftPropType: "doublestar",
        rightPropType: "doublestar",
        propArtwork,
      },
    } as never,
    propTextureService: {
      state: {
        leftDimensions: { width: 300, height: 150 },
        rightDimensions: { width: 300, height: 150 },
      },
      loadPropTextures,
    } as never,
    trailCapturer: null,
    renderLoopService: null,
    precomputationService: null,
    propTypeChangeService: null,
    fireTipTracker: null,
    animationRenderer: {
      prepareLeftPropCrossfade: vi.fn(),
      prepareRightPropCrossfade: vi.fn(),
      startLeftPropCrossfade: vi.fn(),
      startRightPropCrossfade: vi.fn(),
    } as never,
  });
  return { manager, loadPropTextures };
}

const frame = () => ({}) as never;

describe("3D model look with custom prop colors", () => {
  it("draws the model a host asks for even when custom prop colors are set", async () => {
    const { manager, loadPropTextures } = makeManager("pictograph");
    manager.handleOverrides(
      {
        leftPropType: "doublestar",
        rightPropType: "doublestar",
        propLook: "model",
        primaryPropColors: CUSTOM,
      } as never,
      makeState(),
      frame,
      true
    );
    await vi.waitFor(() => expect(loadPropTextures).toHaveBeenCalled());
    expect(loadPropTextures).toHaveBeenLastCalledWith(
      "doublestar__model",
      "doublestar__model",
      true,
      CUSTOM
    );
  });

  it("draws the model from settings when custom prop colors load the textures", async () => {
    const { manager, loadPropTextures } = makeManager("model");
    await manager.loadPropTextures(makeState(), true, CUSTOM);
    expect(loadPropTextures).toHaveBeenLastCalledWith(
      "doublestar__model",
      "doublestar__model",
      true,
      CUSTOM
    );
  });

  it("keeps the model after the custom colors reach the layer pass", async () => {
    const { manager, loadPropTextures } = makeManager("model");
    manager.handleAdditionalLayers(
      {
        leftProp: null,
        rightProp: null,
        additionalLayers: [],
        tunnelSpectrum: false,
        primaryPropColors: CUSTOM,
      } as never,
      makeState(),
      frame,
      true
    );
    await vi.waitFor(() => expect(loadPropTextures).toHaveBeenCalled());
    expect(loadPropTextures).toHaveBeenLastCalledWith(
      "doublestar__model",
      "doublestar__model",
      true,
      CUSTOM
    );
  });

  it("keeps the recolorable artwork for exact tunnel colors", async () => {
    const { manager, loadPropTextures } = makeManager("pictograph");
    manager.handleOverrides(
      {
        leftPropType: "doublestar",
        rightPropType: "doublestar",
        propLook: "model",
        tunnelPropColors: CUSTOM,
      } as never,
      makeState(),
      frame,
      true
    );
    await vi.waitFor(() => expect(loadPropTextures).toHaveBeenCalled());
    expect(loadPropTextures).toHaveBeenLastCalledWith(
      "doublestar",
      "doublestar",
      true,
      CUSTOM
    );
  });

  it("keeps the recolorable artwork for an export with exact tunnel colors", async () => {
    const { manager, loadPropTextures } = makeManager("model");
    manager.propTypeOverrideLeft = "doublestar";
    manager.propTypeOverrideRight = "doublestar";
    await manager.loadPropTextures(makeState(), true, CUSTOM, true);
    expect(loadPropTextures).toHaveBeenLastCalledWith(
      "doublestar",
      "doublestar",
      true,
      CUSTOM
    );
  });
});
