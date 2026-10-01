import { describe, expect, it } from "vitest";
import {
  createStaffEffectPainter,
  createStaffPointMapper,
} from "$lib/shared/media-composition/services/staff-effect-painter";
import { POST_STAFF_EFFECTS } from "$lib/shared/media-composition/domain/post-project";
import type { StaffTipTrack } from "$lib/shared/media-composition/domain/staff-tip-track";
import {
  compilePostProject,
  staffEffectRole,
} from "$lib/shared/media-composition/domain/post-project-compiler";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import { renderPostStudioFrame } from "$lib/shared/media-composition/services/post-studio-frame-compositor";
import type {
  PaintFrame,
  PostStudioLayerPainter,
} from "$lib/shared/media-composition/services/post-studio-layer-painter";
import { CANVAS2D_HOSTED_EFFECTS } from "$lib/shared/effects/services/canvas2d-effect-host";
import {
  EFFECT_ICONS,
  EFFECT_LABELS,
} from "$lib/shared/effects/domain/effect-meta";
import { project, video } from "./post-project-fixtures";

type Transform = NonNullable<PaintFrame["transform"]>;

const IDENTITY: Transform = {
  scale: 1,
  rotationDegrees: 0,
  translateX: 0,
  translateY: 0,
  flipHorizontal: false,
};

/**
 * The export compositor's own layer transform, as a matrix built in the order
 * it calls translate, rotate, scale and flip, so the mapper is checked
 * against that sequence rather than against its own arithmetic.
 */
function compositorPoint(
  rect: { x: number; y: number; width: number; height: number },
  transform: Transform,
  pan: { x: number; y: number },
  local: { x: number; y: number }
): { x: number; y: number } {
  type M = [number, number, number, number, number, number];
  const multiply = (m: M, n: M): M => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radians = (transform.rotationDegrees * Math.PI) / 180;
  let m: M = [1, 0, 0, 1, 0, 0];
  m = multiply(m, [1, 0, 0, 1, cx + pan.x, cy + pan.y]);
  m = multiply(m, [
    Math.cos(radians),
    Math.sin(radians),
    -Math.sin(radians),
    Math.cos(radians),
    0,
    0,
  ]);
  m = multiply(m, [transform.scale, 0, 0, transform.scale, 0, 0]);
  if (transform.flipHorizontal) m = multiply(m, [-1, 0, 0, 1, 0, 0]);
  m = multiply(m, [1, 0, 0, 1, -cx, -cy]);
  return {
    x: m[0] * local.x + m[2] * local.y + m[4],
    y: m[1] * local.x + m[3] * local.y + m[5],
  };
}

describe("createStaffPointMapper", () => {
  it("places picture fractions on the fitted picture", () => {
    const place = createStaffPointMapper({
      rect: { x: 10, y: 20, width: 100, height: 200 },
      sourceWidth: 100,
      sourceHeight: 100,
      fit: "contain",
    });
    // Contain: a 100 square centred in a 100 x 200 slot.
    expect(place(0, 0)).toEqual({ x: 10, y: 70 });
    expect(place(0.5, 0.5)).toEqual({ x: 60, y: 120 });
    expect(place(1, 1)).toEqual({ x: 110, y: 170 });
  });

  it("frames points the way the compositor frames the video", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    const transform: Transform = {
      scale: 2,
      rotationDegrees: 30,
      translateX: 0,
      translateY: 0,
      flipHorizontal: true,
    };
    const place = createStaffPointMapper({
      rect,
      sourceWidth: 100,
      sourceHeight: 100,
      fit: "cover",
      transform,
    });
    for (const [x, y] of [
      [0.9, 0.5],
      [0.2, 0.1],
      [0.5, 0.5],
    ] as const) {
      const got = place(x, y);
      const want = compositorPoint(
        rect,
        transform,
        { x: 0, y: 0 },
        { x: x * 100, y: y * 100 }
      );
      expect(got.x).toBeCloseTo(want.x, 9);
      expect(got.y).toBeCloseTo(want.y, 9);
    }
  });

  it("pans against the picture the zoom hides", () => {
    const place = createStaffPointMapper({
      rect: { x: 0, y: 0, width: 100, height: 100 },
      sourceWidth: 100,
      sourceHeight: 100,
      fit: "cover",
      transform: { ...IDENTITY, scale: 2, translateX: 0.5 },
    });
    // Twice as big hides 100 px across; a hard pan right shifts by half of it.
    expect(place(0.5, 0.5)).toEqual({ x: 100, y: 50 });
  });

  it("maps a manually placed crop through its box, turn, and flip at either output size", () => {
    const sourceGeometry = {
      x: -32 / 1080,
      y: 27 / 1080,
      width: 1128 / 1080,
      height: 940 / 1080,
      rotation: 30,
      crop: { left: 0, top: 0.2107, right: 0.9997, bottom: 0.6792 },
    };
    const transform = { ...IDENTITY, flipHorizontal: true };
    for (const size of [1080, 540]) {
      const rect = { x: 0, y: 0, width: size, height: size };
      const place = createStaffPointMapper({
        rect,
        sourceWidth: 1920,
        sourceHeight: 1080,
        fit: "cover",
        transform,
        sourceGeometry,
      });
      const box = {
        x: (-32 / 1080) * size,
        y: (27 / 1080) * size,
        width: (1128 / 1080) * size,
        height: (940 / 1080) * size,
      };
      const cropAspect =
        (1920 * (sourceGeometry.crop.right - sourceGeometry.crop.left)) /
        (1080 * (sourceGeometry.crop.bottom - sourceGeometry.crop.top));
      const fittedWidth = Math.min(box.width, box.height * cropAspect);
      const fittedHeight = fittedWidth / cropAspect;
      for (const [x, y] of [
        [0.5, 0.2107],
        [0.75, 0.445],
        [0.9997, 0.6792],
      ] as const) {
        const local = {
          x:
            box.x +
            (box.width - fittedWidth) / 2 +
            ((x - sourceGeometry.crop.left) /
              (sourceGeometry.crop.right - sourceGeometry.crop.left)) *
              fittedWidth,
          y:
            box.y +
            (box.height - fittedHeight) / 2 +
            ((y - sourceGeometry.crop.top) /
              (sourceGeometry.crop.bottom - sourceGeometry.crop.top)) *
              fittedHeight,
        };
        const want = compositorPoint(
          box,
          {
            ...IDENTITY,
            rotationDegrees: sourceGeometry.rotation,
            flipHorizontal: true,
          },
          { x: 0, y: 0 },
          local
        );
        const got = place(x, y);
        expect(got.x).toBeCloseTo(want.x, 8);
        expect(got.y).toBeCloseTo(want.y, 8);
      }
    }
  });
});

describe("staff effect choices", () => {
  it("offers trails plus exactly the effects the shared 2D host draws", () => {
    expect([...POST_STAFF_EFFECTS].sort()).toEqual(
      ["trails", ...CANVAS2D_HOSTED_EFFECTS].sort()
    );
  });

  it("has a name and an icon for every choice", () => {
    for (const effect of POST_STAFF_EFFECTS) {
      expect(EFFECT_LABELS[effect]).toBeTruthy();
      expect(EFFECT_ICONS[effect]).toBeTruthy();
    }
  });
});

/** A 2D context that records its calls and draws nothing. */
function recordingContext(): {
  context: CanvasRenderingContext2D;
  calls: string[];
  callArgs: unknown[][];
} {
  const calls: string[] = [];
  const callArgs: unknown[][] = [];
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push(String(key));
        callArgs.push(args);
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  return {
    context: context as unknown as CanvasRenderingContext2D,
    calls,
    callArgs,
  };
}

describe("the staff effect painter", () => {
  it("draws nothing without found ends or a chosen effect", () => {
    const painter = createStaffEffectPainter({
      track: () => null,
      effect: () => "sparkles",
      fit: () => "cover",
    });
    const { context, calls } = recordingContext();
    painter.paint(
      context,
      { x: 0, y: 0, width: 100, height: 100 },
      { projectProgress: 0, sourceTimeSeconds: 1 }
    );
    expect(calls).toEqual([]);
  });

  it("clips a manually cropped staff effect to the rotated video box", () => {
    const track = {
      sourceWidth: 1920,
      sourceHeight: 1080,
      firstSampleSeconds: 0,
      sampleRate: 30,
      sampleCount: 0,
      staffs: [
        {
          color: "blue",
          ends: [
            { x: [], y: [], state: [] },
            { x: [], y: [], state: [] },
          ],
        },
        {
          color: "red",
          ends: [
            { x: [], y: [], state: [] },
            { x: [], y: [], state: [] },
          ],
        },
      ],
    } as unknown as StaffTipTrack;
    const painter = createStaffEffectPainter({
      track: () => track,
      effect: () => "trails",
      fit: () => "cover",
    });
    const { context, calls, callArgs } = recordingContext();
    painter.paint(
      context,
      { x: 0, y: 0, width: 1080, height: 1080 },
      {
        projectProgress: 0,
        sourceTimeSeconds: 0,
        sourceGeometry: {
          x: -32 / 1080,
          y: 27 / 1080,
          width: 1128 / 1080,
          height: 940 / 1080,
          rotation: 30,
          crop: { left: 0, top: 0.2107, right: 0.9997, bottom: 0.6792 },
        },
      }
    );
    const clipAt = calls.indexOf("clip");
    expect(clipAt).toBeGreaterThan(0);
    expect(calls.slice(0, clipAt)).toContain("rotate");
    expect(callArgs[calls.indexOf("rect")]).toEqual([-564, -470, 1128, 940]);
    expect(calls.at(-1)).toBe("restore");
  });

  it("frames its own points, so the export leaves its context unturned", async () => {
    const result = compilePostProject(
      project([
        video("v1", {
          sourceOut: 4,
          zoom: 1.5,
          rotation: 90,
          staffEffect: { effect: "trails" },
        }),
      ]),
      { now: 1 }
    )!;
    const layers = evaluatePresetFrame(
      result.preset,
      result.durationSeconds,
      1
    ).filter((layer) => layer.clipId === "v1~staff");
    expect(layers).toHaveLength(1);

    const frames: PaintFrame[] = [];
    const record = (owns: boolean): PostStudioLayerPainter => ({
      ...(owns ? { ownsTransform: true } : {}),
      prepare: () => Promise.resolve(),
      paint: (_context, _rect, frame) => {
        frames.push(frame);
      },
    });

    for (const owns of [true, false]) {
      const { context, calls } = recordingContext();
      const canvas = {
        width: result.preset.output.width,
        height: result.preset.output.height,
        getContext: () => context,
      } as unknown as HTMLCanvasElement;
      await renderPostStudioFrame({
        canvas,
        root: {} as HTMLElement,
        preset: result.preset,
        layers,
        cardFrameCache: new Map(),
        painters: new Map([[staffEffectRole("v1"), record(owns)]]),
        timeSeconds: 1,
      });
      expect(calls.includes("rotate")).toBe(!owns);
    }
    expect(frames[0]!.transform).toMatchObject({
      scale: 1.5,
      rotationDegrees: 90,
    });
  });

  it("passes evaluated source geometry through the preview and export paint frame", async () => {
    const sourceGeometry = {
      x: -32 / 1080,
      y: 27 / 1080,
      width: 1128 / 1080,
      height: 940 / 1080,
      rotation: 0,
      crop: { left: 0, top: 0.2107, right: 0.9997, bottom: 0.6792 },
    };
    const result = compilePostProject(
      project([
        video("v1", {
          sourceOut: 4,
          staffEffect: { effect: "trails" },
          sourceGeometry,
        }),
      ]),
      { now: 1 }
    )!;
    const layer = evaluatePresetFrame(
      result.preset,
      result.durationSeconds,
      1
    ).find((candidate) => candidate.clipId === "v1~staff")!;
    expect(layer.sourceGeometry).toEqual(sourceGeometry);
    const frames: PaintFrame[] = [];
    const painter: PostStudioLayerPainter = {
      ownsTransform: true,
      prepare: () => Promise.resolve(),
      paint: (_context, _rect, frame) => {
        frames.push(frame);
      },
    };
    const { context } = recordingContext();
    await renderPostStudioFrame({
      canvas: {
        width: 1080,
        height: 1080,
        getContext: () => context,
      } as unknown as HTMLCanvasElement,
      root: {} as HTMLElement,
      preset: result.preset,
      layers: [layer],
      cardFrameCache: new Map(),
      painters: new Map([[staffEffectRole("v1"), painter]]),
      timeSeconds: 1,
    });
    expect(frames).toHaveLength(1);
    expect(frames[0]!.sourceGeometry).toEqual(sourceGeometry);
  });
});
