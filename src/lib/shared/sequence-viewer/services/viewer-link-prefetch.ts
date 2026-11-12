/**
 * A link that opens the app on a sequence (`/browse/gallery?v=<code>`) used
 * to look the code up only once the whole app had started and the drawer
 * host had mounted: about 8 s in on a throttled phone. The Firestore SDK then
 * waited on the guest sign-in, so after a 2.5 s grace the resolver sent the
 * REST read and both 1 MB snapshots too, and the viewer's code began to
 * download only after all that.
 *
 * The app route's load calls `prefetchViewerLink` instead, as the page
 * starts: the one small public REST read and the viewer's code download
 * while the app boots. The drawer host takes the record when it reaches the
 * code and hands it to the resolver, which then skips its own lookup ladder.
 * A miss or a failed read hands back null and the host resolves as before.
 */
import type { ShortCodeData } from "#lib/shared/qr/services/types.js";
import { fetchPublicShortCodeRecord } from "#lib/shared/qr/services/public-short-code-record-reader.js";
import { isInlineEncoded } from "#lib/shared/navigation/services/inline-qr-envelope.js";
import { loadSequenceViewerContent } from "./prefetch-sequence-viewer";

const RECORD_TIMEOUT_MS = 5_000;

const records = new Map<string, Promise<ShortCodeData | null>>();

export function prefetchViewerLink(code: string): void {
  // An inline code carries its sequence; there is nothing to look up.
  if (!code || isInlineEncoded(code) || records.has(code)) return;
  records.set(
    code,
    fetchPublicShortCodeRecord(code, { timeoutMs: RECORD_TIMEOUT_MS }).catch(
      () => null
    )
  );
  void loadSequenceViewerContent().catch(() => {
    // The viewer loads on open as before.
  });
}

/** The record started for this code, once; null when none was started. */
export function takePrefetchedViewerRecord(
  code: string
): Promise<ShortCodeData | null> {
  const pending = records.get(code);
  records.delete(code);
  return pending ?? Promise.resolve(null);
}
