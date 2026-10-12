/**
 * The scan link a TKA card keeps: its QR opens this link instead of the
 * account's own code. The card kind extension in `item-kinds.ts` stores it as
 * `qrUrl`, and the ops and the editor check a link with the same rule.
 */

/** Longest scan link a card keeps. */
export const POST_MAX_QR_URL_LENGTH = 200;
export const POST_QR_URL_RULE = `A card's link must be an https address with no spaces, at most ${POST_MAX_QR_URL_LENGTH} characters.`;

/**
 * Whether a card can carry this scan link: an https address with a host, no
 * spaces, and at most POST_MAX_QR_URL_LENGTH characters.
 */
export function isPostCardQrUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > POST_MAX_QR_URL_LENGTH ||
    /\s/.test(value) ||
    !value.startsWith("https://")
  )
    return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}
