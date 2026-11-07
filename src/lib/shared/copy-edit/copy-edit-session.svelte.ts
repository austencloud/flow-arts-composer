/**
 * Saving and discarding for the edit bar. It lives in a module rather than the
 * bar because a save rewrites copy.json, Vite re-creates the page, and the bar
 * remounts with it: "Saved" has to outlast that.
 */
import { caretOffset } from "./caret-offset";
import { getActivePageCopies } from "./page-copy.svelte";

const SAVED_NOTICE_MS = 2200;

class CopyEditSession {
  saving = $state(false);
  justSaved = $state(false);
  error = $state<string | null>(null);
  readonly changeCount = $derived(
    getActivePageCopies().reduce((sum, copy) => sum + copy.dirtyKeys.length, 0)
  );
  #savedTimer: ReturnType<typeof setTimeout> | undefined;
  #caret: { id: string; offset: number } | null = null;

  /** The replacement block picks up the caret the old block had at save time. */
  takeCaret(id: string): number | null {
    if (this.#caret?.id !== id) return null;
    const { offset } = this.#caret;
    this.#caret = null;
    return offset;
  }

  async save(): Promise<void> {
    if (this.saving) return;
    const dirty = getActivePageCopies().filter((c) => c.dirtyKeys.length > 0);
    if (dirty.length === 0) return;

    this.saving = true;
    this.error = null;
    this.#rememberCaret();
    try {
      for (const copy of dirty) {
        const sent = $state.snapshot(copy.text);
        const response = await fetch("/api/dev/copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: copy.file, copy: sent }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? `Save failed (${response.status})`);
        }
        // Only `saved` moves. Anything typed during the request stays dirty.
        copy.saved = sent;
      }
      this.justSaved = true;
      clearTimeout(this.#savedTimer);
      this.#savedTimer = setTimeout(() => {
        this.justSaved = false;
        this.#caret = null;
      }, SAVED_NOTICE_MS);
    } catch (caught) {
      this.error = caught instanceof Error ? caught.message : "Save failed";
    } finally {
      this.saving = false;
    }
  }

  #rememberCaret(): void {
    const active = document.activeElement;
    const id =
      active instanceof HTMLElement ? active.dataset.copyId : undefined;
    const offset = id ? caretOffset(active as HTMLElement) : null;
    this.#caret = id && offset !== null ? { id, offset } : null;
  }

  discard(): void {
    for (const copy of getActivePageCopies()) {
      for (const key of copy.dirtyKeys) copy.text[key] = copy.saved[key] ?? "";
    }
    this.error = null;
  }
}

export const copyEditSession = new CopyEditSession();
