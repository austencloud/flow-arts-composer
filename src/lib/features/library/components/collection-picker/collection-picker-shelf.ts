/**
 * Which collections the picker shows before the list is opened.
 *
 * A library grows past what one glance can hold (seventeen tiles filled the
 * save screen at 4K), so the picker keeps a shelf: the collections the
 * sequence is already in, the system ones (Favorites), and the ones filed
 * into most recently, up to a cap. Everything else waits behind "Show N
 * more". The shelf keeps the library's own order so tiles do not trade
 * places between visits; recency only decides who is on it.
 */

export const SHELF_CAP = 6;

/** Opening a list this long also shows a find field. */
export const FIND_THRESHOLD = 8;

/** "Show 1 more" is not worth a tap; below this the whole list shows. */
const MIN_HIDDEN = 2;

interface ShelfCandidate {
  readonly id: string;
  readonly updatedAt: Date;
  readonly systemType?: string;
}

function recency(c: ShelfCandidate): number {
  const ms = c.updatedAt?.getTime?.();
  return Number.isFinite(ms) ? ms : 0;
}

export function pickShelf<C extends ShelfCandidate>(
  collections: readonly C[],
  isFeatured: (c: C) => boolean,
  cap: number = SHELF_CAP
): C[] {
  if (collections.length < cap + MIN_HIDDEN) return [...collections];
  const keep = new Set<string>();
  for (const c of collections) {
    if (c.systemType !== undefined || isFeatured(c)) keep.add(c.id);
  }
  const rest = collections
    .filter((c) => !keep.has(c.id))
    .sort((a, b) => recency(b) - recency(a));
  for (const c of rest) {
    if (keep.size >= cap) break;
    keep.add(c.id);
  }
  // Hiding one would be sillier than showing it.
  if (collections.length - keep.size < MIN_HIDDEN) return [...collections];
  return collections.filter((c) => keep.has(c.id));
}

export function filterByName<C extends { readonly name: string }>(
  collections: readonly C[],
  query: string
): C[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [...collections];
  return collections.filter((c) => c.name.toLocaleLowerCase().includes(q));
}
