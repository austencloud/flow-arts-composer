// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { POST_STUDIO_PRESETS } from "$lib/shared/media-composition/domain/post-studio-presets";
import { POST_STUDIO_DOM_CAPTURE_OPTIONS } from "$lib/shared/media-composition/services/post-studio-dom-capture";
import {
  resolveFrameLayerGeometry,
  renderPostStudioFrame,
  waitForPictographMotion,
  type RenderPostStudioFrameInput,
} from "$lib/shared/media-composition/services/post-studio-frame-compositor";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import {
  NOW,
  card,
  overlay,
  project,
  text,
  video,
} from "./post-project-fixtures";
import { createTextItemPainter } from "$lib/shared/media-composition/services/text-item-painter";

const { captureMotion } = vi.hoisted(() => ({ captureMotion: vi.fn() }));
vi.mock("modern-screenshot", () => ({ domToCanvas: captureMotion }));

const preset = POST_STUDIO_PRESETS.find(
  (candidate) => candidate.id === "performance-breakdown"
)!;
const region = preset.regions.find(
  (candidate) => candidate.id === "performance"
)!;

describe("decoded video export surfaces", () => {
  it("covers the whole export frame with black at the transition midpoint", async () => {
    const compiled = compilePostProject(
      project([
        card("out", 4, { transitionOut: { type: "fade-black", duration: 1 } }),
        card("in", 4, { start: 3 }),
      ]),
      { now: NOW }
    )!;
    const fills: Array<{ color: string; alpha: number }> = [];
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      fillStyle: "",
      globalAlpha: 1,
      fillRect: vi.fn(function (this: { fillStyle: string; globalAlpha: number }) {
        fills.push({ color: this.fillStyle, alpha: this.globalAlpha });
      }),
    };
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    vi.spyOn(canvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    await renderPostStudioFrame({
      canvas,
      root: document.createElement("div"),
      preset: compiled.preset,
      layers: evaluatePresetFrame(compiled.preset, compiled.durationSeconds, 3.5),
      cardFrameCache: new Map(),
      timeSeconds: 3.5,
    });
    expect(fills.at(-1)).toEqual({ color: "#000", alpha: 1 });
    expect(context.fillRect).toHaveBeenLastCalledWith(0, 0, 320, 180);
  });
  it.each(["region", "source crop", "blurred backdrop"])(
    "draws a decoded canvas through the %s path without trying to decode it again",
    async (path) => {
      const draft = project([
        video("footage", {
          ...(path === "source crop"
            ? {
                sourceGeometry: {
                  x: 0,
                  y: 0,
                  width: 1,
                  height: 1,
                  rotation: 0,
                  crop: { left: 0.1, top: 0, right: 0.9, bottom: 1 },
                },
              }
            : {}),
        }),
      ]);
      if (path === "blurred backdrop") draft.background = "blur";
      const compiled = compilePostProject(draft, { now: NOW })!;
      const layers = evaluatePresetFrame(
        compiled.preset,
        compiled.durationSeconds,
        1
      );
      const create = <K extends keyof HTMLElementTagNameMap>(tag: K) =>
        document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          tag
        ) as HTMLElementTagNameMap[K];
      const root = create("div");
      const mounted = create("div");
      mounted.className = "media-layer";
      mounted.dataset.clipId = "footage";
      root.append(mounted);
      const frame = create("canvas");
      frame.width = 1920;
      frame.height = 1080;
      const drawImage = vi.fn();
      const context = new Proxy(
        { drawImage },
        {
          get(target, key) {
            return Reflect.get(target, key) ?? vi.fn();
          },
        }
      );
      const canvas = create("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      vi.spyOn(canvas, "getContext").mockReturnValue(
        context as unknown as CanvasRenderingContext2D
      );
      if (path === "blurred backdrop") {
        const sample = create("canvas");
        vi.spyOn(sample, "getContext").mockReturnValue(
          context as unknown as CanvasRenderingContext2D
        );
        vi.spyOn(document, "createElement").mockReturnValueOnce(sample);
      }
      const frameFor = vi.fn().mockResolvedValue(frame);
      await renderPostStudioFrame({
        canvas,
        root,
        preset: compiled.preset,
        layers,
        cardFrameCache: new Map(),
        videoFrames: {
          has: () => true,
          frameFor,
        } as unknown as RenderPostStudioFrameInput["videoFrames"],
      });
      expect(frameFor).toHaveBeenCalledTimes(
        path === "blurred backdrop" ? 2 : 1
      );
      expect(drawImage.mock.calls.some(([source]) => source === frame)).toBe(
        true
      );
    }
  );
});

describe("split animation export", () => {
  it("draws the later piece at a shared take edge from the preview's mounted surface", async () => {
    const compiled = compilePostProject(
      project(
        [
          video("first", { takeId: "a", sourceOut: 4 }),
          video("second", { takeId: "b", start: 4, sourceOut: 3 }),
        ],
        [[overlay("motion", "animation", { start: 0, duration: 7 })]]
      ),
      { now: NOW }
    )!;
    const layers = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      4
    ).filter((layer) => layer.regionId === "motion");
    expect(layers.map((layer) => layer.clipId)).toEqual([
      "motion~0",
      "motion~1",
    ]);

    const root = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    );
    const mounted = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    );
    mounted.className = "media-layer";
    mounted.dataset.clipId = "motion~1";
    mounted.dataset.renderMode = "sequence-animation";
    const animation = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    ) as HTMLElement;
    animation.dataset.sequenceProgressVisible = "false";
    vi.spyOn(animation, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 200,
    } as DOMRect);
    mounted.append(animation);
    captureMotion
      .mockReset()
      .mockResolvedValue(document.createElement("canvas"));
    root.append(mounted);
    const fillRect = vi.fn();
    const context = new Proxy(
      { fillRect },
      {
        get(target, key) {
          return Reflect.get(target, key) ?? vi.fn();
        },
      }
    );
    const canvas = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "canvas"
    ) as HTMLCanvasElement;
    vi.spyOn(canvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );

    await renderPostStudioFrame({
      canvas,
      root,
      preset: compiled.preset,
      layers,
      cardFrameCache: new Map(),
    });
    expect(fillRect).toHaveBeenCalledTimes(2);
  });

  it("covers a non-square region with the captured animation, not a centred square", async () => {
    // The tutorial posts give the animation the lower half of the frame, a
    // region wider than it is tall. The preview fills that box; the export
    // fitted a 1x1 stand-in into it and drew a square, about 11% narrower.
    const compiled = compilePostProject(
      project(
        [video("footage", { takeId: "a", sourceOut: 4 })],
        [
          [
            overlay("motion", "animation", {
              start: 0,
              duration: 4,
              box: { x: 0, y: 0.5, width: 1, height: 0.5 },
            }),
          ],
        ]
      ),
      { now: NOW }
    )!;
    const layers = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      1
    ).filter((layer) => layer.regionId === "motion");
    expect(layers).toHaveLength(1);
    const motion = compiled.preset.regions.find(
      (candidate) => candidate.id === "motion"
    )!;
    const { width, height } = compiled.preset.output;
    const expected = [
      motion.x * width,
      motion.y * height,
      motion.width * width,
      motion.height * height,
    ];
    expect(expected[2]).toBeGreaterThan(expected[3]! + 1);

    const root = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    );
    const mounted = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    );
    mounted.className = "media-layer";
    mounted.dataset.clipId = layers[0]!.clipId;
    mounted.dataset.renderMode = "sequence-animation";
    const animation = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    ) as HTMLElement;
    animation.dataset.sequenceProgressVisible = "false";
    vi.spyOn(animation, "getBoundingClientRect").mockReturnValue({
      width: 270,
      height: 240,
    } as DOMRect);
    mounted.append(animation);
    root.append(mounted);
    const captured = document.createElement("canvas");
    captureMotion.mockReset().mockResolvedValue(captured);
    const drawImage = vi.fn();
    const context = new Proxy(
      { drawImage },
      {
        get(target, key) {
          return Reflect.get(target, key) ?? vi.fn();
        },
      }
    );
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );

    await renderPostStudioFrame({
      canvas,
      root,
      preset: compiled.preset,
      layers,
      cardFrameCache: new Map(),
    });

    expect(drawImage).toHaveBeenCalledWith(captured, ...expected);
  });
});

describe("export capture options", () => {
  it("gives the choreo card capture the shared options", async () => {
    const compiled = compilePostProject(project([card("main", 6)]), {
      now: NOW,
    })!;
    const layers = evaluatePresetFrame(compiled.preset, 6, 1).filter(
      (layer) => layer.clipId === "main"
    );
    expect(layers).toHaveLength(1);

    const createElement = <T extends HTMLElement>(tag: string) =>
      document.createElementNS("http://www.w3.org/1999/xhtml", tag) as T;
    const root = createElement<HTMLDivElement>("div");
    const mounted = createElement<HTMLDivElement>("div");
    mounted.className = "media-layer";
    mounted.dataset.clipId = "main";
    mounted.dataset.renderMode = "choreo-card";
    const choreo = createElement<HTMLDivElement>("div");
    choreo.className = "choreo-layer";
    vi.spyOn(choreo, "getBoundingClientRect").mockReturnValue({
      width: 300,
      height: 420,
    } as DOMRect);
    mounted.append(choreo);
    root.append(mounted);
    const captured = createElement<HTMLCanvasElement>("canvas");
    captured.width = 300;
    captured.height = 420;
    captureMotion.mockReset().mockResolvedValue(captured);
    const context = new Proxy(
      {},
      {
        get(target, key) {
          return Reflect.get(target, key) ?? vi.fn();
        },
      }
    );
    const canvas = createElement<HTMLCanvasElement>("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );

    await renderPostStudioFrame({
      canvas,
      root,
      preset: compiled.preset,
      layers,
      cardFrameCache: new Map(),
    });

    expect(captureMotion).toHaveBeenCalledTimes(1);
    expect(captureMotion.mock.calls[0]![0]).toBe(choreo);
    expect(captureMotion.mock.calls[0]![1]).toMatchObject({
      width: 300,
      height: 420,
      onCreateForeignObjectSvg:
        POST_STUDIO_DOM_CAPTURE_OPTIONS.onCreateForeignObjectSvg,
    });
  });
});

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
  it("waits for both arrow geometries during a handoff and ignores inactive outgoing layers", async () => {
    const createDiv = () =>
      document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      ) as HTMLElement;
    const layer = createDiv();
    const motion = createDiv();
    motion.dataset.pictographMotion = "";
    vi.spyOn(motion, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 200,
    } as DOMRect);
    const current = createDiv();
    current.dataset.pictographRenderReady = "true";
    const outgoing = createDiv();
    outgoing.dataset.pictographCaptureRequired = "true";
    const previous = createDiv();
    previous.dataset.pictographRenderReady = "false";
    outgoing.append(previous);
    motion.append(current, outgoing);
    layer.append(motion);
    let resolved = false;
    const pending = waitForPictographMotion(layer, 1_000);
    void pending.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    previous.dataset.pictographRenderReady = "true";
    await expect(pending).resolves.toMatchObject({ element: motion });
    previous.dataset.pictographRenderReady = "false";
    outgoing.dataset.pictographCaptureRequired = "false";
    await expect(waitForPictographMotion(layer, 1_000)).resolves.toMatchObject({
      element: motion,
    });
    current.dataset.pictographRenderReady = "false";
    outgoing.dataset.pictographCaptureRequired = "true";
    previous.dataset.pictographRenderReady = "true";
    let wrongSourceResolved = false;
    const currentPending = waitForPictographMotion(layer, 1_000);
    void currentPending.then(() => {
      wrongSourceResolved = true;
    });
    await Promise.resolve();
    expect(wrongSourceResolved).toBe(false);
    current.dataset.pictographRenderReady = "true";
    await currentPending;
  });

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
    "captures the complete %s preview once, including its visible overlays",
    async (mode) => {
      const createElement = <T extends HTMLElement>(tag: string) =>
        document.createElementNS("http://www.w3.org/1999/xhtml", tag) as T;
      const compiled = compilePostProject(
        project(
          [card("base", 5)],
          [
            [
              overlay("moves", "moves", {
                start: 0,
                duration: 5,
                mode,
                animationAppearance: { darkMode: true },
              }),
            ],
          ]
        ),
        { now: NOW }
      )!;
      const layers = evaluatePresetFrame(compiled.preset, 5, 1).filter(
        (entry) => entry.regionId === "moves"
      );
      const root = createElement<HTMLDivElement>("div");
      const media = createElement<HTMLDivElement>("div");
      media.className = "media-layer";
      media.dataset.clipId = layers[0]!.clipId;
      media.dataset.renderMode = "sequence-animation";
      const animation = createElement<HTMLDivElement>("div");
      animation.dataset.sequenceProgressVisible = "true";
      animation.dataset.sequenceProgressDark = "true";
      animation.dataset.studioAnimationMode =
        mode === "arrows" ? "pictograph" : "mandala";
      const stage = createElement<HTMLDivElement>("div");
      const labels = createElement<HTMLDivElement>("div");
      labels.textContent = "Step 2 Λ1";
      const paths = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      const header = createElement<HTMLDivElement>("div");
      header.textContent = "WORD";
      const progress = createElement<HTMLDivElement>("div");
      progress.textContent = "Progress";
      const effects = createElement<HTMLCanvasElement>("canvas");
      effects.width = effects.height = 200;
      stage.append(header, effects, paths, labels);
      animation.append(stage, progress);
      if (mode === "arrows") {
        stage.dataset.pictographMotion = "";
        const arrows = createElement<HTMLDivElement>("div");
        arrows.dataset.pictographRenderReady = "true";
        stage.append(arrows);
        vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
          width: 200,
          height: 200,
        } as DOMRect);
      }
      vi.spyOn(animation, "getBoundingClientRect").mockReturnValue({
        width: 200,
        height: 250,
      } as DOMRect);
      media.append(animation);
      root.append(media);
      const captured = createElement<HTMLCanvasElement>("canvas");
      captured.width = captured.height = 200;
      captureMotion.mockReset().mockResolvedValue(captured);
      const drawImage = vi.fn();
      const fillRect = vi.fn();
      const context = new Proxy(
        {
          drawImage,
          fillRect,
          createLinearGradient: () => ({ addColorStop() {} }),
        },
        {
          get(target, key) {
            return Reflect.get(target, key) ?? vi.fn();
          },
        }
      );
      const output = createElement<HTMLCanvasElement>("canvas");
      vi.spyOn(output, "getContext").mockReturnValue(
        context as unknown as CanvasRenderingContext2D
      );

      await renderPostStudioFrame({
        canvas: output,
        root,
        preset: compiled.preset,
        layers,
        cardFrameCache: new Map(),
      });

      expect(drawImage).toHaveBeenCalledTimes(1);
      expect(drawImage.mock.calls[0]![0]).toBe(captured);
      expect(captureMotion).toHaveBeenCalledTimes(1);
      expect(captureMotion.mock.calls[0]![0]).toBe(animation);
      expect(captureMotion.mock.calls[0]![1]).toMatchObject({
        width: 200,
        height: 250,
        onCreateForeignObjectSvg:
          POST_STUDIO_DOM_CAPTURE_OPTIONS.onCreateForeignObjectSvg,
      });
      expect(animation.contains(labels)).toBe(true);
      expect(animation.contains(paths)).toBe(true);
      expect(animation.contains(header)).toBe(true);
      expect(animation.contains(progress)).toBe(true);
      expect(fillRect).toHaveBeenCalledTimes(2);
    }
  );
});
