import { describe, it, expect, vi } from "vitest";

// getBaseMotionColors pulls the SVG generator chain; stub it to keep the
// import light, same as prop-type-manager.layers.test.ts. Not exercised by
// these tests (only additionalLayerColors calls it).
vi.mock("../svg-generator", () => ({
  getBaseMotionColors: () => ({ left: "#1111ff", right: "#ff1111" }),
}));

import { PropTypeManager } from "../prop-type-manager";
import { PropTypeChanger } from "../prop-type-changer.svelte";

/**
 * Regression/behavior guard for the hero-act prop crossfade: PropTypeManager
 * must start the renderer's per-color overlap ONLY on a genuine hot-swap,
 * never on the first-ever override
 * assignment (mount) and never for a color whose type didn't actually change.
 * loadPropTextures reloads both colors together regardless, but the fade
 * itself must be independent per color.
 *
 * This lives in __tests__ because the project's real
 * vitest config (tests/config/vitest.config.ts) only includes
 * "src/**\/__tests__/**\/*.test.ts"; a sibling *.test.ts file next to the
 * source (the original location, and prop-type-manager.layers.test.ts's
 * convention) never matches that glob and silently never runs under
 * `npm run test`. Confirmed via `vitest run --config tests/config/vitest.config.ts
 * <path>` reporting "No test files found" for the old location.
 */

// Minimal AnimatorState double: a mutable current-type pair plus the setters
// PropTypeManager calls. Real AnimatorState is a much larger interface; only
// the members handleOverrides/handleSettingsChange/loadPropTextures touch are
// needed here.
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

/** loadPropTextures resolves on the next microtask (propTextureService is
 *  null, so it hits the early `return;`); flush that before asserting. */
async function flushHotSwap() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PropTypeManager.handleOverrides crossfade trigger", () => {
  it("does not fade on the very first override assignment (mount)", async () => {
    const { ptm, renderer } = makeManager();
    const state = makeState("staff", "staff");

    ptm.handleOverrides(
      { leftPropType: "fan", rightPropType: "fan" } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();

    expect(renderer.prepareLeftPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.prepareRightPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.startLeftPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.startRightPropCrossfade).not.toHaveBeenCalled();
  });

  it("fades only the color that actually changed on a later hot-swap", async () => {
    const { ptm, renderer } = makeManager();
    const state = makeState("staff", "staff");

    ptm.handleOverrides(
      { leftPropType: "fan", rightPropType: "fan" } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();
    renderer.prepareLeftPropCrossfade.mockClear();
    renderer.prepareRightPropCrossfade.mockClear();
    renderer.startLeftPropCrossfade.mockClear();
    renderer.startRightPropCrossfade.mockClear();

    // Left changes fan -> club; right stays fan.

    ptm.handleOverrides(
      { leftPropType: "club", rightPropType: "fan" } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();

    expect(renderer.prepareLeftPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.prepareRightPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.startLeftPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.startRightPropCrossfade).not.toHaveBeenCalled();
    expect(
      renderer.prepareLeftPropCrossfade.mock.invocationCallOrder[0]
    ).toBeLessThan(
      renderer.startLeftPropCrossfade.mock.invocationCallOrder[0]!
    );
  });

  it("fades both colors when both change together", async () => {
    const { ptm, renderer } = makeManager();
    const state = makeState("staff", "staff");

    ptm.handleOverrides(
      { leftPropType: "fan", rightPropType: "fan" } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();
    renderer.prepareLeftPropCrossfade.mockClear();
    renderer.prepareRightPropCrossfade.mockClear();
    renderer.startLeftPropCrossfade.mockClear();
    renderer.startRightPropCrossfade.mockClear();

    ptm.handleOverrides(
      { leftPropType: "club", rightPropType: "buugeng" } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();

    expect(renderer.prepareLeftPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.prepareRightPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.startLeftPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.startRightPropCrossfade).toHaveBeenCalledTimes(1);
  });

  it("crossfades a fan build without changing the choreography prop type", async () => {
    const propTextureService = {
      state: {
        leftDimensions: { width: 260, height: 207 },
        rightDimensions: { width: 260, height: 207 },
      },
      loadPropTextures: vi.fn().mockResolvedValue(undefined),
    };
    const { ptm, renderer } = makeManager({ propTextureService });
    const state = makeState("fan", "fan");

    ptm.handleOverrides(
      {
        leftPropType: "fan",
        rightPropType: "fan",
        fanAppearance: {
          build: "pictograph",
          frameColor: "black",
          cover: "bare",
        },
      } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();
    renderer.prepareLeftPropCrossfade.mockClear();
    renderer.prepareRightPropCrossfade.mockClear();
    renderer.startLeftPropCrossfade.mockClear();
    renderer.startRightPropCrossfade.mockClear();
    propTextureService.loadPropTextures.mockClear();

    const changed = ptm.handleOverrides(
      {
        leftPropType: "fan",
        rightPropType: "fan",
        fanAppearance: {
          build: "fire",
          frameColor: "black",
          cover: "bare",
        },
      } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();

    expect(changed).toBe(true);
    expect(state.currentLeftPropType).toBe("fan");
    expect(state.currentRightPropType).toBe("fan");
    expect(propTextureService.loadPropTextures).toHaveBeenCalledWith(
      "fan__fire_bare",
      "fan__fire_bare",
      false,
      null
    );
    expect(renderer.prepareLeftPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.prepareRightPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.startLeftPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.startRightPropCrossfade).toHaveBeenCalledTimes(1);

    renderer.prepareLeftPropCrossfade.mockClear();
    renderer.prepareRightPropCrossfade.mockClear();
    renderer.startLeftPropCrossfade.mockClear();
    renderer.startRightPropCrossfade.mockClear();
    propTextureService.loadPropTextures.mockClear();

    ptm.handleOverrides(
      {
        leftPropType: "fan",
        rightPropType: "fan",
        fanAppearance: {
          build: "fire",
          frameColor: "black",
          cover: "covered",
        },
      } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();

    expect(propTextureService.loadPropTextures).toHaveBeenCalledWith(
      "fan__fire_covered",
      "fan__fire_covered",
      false,
      null
    );
    expect(renderer.prepareLeftPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.prepareRightPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.startLeftPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.startRightPropCrossfade).toHaveBeenCalledTimes(1);
  });

  it("does not fade when nothing actually changed (handleOverrides returns false)", async () => {
    const { ptm, renderer } = makeManager();
    const state = makeState("staff", "staff");

    ptm.handleOverrides(
      { leftPropType: "fan", rightPropType: "fan" } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();
    renderer.prepareLeftPropCrossfade.mockClear();
    renderer.prepareRightPropCrossfade.mockClear();
    renderer.startLeftPropCrossfade.mockClear();
    renderer.startRightPropCrossfade.mockClear();

    const changed = ptm.handleOverrides(
      { leftPropType: "fan", rightPropType: "fan" } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();

    expect(changed).toBe(false);
    expect(renderer.prepareLeftPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.prepareRightPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.startLeftPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.startRightPropCrossfade).not.toHaveBeenCalled();
  });

  it("finishes an async swap with the newest pose provider", async () => {
    let finishSwap!: () => void;
    const propTextureService = {
      state: {
        leftDimensions: { width: 100, height: 200 },
        rightDimensions: { width: 100, height: 200 },
      },
      loadPropTextures: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finishSwap = resolve;
            })
        ),
    };
    const renderLoopService = {
      triggerRender: vi.fn(),
      updateConfig: vi.fn(),
    };
    const { ptm } = makeManager({ propTextureService, renderLoopService });
    const state = makeState("staff", "staff");

    ptm.handleOverrides(
      { leftPropType: "fan", rightPropType: "fan" } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();
    renderLoopService.triggerRender.mockClear();

    const resetPoseFrame = { pose: "reset" } as unknown as never;
    const incomingStartFrame = { pose: "incoming-start" } as unknown as never;
    ptm.handleOverrides(
      { leftPropType: "club", rightPropType: "club" } as any,
      state,
      () => resetPoseFrame,
      false
    );

    // The replacement sequence initializes while its SVG texture is loading.
    // A no-op prop update still carries the real start pose and must supersede
    // the reset-frame callback retained by the original hot-swap request.
    ptm.handleOverrides(
      { leftPropType: "club", rightPropType: "club" } as any,
      state,
      () => incomingStartFrame,
      false
    );
    finishSwap();
    await flushHotSwap();

    expect(renderLoopService.triggerRender).toHaveBeenCalledTimes(1);
    const provider = renderLoopService.triggerRender.mock.calls[0]?.[0];
    expect(provider?.()).toBe(incomingStartFrame);
  });
});

describe("PropTypeManager.handleSettingsChange crossfade trigger", () => {
  it("does not fade when settings already match AnimatorState at mount", async () => {
    const propTypeChangeService = new PropTypeChanger();
    const { ptm, renderer } = makeManager({ propTypeChangeService });

    (ptm as any).settingsService = {
      currentSettings: {
        leftPropType: "club",
        rightPropType: "club",
        propType: "club",
      },
    };

    // Simulates the true initial load already having synced AnimatorState to
    // "club" (via the direct loadTextures path) before handleSettingsChange
    // ever runs — PropTypeChanger's own internal cache still defaults to
    // "staff", so it WILL fire a reload signal, but nothing should fade since
    // the visible prop isn't actually changing.
    const state = makeState("club", "club");

    ptm.handleSettingsChange(state, getFrameParams, false);
    await flushHotSwap();

    expect(renderer.prepareLeftPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.prepareRightPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.startLeftPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.startRightPropCrossfade).not.toHaveBeenCalled();
  });

  it("fades only the color that genuinely changed via settings", async () => {
    const propTypeChangeService = new PropTypeChanger();
    const { ptm, renderer } = makeManager({ propTypeChangeService });
    const settingsService: { currentSettings: Record<string, string> } = {
      currentSettings: {
        leftPropType: "club",
        rightPropType: "club",
        propType: "club",
      },
    };

    (ptm as any).settingsService = settingsService;

    const state = makeState("club", "club");

    // Mount-time sync (see previous test) — not under test here.
    ptm.handleSettingsChange(state, getFrameParams, false);
    await flushHotSwap();
    renderer.prepareLeftPropCrossfade.mockClear();
    renderer.prepareRightPropCrossfade.mockClear();
    renderer.startLeftPropCrossfade.mockClear();
    renderer.startRightPropCrossfade.mockClear();

    // Genuine change: red only, club -> fan.
    settingsService.currentSettings = {
      leftPropType: "club",
      rightPropType: "fan",
      propType: "club",
    };
    ptm.handleSettingsChange(state, getFrameParams, false);
    await flushHotSwap();

    expect(renderer.prepareLeftPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.prepareRightPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.startLeftPropCrossfade).not.toHaveBeenCalled();
    expect(renderer.startRightPropCrossfade).toHaveBeenCalledTimes(1);
  });
});

// The public composer has no settings service to write the 3D look into, so it
// passes the look as a prop. That prop must win over the stored setting and
// swap the drawn artwork like any other prop change.
describe("PropTypeManager.handleOverrides prop look override", () => {
  it("swaps to the model artwork when the host passes propLook", async () => {
    const renderer = {
      prepareLeftPropCrossfade: vi.fn(),
      prepareRightPropCrossfade: vi.fn(),
      startLeftPropCrossfade: vi.fn(),
      startRightPropCrossfade: vi.fn(),
    };
    const ptm = new PropTypeManager();
    ptm.wire({
      settingsService: {
        currentSettings: { propArtwork: "pictograph" },
      } as any,
      propTextureService: null,
      trailCapturer: null,
      renderLoopService: null,
      precomputationService: null,
      propTypeChangeService: null,
      fireTipTracker: null,
      animationRenderer: renderer as any,
    });
    const state = makeState("staff", "staff");
    const chicken = { leftPropType: "chicken", rightPropType: "chicken" };

    ptm.handleOverrides(chicken as any, state, getFrameParams, false);
    await flushHotSwap();
    ptm.handleOverrides(
      { ...chicken, propLook: "pictograph" } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();
    expect(renderer.prepareLeftPropCrossfade).not.toHaveBeenCalled();

    ptm.handleOverrides(
      { ...chicken, propLook: "model" } as any,
      state,
      getFrameParams,
      false
    );
    await flushHotSwap();
    expect(renderer.prepareLeftPropCrossfade).toHaveBeenCalledTimes(1);
    expect(renderer.prepareRightPropCrossfade).toHaveBeenCalledTimes(1);
  });
});
