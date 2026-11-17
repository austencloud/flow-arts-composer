import { extractScanCode } from "#lib/shared/qr/services/extract-scan-code.js";
import {
  createTkaQrDetector,
  type TkaQrDetector,
} from "#lib/shared/qr/services/tka-qr-detector.js";
import { encodeSequenceForQR } from "#lib/shared/navigation/services/sequence-encoder.js";
import { rememberEmbeddedLetters } from "./embedded-letters";
import type { SequenceFileReadResult } from "#lib/shared/share/services/sequence-file-reader.js";
import type {
  IntakeClassification,
  IntakeItem,
  IntakeProblem,
} from "../domain/share-intake-models";

/** Decodes every QR payload found in an image. Injected so tests need no WASM. */
export type QrDecoder = (file: File) => Promise<string[]>;

/** Reads a sequence carried inside the file itself. Injected for tests. */
export type EmbeddedSequenceReader = (
  file: File
) => Promise<SequenceFileReadResult | null>;

/**
 * Default embedded-sequence reader, loaded on first use so a share of plain
 * photos never pays for mediabunny.
 */
export const fileEmbeddedSequenceReader: EmbeddedSequenceReader = async (
  file
) => {
  const { readSequenceFromFile } = await import(
    "#lib/shared/share/services/sequence-file-reader.js"
  );
  return readSequenceFromFile(file);
};

/**
 * A card code for a file that carries its sequence: the same self-contained
 * `s~` payload a printed QR holds, so resolveForImport opens it with no lookup.
 */
async function codeFromEmbeddedSequence(
  file: File,
  read: EmbeddedSequenceReader
): Promise<{ code: string; found: SequenceFileReadResult } | null> {
  try {
    const found = await read(file);
    if (!found) return null;
    return { code: await encodeSequenceForQR(found.sequence), found };
  } catch (caught) {
    // A payload we cannot re-wrap is not fatal: the QR decoder still gets a turn.
    console.warn("[ShareIntake] Embedded sequence unreadable:", caught);
    return null;
  }
}

/** Observer only: never awaited, never able to fail the intake. */
function reportEmbeddedOpen(found: SequenceFileReadResult): void {
  void import("#lib/shared/analytics/sequence-file-events.js")
    .then((events) =>
      events.trackSequenceFileOpened({
        fileKind: found.fileKind,
        entry: "share_target",
        hadLink: !!found.payload.link,
        stepCount: found.sequence.steps.length,
      })
    )
    .catch(() => {});
}

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
  decode: QrDecoder = fileQrDecoder,
  readEmbedded: EmbeddedSequenceReader = fileEmbeddedSequenceReader
): Promise<IntakeClassification> {
  const items: IntakeItem[] = [];
  const problems: IntakeProblem[] = [];
  const seen = new Set<string>();

  let decoderBroken = false;
  let anyDecodeSucceeded = false;

  for (const file of input.files) {
    // The sequence inside the file is exact and cheap; pixels are the fallback.
    const embedded = await codeFromEmbeddedSequence(file, readEmbedded);
    let code: string | null = embedded?.code ?? null;

    if (!code && !decoderBroken) {
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
    if (embedded) {
      if (embedded.code === code) rememberEmbeddedLetters(code, embedded.found.sequence);
      reportEmbeddedOpen(embedded.found);
    }
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
