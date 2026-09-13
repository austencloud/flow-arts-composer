import type { AnonymousDraft } from "$lib/shared/auth/services/anonymous-upgrade";
import { importDrafts } from "$lib/shared/auth/services/anonymous-upgrade";
import { getAuthInstance } from "$lib/shared/auth/firebase";
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";

interface ImportPromptState {
  isOpen: boolean;
  drafts: AnonymousDraft[];
  /**
   * The account this offer is ABOUT, resolved when the offer is made — not when
   * the user answers it. The collision has just signed them into a specific
   * account; that account is what "add these to this account?" means. Reading
   * the uid at confirm time instead would silently re-point the question at
   * whatever account they switched to in between.
   */
  destinationUid: string | null;
}

const state = $state<ImportPromptState>({
  isOpen: false,
  drafts: [],
  destinationUid: null,
});

/**
 * Bumped by every state transition of this prompt (a new offer, a dismissal,
 * the start of an import). An in-flight import compares the generation it
 * started under against the current one before touching state, so a slow
 * import that finishes after the user has dismissed the offer or after a NEWER
 * offer has replaced it cannot resurrect stale drafts or clobber the new ones.
 */
let generation = 0;

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
  /** The account this offer targets; null when it could not be resolved. */
  get destinationUid() {
    return state.destinationUid;
  },
};

/**
 * Open the import offer if there is anything worth importing.
 *
 * `destinationUid` is the account the collision signed into, taken from that
 * auth result and passed in by the caller. It is NOT looked up here. Two
 * reasons, both load-bearing:
 *
 *  - A later "who is signed in now?" lookup answers a different question. An
 *    offer made about account B, answered after a switch to C, would import
 *    into C — an account the user was never asked about.
 *  - Looking it up would make this function async, and every caller fires it
 *    without awaiting. Two collisions in flight could then interleave between
 *    the await and the state write, so the generation guard and the drafts
 *    could come from different offers. Taking the uid as an argument keeps the
 *    whole transition — generation, destination, drafts, open — synchronous
 *    and therefore atomic.
 */
export function promptAnonymousImport(
  drafts: AnonymousDraft[],
  destinationUid?: string
): void {
  if (!drafts.length) return;
  generation += 1;
  state.destinationUid = destinationUid ?? null;
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

  // This import belongs to this offer. A newer offer or a dismissal
  // invalidates the result we are about to write back.
  generation += 1;
  const startedAt = generation;

  // The account the offer was made about, bound at promptAnonymousImport().
  const destinationUid = state.destinationUid;

  // Fail CLOSED on anything that means we cannot prove where this is going.
  // An unfenced write is the failure mode this whole change exists to prevent,
  // so an unknown or changed destination keeps the drafts and re-offers rather
  // than guessing. The rows are still on the device either way.
  let currentUid: string | null = null;
  let authReadFailed = false;
  try {
    currentUid = (await getAuthInstance()).currentUser?.uid ?? null;
  } catch {
    authReadFailed = true;
  }

  if (!destinationUid || authReadFailed || currentUid !== destinationUid) {
    if (startedAt !== generation) return;
    state.drafts = drafts;
    state.isOpen = true;
    showToast(
      currentUid && destinationUid && currentUid !== destinationUid
        ? "You're signed into a different account now. Your guest sequences are still on this device — sign back in to add them."
        : "Couldn't confirm which account to add these to. They're still on this device — try again.",
      "error"
    );
    return;
  }

  let imported = 0;
  let failed: AnonymousDraft[] = drafts;
  try {
    ({ imported, failed } = await importDrafts(drafts, destinationUid));
  } catch (error) {
    // importDrafts collects per-draft failures rather than throwing, so this is
    // the repository lookup itself failing. Keep everything.
    console.warn("[anonymous-import-prompt] Import could not run:", error);
  }

  // A newer offer or a dismissal happened while we were writing. Reporting or
  // restoring this run's drafts now would overwrite state that is no longer
  // about them.
  if (startedAt !== generation) return;

  if (imported > 0) {
    showToast(
      `Imported ${imported} sequence${imported === 1 ? "" : "s"} you just made.`,
      "success"
    );
  }

  state.drafts = failed;
  if (failed.length === 0) state.destinationUid = null;
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
  generation += 1;
  state.isOpen = false;
  state.drafts = [];
  state.destinationUid = null;
}
