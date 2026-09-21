// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The manager builds OVERLAY_PLUGINS from EFFECT_PLUGINS at module load and calls
// plugin.createRenderer() to make real WebGL renderers — which can't init in node.
// Mock the registry with a single fake webgl "fire" plugin whose renderer is a
// plain stub, so we can exercise the prewarm + keep-warm STATE LOGIC in isolation.
function makeFakeRenderer() {
  const canvas = { style: { display: "" } } as unknown as HTMLCanvasElement;
  let inited = false;
  return {
    canvas,
    initialize: vi.fn(() => {
      inited = true;
      return true;
    }),
    isInitialized: () => inited,
    dispose: vi.fn(() => {
      inited = false;
    }),
    getCanvas: () => canvas,
    resize: vi.fn(),
    setCanvasZIndex: vi.fn(),
  };
}

// LED has its own kind:"led" lifecycle: the manager constructs WebGLLedRenderer
// directly (not via plugin.createRenderer), so its fake adds clearSimulation
// (the keep-warm clear) and is injected through the mocked led module ctor.
function makeFakeLed() {
  const canvas = { style: { display: "" } } as unknown as HTMLCanvasElement;
  let inited = false;
  return {
    canvas,
    initialize: vi.fn(() => {
      inited = true;
      return true;
    }),
    isInitialized: () => inited,
    dispose: vi.fn(() => {
      inited = false;
    }),
    getCanvas: () => canvas,
    clearSimulation: vi.fn(),
    resize: vi.fn(),
    setCanvasZIndex: vi.fn(),
  };
}

// vi.mock is hoisted above top-level code, so the fake plugin + spies it
// references must be created inside vi.hoisted (also hoisted) — not as plain
// top-level consts (which would be in the temporal dead zone at mock time).
const h = vi.hoisted(() => {
  const createRenderer = vi.fn();
  const onDisable = vi.fn();
  const firePlugin = {
    id: "fire",
    kind: "webgl",
    createRenderer,
    configKey: "fireRenderer",
    defaultConfig: {},
    onDisable,
  };
  // LED plugin descriptor (kind:"led"). Excluded from OVERLAY_PLUGINS by the
  // manager's canvas2d|webgl filter, but present in EFFECT_PLUGIN_BY_ID so
  // prewarmRenderer can route "led" to its dedicated warm path.
  const ledPlugin = {
    id: "led",
    kind: "led",
    createRenderer: vi.fn(),
    configKey: "ledRenderer",
    defaultConfig: {},
  };
  // Holder-backed ctor: `new WebGLLedRenderer()` runs this impl, which returns
  // the holder's current fake (a constructor returning an object yields that
  // object). beforeEach swaps in a fresh fake. mockReturnValue is unreliable
  // under `new`, so use an explicit returning implementation.
  const ledHolder: { current: unknown } = { current: null };
  const LedCtor = vi.fn(function () {
    return ledHolder.current;
  });
  return {
    createRenderer,
    onDisable,
    firePlugin,
    ledPlugin,
    LedCtor,
    ledHolder,
  };
});
const { createRenderer, onDisable, LedCtor, ledHolder } = h;

let fakeRenderer: ReturnType<typeof makeFakeRenderer>;
let fakeLed: ReturnType<typeof makeFakeLed>;

vi.mock("../effects/registry", () => ({
  EFFECT_PLUGINS: [h.firePlugin, h.ledPlugin],
  EFFECT_PLUGIN_BY_ID: { fire: h.firePlugin, led: h.ledPlugin },
}));

// new WebGLLedRenderer() returns the injected fake (a constructor returning an
// object yields that object), so the led lifecycle runs against the stub.
vi.mock("../led/web-gl-led-renderer", () => ({
  WebGLLedRenderer: h.LedCtor,
}));

import { EffectRendererManager } from "../effect-renderer-manager";

function wiredManager() {
  const manager = new EffectRendererManager({
    keepInactiveWebglRenderersWarm: true,
  });
  const renderLoopService = { updateConfig: vi.fn(), triggerRender: vi.fn() };
  manager.wire({
    containerElement: {} as HTMLDivElement,
    canvasSize: 500,
    renderLoopService: renderLoopService as never,
    getFrameParams: () => ({}) as never,
    getVM: () => ({}) as never,
  });
  return { manager, renderLoopService };
}

function wiredMobileManager() {
  const manager = new EffectRendererManager({
    keepInactiveWebglRenderersWarm: false,
  });
  const renderLoopService = { updateConfig: vi.fn(), triggerRender: vi.fn() };
  manager.wire({
    containerElement: {} as HTMLDivElement,
    canvasSize: 500,
    renderLoopService: renderLoopService as never,
    getFrameParams: () => ({}) as never,
    getVM: () => ({}) as never,
  });
  return { manager, renderLoopService };
}

describe("EffectRendererManager — prewarm + keep-warm", () => {
  beforeEach(() => {
    fakeRenderer = makeFakeRenderer();
    createRenderer.mockReset();
    createRenderer.mockReturnValue(fakeRenderer);
    onDisable.mockClear();
    // Run the deferred init rAF synchronously so the test is linear.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("prewarmRenderer creates the renderer but leaves it disabled + parked (hidden)", () => {
    const { manager } = wiredManager();
    manager.prewarmRenderer("fire");

    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(manager.getRenderer("fire")).toBe(fakeRenderer);
    expect(fakeRenderer.isInitialized()).toBe(true);
    // Warmed, not enabled — the render loop will not simulate it.
    expect(manager.isEffectEnabled("fire")).toBe(false);
    // Parked: canvas hidden so a preserveDrawingBuffer frame can't leak through.
    expect(fakeRenderer.canvas.style.display).toBe("none");
  });

  it("uses the measured wide frame when an effect starts before ResizeObserver", () => {
    const manager = new EffectRendererManager({
      keepInactiveWebglRenderersWarm: true,
    });
    manager.wire({
      containerElement: {} as HTMLDivElement,
      canvasSize: 800,
      canvasFrame: { size: 800, width: 1200, height: 800 },
      renderLoopService: {
        updateConfig: vi.fn(),
        triggerRender: vi.fn(),
      } as never,
      getFrameParams: () => ({}) as never,
      getVM: () => ({}) as never,
    });

    manager.prewarmRenderer("fire");

    // A 800×800 fallback backing store is CSS-stretched across this host and
    // pushes particle coordinates down and right. The first renderer must use
    // the real 1200×800 rectangle instead.
    expect(fakeRenderer.initialize).toHaveBeenCalledWith(
      expect.anything(),
      1200,
      800
    );
  });

  it("enabling a prewarmed effect reuses the warm renderer (no re-create) and shows it", () => {
    const { manager } = wiredManager();
    manager.prewarmRenderer("fire");
    createRenderer.mockClear();

    manager.setWasEnabled("fire", true);
    manager.syncEffectOverlay("fire");

    expect(createRenderer).not.toHaveBeenCalled(); // un-parked, not rebuilt
    expect(manager.getRenderer("fire")).toBe(fakeRenderer);
    expect(fakeRenderer.canvas.style.display).toBe(""); // shown
  });

  it("disabling a webgl effect parks it warm instead of disposing", () => {
    const { manager } = wiredManager();
    // Cold enable (no prewarm): the deferred webgl init runs via the stubbed rAF.
    manager.setWasEnabled("fire", true);
    manager.syncEffectOverlay("fire");
    expect(fakeRenderer.isInitialized()).toBe(true);

    // Disable.
    manager.setWasEnabled("fire", false);
    manager.syncEffectOverlay("fire");

    expect(fakeRenderer.dispose).not.toHaveBeenCalled(); // kept warm
    expect(manager.getRenderer("fire")).toBe(fakeRenderer); // still held
    expect(fakeRenderer.canvas.style.display).toBe("none"); // parked hidden
    expect(onDisable).toHaveBeenCalledTimes(1); // transition fired exactly once
  });

  it("repeated disabled syncs are a no-op (the warmHidden guard prevents per-frame onDisable)", () => {
    const { manager } = wiredManager();
    manager.setWasEnabled("fire", true);
    manager.syncEffectOverlay("fire");
    manager.setWasEnabled("fire", false);
    manager.syncEffectOverlay("fire"); // park (onDisable #1)
    onDisable.mockClear();

    // Mimics CanvasSurface calling setFireConfig every frame while fire is off.
    manager.syncEffectOverlay("fire");
    manager.syncEffectOverlay("fire");

    expect(onDisable).not.toHaveBeenCalled();
    expect(fakeRenderer.dispose).not.toHaveBeenCalled();
  });

  it("full dispose() tears down the parked renderer", () => {
    const { manager } = wiredManager();
    manager.prewarmRenderer("fire");
    expect(fakeRenderer.isInitialized()).toBe(true);

    manager.dispose();

    expect(fakeRenderer.dispose).toHaveBeenCalled();
    expect(manager.getRenderer("fire")).toBeNull();
  });

  it("does not prewarm or retain inactive WebGL renderers on touch devices", () => {
    const { manager } = wiredMobileManager();
    manager.prewarmRenderer("fire");
    expect(createRenderer).not.toHaveBeenCalled();

    manager.setWasEnabled("fire", true);
    manager.syncEffectOverlay("fire");
    manager.setWasEnabled("fire", false);
    manager.syncEffectOverlay("fire");

    expect(fakeRenderer.dispose).toHaveBeenCalledTimes(1);
    expect(manager.getRenderer("fire")).toBeNull();
    expect(onDisable).toHaveBeenCalledTimes(1);
  });

  it("selects the mobile release policy from touch capability by default", () => {
    vi.stubGlobal("navigator", { maxTouchPoints: 5 });
    const manager = new EffectRendererManager();
    manager.wire({
      containerElement: {} as HTMLDivElement,
      canvasSize: 500,
      renderLoopService: null,
      getFrameParams: () => ({}) as never,
      getVM: () => ({}) as never,
    });

    manager.prewarmRenderer("fire");

    expect(createRenderer).not.toHaveBeenCalled();
  });
});

describe("EffectRendererManager — LED prewarm + keep-warm", () => {
  beforeEach(() => {
    fakeLed = makeFakeLed();
    ledHolder.current = fakeLed;
    LedCtor.mockClear(); // clears call records, KEEPS the returning impl
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("prewarmRenderer('led') creates the led renderer, parks it hidden + cleared, leaves it disabled", () => {
    const { manager } = wiredManager();
    manager.prewarmRenderer("led");

    expect(LedCtor).toHaveBeenCalledTimes(1);
    expect(manager.getRenderer("led")).toBe(fakeLed);
    expect(fakeLed.isInitialized()).toBe(true);
    expect(manager.getLedConfig().enabled).toBe(false);
    // Parked: hidden + cleared so a preserveDrawingBuffer frame can't leak through.
    expect(fakeLed.canvas.style.display).toBe("none");
    expect(fakeLed.clearSimulation).toHaveBeenCalled();
  });

  it("enabling a prewarmed led un-parks it (no second construct) and shows it", () => {
    const { manager } = wiredManager();
    manager.prewarmRenderer("led");
    LedCtor.mockClear();

    manager.setLedConfig({ enabled: true });

    expect(LedCtor).not.toHaveBeenCalled(); // un-parked, not rebuilt
    expect(manager.getRenderer("led")).toBe(fakeLed);
    expect(fakeLed.canvas.style.display).toBe(""); // shown
  });

  it("disabling led parks it warm (clears + hides) instead of disposing", () => {
    const { manager } = wiredManager();
    // Cold enable (no prewarm): deferred init runs via the stubbed rAF.
    manager.setLedConfig({ enabled: true });
    expect(fakeLed.isInitialized()).toBe(true);
    fakeLed.clearSimulation.mockClear();

    manager.setLedConfig({ enabled: false });

    expect(fakeLed.dispose).not.toHaveBeenCalled(); // kept warm
    expect(manager.getRenderer("led")).toBe(fakeLed); // still held
    expect(fakeLed.canvas.style.display).toBe("none"); // parked hidden
    expect(fakeLed.clearSimulation).toHaveBeenCalled(); // flash-safe clear
  });

  it("repeated disabled led syncs are a no-op (the ledWarmHidden guard)", () => {
    const { manager } = wiredManager();
    manager.setLedConfig({ enabled: true });
    manager.setLedConfig({ enabled: false }); // park
    fakeLed.clearSimulation.mockClear();

    // Mimics CanvasSurface calling setLedConfig / syncLedOverlay every frame while off.
    manager.syncLedOverlay();
    manager.syncLedOverlay();

    expect(fakeLed.clearSimulation).not.toHaveBeenCalled();
    expect(fakeLed.dispose).not.toHaveBeenCalled();
  });

  it("full dispose() tears down the parked led", () => {
    const { manager } = wiredManager();
    manager.prewarmRenderer("led");
    expect(fakeLed.isInitialized()).toBe(true);

    manager.dispose();

    expect(fakeLed.dispose).toHaveBeenCalled();
    expect(manager.getRenderer("led")).toBeNull();
  });

  it("does not prewarm or retain inactive LED WebGL on touch devices", () => {
    const { manager } = wiredMobileManager();
    manager.prewarmRenderer("led");
    expect(LedCtor).not.toHaveBeenCalled();

    manager.setLedConfig({ enabled: true });
    manager.setLedConfig({ enabled: false });

    expect(fakeLed.dispose).toHaveBeenCalledTimes(1);
    expect(manager.getRenderer("led")).toBeNull();
  });
});
