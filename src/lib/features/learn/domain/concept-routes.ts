export const CONCEPT_LIST_PATH = "/learn/concepts";

export function buildConceptPath(conceptId?: string): string {
  return conceptId
    ? `${CONCEPT_LIST_PATH}/${encodeURIComponent(conceptId)}`
    : CONCEPT_LIST_PATH;
}

// A lesson saves the reader's place. Links that promise the start of a lesson,
// such as the Guide's "Learn this interactively", carry this flag so the
// lesson clears that saved place before it opens.
const CONCEPT_START_PARAM = "from-start";

export function buildConceptStartPath(conceptId: string): string {
  return `${buildConceptPath(conceptId)}?${CONCEPT_START_PARAM}`;
}

/**
 * Reads a start-from-the-beginning request off a lesson URL. Returns the
 * concept to reset and the same URL without the flag, or null when the URL is
 * not a lesson or carries no request.
 */
export function conceptRestartFromUrl(
  url: URL
): { conceptId: string; cleanHref: string } | null {
  if (!url.searchParams.has(CONCEPT_START_PARAM)) return null;
  const conceptId = conceptIdFromPathname(url.pathname);
  if (!conceptId) return null;
  const params = new URLSearchParams(url.search);
  params.delete(CONCEPT_START_PARAM);
  const query = params.toString();
  return {
    conceptId,
    cleanHref: `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
  };
}

export function conceptIdFromPathname(pathname: string): string | null {
  const match = /^\/learn\/concepts\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function isConceptPath(pathname: string): boolean {
  return (
    pathname === CONCEPT_LIST_PATH ||
    pathname === `${CONCEPT_LIST_PATH}/` ||
    conceptIdFromPathname(pathname) !== null
  );
}
