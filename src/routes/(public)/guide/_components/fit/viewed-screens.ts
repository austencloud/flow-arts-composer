/**
 * A page whose screens are read in any order (2026-11-24, Austen, on the six
 * Dual-Shift modes): each screen counts as viewed once it has been opened,
 * the chapter's line fills by how many have been viewed, and Next leads to
 * one not viewed yet until there is none.
 */

/** The screen Next leads to: the first one not viewed after this screen,
 *  then from the start. Null when all have been viewed. */
export function nextUnviewed(
  viewed: ReadonlySet<number>,
  index: number,
  count: number
): number | null {
  for (let step = 1; step < count; step++) {
    const at = (index + step) % count;
    if (!viewed.has(at)) return at;
  }
  return null;
}

/** The screen Back leads to: the nearest one before this that has been
 *  viewed, so going back never counts a new one. Null when there is none. */
export function previousViewed(
  viewed: ReadonlySet<number>,
  index: number
): number | null {
  for (let at = index - 1; at >= 0; at--) if (viewed.has(at)) return at;
  return null;
}

const storageKey = (page: string) => `guide-viewed:${page}`;

/** The screens of a page opened so far in this visit (the tab's session). */
export function readViewed(page: string): number[] {
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(storageKey(page)) ?? "[]"
    );
    return Array.isArray(saved)
      ? saved.filter((n): n is number => Number.isInteger(n) && n >= 0)
      : [];
  } catch {
    return [];
  }
}

export function saveViewed(page: string, viewed: Iterable<number>): void {
  try {
    sessionStorage.setItem(storageKey(page), JSON.stringify([...viewed]));
  } catch {
    // No storage (a private window): the page still counts until it closes.
  }
}
