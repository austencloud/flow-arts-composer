import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INK_PALETTES } from "#lib/shared/3d/effects/ink/ink-palettes.js";
import {
  Ink2DRenderer,
  resolveInkNibWidth,
  resolveInkStrokeWidth,
  resolveInkTurnLoad,
} from "#lib/shared/effects/renderers/ink-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import type { Ink2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { resolveInk2D } from "#lib/shared/effects/translators/canvas2d-translator.js";
import type { InkIntent } from "#lib/shared/effects/domain/effects-config.js";

function makeParams(overrides: Partial<Ink2DParams> = {}): Ink2DParams {
  return {
    ambientEmission: 0,
    motionEmission: 1,
    intensity: 0.6,
    palette: "watercolor",
    customColor: "#4080c0",
    viscosity: 0.3,
    splatterIntensity: 0.1,
    trackingMode: "both_ends",
    resolvedPalette: INK_PALETTES.watercolor,
    effectiveAmbient: 0,
    ambientSpawnRate: 2,
    motionSpawnRate: 60,
    motionReferenceSpeed: 3,
    strokeWidthMin: 2,
    strokeWidthMax: 13,
    opacityMax: 0.68,
    lifetimeSeconds: 2.2,
    maxPointsPerTip: 84,
    strokeLengthPx: 320,
    gravityPx: 36,
    strokeGravityPx: 0,
    breakStretchMax: 80,
    dropletPoolSize: 512,
    dropletMaxAge: 1.5,
    ...overrides,
  };
}

function makeTip(x: number, y: number): EmitterTip {
  return {
    x,
    y,
    propIndex: 0,
    tipIndex: 0,
    end: "A",
    color: "#4080c0",
  };
}

function makeContext(): CanvasRenderingContext2D {
  return {
    canvas: { width: 800, height: 600 },
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

class FakeOffscreenCanvas {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(): OffscreenCanvasRenderingContext2D {
    const gradient = { addColorStop: vi.fn() } as unknown as CanvasGradient;
    return {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      createRadialGradient: vi.fn(() => gradient),
      getImageData: vi.fn(
        () =>
          ({
            data: new Uint8ClampedArray(this.width * this.height * 4),
          }) as ImageData
      ),
      putImageData: vi.fn(),
      fillStyle: "",
    } as unknown as OffscreenCanvasRenderingContext2D;
  }
}

describe("Ink2DRenderer", () => {
  beforeEach(() => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("turns slow pressure into a wider stroke and scales it with the canvas", () => {
    const params = makeParams();

    const slow = resolveInkStrokeWidth(params, 0, 1);
    const fast = resolveInkStrokeWidth(params, 1000, 1);

    expect(slow).toBeGreaterThan(fast * 2.5);
    expect(resolveInkStrokeWidth(params, 0, 2)).toBeCloseTo(slow * 2);
  });

  it("loads the brush through a turn without widening a straight segment", () => {
    expect(
      resolveInkTurnLoad({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 })
    ).toBe(0);
    expect(
      resolveInkTurnLoad({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })
    ).toBe(1);
    expect(
      resolveInkTurnLoad({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 })
    ).toBe(0);
  });

  // Steady-speed orbits were a uniform tube under speed pressure alone. The
  // nib must vary with direction, keep the average weight, and match across
  // tunnel copies (rotations and mirrors about the stage center).
  it("swells dense ink around the stage and thins it toward the center", () => {
    const center = { x: 400, y: 400 };
    const point = { x: 400, y: 200 };
    const around = resolveInkNibWidth(point, 1, 0, center);
    const toward = resolveInkNibWidth(point, 0, 1, center);
    expect(around).toBeGreaterThan(toward * 4);

    let total = 0;
    const steps = 360;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      total += resolveInkNibWidth(point, Math.cos(a), Math.sin(a), center);
    }
    expect(total / steps).toBeCloseTo(1, 2);

    expect(resolveInkNibWidth(center, 1, 0, center)).toBe(1);
  });

  it("gives every tunnel copy the same nib width as the prop it reflects", () => {
    const center = { x: 400, y: 400 };
    const point = { x: 470, y: 260 };
    const tangent = { x: 0.6, y: 0.8 };
    const base = resolveInkNibWidth(point, tangent.x, tangent.y, center);
    const rotate = (v: { x: number; y: number }, a: number) => ({
      x: v.x * Math.cos(a) - v.y * Math.sin(a),
      y: v.x * Math.sin(a) + v.y * Math.cos(a),
    });
    for (const a of [Math.PI / 2, Math.PI, 1.1]) {
      const offset = rotate({ x: point.x - center.x, y: point.y - center.y }, a);
      const t = rotate(tangent, a);
      expect(
        resolveInkNibWidth(
          { x: center.x + offset.x, y: center.y + offset.y },
          t.x,
          t.y,
          center
        )
      ).toBeCloseTo(base, 10);
    }
    expect(
      resolveInkNibWidth(
        { x: 2 * center.x - point.x, y: point.y },
        -tangent.x,
        tangent.y,
        center
      )
    ).toBeCloseTo(base, 10);
  });

  it("resolves separate Watercolor mark and droplet physics", () => {
    const intent: InkIntent = {
      ambientEmission: 0.1,
      motionEmission: 0.7,
      intensity: 0.5,
      palette: "watercolor",
      customColor: "#4080c0",
      viscosity: 0.1,
      splatterIntensity: 0.1,
      trackingMode: "both_ends",
    };

    const watercolor = resolveInk2D(intent);
    expect(watercolor.strokeWidthMax).toBe(13);
    expect(watercolor.strokeLengthPx).toBe(320);
    expect(watercolor.lifetimeSeconds).toBe(2.2);
    expect(watercolor.opacityMax).toBe(0.68);
    expect(watercolor.strokeGravityPx).toBe(0);
    expect(watercolor.gravityPx).toBeGreaterThan(0);

    const india = resolveInk2D({ ...intent, palette: "india", viscosity: 1 });
    expect(india.strokeLengthPx).toBe(320);
    expect(india.strokeGravityPx).toBeGreaterThan(0);
    expect(india.strokeGravityPx).toBeLessThan(india.gravityPx);
  });

  it("keeps the default Sumi brush mark bold, bounded, and attached", () => {
    const sumi = resolveInk2D({
      ambientEmission: 0.1,
      motionEmission: 0.94,
      intensity: 0.68,
      palette: "sumi",
      customColor: "#0a0a0a",
      viscosity: 0.38,
      splatterIntensity: 0.16,
      trackingMode: "both_ends",
    });

    expect(sumi.strokeWidthMin).toBe(10);
    expect(sumi.strokeWidthMax).toBe(42);
    expect(sumi.strokeLengthPx).toBe(340);
    expect(sumi.lifetimeSeconds).toBe(2.15);
    expect(sumi.strokeGravityPx).toBe(0);
    expect(sumi.gravityPx).toBeGreaterThan(0);
  });

  it("renders Sumi with a narrow matte dry catch on only one side", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const assignments: GlobalCompositeOperation[] = [];
    const pigmentYs: number[] = [];
    const reflectionYs: number[] = [];
    const pigmentWidths: number[] = [];
    const reflectionWidths: number[] = [];
    let composite: GlobalCompositeOperation = "source-over";
    Object.defineProperty(context, "globalCompositeOperation", {
      get: () => composite,
      set: (value: GlobalCompositeOperation) => {
        assignments.push(value);
        composite = value;
      },
    });
    const recordY = (y: number): void => {
      if (composite !== "source-over") return;
      if (context.strokeStyle === "#e5e9ec") {
        reflectionYs.push(y);
        reflectionWidths.push(context.lineWidth);
      } else {
        pigmentYs.push(y);
        pigmentWidths.push(context.lineWidth);
      }
    };
    context.moveTo = vi.fn((_x: number, y: number) => recordY(y));
    context.lineTo = vi.fn((_x: number, y: number) => recordY(y));
    context.quadraticCurveTo = vi.fn(
      (_cpx: number, cpy: number, _x: number, y: number) => {
        recordY(cpy);
        recordY(y);
      }
    );
    context.bezierCurveTo = vi.fn(
      (
        _cp1x: number,
        cp1y: number,
        _cp2x: number,
        cp2y: number,
        _x: number,
        y: number
      ) => {
        recordY(cp1y);
        recordY(cp2y);
        recordY(y);
      }
    );
    const sumi = resolveInk2D({
      ambientEmission: 0,
      motionEmission: 1,
      intensity: 0.68,
      palette: "sumi",
      customColor: "#0a0a0a",
      viscosity: 0.38,
      splatterIntensity: 0,
      trackingMode: "both_ends",
    });

    for (let frame = 0; frame < 18; frame++) {
      renderer.render(
        context,
        sumi,
        [makeTip(100 + frame * 9, 300)],
        1 / 60,
        1.57
      );
    }

    expect(assignments).toContain("source-over");
    expect(assignments).toContain("destination-out");
    expect(assignments).not.toContain("screen");
    expect(assignments).not.toContain("lighter");
    expect(reflectionYs.length).toBeGreaterThan(0);
    expect(
      Math.max(...reflectionYs) <= 300 || Math.min(...reflectionYs) >= 300
    ).toBe(true);
    expect(
      Math.max(...reflectionYs.map((y) => Math.abs(y - 300)))
    ).toBeGreaterThan(2);
    expect(Math.max(...reflectionWidths)).toBeLessThan(3);
    expect(Math.max(...pigmentWidths)).toBeGreaterThan(
      Math.max(...reflectionWidths) * 3
    );
    expect(vi.mocked(context.fill).mock.calls.length).toBeGreaterThan(0);
  });

  it("keeps an eight-second Sumi history inside its path and length bounds", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const sumi = resolveInk2D({
      ambientEmission: 0.1,
      motionEmission: 0.94,
      intensity: 0.68,
      palette: "sumi",
      customColor: "#0a0a0a",
      viscosity: 0.38,
      splatterIntensity: 0,
      trackingMode: "both_ends",
    });

    for (let frame = 0; frame < 8 * 60; frame++) {
      renderer.render(
        context,
        sumi,
        [
          makeTip(
            400 + Math.sin(frame / 35) * 120,
            300 + Math.cos(frame / 47) * 120
          ),
        ],
        1 / 60
      );
    }

    const diagnostics = renderer.getDiagnostics();
    expect(diagnostics.maxPathLength).toBeLessThanOrEqual(
      sumi.strokeLengthPx + 0.01
    );
    expect(diagnostics.pointCount).toBeLessThanOrEqual(sumi.maxPointsPerTip);
    for (const tip of diagnostics.tips) {
      expect(tip.oldestY).toBeGreaterThanOrEqual(180);
      expect(tip.oldestY).toBeLessThanOrEqual(420);
      expect(tip.newestY).toBeGreaterThanOrEqual(180);
      expect(tip.newestY).toBeLessThanOrEqual(420);
    }
  });

  it("fills sparse Sumi motion samples into one attached brush path", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const sumi = resolveInk2D({
      ambientEmission: 0,
      motionEmission: 1,
      intensity: 0.68,
      palette: "sumi",
      customColor: "#0a0a0a",
      viscosity: 0.38,
      splatterIntensity: 0,
      trackingMode: "both_ends",
    });

    renderer.render(context, sumi, [makeTip(100, 300)], 1 / 60);
    renderer.render(context, sumi, [makeTip(180, 300)], 1 / 60);
    renderer.render(context, sumi, [makeTip(260, 300)], 1 / 60);

    const diagnostics = renderer.getDiagnostics();
    expect(diagnostics.pointCount).toBeGreaterThan(6);
    expect(diagnostics.dropletCount).toBe(0);
    expect(diagnostics.tips).toHaveLength(1);
  });

  it("keeps custom pigment attached while acceleration chips remain optional", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const custom = resolveInk2D({
      ambientEmission: 0,
      motionEmission: 1,
      intensity: 0.64,
      palette: "custom",
      customColor: "#2f8fb3",
      viscosity: 0.28,
      splatterIntensity: 0,
      trackingMode: "both_ends",
    });

    renderer.render(context, custom, [makeTip(100, 300)], 1 / 60);
    renderer.render(context, custom, [makeTip(220, 300)], 1 / 60);
    renderer.render(context, custom, [makeTip(340, 300)], 1 / 60);

    const diagnostics = renderer.getDiagnostics();
    expect(diagnostics.pointCount).toBeGreaterThan(1);
    expect(diagnostics.dropletCount).toBe(0);
  });

  it("deposits a loaded Sumi mark during motion below the fast-motion threshold", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const sumi = resolveInk2D({
      ambientEmission: 0,
      motionEmission: 1,
      intensity: 0.68,
      palette: "sumi",
      customColor: "#0a0a0a",
      viscosity: 0.38,
      splatterIntensity: 0,
      trackingMode: "both_ends",
    });

    for (let frame = 0; frame < 120; frame++) {
      renderer.render(
        context,
        sumi,
        [makeTip(100 + frame * 0.25, 300)],
        1 / 60
      );
    }

    expect(renderer.getDiagnostics().pointCount).toBeGreaterThan(2);
  });

  it("batches clean and reflected Sumi into bounded draw-call budgets", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const sumi = resolveInk2D({
      ambientEmission: 0,
      motionEmission: 1,
      intensity: 0.68,
      palette: "sumi",
      customColor: "#0a0a0a",
      viscosity: 0.38,
      splatterIntensity: 0,
      trackingMode: "both_ends",
    });

    for (let frame = 0; frame < 48; frame++) {
      renderer.render(context, sumi, [makeTip(100 + frame * 6, 300)], 1 / 60);
    }
    vi.mocked(context.stroke).mockClear();
    renderer.render(context, sumi, [makeTip(100 + 47 * 6, 300)], 0);

    expect(vi.mocked(context.stroke).mock.calls.length).toBeLessThan(100);

    const tunnelRenderer = new Ink2DRenderer();
    const tunnelContext = makeContext();
    for (let frame = 0; frame < 48; frame++) {
      const emitters = Array.from({ length: 8 }, (_, propIndex) => ({
        ...makeTip(100 + frame * 6, 260 + propIndex * 10),
        propIndex,
      }));
      tunnelRenderer.render(tunnelContext, sumi, emitters, 1 / 60);
    }
    vi.mocked(tunnelContext.stroke).mockClear();
    vi.mocked(tunnelContext.fill).mockClear();
    vi.mocked(tunnelContext.drawImage).mockClear();
    tunnelRenderer.render(
      tunnelContext,
      sumi,
      Array.from({ length: 8 }, (_, propIndex) => ({
        ...makeTip(100 + 47 * 6, 260 + propIndex * 10),
        propIndex,
      })),
      0
    );
    const tunnelPaintCalls =
      vi.mocked(tunnelContext.stroke).mock.calls.length +
      vi.mocked(tunnelContext.fill).mock.calls.length +
      vi.mocked(tunnelContext.drawImage).mock.calls.length;
    expect(tunnelPaintCalls).toBeLessThan(600);
  });

  it("renders identical Ink geometry for identical frame input", () => {
    const params = resolveInk2D({
      ambientEmission: 0.1,
      motionEmission: 0.94,
      intensity: 0.68,
      palette: "sumi",
      customColor: "#0a0a0a",
      viscosity: 0.38,
      splatterIntensity: 0.16,
      trackingMode: "both_ends",
    });
    const firstRenderer = new Ink2DRenderer();
    const secondRenderer = new Ink2DRenderer();
    const firstContext = makeContext();
    const secondContext = makeContext();

    for (let frame = 0; frame < 90; frame++) {
      const tip = makeTip(
        240 + Math.sin(frame / 13) * 80,
        300 + Math.cos(frame / 17) * 60
      );
      firstRenderer.render(firstContext, params, [tip], 1 / 60);
      secondRenderer.render(secondContext, params, [tip], 1 / 60);
    }

    expect(firstRenderer.getDiagnostics()).toEqual(
      secondRenderer.getDiagnostics()
    );
    expect(vi.mocked(firstContext.moveTo).mock.calls).toEqual(
      vi.mocked(secondContext.moveTo).mock.calls
    );
    expect(vi.mocked(firstContext.lineTo).mock.calls).toEqual(
      vi.mocked(secondContext.lineTo).mock.calls
    );
    expect(vi.mocked(firstContext.bezierCurveTo).mock.calls).toEqual(
      vi.mocked(secondContext.bezierCurveTo).mock.calls
    );
    expect(vi.mocked(firstContext.quadraticCurveTo).mock.calls).toEqual(
      vi.mocked(secondContext.quadraticCurveTo).mock.calls
    );
    expect(vi.mocked(firstContext.arc).mock.calls).toEqual(
      vi.mocked(secondContext.arc).mock.calls
    );
    expect(vi.mocked(firstContext.translate).mock.calls).toEqual(
      vi.mocked(secondContext.translate).mock.calls
    );
    expect(vi.mocked(firstContext.rotate).mock.calls).toEqual(
      vi.mocked(secondContext.rotate).mock.calls
    );
    expect(vi.mocked(firstContext.scale).mock.calls).toEqual(
      vi.mocked(secondContext.scale).mock.calls
    );
    expect(vi.mocked(firstContext.drawImage).mock.calls).toEqual(
      vi.mocked(secondContext.drawImage).mock.calls
    );
  });

  it("decorrelates material geometry for emitters following the same path", () => {
    const params = resolveInk2D({
      ambientEmission: 0,
      motionEmission: 1,
      intensity: 0.68,
      palette: "sumi",
      customColor: "#0a0a0a",
      viscosity: 0.38,
      splatterIntensity: 0,
      trackingMode: "both_ends",
    });
    const firstRenderer = new Ink2DRenderer();
    const secondRenderer = new Ink2DRenderer();
    const firstContext = makeContext();
    const secondContext = makeContext();

    for (let frame = 0; frame < 40; frame++) {
      const tip = makeTip(120 + frame * 7, 300);
      firstRenderer.render(firstContext, params, [tip], 1 / 60);
      secondRenderer.render(
        secondContext,
        params,
        [{ ...tip, propIndex: 1 }],
        1 / 60
      );
    }

    expect(vi.mocked(firstContext.moveTo).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(firstContext.moveTo).mock.calls).not.toEqual(
      vi.mocked(secondContext.moveTo).mock.calls
    );
  });

  it("keeps interior Sumi material chunks stable when the oldest point is evicted", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    let composite: GlobalCompositeOperation = "source-over";
    let alpha = 1;
    let currentPath: string[] = [];
    let dryChunks: string[] = [];
    const coordinate = (...values: number[]): string =>
      values.map((value) => value.toFixed(5)).join(",");

    Object.defineProperty(context, "globalCompositeOperation", {
      get: () => composite,
      set: (value: GlobalCompositeOperation) => {
        composite = value;
      },
    });
    Object.defineProperty(context, "globalAlpha", {
      get: () => alpha,
      set: (value: number) => {
        alpha = value;
      },
    });
    context.beginPath = vi.fn(() => {
      currentPath = [];
    });
    context.moveTo = vi.fn((x: number, y: number) => {
      currentPath.push(`M${coordinate(x, y)}`);
    });
    context.lineTo = vi.fn((x: number, y: number) => {
      currentPath.push(`L${coordinate(x, y)}`);
    });
    context.quadraticCurveTo = vi.fn(
      (cpx: number, cpy: number, x: number, y: number) => {
        currentPath.push(`Q${coordinate(cpx, cpy, x, y)}`);
      }
    );
    context.bezierCurveTo = vi.fn(
      (
        cp1x: number,
        cp1y: number,
        cp2x: number,
        cp2y: number,
        x: number,
        y: number
      ) => {
        currentPath.push(`C${coordinate(cp1x, cp1y, cp2x, cp2y, x, y)}`);
      }
    );
    const captureDryPath = (): void => {
      if (
        composite === "source-over" &&
        context.lineWidth < 3 &&
        currentPath.some((command) => command.startsWith("C"))
      ) {
        dryChunks.push(`${alpha.toFixed(6)}:${currentPath.join("|")}`);
      }
    };
    context.fill = vi.fn(captureDryPath);
    context.stroke = vi.fn(captureDryPath);

    const params: Ink2DParams = {
      ...resolveInk2D({
        ambientEmission: 0,
        motionEmission: 1,
        intensity: 0.68,
        palette: "sumi",
        customColor: "#0a0a0a",
        viscosity: 0.38,
        splatterIntensity: 0,
        trackingMode: "both_ends",
      }),
      lifetimeSeconds: 20,
      maxPointsPerTip: 48,
      strokeLengthPx: 2_000,
      motionSpawnRate: 600,
    };

    for (let frame = 0; frame < 38; frame++) {
      renderer.render(context, params, [makeTip(100 + frame * 8, 300)], 1 / 60);
    }

    dryChunks = [];
    renderer.render(context, params, [makeTip(100 + 37 * 8, 300)], 0);
    const beforeEviction = new Set(dryChunks);

    const internalTips = (
      renderer as unknown as {
        tips: Map<string, { points: unknown[] }>;
      }
    ).tips;
    const tipState = internalTips.values().next().value;
    expect(tipState).toBeDefined();
    tipState!.points.shift();

    dryChunks = [];
    renderer.render(context, params, [makeTip(100 + 37 * 8, 300)], 0);
    const stableInteriorChunks = dryChunks.filter((chunk) =>
      beforeEviction.has(chunk)
    );

    expect(beforeEviction.size).toBeGreaterThan(3);
    expect(stableInteriorChunks.length).toBeGreaterThanOrEqual(2);
  });

  it("uses the translated Watercolor opacity without a second renderer cap", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const alphaAssignments: number[] = [];
    let alpha = 0;
    Object.defineProperty(context, "globalAlpha", {
      get: () => alpha,
      set: (value: number) => {
        alphaAssignments.push(value);
        alpha = value;
      },
    });
    const watercolor = makeParams({
      intensity: 1,
      opacityMax: 0.8,
      motionSpawnRate: 600,
      splatterIntensity: 0,
      gravityPx: 0,
    });

    for (let frame = 0; frame < 20; frame++) {
      renderer.render(
        context,
        watercolor,
        [makeTip(100 + frame * 8, 300)],
        1 / 60
      );
    }

    expect(Math.max(...alphaAssignments)).toBeGreaterThan(0.4);
    expect(Math.max(...alphaAssignments)).toBeLessThanOrEqual(0.8);
  });

  it("keeps Neon narrow and attached while preserving additive pigment", () => {
    const neon = resolveInk2D({
      ambientEmission: 0.1,
      motionEmission: 1,
      intensity: 0.9,
      palette: "neon",
      customColor: "#ff2080",
      viscosity: 0.2,
      splatterIntensity: 0.4,
      trackingMode: "both_ends",
    });

    expect(neon.strokeWidthMax).toBe(10);
    expect(neon.strokeLengthPx).toBe(220);
    expect(neon.lifetimeSeconds).toBe(1.55);
    expect(neon.strokeGravityPx).toBe(0);
    expect(neon.resolvedPalette.emissive).toBe(true);
  });

  it("applies attached-mark gravity only to deliberately viscous dense ink", () => {
    const base: InkIntent = {
      ambientEmission: 0.1,
      motionEmission: 0.8,
      intensity: 0.7,
      palette: "india",
      customColor: "#0a0a0a",
      viscosity: 0.3,
      splatterIntensity: 0.3,
      trackingMode: "both_ends",
    };

    expect(resolveInk2D(base).strokeGravityPx).toBe(0);
    expect(
      resolveInk2D({ ...base, viscosity: 0.8 }).strokeGravityPx
    ).toBeGreaterThan(0);
  });

  it("builds a continuous filled ribbon with clipped granulation", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const params = makeParams({ splatterIntensity: 0, gravityPx: 0 });

    for (let frame = 0; frame < 24; frame++) {
      renderer.render(context, params, [makeTip(100 + frame * 8, 300)], 1 / 60);
    }

    expect(vi.mocked(context.fill).mock.calls.length).toBeGreaterThan(20);
    expect(vi.mocked(context.drawImage).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(context.stroke).mock.calls.length).toBeGreaterThan(0);
  });

  it("bounds visible history by scaled path length", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const params = makeParams({
      splatterIntensity: 0,
      gravityPx: 0,
      strokeGravityPx: 0,
      strokeLengthPx: 240,
    });

    for (let frame = 0; frame < 100; frame++) {
      renderer.render(
        context,
        params,
        [makeTip(100 + frame * 10, 300)],
        1 / 60
      );
    }

    expect(renderer.getDiagnostics().maxPathLength).toBeLessThanOrEqual(240.01);
  });

  it("keeps a seamless LOOP connected across its playback boundary", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const params = makeParams({
      motionSpawnRate: 600,
      splatterIntensity: 0,
      gravityPx: 0,
      lifetimeSeconds: 10,
      strokeLengthPx: 2000,
    });

    for (let frame = 0; frame < 12; frame++) {
      renderer.render(context, params, [makeTip(100 + frame * 8, 300)], 1 / 60);
    }
    const beforeBoundary = renderer.getDiagnostics();

    renderer.render(context, params, [makeTip(196, 300)], 1 / 60, 1, {
      loopDetected: true,
      isSeamlesslyLoopable: true,
    });

    const afterBoundary = renderer.getDiagnostics();
    expect(beforeBoundary.pointCount).toBeGreaterThan(0);
    expect(afterBoundary.detachedStrokeCount).toBe(0);
    expect(afterBoundary.pointCount).toBeGreaterThanOrEqual(
      beforeBoundary.pointCount
    );
  });

  it("preserves the old mark without bridging a freeform reset", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const params = makeParams({
      motionSpawnRate: 600,
      splatterIntensity: 0,
      gravityPx: 0,
      lifetimeSeconds: 10,
      strokeLengthPx: 2000,
    });

    for (let frame = 0; frame < 12; frame++) {
      renderer.render(context, params, [makeTip(100 + frame * 8, 300)], 1 / 60);
    }
    const beforeBoundary = renderer.getDiagnostics();

    renderer.render(context, params, [makeTip(700, 300)], 1 / 60, 1, {
      loopDetected: true,
      isSeamlesslyLoopable: false,
    });
    renderer.render(context, params, [makeTip(708, 300)], 1 / 60);

    const afterBoundary = renderer.getDiagnostics();
    expect(beforeBoundary.pointCount).toBeGreaterThan(0);
    expect(afterBoundary.detachedStrokeCount).toBe(1);
    expect(afterBoundary.pointCount).toBeGreaterThan(0);
    expect(afterBoundary.maxPathLength).toBeLessThan(300);
  });

  it("keeps the Watercolor mark on its path while dense ink strands sag", () => {
    const watercolorRenderer = new Ink2DRenderer();
    const watercolor = makeParams({
      effectiveAmbient: 1,
      ambientSpawnRate: 60,
      motionSpawnRate: 0,
      splatterIntensity: 0,
      gravityPx: 36,
      strokeGravityPx: 0,
    });
    watercolorRenderer.render(
      makeContext(),
      watercolor,
      [makeTip(100, 300)],
      1 / 60
    );
    watercolorRenderer.render(
      makeContext(),
      watercolor,
      [makeTip(100, 300)],
      1 / 60
    );
    for (let frame = 0; frame < 30; frame++) {
      watercolorRenderer.render(makeContext(), watercolor, [], 1 / 60);
    }

    const watercolorTip = watercolorRenderer.getDiagnostics().tips[0];
    expect(watercolorTip?.oldestY).toBeCloseTo(300);

    const denseRenderer = new Ink2DRenderer();
    const dense = makeParams({
      palette: "india",
      resolvedPalette: INK_PALETTES.india,
      opacityMax: 1,
      effectiveAmbient: 1,
      ambientSpawnRate: 60,
      motionSpawnRate: 0,
      splatterIntensity: 0,
      gravityPx: 36,
      strokeGravityPx: 36,
      lifetimeSeconds: 3,
      strokeLengthPx: 420,
    });
    denseRenderer.render(makeContext(), dense, [makeTip(100, 300)], 1 / 60);
    denseRenderer.render(makeContext(), dense, [makeTip(100, 300)], 1 / 60);
    for (let frame = 0; frame < 30; frame++) {
      denseRenderer.render(makeContext(), dense, [], 1 / 60);
    }

    expect(denseRenderer.getDiagnostics().tips[0]?.oldestY).toBeGreaterThan(
      304
    );
  });

  it("keeps watercolor non-additive while preserving neon's additive material", () => {
    const watercolorRenderer = new Ink2DRenderer();
    const watercolorContext = makeContext();
    const watercolorAssignments: GlobalCompositeOperation[] = [];
    let watercolorComposite: GlobalCompositeOperation = "source-over";
    Object.defineProperty(watercolorContext, "globalCompositeOperation", {
      get: () => watercolorComposite,
      set: (value: GlobalCompositeOperation) => {
        watercolorAssignments.push(value);
        watercolorComposite = value;
      },
    });

    const watercolor = makeParams({ splatterIntensity: 0, gravityPx: 0 });
    watercolorRenderer.render(
      watercolorContext,
      watercolor,
      [makeTip(100, 300)],
      1 / 60
    );
    watercolorRenderer.render(
      watercolorContext,
      watercolor,
      [makeTip(180, 300)],
      1 / 60
    );

    expect(watercolorAssignments).toContain("source-over");
    expect(watercolorAssignments).not.toContain("lighter");

    const neonRenderer = new Ink2DRenderer();
    const neonContext = makeContext();
    const neonAssignments: GlobalCompositeOperation[] = [];
    let neonComposite: GlobalCompositeOperation = "source-over";
    Object.defineProperty(neonContext, "globalCompositeOperation", {
      get: () => neonComposite,
      set: (value: GlobalCompositeOperation) => {
        neonAssignments.push(value);
        neonComposite = value;
      },
    });
    const neon = makeParams({
      palette: "neon",
      resolvedPalette: INK_PALETTES.neon,
      opacityMax: 1,
      splatterIntensity: 0,
      gravityPx: 0,
    });
    neonRenderer.render(neonContext, neon, [makeTip(100, 300)], 1 / 60);
    neonRenderer.render(neonContext, neon, [makeTip(180, 300)], 1 / 60);

    expect(neonAssignments).toContain("lighter");
  });

  it("gives dense ink a wet reflection without making it additive", () => {
    const renderer = new Ink2DRenderer();
    const context = makeContext();
    const assignments: GlobalCompositeOperation[] = [];
    let composite: GlobalCompositeOperation = "source-over";
    Object.defineProperty(context, "globalCompositeOperation", {
      get: () => composite,
      set: (value: GlobalCompositeOperation) => {
        assignments.push(value);
        composite = value;
      },
    });
    const india = makeParams({
      palette: "india",
      resolvedPalette: INK_PALETTES.india,
      opacityMax: 1,
      splatterIntensity: 0,
      gravityPx: 0,
    });

    renderer.render(context, india, [makeTip(100, 300)], 1 / 60);
    renderer.render(context, india, [makeTip(180, 300)], 1 / 60);

    expect(assignments).toContain("screen");
    expect(assignments).not.toContain("lighter");
  });

  it("turns an acceleration spike into bounded velocity-driven splatter", () => {
    const quietRenderer = new Ink2DRenderer();
    const quietContext = makeContext();
    const quiet = makeParams({
      motionSpawnRate: 0,
      splatterIntensity: 0,
      gravityPx: 0,
    });
    quietRenderer.render(quietContext, quiet, [makeTip(100, 300)], 1 / 60);
    quietRenderer.render(quietContext, quiet, [makeTip(220, 300)], 1 / 60);
    expect(vi.mocked(quietContext.arc)).not.toHaveBeenCalled();

    const loudRenderer = new Ink2DRenderer();
    const loudParams = makeParams({
      motionSpawnRate: 0,
      splatterIntensity: 1,
      gravityPx: 0,
      dropletPoolSize: 3,
    });
    loudRenderer.render(makeContext(), loudParams, [makeTip(100, 300)], 1 / 60);
    loudRenderer.render(makeContext(), loudParams, [makeTip(220, 300)], 1 / 60);

    const finalContext = makeContext();
    loudRenderer.render(finalContext, loudParams, [], 1 / 60);
    expect(vi.mocked(finalContext.arc).mock.calls.length).toBe(6);
  });

  it("renders Blood splatter as irregular pointed chips instead of oval stamps", () => {
    const renderer = new Ink2DRenderer();
    const blood = makeParams({
      palette: "blood",
      resolvedPalette: INK_PALETTES.blood,
      motionSpawnRate: 0,
      splatterIntensity: 1,
      gravityPx: 0,
      dropletPoolSize: 3,
    });
    renderer.render(makeContext(), blood, [makeTip(100, 300)], 1 / 60);
    renderer.render(makeContext(), blood, [makeTip(220, 300)], 1 / 60);

    const finalContext = makeContext();
    renderer.render(finalContext, blood, [], 1 / 60);

    expect(vi.mocked(finalContext.bezierCurveTo)).toHaveBeenCalled();
    expect(vi.mocked(finalContext.quadraticCurveTo)).toHaveBeenCalled();
    expect(vi.mocked(finalContext.arc)).not.toHaveBeenCalled();
  });

  it("keeps the Blood stroke attached beneath its acceleration chips", () => {
    const renderer = new Ink2DRenderer();
    const blood = makeParams({
      palette: "blood",
      resolvedPalette: INK_PALETTES.blood,
      motionSpawnRate: 600,
      splatterIntensity: 0.34,
      gravityPx: 0,
    });

    renderer.render(makeContext(), blood, [makeTip(100, 300)], 1 / 60);
    renderer.render(makeContext(), blood, [makeTip(220, 300)], 1 / 60);
    renderer.render(makeContext(), blood, [makeTip(340, 300)], 1 / 60);

    const diagnostics = renderer.getDiagnostics();
    expect(diagnostics.pointCount).toBeGreaterThan(1);
    expect(diagnostics.tips[0]?.pathLength).toBeGreaterThan(100);
  });
});
