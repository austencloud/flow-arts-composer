import { describe, expect, it } from "vitest";
import {
  POST_MAX_EDGE_BORDER,
  POST_PLAIN_EDGE,
  PostProjectSchema,
  type PostProject,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  POST_EDGE_COLOR_HEX,
  mergeEdge,
  regionEdge,
} from "$lib/shared/media-composition/domain/post-clip-edge";
import { updateItem } from "$lib/shared/media-composition/domain/post-project-edits";
import {
  compilePostProject,
  staffEffectRole,
} from "$lib/shared/media-composition/domain/post-project-compiler";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import { renderPostStudioFrame } from "$lib/shared/media-composition/services/post-studio-frame-compositor";
import {
  paintEdgeBorder,
  paintEdgeShadow,
  regionEdgePixels,
} from "$lib/shared/media-composition/services/region-edge-painter";
import { traceRoundedRect } from "$lib/shared/render/utils/trace-rounded-rect";
import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";
import { NOW, project, video } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };

function valid(p: PostProject): PostProject {
  const parsed = PostProjectSchema.safeParse(p);
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  return p;
}

function clip(p: PostProject, id: string): PostVideoItem {
  return p.tracks.flatMap((track) => track.items).find((item) => item.id === id) as PostVideoItem;
}

interface Call {
  name: string;
  args: unknown[];
  /** The context's settable state when the call was made. */
  state: Record<string, unknown>;
}

/** A 2D context that records each call with the state it was made under. */
function recordingContext(canvas = { width: 1080, height: 1920 }): {
  context: CanvasRenderingContext2D;
  calls: Call[];
} {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { canvas };
  const stack: Record<string, unknown>[] = [];
  const context = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key as string];
      return (...args: unknown[]) => {
        const name = String(key);
        if (name === "save") stack.push({ ...target });
        if (name === "restore") {
          const saved = stack.pop();
          if (saved) {
            for (const field of Object.keys(target)) delete target[field];
            Object.assign(target, saved);
          }
        }
        calls.push({ name, args, state: { ...target } });
      };
    },
    set(target, key, value) {
      target[key as string] = value;
      return true;
    },
  });
  return { context: context as unknown as CanvasRenderingContext2D, calls };
}

describe("a clip's edge", () => {
  it("keeps each amount in range and stores nothing when plain", () => {
    expect(
      mergeEdge(POST_PLAIN_EDGE, { corners: 2, border: 1, shadow: -1, borderColor: "red" })
    ).toEqual({ corners: 0.5, border: POST_MAX_EDGE_BORDER, borderColor: "red", shadow: 0 });
    expect(mergeEdge(POST_PLAIN_EDGE, { borderColor: "blue" })).toBeNull();
    expect(
      mergeEdge({ corners: 0.1, border: 0, borderColor: "white", shadow: 0 }, { corners: 0 })
    ).toBeNull();
  });

  it("is laid on a clip through an edit and taken off when plain again", () => {
    const base = project([video("v1")]);
    const rounded = valid(updateItem(base, "v1", { edge: { corners: 0.2 } }, ctx));
    expect(clip(rounded, "v1").edge).toEqual({
      corners: 0.2,
      border: 0,
      borderColor: "white",
      shadow: 0,
    });
    const bordered = valid(
      updateItem(rounded, "v1", { edge: { border: 0.01, borderColor: "gold" } }, ctx)
    );
    expect(clip(bordered, "v1").edge).toMatchObject({ corners: 0.2, border: 0.01 });
    const cleared = valid(
      updateItem(bordered, "v1", { edge: { corners: 0, border: 0 } }, ctx)
    );
    expect(clip(cleared, "v1")).not.toHaveProperty("edge");
    expect(updateItem(cleared, "v1", { edge: null }, ctx)).toBe(cleared);
  });

  it("reaches the compiled region in the colour the export paints", () => {
    expect(regionEdge(undefined)).toBeUndefined();
    expect(regionEdge(POST_PLAIN_EDGE)).toBeUndefined();

    const edge = { corners: 0.25, border: 0.01, borderColor: "violet", shadow: 0.5 } as const;
    const result = compilePostProject(project([video("v1", { edge: { ...edge } })]), ctx)!;
    const region = result.preset.regions.find((entry) => entry.id === "v1");
    expect(region?.edge).toEqual({
      cornerRadius: 0.25,
      borderWidth: 0.01,
      borderColor: POST_EDGE_COLOR_HEX.violet,
      shadow: 0.5,
    });

    const plain = compilePostProject(project([video("v1")]), ctx)!;
    expect(plain.preset.regions.find((entry) => entry.id === "v1")).not.toHaveProperty("edge");
  });
});

describe("the edge in pixels", () => {
  const edge = { cornerRadius: 0.5, borderWidth: 0.01, borderColor: "#fff", shadow: 1 };

  it("rounds against the picture and borders against the post", () => {
    const pixels = regionEdgePixels(edge, { width: 400, height: 300 }, { width: 1080, height: 1920 });
    expect(pixels.radius).toBe(150);
    expect(pixels.border).toBeCloseTo(10.8, 9);
    expect(pixels.shadow).not.toBeNull();
    expect(regionEdgePixels({ ...edge, shadow: 0 }, { width: 400, height: 300 }, { width: 1080, height: 1920 }).shadow).toBeNull();
  });

  it("scales with the stage, so the preview is the export made smaller", () => {
    const full = regionEdgePixels(edge, { width: 540, height: 960 }, { width: 1080, height: 1920 });
    const half = regionEdgePixels(edge, { width: 270, height: 480 }, { width: 540, height: 960 });
    expect(half.radius).toBeCloseTo(full.radius / 2, 9);
    expect(half.border).toBeCloseTo(full.border / 2, 9);
    expect(half.shadow!.blur).toBeCloseTo(full.shadow!.blur / 2, 9);
    expect(half.shadow!.drop).toBeCloseTo(full.shadow!.drop / 2, 9);
  });

  it("never draws a border wider than half the picture", () => {
    const pixels = regionEdgePixels(
      { ...edge, borderWidth: 1 },
      { width: 20, height: 10 },
      { width: 1080, height: 1920 }
    );
    expect(pixels.border).toBe(5);
  });
});

describe("the edge painter", () => {
  const rect = { x: 100, y: 200, width: 400, height: 300 };

  it("traces square corners as a plain rect and rounds the rest", () => {
    const { context, calls } = recordingContext();
    traceRoundedRect(context, rect, 0);
    expect(calls.map((call) => call.name)).toEqual(["beginPath", "rect"]);

    const rounded = recordingContext();
    traceRoundedRect(rounded.context, rect, 500);
    const round = rounded.calls.find((call) => call.name === "roundRect");
    expect(round?.args).toEqual([100, 200, 400, 300, 150]);
  });

  it("casts only the shadow into place, faded with the clip", () => {
    const { context, calls } = recordingContext();
    const pixels = regionEdgePixels(
      { cornerRadius: 0, borderWidth: 0, borderColor: "#fff", shadow: 1 },
      rect,
      { width: 1080, height: 1920 }
    );
    paintEdgeShadow(context, rect, pixels, 0.5);
    const translate = calls.find((call) => call.name === "translate")!;
    const fill = calls.find((call) => call.name === "fill")!;
    const away = -(translate.args[0] as number);
    // The shape lands off the frame; only its shadow comes back over the rect.
    expect(rect.x + rect.width - away).toBeLessThan(0);
    expect(fill.state.shadowOffsetX).toBe(away);
    expect(fill.state.shadowOffsetY).toBeCloseTo(pixels.shadow!.drop, 9);
    expect(fill.state.shadowColor).toBe(`rgba(0, 0, 0, ${pixels.shadow!.alpha * 0.5})`);

    const none = recordingContext();
    paintEdgeShadow(none.context, rect, pixels, 0);
    expect(none.calls).toEqual([]);
  });

  it("strokes the border inside the edge, following its corners", () => {
    const { context, calls } = recordingContext();
    paintEdgeBorder(
      context,
      rect,
      { radius: 30, border: 10, color: "#ff0000", shadow: null },
      1
    );
    expect(calls.find((call) => call.name === "roundRect")?.args).toEqual([105, 205, 390, 290, 25]);
    const stroke = calls.find((call) => call.name === "stroke")!;
    expect(stroke.state).toMatchObject({ lineWidth: 10, strokeStyle: "#ff0000", globalAlpha: 1 });
  });
});

describe("the export", () => {
  it("lays the shadow under a clip's layers, clips them round and borders over them", async () => {
    const edge = { corners: 0.2, border: 0.01, borderColor: "red", shadow: 0.6 } as const;
    const box = { x: 0.1, y: 0.1, width: 0.5, height: 0.4 };
    const result = compilePostProject(
      project([video("v1", { box, edge: { ...edge }, staffEffect: { effect: "trails" } })]),
      ctx
    )!;
    const layers = evaluatePresetFrame(result.preset, result.durationSeconds, 1).filter(
      (layer) => layer.clipId === "v1~staff"
    );
    expect(layers).toHaveLength(1);

    const { context, calls } = recordingContext({
      width: result.preset.output.width,
      height: result.preset.output.height,
    });
    const painter: PostStudioLayerPainter = {
      prepare: () => Promise.resolve(),
      paint: (target) => {
        (target as unknown as { paint: () => void }).paint();
      },
    };
    await renderPostStudioFrame({
      canvas: {
        width: result.preset.output.width,
        height: result.preset.output.height,
        getContext: () => context,
      } as unknown as HTMLCanvasElement,
      root: {} as HTMLElement,
      preset: result.preset,
      layers,
      cardFrameCache: new Map(),
      painters: new Map([[staffEffectRole("v1"), painter]]),
      timeSeconds: 1,
    });

    const names = calls.map((call) => call.name);
    const shadowFill = names.findIndex(
      (name, index) => name === "fill" && (calls[index]!.state.shadowBlur as number) > 0
    );
    const clipAt = names.indexOf("clip");
    const paintAt = names.indexOf("paint");
    const strokeAt = names.indexOf("stroke");
    expect(shadowFill).toBeGreaterThan(-1);
    expect(shadowFill).toBeLessThan(clipAt);
    expect(clipAt).toBeLessThan(paintAt);
    expect(paintAt).toBeLessThan(strokeAt);
    // The layer's clip is the rounded picture: the path begun just before it.
    const pathAt = names.lastIndexOf("beginPath", clipAt);
    expect(calls[pathAt + 1]?.name).toBe("roundRect");
    expect(calls[pathAt + 1]?.args[4]).toBeGreaterThan(0);
    expect(calls[strokeAt]!.state.strokeStyle).toBe(POST_EDGE_COLOR_HEX.red);
  });
});
