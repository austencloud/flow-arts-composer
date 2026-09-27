/**
 * Export-time guarantee for printed card QR codes.
 *
 * A card front may leave the renderer without its QR (the QR pre-render and
 * the composer both log a failure and carry on) or with modules too small for
 * a phone to resolve on paper. Neither is visible in the preview, so exports
 * check the finished pixels: the QR cell must decode, carry the expected TKA
 * payload, and print with modules of at least MIN_PRINTED_QR_MODULE_MM.
 */
import QRCodeStyling from "qr-code-styling";
import {
  MODERN_QR_STYLE,
  PRINT_QR_RENDER_SIZE,
  createStyledQrOptions,
} from "@tka/render-composition";
import {
  createTkaQrDetector,
  type TkaQrDetector,
} from "$lib/shared/qr/services/tka-qr-detector";
import { extractScanCode } from "$lib/shared/qr/services/extract-scan-code";
import { getPageLayout, type CardSizeId } from "../domain/card-sizes";
import {
  getSerializedQrPlacement,
  type SerializedQrPlacement,
} from "./serialized-card-front";
import type { CardPair } from "./types";

/** Smallest printed QR module a phone camera reliably resolves on a card. */
export const MIN_PRINTED_QR_MODULE_MM = 0.33;

/**
 * Print-service artwork (MPC ZIP, one-card-per-page PDF) is authored at 300 px
 * per inch: CARD_SIZES content pixels are trim inches × 300.
 */
export const PRINT_SERVICE_PIXELS_PER_INCH = 300;

/**
 * Home-print sheets draw the whole canvas, bleed included, into the trim box,
 * so the card prints denser than its authored 300 DPI. The denser axis gives
 * the smaller printed module, which is the one that has to scan.
 */
export function homePrintPixelsPerInch(
  canvas: { width: number; height: number },
  cardSize: CardSizeId
): number {
  const { cardWidthPt, cardHeightPt } = getPageLayout(cardSize);
  return Math.max(
    canvas.width / (cardWidthPt / 72),
    canvas.height / (cardHeightPt / 72)
  );
}

export type PrintedQrProblem = "missing" | "wrong-payload" | "too-small";

export class PrintedQrError extends Error {
  constructor(
    readonly cardLabel: string,
    readonly problem: PrintedQrProblem,
    message: string
  ) {
    super(message);
    this.name = "PrintedQrError";
  }
}

/** Module counts by payload byte length; byte mode fixes the version by length. */
const moduleCounts = new Map<number, number>();

/**
 * Modules per side of the printed QR for this payload. Uses the same
 * qr-code-styling options as every print QR (byte mode, error correction H
 * for the play badge), so the symbol version matches what the card carries.
 */
export function printedQrModuleCount(payload: string): number {
  const byteLength = new TextEncoder().encode(payload).length;
  const cached = moduleCounts.get(byteLength);
  if (cached) return cached;
  // The badge image only affects drawing, not the symbol version; leaving it
  // out avoids an image load.
  const {
    image: _image,
    imageOptions: _imageOptions,
    ...options
  } = createStyledQrOptions(
    payload,
    PRINT_QR_RENDER_SIZE,
    1,
    MODERN_QR_STYLE,
    "play"
  );
  const count = new QRCodeStyling(
    options as ConstructorParameters<typeof QRCodeStyling>[0]
  )._qr?.getModuleCount();
  if (!count) {
    throw new Error("Could not size the QR symbol for this payload");
  }
  moduleCounts.set(byteLength, count);
  return count;
}

function toMillimeters(pixels: number, pixelsPerInch: number): number {
  return (pixels / pixelsPerInch) * 25.4;
}

/**
 * Module width in canvas pixels for a QR authored the way print QRs are:
 * qr-code-styling floors the module to whole pixels at PRINT_QR_RENDER_SIZE
 * (margin 1), then the image is scaled into the placement square.
 */
function plannedModulePx(payload: string, placementSize: number): number {
  const modules = printedQrModuleCount(payload);
  const authoredModulePx = Math.floor((PRINT_QR_RENDER_SIZE - 2) / modules);
  return (authoredModulePx * placementSize) / PRINT_QR_RENDER_SIZE;
}

/** Printed module size of a QR before it is rendered. */
export function plannedQrModuleMm(
  payload: string,
  placementSize: number,
  pixelsPerInch: number
): number {
  return toMillimeters(plannedModulePx(payload, placementSize), pixelsPerInch);
}

function formatMm(value: number): string {
  return `${value.toFixed(2)} mm`;
}

function tooSmallError(label: string, moduleMm: number): PrintedQrError {
  return new PrintedQrError(
    label,
    "too-small",
    `Card "${label}": its QR code would print with ${formatMm(moduleMm)} dots, ` +
      `below the ${formatMm(MIN_PRINTED_QR_MODULE_MM)} phones need to scan it. ` +
      `This card layout leaves too little room for the QR.`
  );
}

/** Fail before rendering when a serialized QR cannot print large enough. */
export function assertPlannedQrFits(
  label: string,
  payload: string,
  placementSize: number,
  pixelsPerInch: number
): void {
  const moduleMm = plannedQrModuleMm(payload, placementSize, pixelsPerInch);
  if (moduleMm < MIN_PRINTED_QR_MODULE_MM) {
    throw tooSmallError(label, moduleMm);
  }
}

export interface PrintedQrCheck {
  /** Card name used in the error message. */
  label: string;
  placement: SerializedQrPlacement;
  pixelsPerInch: number;
  /** Exact payload the QR must carry. Without it any TKA scan code passes. */
  expectedPayload?: string;
}

export interface PrintedQrMeasurement {
  payload: string;
  modules: number;
  /** Decoded symbol width in canvas pixels. */
  symbolPx: number;
  moduleMm: number;
}

let defaultDetector: TkaQrDetector | undefined;

function getDefaultDetector(): TkaQrDetector {
  defaultDetector ??= createTkaQrDetector();
  return defaultDetector;
}

/** Copy the QR cell (with its white surround as quiet zone) for decoding. */
function readQrCell(
  front: HTMLCanvasElement,
  placement: SerializedQrPlacement
): ImageData {
  const margin = Math.ceil(placement.size * 0.08);
  const left = Math.max(0, placement.x - margin);
  const top = Math.max(0, placement.y - margin);
  const right = Math.min(front.width, placement.x + placement.size + margin);
  const bottom = Math.min(front.height, placement.y + placement.size + margin);
  const width = right - left;
  const height = bottom - top;

  const cell = document.createElement("canvas");
  cell.width = width;
  cell.height = height;
  const context = cell.getContext("2d");
  if (!context) throw new Error("Could not read the card's QR cell");
  context.drawImage(front, left, top, width, height, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

/**
 * Decode the QR on a finished card front and check that it prints scannable.
 * Throws PrintedQrError naming the card when the QR is missing, unreadable,
 * carries the wrong payload, or prints below MIN_PRINTED_QR_MODULE_MM.
 */
export async function verifyPrintedQr(
  front: HTMLCanvasElement,
  check: PrintedQrCheck,
  detector: TkaQrDetector = getDefaultDetector()
): Promise<PrintedQrMeasurement> {
  const { label, placement, pixelsPerInch, expectedPayload } = check;
  // A known payload can be sized before decoding. This also names the real
  // cause when the modules are too small for the decoder to read at all.
  if (expectedPayload) {
    assertPlannedQrFits(label, expectedPayload, placement.size, pixelsPerInch);
  }
  let detections: Awaited<ReturnType<TkaQrDetector["detect"]>>;
  try {
    detections = await detector.detect(readQrCell(front, placement));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Couldn't check the QR code on card "${label}": ${reason}`);
  }

  const detection = expectedPayload
    ? detections.find((d) => d.rawValue === expectedPayload)
    : detections.find((d) => extractScanCode(d.rawValue) !== null);
  if (!detection) {
    if (detections.length > 0) {
      throw new PrintedQrError(
        label,
        "wrong-payload",
        `Card "${label}": its QR code reads "${detections[0]!.rawValue}"` +
          (expectedPayload
            ? ` instead of "${expectedPayload}".`
            : `, which is not a TKA card link.`)
      );
    }
    throw new PrintedQrError(
      label,
      "missing",
      `Card "${label}": its QR code is missing or unreadable. ` +
        `The export was stopped so no card prints without a working QR.`
    );
  }

  const modules = printedQrModuleCount(detection.rawValue);
  const symbolPx = detection.boundingBox.width;
  // The decoder's corner estimate can run a few pixels wide on larger
  // symbols, and a QR authored below PRINT_QR_RENDER_SIZE is smaller than the
  // authored geometry. The smaller of the two bounds the printed module.
  const modulePx = Math.min(
    symbolPx / modules,
    plannedModulePx(detection.rawValue, placement.size)
  );
  const moduleMm = toMillimeters(modulePx, pixelsPerInch);
  if (moduleMm < MIN_PRINTED_QR_MODULE_MM) {
    throw tooSmallError(label, moduleMm);
  }
  return { payload: detection.rawValue, modules, symbolPx, moduleMm };
}

/**
 * Verify every distinct front in an export that carries a QR cell.
 *
 * Only pairs with render provenance can be located; inserts and other
 * sequence-less cards have no QR cell and are skipped. A front canvas shared
 * by several pairs is decoded once.
 */
export async function verifyCardFrontQrs(
  pairs: readonly CardPair[],
  pixelsPerInchFor: (front: HTMLCanvasElement) => number,
  detector?: TkaQrDetector
): Promise<void> {
  const checked = new Set<HTMLCanvasElement>();
  for (const pair of pairs) {
    if (checked.has(pair.front)) continue;
    checked.add(pair.front);
    const meta = pair.renderMeta;
    if (!meta) continue;
    const placement = getSerializedQrPlacement(meta.sequence, meta.options);
    if (!placement) continue;
    await verifyPrintedQr(
      pair.front,
      {
        label: pair.label,
        placement,
        pixelsPerInch: pixelsPerInchFor(pair.front),
        expectedPayload: meta.options.qrUrl,
      },
      detector
    );
  }
}
