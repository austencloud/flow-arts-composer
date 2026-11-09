/**
 * What a Browse screen hands the header bar.
 *
 * The bar draws the trail from the route on its own. A screen that knows
 * something the route does not (a collection's name while it loads, its
 * action buttons, its selection toolbar, its tint) registers an entry here.
 * Fields are getters so the bar follows the screen's state without the screen
 * re-registering; the effect cleanup that unregisters clears the slot when the
 * screen leaves.
 */
import type { Snippet } from "svelte";
import type { BrowseEngine } from "#lib/shared/browse/engine/types.js";

export interface BrowseHeaderEntry {
  /** The current crumb's label. Null while it is still loading. */
  leaf?: () => string | null;
  /** Replaces the leaf label while it is being edited in place. */
  leafContent?: () => Snippet | null | undefined;
  /** Pill buttons for the bar's right slot. */
  actions?: () => Snippet | null | undefined;
  /** A toolbar that takes over the whole bar while it is set. */
  toolbar?: () => Snippet | null | undefined;
  /** The screen's tint, for the bar's focus rings and hover tints. */
  accent?: () => string | null | undefined;
}

/** The scope bar's search, when the bar's own field gives its row to the grid. */
export interface BrowseHeaderSearch {
  placeholder: () => string;
  value: () => string;
  onSearch: (text: string) => void;
}

/** The open grid's Filters pill, when its toolbar gives its row to the grid. */
export interface BrowseHeaderFilters {
  engine: () => BrowseEngine;
  open: () => void;
}

export interface BrowseHeaderState {
  /** A phone or tablet not held sideways: search and Filters live in the bar,
   * and the bands under it step aside for the grid. */
  readonly compactChrome: boolean;
  readonly search: BrowseHeaderSearch | null;
  readonly filters: BrowseHeaderFilters | null;
  /** Both return the matching cleanup, like `register`. They are slots of
   * their own because the screen that owns them is not the screen's entry: a
   * collection keeps its own actions beside them. */
  registerSearch(search: BrowseHeaderSearch): () => void;
  registerFilters(filters: BrowseHeaderFilters): () => void;
  readonly entry: BrowseHeaderEntry | null;
  readonly leaf: string | null;
  readonly leafContent: Snippet | null;
  readonly actions: Snippet | null;
  readonly toolbar: Snippet | null;
  readonly accent: string | null;
  /** Registers the screen's entry and returns the matching cleanup. */
  register(entry: BrowseHeaderEntry): () => void;
}

export function createBrowseHeaderState({
  compactChrome = () => false,
}: { compactChrome?: () => boolean } = {}): BrowseHeaderState {
  // Raw: the entry holds the screen's getters, nothing to deep-proxy, and
  // unregistering compares it against the object the screen handed in.
  let entry = $state.raw<BrowseHeaderEntry | null>(null);
  let search = $state.raw<BrowseHeaderSearch | null>(null);
  let filters = $state.raw<BrowseHeaderFilters | null>(null);

  return {
    get compactChrome() {
      return compactChrome();
    },
    get search() {
      return search;
    },
    get filters() {
      return filters;
    },
    registerSearch(next) {
      search = next;
      return () => {
        if (search === next) search = null;
      };
    },
    registerFilters(next) {
      filters = next;
      return () => {
        if (filters === next) filters = null;
      };
    },
    get entry() {
      return entry;
    },
    get leaf() {
      return entry?.leaf?.() ?? null;
    },
    get leafContent() {
      return entry?.leafContent?.() ?? null;
    },
    get actions() {
      return entry?.actions?.() ?? null;
    },
    get toolbar() {
      return entry?.toolbar?.() ?? null;
    },
    get accent() {
      return entry?.accent?.() ?? null;
    },
    register(next) {
      entry = next;
      return () => {
        // A later screen may already own the slot; leave its entry alone.
        if (entry === next) entry = null;
      };
    },
  };
}
