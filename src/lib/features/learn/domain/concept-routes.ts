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

// A page can open a lesson on one of its stages by name (the Guide's
// "Try it yourself" beside the six combinations opens the two-hands stage).
// Names, not numbers, so a renumbered lesson never breaks a page link.
const CONCEPT_STAGE_PARAM = "stage";

export function buildConceptStagePath(
  conceptId: string,
  stage: string
): string {
  return `${buildConceptPath(conceptId)}?${CONCEPT_STAGE_PARAM}=${encodeURIComponent(stage)}`;
}

/**
 * Reads a named stage off a lesson URL, or null when the URL is not a
 * lesson or names no stage.
 */
export function conceptStageFromUrl(
  url: URL
): { conceptId: string; stage: string } | null {
  const stage = url.searchParams.get(CONCEPT_STAGE_PARAM);
  if (!stage) return null;
  const conceptId = conceptIdFromPathname(url.pathname);
  if (!conceptId) return null;
  return { conceptId, stage };
}

/**
 * The same lesson URL without its entry flags (`from-start`, `stage`), so a
 * reload resumes as usual. Null when there is nothing to strip.
 */
export function conceptHrefWithoutFlags(url: URL): string | null {
  if (
    !url.searchParams.has(CONCEPT_START_PARAM) &&
    !url.searchParams.has(CONCEPT_STAGE_PARAM)
  ) {
    return null;
  }
  const params = new URLSearchParams(url.search);
  params.delete(CONCEPT_START_PARAM);
  params.delete(CONCEPT_STAGE_PARAM);
  const query = params.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
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

/**
 * Whether a navigation into the course arrived from another page of this
 * site, such as the Guide's "Start the first lesson" or a topic's "Learn this
 * interactively". A lesson reached that way keeps that page as its way out:
 * its Back button at the first step returns there, the way the browser's own
 * Back does, instead of landing on a lesson list the reader never saw.
 *
 * Moves inside the course (the list, a lesson switch) do not count, and
 * neither does a fresh page load or an arrival from another site, since
 * neither has a page of ours to go back to.
 */
export function enteredCourseFromOutside(navigation: {
  from: { url: URL } | null;
  to: { url: URL } | null;
}): boolean {
  const from = navigation.from?.url;
  const to = navigation.to?.url;
  if (!from || !to) return false;
  if (from.origin !== to.origin) return false;
  return isConceptPath(to.pathname) && !isConceptPath(from.pathname);
}
