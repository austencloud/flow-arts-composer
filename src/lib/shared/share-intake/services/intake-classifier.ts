import { extractScanCode } from "#lib/shared/qr/services/extract-scan-code.js";
import {
  createTkaQrDetector,
  type TkaQrDetector,
} from "#lib/shared/qr/services/tka-qr-detector.js";
import type {
  IntakeClassification,
  IntakeItem,
  IntakeProblem,
} from "../domain/share-intake-models";

/** Decodes every QR payload found in an image. Injected so tests need no WASM. */
export type QrDecoder = (file: File) => Promise<string[]>;

let sharedDetector: TkaQrDetector | null = null;

/**
 * One detector for the whole app run. createTkaQrDetector() constructs a
 * BarcodeDetector and, on the first call, prepares the ZXing WASM module -
 * building one per image paid that cost N times for nothing.
 */
function getDetector(): TkaQrDetector {
  sharedDetector ??= createTkaQrDetector();
  return sharedDetector;
}

/**
 * Default decoder.
 *
 * The detector accepts an ImageBitmapSource (Task 4) and a File IS a Blob, so
 * the file goes straight in: no createImageBitmap, no canvas, no
 * getImageData. zxing-wasm does the decode internally, which is also why the
 * 10 MB validation cap is the resolution cap - there is no intermediate
 * bitmap for us to downscale, and inserting one to create the opportunity
 * would be the hand-rolled path this deleted.
 */
export const fileQrDecoder: QrDecoder = async (file) => {
  const detections = await getDetector().detect(file);
  return detections.map((detection) => detection.rawValue);
};

const URL_LIKE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>'"]+$/;

/**
 * Pull a TKA code out of free-form shared text.
 *
 * extractScanCode needs the WHOLE trimmed string to be a URL, an s~ payload,
 * or a bare code - it calls `new URL(raw)` directly. Android's EXTRA_TEXT is
 * almost never that: it reads "Check this out https://tka.run/AB12". So the
 * URL-shaped substrings are extracted and each is offered to extractScanCode,
 * with the whole string as a last resort for the bare-code case.
 *
 * The residual is what is left after removing the matched URL. It becomes the
 * prefilled message note; the first draft threw it away whenever a code was
 * found.
 */
export function extractCodeFromText(text: string): {
  code: string | null;
  residual: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { code: null, residual: "" };

  for (const match of trimmed.match(URL_LIKE) ?? []) {
    const candidate = match.replace(TRAILING_PUNCTUATION, "");
    const code = extractScanCode(
      candidate.toLowerCase().startsWith("www.") ? `https://${candidate}` : candidate
    );
    if (code) {
      const residual = trimmed.replace(match, " ").replace(/\s+/g, " ").trim();
      return { code, residual };
    }
  }

  const whole = extractScanCode(trimmed);
  return whole ? { code: whole, residual: "" } : { code: null, residual: trimmed };
}

/**
 * Decide, per item, whether each shared file is a TKA card, a duplicate of one
 * already in the batch, or an ordinary image.
 *
 * extractScanCode returns null for anything that is not a TKA card - a random
 * QR in a photo is NOT an error, it just means the photo is a photo.
 */
export async function classifyIntake(
  input: { files: File[]; text?: string },
  decode: QrDecoder = fileQrDecoder
): Promise<IntakeClassification> {
  const items: IntakeItem[] = [];
  const problems: IntakeProblem[] = [];
  const seen = new Set<string>();

  let decoderBroken = false;
  let anyDecodeSucceeded = false;

  for (const file of input.files) {
    let code: string | null = null;

    if (!decoderBroken) {
      try {
        const payloads = await decode(file);
        anyDecodeSucceeded = true;
        for (const raw of payloads) {
          const candidate = extractScanCode(raw);
          if (candidate) {
            code = candidate;
            break;
          }
        }
      } catch (caught) {
        const detail = caught instanceof Error ? caught.message : String(caught);
        if (anyDecodeSucceeded) {
          // One bad image among many. Noise, but recorded.
          problems.push({ name: file.name, reason: "decode-failed", detail });
        } else {
          // Nothing has EVER decoded in this run: the ZXing WASM is missing or
          // failed to instantiate, and every shared card in the app is about to
          // be treated as a photo. Say so once, loudly, and stop retrying.
          decoderBroken = true;
          problems.push({ name: "", reason: "decode-failed", detail });
          console.error(
            "[ShareIntake] QR decoding is unavailable - every shared card will be treated as a photo:",
            detail
          );
        }
      }
    }

    if (!code) {
      items.push({ kind: "image", file });
      continue;
    }
    if (seen.has(code)) {
      items.push({ kind: "duplicate", code, file });
      continue;
    }
    seen.add(code);
    items.push({ kind: "card", code, file });
  }

  const text = input.text
    ? extractCodeFromText(input.text)
    : { code: null, residual: "" };

  return {
    items,
    textCode: text.code,
    residualText: text.residual.length > 0 ? text.residual : null,
    problems,
  };
}
