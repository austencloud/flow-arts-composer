import { describe, it, expect, beforeEach } from "vitest";
import { RenderContextRegistry } from "#lib/shared/animation-engine/services/render-context-registry.js";

function makeMockContext(id: string) {
  return {
    id,
    canvas: {} as HTMLCanvasElement,
    container: {} as HTMLDivElement,
    renderer: {} as any,
    effectManager: {} as any,
    trailCapturer: {} as any,
    renderLoop: {} as any,
    resizer: {} as any,
    precomputer: {} as any,
    size: 500,
    resize: () => {},
    restoreSize: () => {},
    triggerRender: () => {},
    dispose: () => {},
  };
}

describe("RenderContextRegistry", () => {
  let registry: RenderContextRegistry;

  beforeEach(() => {
    registry = new RenderContextRegistry();
  });

  it("returns null for unregistered id", () => {
    expect(registry.get("main")).toBeNull();
  });

  it("registers and retrieves a context by id", () => {
    const ctx = makeMockContext("main");
    registry.register(ctx);
    expect(registry.get("main")).toBe(ctx);
  });

  it("unregisters a context", () => {
    const ctx = makeMockContext("main");
    registry.register(ctx);
    registry.unregister("main");
    expect(registry.get("main")).toBeNull();
  });

  it("getAll returns all registered contexts", () => {
    const a = makeMockContext("a");
    const b = makeMockContext("b");
    registry.register(a);
    registry.register(b);
    expect(registry.getAll()).toHaveLength(2);
    expect(registry.getAll()).toContain(a);
    expect(registry.getAll()).toContain(b);
  });

  it("overwrites existing context with same id", () => {
    const first = makeMockContext("main");
    const second = makeMockContext("main");
    registry.register(first);
    registry.register(second);
    expect(registry.get("main")).toBe(second);
    expect(registry.getAll()).toHaveLength(1);
  });

  it("unregister is a no-op for unknown id", () => {
    expect(() => registry.unregister("ghost")).not.toThrow();
  });
});
