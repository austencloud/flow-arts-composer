/**
 * The `s~` self-contained QR payload envelope.
 *
 * Owned here, away from the codecs, because two URL boundaries need to reason
 * about the envelope without decoding a sequence: the `/sequence/[id]` route
 * parser and the scan-code extractor.
 *
 * The whole problem this module exists to solve is that a legacy payload is
 * base45 (RFC 9285), and base45's alphabet contains `%`. A `%` in a URL path is
 * therefore ambiguous: `s~q1:A%4AB` can be a genuine payload whose body really
 * contains `%4A`, or an escaped spelling of `s~q1:AJB`. Decoding always, or
 * never, corrupts one of those two.
 *
 * The tell is the envelope. Every payload opens with a delimiter the decoder
 * has to read — `q1:`, `r1:`, `raw:`, `d1:`, or a bare flat encoding's `|` —
 * and if that delimiter is intact then the escapes further in are the payload's
 * own. If it is escaped (`q1%3A`), the whole string was encoded a second time
 * somewhere upstream and one decode restores it, `%254A` back to `%4A` and all.
 */

export const INLINE_PREFIX = "s~";

/** Compression envelopes `decodeSequenceFromQR` knows how to open. */
const QR_ENVELOPES = ["q1:", "r1:", "raw:", "d1:"] as const;

export function isInlineEncoded(code: string): boolean {
  return code.startsWith(INLINE_PREFIX);
}

/** Percent-decode without throwing; malformed escapes keep the raw text. */
export function decodeOnce(value: string): string {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Whether an `s~` payload's compression envelope is intact, meaning the
 * decoder can read it and any remaining `%` belongs to the base45 body.
 */
export function hasReadableQrEnvelope(payload: string): boolean {
  const body = payload.slice(INLINE_PREFIX.length);
  return (
    QR_ENVELOPES.some((envelope) => body.startsWith(envelope)) ||
    // A pre-envelope payload is the bare flat encoding, whose beat separators
    // are the delimiters that must survive instead.
    body.includes("|")
  );
}

/**
 * Whether a URL-encoded share blob's own delimiters are intact.
 *
 * `d1:` bodies are base64url and can never contain a `%`; `raw:` bodies are the
 * flat encoding and always carry at least the header/start-position pipe.
 */
export function hasReadableUrlEnvelope(candidate: string): boolean {
  if (candidate.startsWith("d1:")) return !candidate.includes("%");
  if (candidate.startsWith("raw:")) return candidate.includes("|");
  return true;
}

/**
 * Hand back the spelling of an `s~` payload that its decoder can actually read.
 *
 * Returns the value untouched when its envelope is already intact - which is
 * what preserves a genuine `%4A` in the base45 body - and otherwise the
 * once-decoded form, but only when decoding is what restores the envelope.
 */
export function resolveInlineQrPayload(value: string): string {
  if (hasReadableQrEnvelope(value)) return value;

  const decoded = decodeOnce(value);
  return decoded !== value && hasReadableQrEnvelope(decoded) ? decoded : value;
}
