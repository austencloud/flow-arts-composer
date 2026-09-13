import type { AnonymousDraft } from "$lib/shared/auth/services/anonymous-upgrade";
import { importDrafts } from "$lib/shared/auth/services/anonymous-upgrade";
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";

interface ImportPromptState {
  isOpen: boolean;
  drafts: AnonymousDraft[];
}

const state = $state<ImportPromptState>({ isOpen: false, drafts: [] });

export const anonymousImportPrompt = {
  get isOpen() {
    return state.isOpen;
  },
  set isOpen(v: boolean) {
    state.isOpen = v;
  },
  get count() {
    return state.drafts.length;
  },
};

/** Open the import offer if there is anything worth importing. */
export function promptAnonymousImport(drafts: AnonymousDraft[]): void {
  if (!drafts.length) return;
  state.drafts = drafts;
  state.isOpen = true;
}

/**
 * Import the captured drafts, keeping whatever could not be written.
 *
 * This used to clear `state.drafts` BEFORE awaiting the import, which meant a
 * failed write left the user with a dialog that had closed itself, no error,
 * and nothing to retry from — the drafts stayed in Dexie under the old
 * anonymous uid's ledger, which no read path consults once they are signed in.
 * The rows survived; the only way back to them did not.
 *
 * Never rejects. `MainApplication` hands this straight to `ConfirmDialog`,
 * which calls it without awaiting or catching, so a rejection here would reach
 * no handler at all. Failures are surfaced as a toast and a re-offer instead.
 * See docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md (F3).
 */
export async function confirmAnonymousImport(): Promise<void> {
  const drafts = state.drafts;
  if (drafts.length === 0) return;
  // Close the dialog so the click feels answered, but hold the drafts until the
  // import has actually settled.
  state.isOpen = false;

  let imported = 0;
  let failed: AnonymousDraft[] = drafts;
  try {
    ({ imported, failed } = await importDrafts(drafts));
  } catch (error) {
    // importDrafts collects per-draft failures rather than throwing, so this is
    // the repository lookup itself failing. Keep everything.
    console.warn("[anonymous-import-prompt] Import could not run:", error);
  }

  if (imported > 0) {
    showToast(
      `Imported ${imported} sequence${imported === 1 ? "" : "s"} you just made.`,
      "success"
    );
  }

  state.drafts = failed;
  if (failed.length > 0) {
    // Re-offer exactly what is still outstanding. "Not now" still dismisses.
    state.isOpen = true;
    showToast(
      `Couldn't add ${failed.length} sequence${failed.length === 1 ? "" : "s"} yet. They're still on this device — try again.`,
      "error"
    );
  }
}

export function cancelAnonymousImport(): void {
  state.isOpen = false;
  state.drafts = [];
}
