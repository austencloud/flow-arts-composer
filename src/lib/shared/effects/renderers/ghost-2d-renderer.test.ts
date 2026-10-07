import { describe, expect, it, vi } from "vitest";
import type { Ghost2DParams } from "../translators/canvas2d-types";
import {
  GHOST_FROST_WHITE,
  GHOST_RIM_FROST_MIX,
  resolveGhost2DAgeVisual,
} from "./ghost-chrono-frost-2d";
import {
  Ghost2DRenderer,
  type GhostInput,
  type GhostProp,
} from "./ghost-2d-renderer";

const IMG = { complete: true } as unknown as CanvasImageSource;

function makeCtx() {
  let alpha = 1;
  let composite: GlobalCompositeOperation = "source-over";
  return {
    canvas: { width: 400, height: 400 },
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(value: number) {
      alpha = value;
    },
    get globalCompositeOperation() {
      return composite;
    },
    set globalCompositeOperation(value: GlobalCompositeOperation) {
      composite = value;
    },
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function makeParams(overrides: Partial<Ghost2DParams> = {}): Ghost2DParams {
  return {
    intensity: 1,
    decay: 8,
    interval: 0.5,
    ...overrides,
  };
}

function prop(overrides: Partial<GhostProp> = {}): GhostProp {
  return {
    id: 0,
    image: IMG,
    centerX: 100,
    centerY: 100,
    angle: 0,
    width: 40,
    height: 200,
    flipped: false,
    ...overrides,
  };
}

function input(
  props: GhostProp[],
  epoch: string | number = "seq-a",
  currentStep = 0
): GhostInput {
  return { props, currentStep, epoch };
}

function phantomCount(ctx: CanvasRenderingContext2D): number {
  return (ctx.translate as ReturnType<typeof vi.fn>).mock.calls.length;
}

function clearDrawCalls(ctx: CanvasRenderingContext2D): void {
  (ctx.translate as ReturnType<typeof vi.fn>).mockClear();
  (ctx.drawImage as ReturnType<typeof vi.fn>).mockClear();
}

describe("Ghost2DRenderer — Chrono-Frost prop onion-skin", () => {
  it("omits the current live pose until the prop moves", () => {
    const renderer = new Ghost2DRenderer();
    const ctx = makeCtx();

    renderer.render(
      ctx,
      makeParams(),
      input([prop({ centerX: 100 })]),
      0.016,
      1
    );
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(phantomCount(ctx)).toBe(0);

    clearDrawCalls(ctx);
    renderer.render(
      ctx,
      makeParams(),
      input([prop({ centerX: 320 })]),
      0.016,
      1
    );
    expect(phantomCount(ctx)).toBe(1);
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it("deduplicates a stationary pose", () => {
    const renderer = new Ghost2DRenderer();
    const ctx = makeCtx();
    renderer.render(ctx, makeParams(), input([prop()]), 0.016, 1);
    clearDrawCalls(ctx);

    renderer.render(ctx, makeParams(), input([prop()]), 0.016, 1);
    expect(phantomCount(ctx)).toBe(0);
  });

  it("keeps blue and red draw budgets independent", () => {
    const renderer = new Ghost2DRenderer();
    const ctx = makeCtx();
    renderer.render(
      ctx,
      makeParams(),
      input([prop({ id: 0 }), prop({ id: 1 })]),
      0.016,
      1
    );
    clearDrawCalls(ctx);

    renderer.render(
      ctx,
      makeParams(),
      input([prop({ id: 0, centerX: 320 }), prop({ id: 1, centerX: 320 })]),
      0.016,
      1
    );
    expect(phantomCount(ctx)).toBe(2);
  });

  it("fully prunes exposures past the persistence window", () => {
    const renderer = new Ghost2DRenderer();
    const ctx = makeCtx();
    renderer.render(ctx, makeParams({ decay: 8 }), input([prop()]), 0.016, 1);
    renderer.render(
      ctx,
      makeParams({ decay: 8 }),
      input([prop({ centerX: 320 })]),
      0.016,
      1
    );
    clearDrawCalls(ctx);

    renderer.render(ctx, makeParams({ decay: 8 }), input([]), 3, 1);
    expect(phantomCount(ctx)).toBe(0);
  });

  it("wipes the exposure when the sequence epoch changes", () => {
    const renderer = new Ghost2DRenderer();
    const ctx = makeCtx();
    renderer.render(
      ctx,
      makeParams(),
      input([prop({ centerX: 100 })], "seq-a"),
      0.016,
      1
    );
    renderer.render(
      ctx,
      makeParams(),
      input([prop({ centerX: 320 })], "seq-a"),
      0.016,
      1
    );
    clearDrawCalls(ctx);

    renderer.render(
      ctx,
      makeParams(),
      input([prop({ centerX: 200 })], "seq-b"),
      0.016,
      1
    );
    expect(phantomCount(ctx)).toBe(0);
  });

  it("higher Density retains more distinct poses while visible work stays bounded", () => {
    function ghostsAfterSweep(density: number, propId = 0): number {
      const renderer = new Ghost2DRenderer();
      const ctx = makeCtx();
      for (let index = 0; index < 28; index += 1) {
        renderer.render(
          ctx,
          makeParams({ interval: density }),
          input([prop({ id: propId, angle: index * 0.05 })]),
          0.01,
          1
        );
      }
      clearDrawCalls(ctx);
      renderer.render(
        ctx,
        makeParams({ interval: density }),
        input([prop({ id: propId, angle: 28 * 0.05 })]),
        0.01,
        1
      );
      return phantomCount(ctx);
    }

    expect(ghostsAfterSweep(0.9)).toBeGreaterThan(ghostsAfterSweep(0.1));
    expect(ghostsAfterSweep(0.9)).toBeLessThanOrEqual(10);
  });

  it("caps each prop at ten visible phantoms", () => {
    const renderer = new Ghost2DRenderer();
    const ctx = makeCtx();
    for (let index = 0; index < 36; index += 1) {
      renderer.render(
        ctx,
        makeParams({ interval: 1, decay: 10 }),
        input([
          prop({ id: 0, angle: index * 0.09 }),
          prop({ id: 1, angle: index * 0.09 }),
        ]),
        0.01,
        1
      );
    }
    clearDrawCalls(ctx);

    renderer.render(
      ctx,
      makeParams({ interval: 1, decay: 10 }),
      input([prop({ id: 0, angle: 4 }), prop({ id: 1, angle: 4 })]),
      0.01,
      1
    );
    expect(phantomCount(ctx)).toBe(20);
  });

  it("falls back to a direct sprite blit when treatment canvases are unavailable", () => {
    const createElement = vi.spyOn(document, "createElement").mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement);
    const renderer = new Ghost2DRenderer();
    const ctx = makeCtx();
    try {
      renderer.render(ctx, makeParams(), input([prop()]), 0.016, 1);
      renderer.render(
        ctx,
        makeParams(),
        input([prop({ centerX: 320 })]),
        0.016,
        1
      );
      expect(phantomCount(ctx)).toBe(1);
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    } finally {
      createElement.mockRestore();
    }
  });

  it("reset clears history and cached cross-frame state", () => {
    const renderer = new Ghost2DRenderer();
    const ctx = makeCtx();
    renderer.render(ctx, makeParams(), input([prop()]), 0.016, 1);
    renderer.reset();
    clearDrawCalls(ctx);
    renderer.render(ctx, makeParams(), input([]), 0.016, 1);
    expect(phantomCount(ctx)).toBe(0);
  });
});

describe("2D Chrono-Frost presentation", () => {
  it("progresses from body to frost to a fading cold rim", () => {
    const fresh = resolveGhost2DAgeVisual(0, 2, 1);
    const middle = resolveGhost2DAgeVisual(0.8, 2, 1);
    const old = resolveGhost2DAgeVisual(1.7, 2, 1);
    const expired = resolveGhost2DAgeVisual(2, 2, 1);

    expect(fresh.bodyAlpha).toBeGreaterThan(middle.bodyAlpha);
    expect(middle.frostAlpha).toBeGreaterThan(fresh.frostAlpha);
    expect(old.rimAlpha).toBeGreaterThan(old.bodyAlpha);
    expect(expired).toEqual({ bodyAlpha: 0, rimAlpha: 0, frostAlpha: 0 });
  });

  it("scales every layer by intensity", () => {
    const full = resolveGhost2DAgeVisual(0.5, 2, 1);
    const half = resolveGhost2DAgeVisual(0.5, 2, 0.5);
    expect(half.bodyAlpha).toBeCloseTo(full.bodyAlpha * 0.5);
    expect(half.rimAlpha).toBeCloseTo(full.rimAlpha * 0.5);
    expect(half.frostAlpha).toBeCloseTo(full.frostAlpha * 0.5);
  });

});

describe("2D ghost keeps the prop's own look", () => {
  interface FillRecord {
    composite: GlobalCompositeOperation;
    alpha: number;
    fillStyle: string;
  }

  /** OffscreenCanvas stand-in that records how treatment layers are filled. */
  function installRecordingOffscreenCanvas(fills: FillRecord[]) {
    class RecordingOffscreenCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        const state = {
          globalCompositeOperation: "source-over" as GlobalCompositeOperation,
          globalAlpha: 1,
          fillStyle: "#000000",
        };
        return Object.assign(state, {
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          fillRect: vi.fn(() => {
            fills.push({
              composite: state.globalCompositeOperation,
              alpha: state.globalAlpha,
              fillStyle: String(state.fillStyle),
            });
          }),
        });
      }
    }
    vi.stubGlobal("OffscreenCanvas", RecordingOffscreenCanvas);
  }

  function renderOneGhost(): CanvasRenderingContext2D {
    const renderer = new Ghost2DRenderer();
    const ctx = makeCtx();
    renderer.render(ctx, makeParams(), input([prop({ centerX: 100 })]), 0.016, 1);
    renderer.render(ctx, makeParams(), input([prop({ centerX: 320 })]), 0.016, 1);
    return ctx;
  }

  it("draws the ghost body from the live prop sprite itself", () => {
    installRecordingOffscreenCanvas([]);
    try {
      const ctx = renderOneGhost();
      const drawn = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0]
      );
      expect(drawn).toContain(IMG);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never floods a layer with a hand color, only a light frost lift", () => {
    const fills: FillRecord[] = [];
    installRecordingOffscreenCanvas(fills);
    try {
      renderOneGhost();
      // A source-in fill would replace the sprite's bark/tape colors with one
      // flat hue. The rim may only lean toward frost white, atop its own colors.
      expect(fills.some((fill) => fill.composite === "source-in")).toBe(false);
      const rimLift = fills.find((fill) => fill.composite === "source-atop");
      expect(rimLift).toEqual({
        composite: "source-atop",
        alpha: GHOST_RIM_FROST_MIX,
        fillStyle: GHOST_FROST_WHITE,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
