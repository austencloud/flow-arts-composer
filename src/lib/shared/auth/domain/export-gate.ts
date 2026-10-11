import {
  authState,
  awaitAuthSettled,
} from "#lib/shared/auth/state/auth-state.svelte.js";
import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";

/**
 * Take-it-home gate.
 *
 * Downloading rendered output (sequence animations, choreo cards, print PDFs)
 * requires a full, non-anonymous account. Guests may play with everything —
 * configure export options, preview, render on screen — but pulling the actual
 * file down is the "take it home" step that earns a free signup. Anonymous
 * Firebase sessions don't qualify: they're ephemeral (auto-cleaned) and
 * single-device, so a file saved under one is effectively a dead end.
 *
 * Returns true when the caller may proceed. Otherwise it opens the signup
 * modal and returns false, so the caller should bail; the user re-runs the
 * export once they have an account.
 *
 * Async because it waits for auth restoration to settle first. Firebase
 * restores a session asynchronously, and until it lands a signed-in user reads
 * as a guest — so an export requested during that window was refused, and a
 * signup drawer opened on someone who already has an account. On a cold load of
 * a heavy 3D scene that window is seconds wide, which is exactly when someone
 * clicks Share.
 */
export async function ensureFullAccountForExport(): Promise<boolean> {
  await awaitAuthSettled();
  if (authState.isAuthenticated && !authState.isAnonymous) return true;
  authDrawerState.show("signup", "export");
  return false;
}
