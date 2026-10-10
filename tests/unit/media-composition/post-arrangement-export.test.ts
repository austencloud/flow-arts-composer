// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import { createArrangementProject } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
import { compilePostProject } from "#lib/shared/media-composition/domain/post-project-compiler.js";
import { evaluatePresetFrame } from "#lib/shared/media-composition/services/frame-evaluator.js";
import {
  renderPostStudioFrame,
  type RenderPostStudioFrameInput,
} from "#lib/shared/media-composition/services/post-studio-frame-compositor.js";

const snapshot: ArrangementSnapshot = {
  schemaVersion: 1,
  cells: [
    {
      id: "cell-1",
      row: 0,
      col: 0,
      colSpan: 1,
      rowSpan: 1,
      beatOffset: 0,
      mediaType: "animation",
      layers: [
        {
          sequence: { id: "sequence-1", steps: [{}] },
          beatOffset: 0,
          propColors: { left: "#fff", right: "#fff" },
          transformStack: [],
        },
      ] as ArrangementSnapshot["cells"][number]["layers"],
    },
  ],
  gridRows: 1,
  gridCols: 1,
  bpm: 120,
  skipStartPlacement: true,
};

describe("arrangement frame export", () => {
  it("waits for cells before capturing a non-animation arrangement", async () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const project = createArrangementProject(
      snapshot,
      "studio-arrangement:export",
      123
    );
    const compiled = compilePostProject(project, { now: 123 })!;
    const layers = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      0.25
    );
    const create = <K extends keyof HTMLElementTagNameMap>(tag: K) =>
      document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        tag
      ) as HTMLElementTagNameMap[K];
    const root = create("div");
    const mounted = create("div");
    mounted.className = "media-layer";
    mounted.dataset.clipId = "arrangement-1";
    mounted.dataset.renderMode = "arrangement";
    const surface = create("div");
    surface.dataset.arrangementSurface = "";
    surface.dataset.arrangementCellCount = "1";
    const cell = create("div");
    cell.className = "arrangement-cell";
    cell.dataset.mediaType = "choreo-card";
    cell.dataset.arrangementCellReady = "false";
    surface.append(cell);
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      width: 300,
      height: 300,
    } as DOMRect);
    mounted.append(surface);
    root.append(mounted);

    const captured = create("canvas");
    captured.width = 600;
    captured.height = 600;
    const capture = vi.fn().mockResolvedValue(captured);
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
    canvas.width = 600;
    canvas.height = 600;
    vi.spyOn(canvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );

    const rendering = renderPostStudioFrame({
      canvas,
      root,
      preset: compiled.preset,
      layers,
      cardFrameCache: new Map(),
      pictographCapture: {
        capture,
      } as unknown as RenderPostStudioFrameInput["pictographCapture"],
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(capture).not.toHaveBeenCalled();
    cell.dataset.arrangementCellReady = "true";
    await rendering;

    expect(capture).toHaveBeenCalledWith(surface, 300, 300, 3.6);
    expect(drawImage.mock.calls.some(([source]) => source === captured)).toBe(
      true
    );
  });

  it("draws ready animation canvases without capturing the grid DOM", async () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const project = createArrangementProject(
      snapshot,
      "studio-arrangement:export",
      123
    );
    const compiled = compilePostProject(project, { now: 123 })!;
    const layers = evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      0.25
    );
    const root = document.createElement("div");
    const mounted = document.createElement("div");
    mounted.className = "media-layer";
    mounted.dataset.clipId = "arrangement-1";
    mounted.dataset.renderMode = "arrangement";
    const surface = document.createElement("div");
    surface.dataset.arrangementSurface = "";
    surface.dataset.arrangementCellCount = "1";
    surface.style.backgroundColor = "#101018";
    const cell = document.createElement("div");
    cell.className = "arrangement-cell";
    cell.dataset.mediaType = "animation";
    const cellCanvas = document.createElement("div");
    cellCanvas.className = "cell-canvas";
    cellCanvas.dataset.arrangementCellReady = "true";
    cellCanvas.style.backgroundColor = "#12121c";
    cellCanvas.style.border = "1px solid #333";
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-wrapper";
    wrapper.style.backgroundColor = "#0a0a0f";
    const engineCanvas = document.createElement("canvas");
    engineCanvas.width = 300;
    engineCanvas.height = 300;
    wrapper.append(engineCanvas);
    cellCanvas.append(wrapper);
    cell.append(cellCanvas);
    surface.append(cell);
    mounted.append(surface);
    root.append(mounted);
    const bounds = { left: 0, top: 0, width: 300, height: 300 } as DOMRect;
    for (const element of [surface, cellCanvas, wrapper, engineCanvas])
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue(bounds);

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
    canvas.width = 600;
    canvas.height = 600;
    vi.spyOn(canvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    const capture = vi.fn();
    await renderPostStudioFrame({
      canvas,
      root,
      preset: compiled.preset,
      layers,
      cardFrameCache: new Map(),
      pictographCapture: {
        capture,
      } as unknown as RenderPostStudioFrameInput["pictographCapture"],
    });
    expect(capture).not.toHaveBeenCalled();
    expect(
      drawImage.mock.calls.some(([source]) => source === engineCanvas)
    ).toBe(true);
  });
});
