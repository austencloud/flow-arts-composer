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

export interface BrowseHeaderState {
  readonly entry: BrowseHeaderEntry | null;
  readonly leaf: string | null;
  readonly leafContent: Snippet | null;
  readonly actions: Snippet | null;
  readonly toolbar: Snippet | null;
  readonly accent: string | null;
  /** Registers the screen's entry and returns the matching cleanup. */
  register(entry: BrowseHeaderEntry): () => void;
}

export function createBrowseHeaderState(): BrowseHeaderState {
  let entry = $state<BrowseHeaderEntry | null>(null);

  return {
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
