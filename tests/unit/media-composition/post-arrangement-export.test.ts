// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { ArrangementSnapshot } from "$lib/shared/media-composition/domain/arrangement";
import { createArrangementProject } from "$lib/shared/media-composition/domain/post-arrangement-item";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import {
  renderPostStudioFrame,
  type RenderPostStudioFrameInput,
} from "$lib/shared/media-composition/services/post-studio-frame-compositor";

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

    expect(capture).toHaveBeenCalledWith(surface, 300, 300, 3.6);
    expect(drawImage.mock.calls.some(([source]) => source === captured)).toBe(
      true
    );
  });
});
