/**
 * A page's editable strings: the sidecar copy.json next to its +page.svelte,
 * wrapped so the page reads `copy.text[key]`.
 *
 * In production this holds the strings and nothing else. The editing code all
 * sits behind CopyEditBar, which only a dev build mounts: it sets `editor`, and
 * until then CopyText has nothing to swap in.
 */
import { onDestroy, type Component, type Snippet } from "svelte";
import { browser, dev } from "$app/env";

export type CopyStrings = Record<string, string>;

export interface CopyEditorProps {
  copy: PageCopy;
  key: string;
  islands: readonly Snippet[];
  multiline: boolean;
}

export class PageCopy {
  readonly file: string;
  text = $state<CopyStrings>({});
  saved = $state<CopyStrings>({});
  editor = $state<Component<CopyEditorProps> | null>(null);

  constructor(file: string, initial: CopyStrings) {
    this.file = file;
    this.text = { ...initial };
    this.saved = { ...initial };
  }

  // A getter, not $derived. This object outlives the page that created it (see
  // knownCopies), and a $derived dies with its creating component, which froze
  // the change count after the first hot reload.
  get dirtyKeys(): string[] {
    return Object.keys(this.text).filter(
      (key) => this.text[key] !== this.saved[key]
    );
  }

  /** New strings from disk. A key with unsaved edits keeps them. */
  acceptInitial(initial: CopyStrings): void {
    for (const key of Object.keys(this.text)) {
      if (!(key in initial) && this.text[key] === this.saved[key]) {
        delete this.text[key];
        delete this.saved[key];
      }
    }
    for (const [key, value] of Object.entries(initial)) {
      if (this.text[key] === this.saved[key]) this.text[key] = value;
      this.saved[key] = value;
    }
  }
}

// Saving rewrites copy.json, and Vite answers by re-creating the page. Keeping
// each file's PageCopy here means that remount finds the same object, so edits
// made to other keys in the meantime survive it. Browser only: a server module
// would share this between requests.
const knownCopies = new Map<string, PageCopy>();
const mountCounts = new Map<PageCopy, number>();
let activeCopies = $state<PageCopy[]>([]);

/** The copy files of the page on screen, for the edit bar. */
export function getActivePageCopies(): readonly PageCopy[] {
  return activeCopies;
}

export function createPageCopy({
  file,
  initial,
}: {
  file: string;
  initial: CopyStrings;
}): PageCopy {
  if (!dev || !browser) return new PageCopy(file, initial);

  const known = knownCopies.get(file);
  known?.acceptInitial(initial);
  const copy = known ?? new PageCopy(file, initial);
  knownCopies.set(file, copy);

  // A hot reload can create the new page before it destroys the old one, so
  // this counts mounts rather than dropping the copy on the first destroy.
  mountCounts.set(copy, (mountCounts.get(copy) ?? 0) + 1);
  if (!activeCopies.includes(copy)) activeCopies.push(copy);
  onDestroy(() => {
    const remaining = (mountCounts.get(copy) ?? 1) - 1;
    mountCounts.set(copy, remaining);
    if (remaining === 0) {
      activeCopies = activeCopies.filter((active) => active !== copy);
    }
  });
  return copy;
}
