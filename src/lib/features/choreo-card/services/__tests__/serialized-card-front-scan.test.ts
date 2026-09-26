/**
 * Finished serialized card fronts must carry a QR that decodes to the exact
 * serialized URL and fills its slot. Rendering uses node-canvas and the
 * production QR generator; decoding uses the self-hosted ZXing decoder.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRINT_QR_RENDER_SIZE } from "@tka/render-composition";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { buildSerializedCardUrl } from "$lib/shared/qr/domain/physical-card";
import type { QRCodeGenerator } from "$lib/shared/qr/services/qr-code-generator";
import type { TkaQrDetector } from "$lib/shared/qr/services/tka-qr-detector";
import {
  createNodeCanvas,
  createNodeQrDetector,
  createNodeQrGenerator,
  installNodeCanvas,
} from "../../../../../../tests/helpers/node-print-qr";
import { TND_ELEMENTS } from "../../domain/tnd-element";
import { calculatePhysicalCardLayout } from "../physical-card-layout-calculator";
import {
  MIN_PRINTED_QR_MODULE_MM,
  PRINT_SERVICE_PIXELS_PER_INCH,
  PrintedQrError,
  homePrintPixelsPerInch,
  plannedQrModuleMm,
  printedQrModuleCount,
  verifyPrintedQr,
} from "../print-qr-guard";
import {
  getSerializedQrPlacement,
  renderSerializedCardFront,
} from "../serialized-card-front";
import type { PrintRenderOptions } from "../types";

const CANVAS_WIDTH = 822;
const CANVAS_HEIGHT = 1122;
const BLEED = 36;

/** What the deck's non-serialized front already carries in the QR cell. */
const SHARED_URL = "HTTPS://TKA.RUN/K7QM?bp=staff&rp=staff";
/** Cards printed before the props moved to the physical card record. */
const TYPICAL_URL = "https://tka.run/K7QM?bp=staff&rp=staff&pid=k7Qm2XpR9aBc";
/** Six-character code plus the longest prop name on both hands. */
const LONGEST_URL =
  "https://tka.run/K7QM2X?bp=bigdoublecontactball&rp=bigdoublecontactball&pid=k7Qm2XpR9aBc";
/** What serialized cards carry now: the code and physical ID only. */
const SERIALIZED_URL = buildSerializedCardUrl("K7QM2X", "k7Qm2XpR9aBc");

function sequence(stepCount: number): SequenceData {
  return {
    id: `scan-${stepCount}`,
    word: "ABCDEFGH".slice(0, Math.min(8, stepCount)),
    steps: Array.from({ length: stepCount }, () => ({})),
  } as unknown as SequenceData;
}

const element = TND_ELEMENTS[0]!;

function printOptions(
  layout: Pick<PrintRenderOptions, "startPlacementLayout" | "totalGridColumns">
): PrintRenderOptions {
  return {
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    bleedPx: BLEED,
    includeStartPlacement: true,
    tndElement: element,
    leftLabel: element.element,
    rightLabel: "1 turn",
    notes: "Deck 001",
    ...layout,
  };
}

/** The layout the deck releaser picks for this step count. */
function bestFitLayout(
  stepCount: number
): Pick<PrintRenderOptions, "startPlacementLayout" | "totalGridColumns"> {
  const layout = calculatePhysicalCardLayout({
    sequence: sequence(stepCount),
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    bleedPx: BLEED,
    includeStartPlacement: true,
    showHeader: true,
    showFooter: true,
    showQRCode: true,
  });
  return {
    startPlacementLayout: layout.startPlacementLayout,
    ...(layout.totalGridColumns !== undefined && {
      totalGridColumns: layout.totalGridColumns,
    }),
  };
}

interface ScanCase {
  name: string;
  stepCount: number;
  layout: Pick<PrintRenderOptions, "startPlacementLayout" | "totalGridColumns">;
  url: string;
  /** Whether the printed module clears MIN_PRINTED_QR_MODULE_MM at home print. */
  printable: boolean;
}

const CASES: ScanCase[] = [
  {
    name: "4-step row with the longest serialized URL",
    stepCount: 4,
    layout: { startPlacementLayout: "row" },
    url: LONGEST_URL,
    printable: true,
  },
  {
    name: "4-step row with a typical serialized URL",
    stepCount: 4,
    layout: { startPlacementLayout: "row" },
    url: TYPICAL_URL,
    printable: true,
  },
  {
    name: "8-step best-fit column",
    stepCount: 8,
    layout: bestFitLayout(8),
    url: TYPICAL_URL,
    printable: true,
  },
  {
    name: "8-step best-fit column with the current serialized URL",
    stepCount: 8,
    layout: bestFitLayout(8),
    url: SERIALIZED_URL,
    printable: true,
  },
  {
    name: "8-step catalog column",
    stepCount: 8,
    layout: { startPlacementLayout: "column" },
    url: TYPICAL_URL,
    printable: false,
  },
];

let restoreCanvas: () => void;
let generator: QRCodeGenerator;
let detector: TkaQrDetector;

beforeAll(() => {
  restoreCanvas = installNodeCanvas();
  generator = createNodeQrGenerator();
  detector = createNodeQrDetector();
});

afterAll(() => {
  restoreCanvas();
});

/** A framed front whose QR cell already holds the deck's shared QR. */
async function baseFront(
  placement: NonNullable<ReturnType<typeof getSerializedQrPlacement>>
): Promise<HTMLCanvasElement> {
  const front = createNodeCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = front.getContext("2d")!;
  context.fillStyle = "#e8e2d4";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const flood = Math.ceil(placement.size * 0.06);
  context.fillStyle = "#ffffff";
  context.fillRect(
    placement.x - flood,
    placement.y - flood,
    placement.size + flood * 2,
    placement.size + flood * 2
  );
  const shared = await generator.generateUrlAsImage(
    SHARED_URL,
    PRINT_QR_RENDER_SIZE,
    { style: "modern", margin: 1, darkMode: false }
  );
  context.drawImage(
    shared,
    placement.x,
    placement.y,
    placement.size,
    placement.size
  );
  return front;
}

describe("serialized card front QR scan", () => {
  it.each(CASES)(
    "$name decodes to the serialized URL and fills its slot",
    async ({ stepCount, layout, url, printable }) => {
      const cardSequence = sequence(stepCount);
      const options = printOptions(layout);
      const placement = getSerializedQrPlacement(cardSequence, options)!;
      expect(placement).not.toBeNull();

      const front = await renderSerializedCardFront(
        await baseFront(placement),
        cardSequence,
        options,
        url,
        generator
      );

      const pixels = front
        .getContext("2d")!
        .getImageData(0, 0, front.width, front.height);
      const detections = await detector.detect(pixels);
      expect(detections.map((d) => d.rawValue)).toEqual([url]);

      // qr-code-styling floors modules at the authored size. Authored at the
      // print render size, the symbol keeps at least 95% of its slot; authored
      // at the slot size it lost up to a third on small layouts.
      const modules = printedQrModuleCount(url);
      const plannedSymbolPx =
        (Math.floor((PRINT_QR_RENDER_SIZE - 2) / modules) *
          modules *
          placement.size) /
        PRINT_QR_RENDER_SIZE;
      const symbolPx = detections[0]!.boundingBox.width;
      expect(Math.abs(symbolPx - plannedSymbolPx)).toBeLessThanOrEqual(1.5);
      expect(symbolPx / placement.size).toBeGreaterThanOrEqual(0.95);

      const homePpi = homePrintPixelsPerInch(front, "poker");
      const check = {
        label: cardSequence.word!,
        placement,
        expectedPayload: url,
      };
      if (printable) {
        for (const pixelsPerInch of [PRINT_SERVICE_PIXELS_PER_INCH, homePpi]) {
          const measured = await verifyPrintedQr(
            front,
            { ...check, pixelsPerInch },
            detector
          );
          expect(measured.payload).toBe(url);
          expect(measured.moduleMm).toBeGreaterThanOrEqual(
            MIN_PRINTED_QR_MODULE_MM
          );
          expect(measured.moduleMm).toBeCloseTo(
            plannedQrModuleMm(url, placement.size, pixelsPerInch),
            2
          );
        }
      } else {
        const failure = verifyPrintedQr(
          front,
          { ...check, pixelsPerInch: PRINT_SERVICE_PIXELS_PER_INCH },
          detector
        );
        await expect(failure).rejects.toBeInstanceOf(PrintedQrError);
        await expect(failure).rejects.toThrow(
          `Card "${cardSequence.word}": its QR code would print with`
        );
      }
    }
  );
});
