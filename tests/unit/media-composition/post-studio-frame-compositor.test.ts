// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { POST_STUDIO_PRESETS } from "$lib/shared/media-composition/domain/post-studio-presets";
import {
  resolveFrameLayerGeometry,
  renderPostStudioFrame,
  waitForPictographMotion,
} from "$lib/shared/media-composition/services/post-studio-frame-compositor";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import { NOW, card, overlay, project, text } from "./post-project-fixtures";
import { createTextItemPainter } from "$lib/shared/media-composition/services/text-item-painter";

const { captureMotion } = vi.hoisted(() => ({ captureMotion: vi.fn() }));
vi.mock("modern-screenshot", () => ({ domToCanvas: captureMotion }));

const preset = POST_STUDIO_PRESETS.find(
  (candidate) => candidate.id === "performance-breakdown"
)!;
const region = preset.regions.find(
  (candidate) => candidate.id === "performance"
)!;

describe("painted title overflow", () => {
  it.each([true, false])(
    "keeps the recovered entrance ink inside the export clip (animated=%s)",
    async (animated) => {
      const compiled = compilePostProject(
        project(
          [card("main", 6)],
          [
            [
              text("title", 0, 5.8, {
                text: "Take it slow",
                box: {
                  x: 159.88077 / 738,
                  y: 174.11273 / 1313,
                  width: 418.23843 / 738,
                  height: 94.76527 / 1313,
                },
                style: {
                  fontFamily: "PermanentMarker.ttf",
                  fontSizeNative: 84,
                  fontScale: 0.790714,
                  sourceCanvasWidth: 738,
                  letterSpacing: 0,
                  lineSpacing: 1,
                  alignment: "center",
                  alpha: 1,
                },
                ...(animated
                  ? {
                      animation: {
                        kind: "letter-slide",
                        inDurationSeconds: 0.953127,
                        outDurationSeconds: 0.953127,
                        entranceProgress: 0.983333,
                        exitProgress: 0,
                      },
                    }
                  : {}),
              }),
            ],
          ]
        ),
        { now: NOW }
      )!;
      const seconds = 0.0324;
      const layers = evaluatePresetFrame(compiled.preset, 6, seconds).filter(
        (entry) => entry.regionId === "title"
      );
      const title = compiled.texts[0]!;
      const painter = createTextItemPainter(() => title);
      const clips: number[][] = [];
      const ink: number[] = [];
      const context = new Proxy(
        {
          globalAlpha: 1,
          rect: (...values: number[]) => clips.push(values),
          measureText: () => ({ width: 50 }),
          fillText: (_text: string, _x: number, y: number) => ink.push(y),
        },
        {
          get(target, key) {
            return Reflect.get(target, key) ?? vi.fn();
          },
        }
      );
      const canvas = document.createElement("canvas");
      vi.spyOn(canvas, "getContext").mockImplementation(((kind: string) =>
        kind === "2d" ? context : null) as HTMLCanvasElement["getContext"]);
      await renderPostStudioFrame({
        canvas,
        root: document.createElement("div"),
        preset: compiled.preset,
        layers,
        cardFrameCache: new Map(),
        painters: new Map([[title.role, painter]]),
        timeSeconds: seconds,
      });

      expect(ink.length).toBeGreaterThan(0);
      const clip = clips[0]!;
      expect(Math.min(...ink)).toBeGreaterThanOrEqual(clip[1]!);
      expect(Math.max(...ink)).toBeLessThanOrEqual(clip[1]! + clip[3]!);
      if (!animated) {
        // Ordinary text keeps its authored crop; enlarging all layers would
        // silently change composition and edge effects in unrelated posts.
        expect(clip[1]).toBeCloseTo(
          title.box.y * compiled.preset.output.height
        );
        expect(clip[3]).toBeCloseTo(
          title.box.height * compiled.preset.output.height
        );
      }
    }
  );
});
describe("resolveFrameLayerGeometry", () => {
  it("resolves the performance crop in output pixels", () => {
    const geometry = resolveFrameLayerGeometry({
      preset,
      region,
      sourceWidth: 1920,
      sourceHeight: 1080,
      transform: {
        scale: 1,
        rotationDegrees: 0,
        translateX: 0,
        translateY: 0,
      },
    });

    expect(geometry.region).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 1152,
    });
    expect(geometry.drawRect.x).toBeCloseTo(-484);
    expect(geometry.drawRect.y).toBe(0);
    expect(geometry.drawRect.width).toBeCloseTo(2048);
    expect(geometry.drawRect.height).toBe(1152);
  });

  it("resolves clip translation against the source the slot hides", () => {
    // A 1080-square source covering a 1080x1152 slot draws 1152 wide, and the
    // 1.25 scale takes both sides to 1440. Turned 12 degrees, that square's
    // outline is about 1708 each way: 628 hidden across, 556 down. A pan is a
    // fraction of that, so 0.1 across is about 62.8px and -0.25 down -139px.
    const geometry = resolveFrameLayerGeometry({
      preset,
      region,
      sourceWidth: 1080,
      sourceHeight: 1080,
      transform: {
        scale: 1.25,
        rotationDegrees: 12,
        translateX: 0.1,
        translateY: -0.25,
      },
    });

    expect(geometry.translateX).toBeCloseTo(62.793, 3);
    expect(geometry.translateY).toBeCloseTo(-138.981, 3);
    expect(geometry.scale).toBe(1.25);
    expect(geometry.rotationDegrees).toBe(12);
  });

  it("refuses to pan a layer that is hiding nothing", () => {
    // Source and slot share an aspect, so a cover fit hides no source at all.
    // Panning here could only open a gap beside the picture, which is the
    // difference between a crop control and a shove.
    const geometry = resolveFrameLayerGeometry({
      preset,
      region,
      sourceWidth: 1080,
      sourceHeight: 1152,
      transform: {
        scale: 1,
        rotationDegrees: 0,
        translateX: 0.4,
        translateY: -0.5,
      },
    });

    expect(geometry.translateX).toBeCloseTo(0);
    expect(geometry.translateY).toBeCloseTo(0);
  });

  it("places a native source rect against the whole output with its UV crop", () => {
    const crop = { left: 0.1, top: 0.2, right: 0.9, bottom: 1 };
    const geometry = resolveFrameLayerGeometry({
      preset,
      region,
      sourceWidth: 1920,
      sourceHeight: 1080,
      transform: {
        scale: 1.5,
        rotationDegrees: 15,
        translateX: 0.5,
        translateY: -0.5,
      },
      sourceGeometry: {
        x: -0.2,
        y: 0.1,
        width: 1.4,
        height: 0.8,
        rotation: 30,
        crop,
      },
    });
    expect(geometry.drawRect.x).toBe(-216);
    expect(geometry.drawRect.y).toBeCloseTo(534.75);
    expect(geometry.drawRect.width).toBe(1512);
    expect(geometry.drawRect.height).toBeCloseTo(850.5);
    expect(geometry.sourceCrop).toEqual(crop);
    expect(geometry.rotationDegrees).toBe(45);
    expect(geometry.translateX).toBeGreaterThan(0);
    expect(geometry.translateY).toBeLessThan(0);
    expect(geometry.scale).toBe(1.5);
  });

  it("keeps an imported crop proportional after the canvas ratio changes", () => {
    const sourceGeometry = {
      x: 0,
      y: 0,
      width: 1,
      height: 0.5,
      rotation: 0,
      crop: { left: 0, top: 0, right: 1, bottom: 1 },
    };
    const transform = {
      scale: 1,
      rotationDegrees: 0,
      translateX: 0,
      translateY: 0,
    };
    const square = resolveFrameLayerGeometry({
      preset: { ...preset, output: { width: 1080, height: 1080 } },
      region,
      sourceWidth: 1080,
      sourceHeight: 1920,
      transform,
      sourceGeometry,
    });
    expect(square.drawRect.width / square.drawRect.height).toBeCloseTo(
      1080 / 1920
    );
    expect(square.drawRect.width).toBeCloseTo(303.75);
    expect(square.drawRect.height).toBeCloseTo(540);
  });
});

describe("waitForPictographMotion", () => {
  it("waits through a remount and ignores a stale, unready pictograph", async () => {
    const createDiv = () =>
      document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      ) as HTMLElement;
    const layer = createDiv();
    const pending = waitForPictographMotion(layer, 1_000);
    const motion = createDiv();
    motion.dataset.pictographMotion = "";
    const container = createDiv();
    container.dataset.pictographRenderReady = "false";
    motion.append(container);
    layer.append(motion);
    vi.spyOn(motion, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 200,
    } as DOMRect);

    let resolved = false;
    void pending.then(() => (resolved = true));
    await Promise.resolve();
    expect(resolved).toBe(false);

    container.dataset.pictographRenderReady = "true";
    await expect(pending).resolves.toMatchObject({ element: motion });
  });

  it("fails with a bounded readiness error", async () => {
    const layer = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    ) as HTMLElement;
    await expect(waitForPictographMotion(layer, 10)).rejects.toThrow(
      "The pictograph motion layer was not ready to render."
    );
  });
});

describe("scoped Moves export", () => {
  it.each(["arrows", "mandala"] as const)(
    "exports %s without repainting effect canvases over the captured arrows",
    async (mode) => {
      const createElement = <T extends HTMLElement>(tag: string) =>
        document.createElementNS("http://www.w3.org/1999/xhtml", tag) as T;
      const compiled = compilePostProject(project([card("base", 5)], [[
        overlay("moves", "moves", {
          start: 0, duration: 5, mode,
          animationAppearance: { darkMode: true },
        }),
      ]]), { now: NOW })!;
      const layers = evaluatePresetFrame(compiled.preset, 5, 1)
        .filter((entry) => entry.regionId === "moves");
      const root = createElement<HTMLDivElement>("div");
      const media = createElement<HTMLDivElement>("div");
      media.className = "media-layer";
      media.dataset.clipId = layers[0]!.clipId;
      media.dataset.renderMode = "sequence-animation";
      const animation = createElement<HTMLDivElement>("div");
      animation.dataset.studioAnimationMode = mode === "arrows" ? "pictograph" : "mandala";
      const effects = createElement<HTMLCanvasElement>("canvas");
      effects.width = effects.height = 200;
      animation.append(effects);
      if (mode === "arrows") {
        animation.dataset.pictographMotion = "";
        const arrows = createElement<HTMLDivElement>("div");
        arrows.dataset.pictographRenderReady = "true";
        animation.append(arrows);
        vi.spyOn(animation, "getBoundingClientRect").mockReturnValue({
          width: 200, height: 200,
        } as DOMRect);
      }
      media.append(animation);
      root.append(media);
      const captured = createElement<HTMLCanvasElement>("canvas");
      captured.width = captured.height = 200;
      captureMotion.mockReset().mockResolvedValue(captured);
      const drawImage = vi.fn();
      const context = new Proxy({ drawImage }, {
        get(target, key) { return Reflect.get(target, key) ?? vi.fn(); },
      });
      const output = createElement<HTMLCanvasElement>("canvas");
      vi.spyOn(output, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);

      await renderPostStudioFrame({
        canvas: output, root, preset: compiled.preset, layers,
        cardFrameCache: new Map(),
      });

      expect(drawImage).toHaveBeenCalledTimes(1);
      expect(drawImage.mock.calls[0]![0]).toBe(mode === "arrows" ? captured : effects);
      expect(captureMotion).toHaveBeenCalledTimes(mode === "arrows" ? 1 : 0);
    }
  );
});
