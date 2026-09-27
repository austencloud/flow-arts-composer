/**
 * The export guard must stop any card whose QR is missing, carries the wrong
 * payload, or prints too small to scan, and name that card in the error.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PRINT_QR_RENDER_SIZE } from "@tka/render-composition";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { QRCodeGenerator } from "$lib/shared/qr/services/qr-code-generator";
import type { TkaQrDetector } from "$lib/shared/qr/services/tka-qr-detector";
import {
  createNodeCanvas,
  createNodeQrDetector,
  createNodeQrGenerator,
  installNodeCanvas,
} from "../../../../../../tests/helpers/node-print-qr";
import { TND_ELEMENTS } from "../../domain/tnd-element";
import { exportHomePrintPDF } from "../print-pdf-exporter";
import { exportDeckZIP } from "../print-zip-exporter";
import {
  MIN_PRINTED_QR_MODULE_MM,
  PRINT_SERVICE_PIXELS_PER_INCH,
  PrintedQrError,
  assertPlannedQrFits,
  homePrintPixelsPerInch,
  verifyCardFrontQrs,
} from "../print-qr-guard";
import { getSerializedQrPlacement } from "../serialized-card-front";
import type { CardPair, PrintRenderOptions } from "../types";

// Exporters use the production detector; route it to the Node decoder.
vi.mock("$lib/shared/qr/services/tka-qr-detector", async () => {
  const { createNodeQrDetector } =
    await import("../../../../../../tests/helpers/node-print-qr");
  return { createTkaQrDetector: () => createNodeQrDetector() };
});

const CARD_URL = "HTTPS://TKA.RUN/K7QM?bp=staff&rp=staff";
const SERIALIZED_URL =
  "https://tka.run/K7QM?bp=staff&rp=staff&pid=k7Qm2XpR9aBc";
const element = TND_ELEMENTS[0]!;

function sequence(stepCount: number, word: string): SequenceData {
  return {
    id: `guard-${word}`,
    word,
    steps: Array.from({ length: stepCount }, () => ({})),
  } as unknown as SequenceData;
}

function printOptions(
  startPlacementLayout: "row" | "column",
  qrUrl?: string
): PrintRenderOptions {
  return {
    canvasWidth: 822,
    canvasHeight: 1122,
    bleedPx: 36,
    includeStartPlacement: true,
    startPlacementLayout,
    tndElement: element,
    leftLabel: element.element,
    rightLabel: "1 turn",
    notes: "Deck 001",
    ...(qrUrl && { qrUrl }),
  };
}

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

/** A framed front with a white QR cell, holding `payload` when given. */
async function cardPair(
  word: string,
  options: PrintRenderOptions,
  payload: string | null
): Promise<CardPair> {
  const cardSequence = sequence(4, word);
  const placement = getSerializedQrPlacement(cardSequence, options)!;
  const front = createNodeCanvas(822, 1122);
  const context = front.getContext("2d")!;
  context.fillStyle = "#e8e2d4";
  context.fillRect(0, 0, 822, 1122);
  context.fillStyle = "#ffffff";
  const flood = Math.ceil(placement.size * 0.06);
  context.fillRect(
    placement.x - flood,
    placement.y - flood,
    placement.size + flood * 2,
    placement.size + flood * 2
  );
  if (payload) {
    const qr = await generator.generateUrlAsImage(
      payload,
      PRINT_QR_RENDER_SIZE,
      { style: "modern", margin: 1, darkMode: false }
    );
    context.drawImage(
      qr,
      placement.x,
      placement.y,
      placement.size,
      placement.size
    );
  }
  return {
    front,
    back: createNodeCanvas(1, 1),
    label: word,
    renderMeta: { sequence: cardSequence, options },
  };
}

function countingDetector(): TkaQrDetector & { calls: number } {
  const counter = {
    calls: 0,
    async detect(source: ImageBitmapSource) {
      counter.calls++;
      return detector.detect(source);
    },
  };
  return counter;
}

describe("planned serialized QR size", () => {
  it("prints home-print cards at the denser of the two squeezed axes", () => {
    expect(homePrintPixelsPerInch({ width: 822, height: 1122 }, "poker")).toBe(
      328.8
    );
  });

  it("names the card when its QR cell is too small to print", () => {
    const eightStepColumn = getSerializedQrPlacement(
      sequence(8, "ABCDEFGH"),
      printOptions("column")
    )!;
    const attempt = () =>
      assertPlannedQrFits(
        "ABCDEFGH",
        SERIALIZED_URL,
        eightStepColumn.size,
        PRINT_SERVICE_PIXELS_PER_INCH
      );
    expect(attempt).toThrow(PrintedQrError);
    expect(attempt).toThrow(
      `Card "ABCDEFGH": its QR code would print with 0.24 mm dots, below the ${MIN_PRINTED_QR_MODULE_MM.toFixed(2)} mm`
    );
  });

  it("lets a four-step card through at home-print scale", () => {
    const fourStep = getSerializedQrPlacement(
      sequence(4, "ABCD"),
      printOptions("row")
    )!;
    expect(() =>
      assertPlannedQrFits("ABCD", SERIALIZED_URL, fourStep.size, 328.8)
    ).not.toThrow();
  });
});

describe("finished front QR verification", () => {
  it("passes a front whose QR decodes to its card URL", async () => {
    const pair = await cardPair(
      "ABCD",
      printOptions("row", CARD_URL),
      CARD_URL
    );
    await expect(
      verifyCardFrontQrs([pair], () => 328.8, detector)
    ).resolves.toBeUndefined();
  });

  it("stops a front whose QR never rendered", async () => {
    const pair = await cardPair("BLANK", printOptions("row", CARD_URL), null);
    const failure = verifyCardFrontQrs([pair], () => 300, detector);
    await expect(failure).rejects.toMatchObject({
      name: "PrintedQrError",
      cardLabel: "BLANK",
      problem: "missing",
    });
    await expect(failure).rejects.toThrow(
      'Card "BLANK": its QR code is missing or unreadable.'
    );
  });

  it("stops a front whose QR carries another card's URL", async () => {
    const pair = await cardPair(
      "SWAP",
      printOptions("row", CARD_URL),
      "HTTPS://TKA.RUN/ZZZZ?bp=staff&rp=staff"
    );
    await expect(
      verifyCardFrontQrs([pair], () => 300, detector)
    ).rejects.toMatchObject({ cardLabel: "SWAP", problem: "wrong-payload" });
  });

  it("decodes a shared front once and skips cards without a QR cell", async () => {
    const pair = await cardPair(
      "ABCD",
      printOptions("row", CARD_URL),
      CARD_URL
    );
    const insert: CardPair = {
      front: createNodeCanvas(822, 1122),
      back: createNodeCanvas(1, 1),
      label: "How to Read",
    };
    const counting = countingDetector();
    await verifyCardFrontQrs([pair, { ...pair }, insert], () => 300, counting);
    expect(counting.calls).toBe(1);
  });
});

describe("exporter QR guard", () => {
  it("refuses a home-print PDF with a QR-less card", async () => {
    const good = await cardPair(
      "GOOD",
      printOptions("row", CARD_URL),
      CARD_URL
    );
    const blank = await cardPair("BLANK", printOptions("row", CARD_URL), null);
    await expect(
      exportHomePrintPDF([good, blank], "Deck_001", "poker")
    ).rejects.toThrow('Card "BLANK": its QR code is missing or unreadable.');
  });

  it("refuses a print-service ZIP with a QR-less card", async () => {
    const blank = await cardPair("BLANK", printOptions("row", CARD_URL), null);
    await expect(exportDeckZIP([blank], "Deck_001")).rejects.toThrow(
      'Card "BLANK": its QR code is missing or unreadable.'
    );
  });
});
