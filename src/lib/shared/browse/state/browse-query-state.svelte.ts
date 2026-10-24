// The one Browse query: the words in the search bar and the user's filters.
// Every scope (Everyone, Saved, Drafts, a collection) has its own engine and
// pool, but they all read this query, so switching scope keeps what you were
// looking for. Only one scope's grid is mounted at a time, so only one engine
// is bound at once.

import { getContext, setContext, untrack } from "svelte";
import type { ActiveFilter, BrowseEngine } from "../engine/types.js";
import type { FilterConnective } from "../services/multi-filter.js";

type FilterEntry = readonly [string, ActiveFilter];

export interface BrowseQueryState {
  readonly search: string;
  readonly filterEntries: readonly FilterEntry[];
  readonly connectives: Readonly<Record<string, FilterConnective>>;
  setSearch(query: string): void;
  setFilters(
    entries: readonly FilterEntry[],
    connectives: Readonly<Record<string, FilterConnective>>
  ): void;
}

function userEntries(map: ReadonlyMap<string, ActiveFilter>): FilterEntry[] {
  return [...map].filter(([, filter]) => !filter.locked);
}

function sameEntries(a: readonly FilterEntry[], b: readonly FilterEntry[]) {
  if (a.length !== b.length) return false;
  const byKey = new Map(b);
  return a.every(([key, filter]) => {
    const other = byKey.get(key);
    return (
      other !== undefined &&
      other.type === filter.type &&
      JSON.stringify(other.value) === JSON.stringify(filter.value)
    );
  });
}

function sameConnectives(
  a: Readonly<Record<string, FilterConnective>>,
  b: Readonly<Record<string, FilterConnective>>
) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? "any") !== (b[key] ?? "any")) return false;
  }
  return true;
}

/** Seeded from the community engine so a returning visitor's saved
 * filters survive the first bind. */
export function createBrowseQueryState(seed?: BrowseEngine): BrowseQueryState {
  let search = $state(seed?.searchQuery ?? "");
  let filterEntries = $state.raw<readonly FilterEntry[]>(
    seed ? userEntries(seed.activeFilters) : []
  );
  let connectives = $state.raw<Readonly<Record<string, FilterConnective>>>(
    seed ? { ...seed.connectives } : {}
  );

  return {
    get search() {
      return search;
    },
    get filterEntries() {
      return filterEntries;
    },
    get connectives() {
      return connectives;
    },
    setSearch(query) {
      if (query !== search) search = query;
    },
    setFilters(entries, nextConnectives) {
      if (!sameEntries(entries, filterEntries)) filterEntries = [...entries];
      if (!sameConnectives(nextConnectives, connectives)) {
        connectives = { ...nextConnectives };
      }
    },
  };
}

/**
 * Keep an engine and the query in step for as long as the calling component
 * lives. Call during component init. The query wins when the engine first
 * appears; after that, changes flow both ways (the filter sheet edits the
 * engine, the search bar edits the query).
 *
 * `filters: false` binds search only — a smart collection's rules occupy the
 * engine's filters, and carrying the user's filters in would rewrite them.
 */
export function bindBrowseQuery(
  query: BrowseQueryState | null,
  getEngine: () => BrowseEngine | null | undefined,
  options: { filters?: boolean } = {}
): void {
  if (!query) return;
  const withFilters = options.filters ?? true;

  // Query → engine. Runs when the engine appears and when the query moves.
  $effect(() => {
    const engine = getEngine();
    if (!engine) return;
    const next = query.search;
    untrack(() => {
      if (engine.searchQuery !== next) engine.setSearch(next);
    });
  });
  if (withFilters) {
    $effect(() => {
      const engine = getEngine();
      if (!engine) return;
      const entries = query.filterEntries;
      const nextConnectives = query.connectives;
      untrack(() => {
        if (
          !sameEntries(userEntries(engine.activeFilters), entries) ||
          !sameConnectives(engine.connectives, nextConnectives)
        ) {
          engine.replaceUserFilters(entries, nextConnectives);
        }
      });
    });
  }

  // Engine → query. Declared after, so on the first run it reads the engine
  // the effects above just brought in line and changes nothing.
  $effect(() => {
    const engine = getEngine();
    if (!engine) return;
    const current = engine.searchQuery;
    untrack(() => query.setSearch(current));
  });
  if (withFilters) {
    $effect(() => {
      const engine = getEngine();
      if (!engine) return;
      const entries = userEntries(engine.activeFilters);
      const engineConnectives = engine.connectives;
      untrack(() => query.setFilters(entries, engineConnectives));
    });
  }
}

const BROWSE_QUERY_CONTEXT = Symbol("browse-query");

export function setBrowseQueryContext(
  query: BrowseQueryState
): BrowseQueryState {
  setContext(BROWSE_QUERY_CONTEXT, query);
  return query;
}

/** Null outside the Browse module; a grid there keeps its own search. */
export function tryGetBrowseQueryContext(): BrowseQueryState | null {
  return getContext<BrowseQueryState>(BROWSE_QUERY_CONTEXT) ?? null;
}
