import { describe, it, expect, vi } from "vitest";
import { CanvasLifecycleManager } from "$lib/shared/animation-engine/services/canvas-lifecycle-manager";

// CanvasLifecycleManager creates its collaborators internally during
// initialize(); there are no public setters (the old set*() API was removed in
// the 2026-05-28 render-context refactor). configure() is the real public seam
// for the two engine-owned deps (canvasInitializer, effectManager). The
// internally-created services have no injection point, so for unit-testing the
// lifecycle delegation (pause / resume / dispose) we seed their private fields
// directly. private is compile-time only in TS, so the fields are plain
// instance properties at runtime.
function injectInternals(
  mgr: CanvasLifecycleManager,
  fields: Record<string, unknown>
): void {
  Object.assign(mgr, fields);
}

/**
 * The resizer measures `clientWidth`/`clientHeight`, not the bounding rect: a
 * transformed rectangle is not the canvas's raster allocation, and transforms
 * never notify ResizeObserver. jsdom gives a detached div no client box at all,
 * so a test container has to declare one.
 */
function sizeContainer(container: HTMLElement, size: number): void {
  for (const prop of ["clientWidth", "clientHeight"] as const) {
    Object.defineProperty(container, prop, {
      configurable: true,
      get: () => size,
    });
  }
}

describe("CanvasLifecycleManager", () => {
  it("redraws a paused canvas only after its resized textures are ready", async () => {
    const container = document.createElement("div");
    sizeContainer(container, 320);
    let finishResize!: () => void;
    const resize = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishResize = resolve;
        })
    );
    const redraw = vi.fn();
    const mgr = new CanvasLifecycleManager();
    injectInternals(mgr, {
      _animationRenderer: { resize },
      _containerElement: container,
    });
    mgr["_doInitResizeService"](container, redraw);

    const pending = mgr.resizer!.resize(500);
    expect(resize).toHaveBeenCalledWith(320);
    expect(redraw).not.toHaveBeenCalled();
    finishResize();
    await pending;
    expect(redraw).toHaveBeenCalledOnce();
    mgr.dispose();
  });

  it("does not redraw a player removed while its resize is pending", async () => {
    const container = document.createElement("div");
    sizeContainer(container, 320);
    let finishResize!: () => void;
    const resize = () =>
      new Promise<void>((resolve) => {
        finishResize = resolve;
      });
    const redraw = vi.fn();
    const mgr = new CanvasLifecycleManager();
    injectInternals(mgr, {
      _animationRenderer: { resize },
      _containerElement: container,
    });
    mgr["_doInitResizeService"](container, redraw);

    const pending = mgr.resizer!.resize(500);
    mgr.dispose();
    finishResize();
    await pending;
    expect(redraw).not.toHaveBeenCalled();
  });

  it("pauseResize delegates to resizer", () => {
    const resizer = { pauseObservation: vi.fn(), resumeObservation: vi.fn() };
    const mgr = new CanvasLifecycleManager();
    injectInternals(mgr, { _resizer: resizer });
    mgr.pauseResize();
    expect(resizer.pauseObservation).toHaveBeenCalled();
  });

  it("resumeResize delegates to resizer", () => {
    const resizer = { pauseObservation: vi.fn(), resumeObservation: vi.fn() };
    const mgr = new CanvasLifecycleManager();
    injectInternals(mgr, { _resizer: resizer });
    mgr.resumeResize();
    expect(resizer.resumeObservation).toHaveBeenCalled();
  });

  it("pauseResize is safe when no resizer set", () => {
    const mgr = new CanvasLifecycleManager();
    expect(() => mgr.pauseResize()).not.toThrow();
  });

  it("resumeResize is safe when no resizer set", () => {
    const mgr = new CanvasLifecycleManager();
    expect(() => mgr.resumeResize()).not.toThrow();
  });

  it("dispose tears down resizer and render loop", () => {
    const resizer = { teardown: vi.fn() };
    const renderLoop = { dispose: vi.fn() };
    const effectManager = { dispose: vi.fn() };
    const trailCapturer = { clearTrails: vi.fn() };
    const mgr = new CanvasLifecycleManager();
    mgr.configure({ effectManager: effectManager as any });
    injectInternals(mgr, {
      _resizer: resizer,
      _renderLoop: renderLoop,
      _trailCapturer: trailCapturer,
    });
    mgr.dispose();
    expect(resizer.teardown).toHaveBeenCalled();
    expect(renderLoop.dispose).toHaveBeenCalled();
    expect(effectManager.dispose).toHaveBeenCalled();
    expect(trailCapturer.clearTrails).toHaveBeenCalled();
  });

  it("dispose calls unsubscribeVisibility", () => {
    const unsubscribe = vi.fn();
    const mgr = new CanvasLifecycleManager();
    injectInternals(mgr, { _unsubscribeVisibility: unsubscribe });
    mgr.dispose();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("dispose tears down all services", () => {
    const visibilitySync = { dispose: vi.fn() };
    const glyphTransition = { dispose: vi.fn() };
    const sequenceCache = { dispose: vi.fn() };
    const trailSettingsSync = { dispose: vi.fn() };
    const propTypeChange = { dispose: vi.fn() };
    const precomputer = { dispose: vi.fn() };
    const glyphTexture = { dispose: vi.fn() };
    const propTexture = { dispose: vi.fn() };

    const mgr = new CanvasLifecycleManager();
    injectInternals(mgr, {
      _visibilitySyncService: visibilitySync,
      _glyphTransitionService: glyphTransition,
      _sequenceCacheService: sequenceCache,
      _trailSettingsSyncService: trailSettingsSync,
      _propTypeChangeService: propTypeChange,
      _precomputer: precomputer,
      _glyphTextureService: glyphTexture,
      _propTextureService: propTexture,
    });
    mgr.dispose();

    expect(visibilitySync.dispose).toHaveBeenCalled();
    expect(glyphTransition.dispose).toHaveBeenCalled();
    expect(sequenceCache.dispose).toHaveBeenCalled();
    expect(trailSettingsSync.dispose).toHaveBeenCalled();
    expect(propTypeChange.dispose).toHaveBeenCalled();
    expect(precomputer.dispose).toHaveBeenCalled();
    expect(glyphTexture.dispose).toHaveBeenCalled();
    expect(propTexture.dispose).toHaveBeenCalled();
  });

  it("dispose calls canvasInitializer.destroy with callbacks", () => {
    const canvasInitializer = { destroy: vi.fn() };
    const onCanvasReady = vi.fn();
    const onInitialized = vi.fn();

    const mgr = new CanvasLifecycleManager();
    mgr.configure({ canvasInitializer: canvasInitializer as any });
    mgr.dispose({ onCanvasReady, onInitialized });

    expect(canvasInitializer.destroy).toHaveBeenCalledWith({
      onCanvasReady: expect.any(Function),
      onInitialized: expect.any(Function),
    });
  });

  it("dispose is safe with no services set", () => {
    const mgr = new CanvasLifecycleManager();
    expect(() => mgr.dispose()).not.toThrow();
  });
});
