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
  it("captures and draws the live arrangement surface", async () => {
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
});
