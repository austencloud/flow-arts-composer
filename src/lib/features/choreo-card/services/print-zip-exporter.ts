/**
 * Print ZIP Exporter
 *
 * Exports rendered card pairs as a ZIP file with fronts/ and backs/
 * subdirectories containing numbered PNG files. Designed for upload
 * to print services like MakePlayingCards.com that accept individual
 * card face images.
 */

import type { ZipCardPair } from "./types";
import { sanitizeFilename } from "#lib/shared/foundation/services/file-downloader.js";
import {
  PRINT_SERVICE_PIXELS_PER_INCH,
  verifyCardFrontQrs,
} from "./print-qr-guard";

export interface DeckZipExportOptions {
  /** Per-card front renderer used to stamp a freshly allocated physical ID.
   *  The renderer owns QR verification for the fronts it returns; without it,
   *  every front with a QR cell is decoded and size-checked before export. */
  frontRenderer?: (
    pair: ZipCardPair,
    cardIndex: number
  ) => Promise<HTMLCanvasElement>;
  /** "How to Read" insert, written as card 001 ahead of the sequence cards.
   *  Passed separately rather than prepended to `pairs` so it never reaches
   *  `frontRenderer` — it has no sequence and must not consume a short code. */
  insertPair?: { front: HTMLCanvasElement; back: HTMLCanvasElement };
}

export async function exportDeckZIP(
  pairs: ZipCardPair[],
  deckName: string,
  onProgress?: (current: number, total: number) => void,
  options: DeckZipExportOptions = {}
): Promise<Blob> {
  if (!options.frontRenderer) {
    await verifyCardFrontQrs(pairs, () => PRINT_SERVICE_PIXELS_PER_INCH);
  }

  // JSZip is lazy-loaded - it uses `new Function` internally (CSP-incompatible
  // when eagerly imported into the main chunk).
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const fronts = zip.folder("fronts")!;
  const backs = zip.folder("backs")!;
  const insert = options.insertPair;
  // The insert occupies 001; sequence cards start at 002.
  const indexOffset = insert ? 1 : 0;
  const total = pairs.length + indexOffset;

  if (insert) {
    fronts.file("001_how-to-read_front.png", await canvasToBlob(insert.front));
    backs.file("001_how-to-read_back.png", await canvasToBlob(insert.back));
    onProgress?.(1, total);
  }

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]!;
    const index = String(i + 1 + indexOffset).padStart(3, "0");
    // Keep Greek glyphs (Σ, Φ, Λ…) — ZIP entry names are UTF-8. sanitizeFilename
    // preserves Unicode and strips only illegal path chars; the old
    // [^a-zA-Z0-9_-] regex flattened every Greek letter to "_".
    const safeName = sanitizeFilename(pair.label).replace(/\s+/g, "_") || index;

    const front = options.frontRenderer
      ? await options.frontRenderer(pair, i)
      : pair.front;
    const frontBlob = await canvasToBlob(front);
    fronts.file(`${index}_${safeName}_front.png`, frontBlob);

    const backBlob = await canvasToBlob(pair.back);
    backs.file(`${index}_${safeName}_back.png`, backBlob);

    onProgress?.(i + 1 + indexOffset, total);
  }

  return zip.generateAsync({ type: "blob" });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      },
      "image/png"
    );
  });
}
