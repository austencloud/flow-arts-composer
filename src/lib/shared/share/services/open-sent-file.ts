/**
 * Open a picture or video someone sent, chosen from the device or dropped on
 * the window.
 *
 * Three tries, in order of how exact they are:
 * 1. The sequence written inside the file (`readSequenceFromFile`).
 * 2. For a picture only, the card's QR in its pixels, through the same decoder
 *    and code reader the share intake uses, then the short-code resolver. A
 *    screenshot of a card, or a copy a chat app re-compressed, still opens.
 * 3. Neither: one toast saying what is known, and nothing else.
 *
 * Opening is the viewer overlay, the same hydrate-then-open the share intake
 * runs (`open-filed-card.ts`). Nothing is saved to the library; saving is the
 * viewer's own button.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  SequenceFileEntry,
  SequenceFileNotFoundKind,
} from "#lib/shared/analytics/sequence-file-events.js";
import type { SequenceFileReadResult } from "./sequence-file-reader";

export type SentFileEntry = Extract<SequenceFileEntry, "picker" | "drop">;

/** What happened, for callers and tests. */
export type OpenSentFileOutcome = "embedded" | "qr" | "not-found" | "failed";

export interface OpenSentFileDeps {
  readEmbedded: (file: File) => Promise<SequenceFileReadResult | null>;
  /** Every QR payload found in a picture. */
  decodeQr: (file: File) => Promise<string[]>;
  /** A TKA card code from one QR payload, or null for any other QR. */
  extractCode: (raw: string) => string | null;
  resolveCode: (code: string) => Promise<SequenceData | null>;
  open: (sequence: SequenceData, shortCode?: string) => Promise<void>;
  notFound: () => void;
  /** A sequence was found but could not be opened. */
  openFailed: () => void;
  trackOpened: (found: SequenceFileReadResult, entry: SentFileEntry) => void;
  trackNotFound: (
    fileKind: SequenceFileNotFoundKind,
    entry: SentFileEntry
  ) => void;
  sniffKind: (file: File) => Promise<SequenceFileNotFoundKind>;
}

function isPicture(file: File): boolean {
  return file.type.startsWith("image/");
}

async function codeFromPixels(
  file: File,
  deps: OpenSentFileDeps
): Promise<string | null> {
  let payloads: string[];
  try {
    payloads = await deps.decodeQr(file);
  } catch (error) {
    // No decoder (the WASM failed to load) reads the same as no card here.
    console.warn("[OpenSentFile] Could not look for a QR in the picture:", error);
    return null;
  }
  for (const raw of payloads) {
    const code = deps.extractCode(raw);
    if (code) return code;
  }
  return null;
}

async function tryQr(file: File, deps: OpenSentFileDeps): Promise<boolean> {
  const code = await codeFromPixels(file, deps);
  if (!code) return false;
  let sequence: SequenceData | null = null;
  try {
    sequence = await deps.resolveCode(code);
  } catch (error) {
    console.warn("[OpenSentFile] The card's code did not resolve:", error);
  }
  if (!sequence) return false;
  await deps.open(sequence, code);
  return true;
}

export async function openSentFile(
  file: File,
  entry: SentFileEntry,
  deps?: OpenSentFileDeps
): Promise<OpenSentFileOutcome> {
  const use = deps ?? (await defaultDeps());
  try {
    const found = await use.readEmbedded(file);
    if (found) {
      const linkCode = found.payload.link
        ? use.extractCode(found.payload.link)
        : null;
      await use.open(found.sequence, linkCode ?? undefined);
      use.trackOpened(found, entry);
      return "embedded";
    }

    if (isPicture(file) && (await tryQr(file, use))) return "qr";

    use.notFound();
    use.trackNotFound(await use.sniffKind(file), entry);
    return "not-found";
  } catch (error) {
    // Hydrating or opening the viewer failed after a sequence was found.
    console.error("[OpenSentFile] Could not open the file's sequence:", error);
    use.openFailed();
    return "failed";
  }
}

/** The real owners, loaded on first use so the menu and drop host stay light. */
async function defaultDeps(): Promise<OpenSentFileDeps> {
  const [
    reader,
    classifier,
    scanCode,
    shortCodes,
    hydrator,
    loopDetector,
    overlay,
    toastState,
    i18n,
    events,
  ] = await Promise.all([
    import("./sequence-file-reader"),
    import("#lib/shared/share-intake/services/intake-classifier.js"),
    import("#lib/shared/qr/services/extract-scan-code.js"),
    import("#lib/shared/qr/get-short-code-manager.js"),
    import("#lib/shared/navigation/services/sequence-hydrator.js"),
    import("#lib/shared/create/get-loop-detector.js"),
    import(
      "#lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.js"
    ),
    import("#lib/shared/toast/state/toast-state.svelte.js"),
    import("#lib/shared/i18n/i18n.svelte.js"),
    import("#lib/shared/analytics/sequence-file-events.js"),
  ]);

  return {
    readEmbedded: reader.readSequenceFromFile,
    decodeQr: classifier.fileQrDecoder,
    extractCode: scanCode.extractScanCode,
    resolveCode: (code) => shortCodes.getShortCodeManager().resolveShortCode(code),
    open: async (sequence, shortCode) => {
      const hydrated = await hydrator.hydrateSequence(sequence, {
        loopDetector: loopDetector.getLoopDetector(),
      });
      // The viewer has no source for an opened file; it reaches the app the
      // same way a shared one does, so it is counted with the share intake.
      overlay.openSequenceOverlay(hydrated, {
        analyticsSource: "share_intake",
        ...(shortCode && { shortCode }),
      });
    },
    notFound: () => toastState.toast.info(i18n.t("share_open_file_not_found")),
    openFailed: () => toastState.toast.error(i18n.t("connect_load_sequence_failed")),
    trackOpened: (found, entry) =>
      events.trackSequenceFileOpened({
        fileKind: found.fileKind,
        entry,
        hadLink: !!found.payload.link,
        stepCount: found.sequence.steps.length,
      }),
    trackNotFound: (fileKind, entry) =>
      events.trackSequenceFileNotFound({ fileKind, entry }),
    sniffKind: async (file) => {
      const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      return (
        reader.sniffSequenceFileKind(head) ?? events.fileKindFromType(file.type)
      );
    },
  };
}
