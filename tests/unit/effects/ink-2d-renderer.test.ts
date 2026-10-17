import { describe, expect, it, vi } from "vitest";
import { Ink2DRenderer } from "#lib/shared/effects/renderers/ink-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { resolveInk2D } from "#lib/shared/effects/translators/canvas2d-translator.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import type { InkIntent } from "#lib/shared/effects/domain/effects-config.js";

function makeContext(): CanvasRenderingContext2D {
  return {
    canvas: { width: 800, height: 600 },
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 400, f: 300 }),
  } as unknown as CanvasRenderingContext2D;
}

function tip(angle: number, end: "A" | "B" = "A"): EmitterTip {
  return {
    x: Math.cos(angle) * 110,
    y: Math.sin(angle) * 110,
    propIndex: 0,
    tipIndex: end === "A" ? 0 : 1,
    end,
    color: "#2f8fb3",
  };
}

function spin(
  renderer: Ink2DRenderer,
  intent: Partial<InkIntent>,
  frames: number,
  ctx = makeContext(),
  ends: Array<"A" | "B"> = ["A"]
) {
  const params = resolveInk2D({ ...DEFAULT_EFFECTS_CONFIG.ink, ...intent });
  for (let f = 0; f < frames; f++) {
    const angle = (f / 60) * Math.PI * 2;
    renderer.render(ctx, params, ends.map((end) => tip(angle + (end === "B" ? Math.PI : 0), end)), 1 / 60, 1);
  }
  return ctx;
}

describe("Ink2DRenderer", () => {
  it("draws ink thrown off a spinning tip as strands and drops", () => {
    const renderer = new Ink2DRenderer();
    const ctx = spin(renderer, { viscosity: 0.6 }, 50);
    const diagnostics = renderer.getDiagnostics();
    expect(diagnostics.parcels).toBeGreaterThan(20);
    expect(diagnostics.strands).toBeGreaterThan(0);
    expect(diagnostics.drops).toBeGreaterThan(0);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.ellipse).toHaveBeenCalled();
  });

  it("follows the tracked end only", () => {
    const both = new Ink2DRenderer();
    spin(both, { trackingMode: "both_ends" }, 30, makeContext(), ["A", "B"]);
    const one = new Ink2DRenderer();
    spin(one, { trackingMode: "right_end" }, 30, makeContext(), ["A", "B"]);
    expect(one.getDiagnostics().parcels).toBeGreaterThan(0);
    expect(one.getDiagnostics().parcels).toBeLessThan(both.getDiagnostics().parcels);
  });

  it("draws neon additively", () => {
    const renderer = new Ink2DRenderer();
    const ctx = makeContext();
    const assigned: string[] = [];
    Object.defineProperty(ctx, "globalCompositeOperation", {
      set: (value: string) => assigned.push(value),
      get: () => assigned.at(-1) ?? "source-over",
    });
    spin(renderer, { palette: "neon" }, 20, ctx);
    expect(assigned).toContain("lighter");
  });

  it("lets ink that falls below the canvas leave", () => {
    const renderer = new Ink2DRenderer();
    const ctx = spin(renderer, {}, 40);
    const params = resolveInk2D(DEFAULT_EFFECTS_CONFIG.ink);
    for (let f = 0; f < 240; f++) renderer.render(ctx, params, [], 1 / 60, 1);
    expect(renderer.getDiagnostics().parcels).toBe(0);
  });

  it("cuts strands at a freeform wrap instead of drawing across the stage", () => {
    const renderer = new Ink2DRenderer();
    const ctx = spin(renderer, { viscosity: 0 }, 20);
    expect(renderer.getDiagnostics().tied).toBe(1);
    const params = resolveInk2D({ ...DEFAULT_EFFECTS_CONFIG.ink, viscosity: 0 });
    renderer.render(ctx, params, [tip(Math.PI)], 1 / 60, 1, {
      loopDetected: true,
      isSeamlesslyLoopable: false,
    });
    expect(renderer.getDiagnostics().tied).toBe(0);
    expect(renderer.getDiagnostics().strands).toBeGreaterThan(0);
  });

  it("clears its liquid on dispose", () => {
    const renderer = new Ink2DRenderer();
    spin(renderer, {}, 20);
    renderer.dispose();
    expect(renderer.getDiagnostics().parcels).toBe(0);
  });
});
