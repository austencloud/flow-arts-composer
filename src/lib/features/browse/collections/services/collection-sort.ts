/**
 * Collection list sorting — plain function module.
 *
 * The Library rail lists every collection you own. Older collections carry
 * their creation time in `sortOrder` (collection-manager stamps Date.now() on
 * create, and nothing reorders them since the drag UI went away), so sorting
 * by `sortOrder` is oldest-first and a brand-new collection sinks to the
 * bottom of a long list. This module owns the three orders the rail offers
 * and the per-device memory of which one is active.
 *
 * System collections with a negative `sortOrder` (Favorites is -1000) stay
 * pinned above the rest whatever order is chosen.
 */

import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";

export type CollectionSortMethod = "recent" | "newest" | "alphabetical";

export const COLLECTION_SORT_METHODS: readonly CollectionSortMethod[] = [
  "recent",
  "newest",
  "alphabetical",
];

export const DEFAULT_COLLECTION_SORT: CollectionSortMethod = "recent";

const STORAGE_KEY = "tka_collections_sort";

type SortableCollection = Pick<
  LibraryCollection,
  "name" | "sortOrder" | "createdAt" | "updatedAt"
>;

export function isCollectionSortMethod(
  value: unknown
): value is CollectionSortMethod {
  return (COLLECTION_SORT_METHODS as readonly unknown[]).includes(value);
}

function byName(a: SortableCollection, b: SortableCollection): number {
  // "numeric" keeps "Step 2" ahead of "Step 10"; "base" ignores case and
  // accents so "zan" and "Zan" don't split into two runs.
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function newestFirst(a: Date, b: Date): number {
  return b.getTime() - a.getTime();
}

const comparators: Record<
  CollectionSortMethod,
  (a: SortableCollection, b: SortableCollection) => number
> = {
  recent: (a, b) => newestFirst(a.updatedAt, b.updatedAt) || byName(a, b),
  newest: (a, b) => newestFirst(a.createdAt, b.createdAt) || byName(a, b),
  alphabetical: (a, b) => byName(a, b) || newestFirst(a.createdAt, b.createdAt),
};

/** Pinned system collections first (most negative sortOrder on top), then the rest in the chosen order. */
export function sortCollections<T extends SortableCollection>(
  collections: readonly T[],
  method: CollectionSortMethod
): T[] {
  const pinned = collections
    .filter((c) => c.sortOrder < 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const rest = collections
    .filter((c) => c.sortOrder >= 0)
    .sort(comparators[method]);
  return [...pinned, ...rest];
}

/** The order chosen on this device, or the default when nothing (or junk) is stored. */
export function readCollectionSortPreference(): CollectionSortMethod {
  if (typeof localStorage === "undefined") return DEFAULT_COLLECTION_SORT;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isCollectionSortMethod(stored) ? stored : DEFAULT_COLLECTION_SORT;
  } catch {
    return DEFAULT_COLLECTION_SORT;
  }
}

export function writeCollectionSortPreference(
  method: CollectionSortMethod
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, method);
  } catch {
    // Private mode or a full quota: the choice still applies for this visit.
  }
}
