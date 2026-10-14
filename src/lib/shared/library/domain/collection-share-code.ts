/**
 * Collection share codes: the 4-6 character base36 tail of
 * `https://tkaflowarts.com/c/{code}`.
 *
 * Pure helpers shared by the client (minting), the `/c/[code]` resolver and
 * tests. No Firebase import so the server route stays light.
 */

export const COLLECTION_LINKS_COLLECTION = "collectionLinks";

const SHARE_CODE_PATTERN = /^[0-9A-Z]{4,6}$/;

/**
 * Normalise a code typed or pasted by a person: trims, upper-cases, and
 * returns null unless the result is a well-formed code. Lower-case links
 * (`/c/a1f8`) resolve the same as their canonical upper-case form.
 */
export function normalizeCollectionShareCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return SHARE_CODE_PATTERN.test(code) ? code : null;
}
