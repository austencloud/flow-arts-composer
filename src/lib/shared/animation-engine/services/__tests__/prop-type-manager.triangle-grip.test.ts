import { describe, it, expect, vi } from "vitest";

// getBaseMotionColors pulls the SVG generator chain; stub it to keep the
// import light, same as prop-type-manager.crossfade.test.ts. Not exercised by
// this test (only additionalLayerColors calls it).
vi.mock("../svg-generator", () => ({
  getBaseMotionColors: () => ({ left: "#1111ff", right: "#ff1111" }),
}));

import { PropTypeManager } from "../prop-type-manager";
import { PropTypeChanger } from "../prop-type-changer.svelte";

/**
 * The triangle's grip is a settings-driven look, like a fan build: a grip
 * change alone (no prop-type change) must still reach the texture loader as
 * part of the render key, because resolvePropRenderKey encodes it as
 * "triangle__side" rather than leaving it for a separate signal. This is the
 * settings path (handleSettingsChange -> loadPropTextures), harnessed the
 * same way as prop-type-manager.crossfade.test.ts's "fades only the color
 * that genuinely changed via settings" case.
 */

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

function makeManager(opts?: {
  propTypeChangeService?: PropTypeChanger;
  propTextureService?: object | null;
  renderLoopService?: object | null;
}) {
  const renderer = {
    prepareLeftPropCrossfade: vi.fn(),
    prepareRightPropCrossfade: vi.fn(),
    startLeftPropCrossfade: vi.fn(),
    startRightPropCrossfade: vi.fn(),
  };
  const ptm = new PropTypeManager();
  ptm.wire({
    settingsService: null,
    propTextureService: (opts?.propTextureService ?? null) as any,
    trailCapturer: null,
    renderLoopService: (opts?.renderLoopService ?? null) as any,
    precomputationService: null,
    propTypeChangeService: opts?.propTypeChangeService ?? null,
    fireTipTracker: null,
    animationRenderer: renderer as any,
  });
  return { ptm, renderer };
}

const getFrameParams = () => ({}) as never;

/** loadPropTextures resolves on the next microtask; flush before asserting. */
async function flushHotSwap() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PropTypeManager triangle grip threading", () => {
  it("passes the side grip's render key to the texture loader", async () => {
    const propTextureService = {
      state: {
        leftDimensions: { width: 260, height: 207 },
        rightDimensions: { width: 260, height: 207 },
      },
      loadPropTextures: vi.fn().mockResolvedValue(undefined),
    };
    const propTypeChangeService = new PropTypeChanger();
    const { ptm } = makeManager({ propTypeChangeService, propTextureService });
    const settingsService: {
      currentSettings: Record<string, unknown>;
    } = {
      currentSettings: {
        leftPropType: "triangle",
        rightPropType: "triangle",
        propType: "triangle",
        triangleGrip: "side",
      },
    };
    (ptm as any).settingsService = settingsService;

    const state = makeState("triangle", "triangle");

    ptm.handleSettingsChange(state, getFrameParams, false);
    await flushHotSwap();

    expect(propTextureService.loadPropTextures).toHaveBeenCalledWith(
      "triangle__side",
      "triangle__side",
      false,
      null
    );
  });
});
