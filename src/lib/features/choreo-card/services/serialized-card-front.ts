import { PRINT_QR_RENDER_SIZE } from "@tka/render-composition";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { findEmptyCellForQR } from "$lib/shared/render/services/cell-border-renderer";
import { computeCardFrontLayout } from "$lib/shared/render/services/card-front-assembler";
import type { QRCodeGenerator } from "$lib/shared/qr/services/qr-code-generator";
import { buildFrontComposeOptions } from "./build-front-compose-options";
import { getCardFrameContentInset } from "./card-front-frame";
import type { PrintRenderOptions } from "./types";

export interface SerializedQrPlacement {
  x: number;
  y: number;
  size: number;
}

/**
 * Locate the QR square inside the fully framed print canvas.
 *
 * This deliberately reuses the same layout builder and empty-cell resolver as
 * the original card render. The placement is therefore derived from the card's
 * authored geometry instead of inferred from pixels.
 */
export function getSerializedQrPlacement(
  sequence: SequenceData,
  options: PrintRenderOptions
): SerializedQrPlacement | null {
  const { composeOptions, frame } = buildFrontComposeOptions(sequence, options);
  if (!composeOptions.visibilityOverrides?.showQRCode) return null;

  const layout = computeCardFrontLayout(
    sequence,
    composeOptions,
    composeOptions.visibilityOverrides
  );
  const cell = findEmptyCellForQR(
    layout.columns,
    layout.rows,
    sequence,
    composeOptions
  );
  if (!cell) return null;

  const frameInset = getCardFrameContentInset(frame.bleedPx);
  const sideMargin = Math.round(layout.stepSize * 0.055);
  const qrSize = Math.floor(layout.stepSize - 2 * sideMargin);
  const cellLeft = frameInset + layout.gridOffsetX + cell.col * layout.stepSize;
  const cellTop = frameInset + layout.gridOffsetY + cell.row * layout.stepSize;

  return {
    x: cellLeft + Math.floor((layout.stepSize - qrSize) / 2),
    y: cellTop + Math.floor((layout.stepSize - qrSize) / 2),
    size: qrSize,
  };
}

/**
 * Clone a rendered card front and replace only its QR square.
 *
 * The generated QR has an opaque card-color background and exactly covers the
 * original QR bounds, so the surrounding card artwork and cell borders remain
 * untouched.
 *
 * The QR is authored at PRINT_QR_RENDER_SIZE and scaled into the placement,
 * the same way the base front's QR is. qr-code-styling floors its module size
 * to whole pixels, so authoring at the small placement size instead would
 * leave up to one pixel per module unused and shrink the printed symbol.
 */
export async function renderSerializedCardFront(
  baseFront: HTMLCanvasElement,
  sequence: SequenceData,
  options: PrintRenderOptions,
  serializedUrl: string,
  qrGenerator: QRCodeGenerator
): Promise<HTMLCanvasElement> {
  const placement = getSerializedQrPlacement(sequence, options);
  if (!placement) {
    throw new Error(
      `Card "${sequence.word ?? sequence.name ?? "Untitled"}" has no QR cell to serialize`
    );
  }

  const qrImage = await qrGenerator.generateUrlAsImage(
    serializedUrl,
    PRINT_QR_RENDER_SIZE,
    {
      style: "modern",
      margin: 1,
      darkMode: false,
    }
  );

  const canvas = document.createElement("canvas");
  canvas.width = baseFront.width;
  canvas.height = baseFront.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create serialized card canvas");
  }

  context.drawImage(baseFront, 0, 0);
  context.drawImage(
    qrImage,
    placement.x,
    placement.y,
    placement.size,
    placement.size
  );
  return canvas;
}
