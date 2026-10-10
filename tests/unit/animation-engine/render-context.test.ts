import { describe, it, expect, vi } from "vitest";
import { LiveRenderContext } from "#lib/shared/animation-engine/services/render-context.js";

function makeDeps(overrides: Record<string, any> = {}) {
  return {
    id: "test",
    canvas: { width: 500, height: 500 } as unknown as HTMLCanvasElement,
    container: {
      getBoundingClientRect: () => ({ width: 500, height: 500 }),
    } as unknown as HTMLDivElement,
    renderer: { resize: vi.fn().mockResolvedValue(undefined), renderScene: vi.fn() } as any,
    effectManager: { resizeAll: vi.fn(), dispose: vi.fn() } as any,
    trailCapturer: { updateConfig: vi.fn(), clearTrails: vi.fn() } as any,
    renderLoop: {
      updateConfig: vi.fn(),
      triggerRender: vi.fn(),
      dispose: vi.fn(),
    } as any,
    resizer: {
      resize: vi.fn().mockResolvedValue(1080),
      resumeObservation: vi.fn(),
      pauseObservation: vi.fn(),
      dispose: vi.fn(),
    } as any,
    precomputer: { dispose: vi.fn() } as any,
    ...overrides,
  };
}

describe("LiveRenderContext", () => {
  it("exposes id and size from constructor", () => {
    const deps = makeDeps();
    const ctx = new LiveRenderContext(deps);
    expect(ctx.id).toBe("test");
    expect(ctx.size).toBe(500);
  });

  it("resize updates size and propagates to all services", () => {
    const deps = makeDeps();
    const ctx = new LiveRenderContext(deps);
    ctx.resize(1080);
    expect(ctx.size).toBe(1080);
    expect(deps.renderer.resize).toHaveBeenCalledWith(1080);
    expect(deps.effectManager.resizeAll).toHaveBeenCalledWith(1080);
    expect(deps.trailCapturer.updateConfig).toHaveBeenCalledWith({ canvasSize: 1080 });
    expect(deps.renderLoop.updateConfig).toHaveBeenCalledWith({ canvasSize: 1080 });
  });

  it("restoreSize reads container dimensions", () => {
    const deps = makeDeps();
    const ctx = new LiveRenderContext(deps);
    ctx.resize(1080);
    ctx.restoreSize();
    expect(ctx.size).toBe(500);
  });

  it("dispose tears down all services", () => {
    const deps = makeDeps();
    const ctx = new LiveRenderContext(deps);
    ctx.dispose();
    expect(deps.effectManager.dispose).toHaveBeenCalled();
    expect(deps.renderLoop.dispose).toHaveBeenCalled();
    expect(deps.trailCapturer.clearTrails).toHaveBeenCalled();
  });
});
