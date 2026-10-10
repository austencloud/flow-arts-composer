import { hashString } from "#lib/shared/foundation/services/content-hasher.js";
import type { ReceiptInput } from "./share-intake-models";

/**
 * Length-prefix a field so its content cannot shift a boundary in the hashed
 * material. `mimeType` and the shared text come from whichever app invoked the
 * share, so they are untrusted: with plain delimiters, a crafted value lets an
 * unrelated share forge the receipt id of a pending one and be swallowed as a
 * duplicate.
 */
function field(value: string): string {
  return `${value.length}:${value}`;
}

/**
 * A stable id derived from the share's CONTENT, not from a counter or clock.
 *
 * Why this matters: Capacitor's BridgeActivity calls onNewIntent(getIntent())
 * immediately after load(), and @capgo/capacitor-share-target handles the
 * intent in both. A cold-launch share fires twice. Deriving the id from content
 * makes the second delivery a no-op instead of a duplicate upload.
 *
 * Files are sorted so two deliveries that enumerate in a different order still
 * collapse to one id. The uri is deliberately EXCLUDED - but NOT because the
 * plugin writes a different cache path each time. It does not:
 * copyFileToCache writes to new File(cacheDir, fileName), a deterministic
 * path (CapacitorShareTargetPlugin.java:170). The real reasons are that
 * getFileData falls back to uri.toString() when that copy fails (Java line
 * 114), which yields a content:// uri that genuinely does vary between
 * deliveries, and that a data: uri would drag the whole payload into the id.
 *
 * Consequence worth knowing: two genuinely different files that agree on
 * name + mimeType + size hash identically. That is the accepted cost of
 * excluding the uri without reading bytes, and it is bounded by the store's
 * one-hour TTL (Task 5).
 */
export function deriveReceiptId(input: ReceiptInput): string {
  const fileParts = input.files
    .map((f) =>
      [
        field(f.name),
        field(f.mimeType),
        // "-" and "0" must not collapse: if one delivery reports a size and the
        // other omits it, the ids MUST diverge visibly rather than silently
        // agreeing on a sentinel that hides the desync.
        field(f.size === undefined ? "-" : String(f.size)),
      ].join("")
    )
    .sort();

  // The file count is length-prefixed first, so the files/texts boundary is
  // positional and cannot be forged by any field value.
  const material = [
    field(String(fileParts.length)),
    ...fileParts,
    ...input.texts.map(field),
  ].join("");

  // hashString is the repo's 128-bit FNV-1a, emitting a fixed-width 22-char
  // base62 digest (content-hasher.ts:156). Fixed width matters: concatenating
  // two variable-length digests makes its own split point ambiguous.
  return `si_${hashString(material)}`;
}
