import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  paintCardFrontChrome,
  type CardFrontLayout,
} from "$lib/shared/render/services/card-front-assembler";

function createContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

const layout: CardFrontLayout = {
  columns: 4,
  rows: 2,
  stepSize: 100,
  canvasWidth: 400,
  canvasHeight: 200,
  headerHeight: 0,
  footerHeight: 0,
  gridOffsetX: 0,
  gridOffsetY: 0,
  isDarkMode: false,
  derivedWord: "",
  startColumn: 0,
  startRow: 1,
  stepsPerRow: 4,
  hasStartPlacement: true,
};

describe("paintCardFrontChrome mandala eligibility", () => {
  it("renders an enabled mandala even when the sequence has no LOOP classification", async () => {
    const renderMandalas = vi.fn().mockResolvedValue(undefined);
    const sequence = {
      id: "non-loop-sequence",
      steps: Array.from({ length: 4 }, (_, index) => ({
        id: `step-${index + 1}`,
        motions: {},
      })),
    } as unknown as SequenceData;

    await paintCardFrontChrome(
      {} as never,
      createContext(),
      layout,
      sequence,
      {
        includeStartPlacement: true,
        startPlacementLayout: "row",
        addWord: false,
        addDifficultyLevel: false,
        addUserInfo: false,
        showLoopGlyph: false,
        visibilityOverrides: { showMandala: true },
      },
      {},
      {
        textRenderer: {} as never,
        renderMandalas,
        renderQRCode: vi.fn().mockResolvedValue(undefined),
      }
    );

    expect(renderMandalas).toHaveBeenCalledOnce();
  });
});
