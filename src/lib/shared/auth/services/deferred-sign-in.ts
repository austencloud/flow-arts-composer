/**
 * Quiet sign-in for public pages.
 *
 * Public pages boot without the sign-in code so a first visit stays fast. A
 * returning visitor still expects their account there: their avatar in the
 * site header, and prop, color and grip changes that reach their account
 * instead of staying on this device. So the page first checks browser storage
 * for a saved session, which needs no Firebase, and only when one is there
 * does it load the real auth state, at the browser's next idle moment or after
 * two seconds, whichever comes first. Signing in that way also attaches
 * settings sync (auth-boot-orchestrator.ts).
 *
 * The site header and the headerless Shape Engine page share this, down to the
 * one storage check (saved-firebase-user.ts), which this module re-exports.
 */
import type { authState as AuthStateInstance } from "../state/auth-state.svelte";

export type AuthStateApi = typeof AuthStateInstance;

// The longest sign-in waits for idle time. A page running a looping animation
// may never go idle, and without a cap a returning visitor's avatar waited
// over 22 s on the timing mode guides, or never came. Two seconds matches the
// app's other idle work (composition-root, module-prefetch) and still lets
// first paint go ahead; only visitors with a saved session reach this.
const IDLE_TIMEOUT_MS = 2_000;

export { hasSavedFirebaseUser } from "./saved-firebase-user";

/**
 * Load the real auth state and start it: restore the saved session, then the
 * account services, settings sync among them. Starting it twice is harmless
 * (initialize() shares one run). `onLoaded` gets the auth state before the
 * session is restored, so reactive UI can follow it as it resolves.
 */
export async function startAuthState(
  onLoaded?: (authState: AuthStateApi) => void
): Promise<void> {
  const { authState } = await import("../state/auth-state.svelte");
  onLoaded?.(authState);
  await authState.initialize();
}

export interface DeferredSignInOptions {
  /** Answers "is there a session to restore?" without loading Firebase. */
  hasSession: () => Promise<boolean>;
  /** Hears that answer, e.g. to hold the header's account slot until then. */
  onProbed?: (hasSession: boolean) => void;
  /** Starts sign-in. Defaults to starting the shared auth state. */
  signIn?: () => Promise<void>;
  /** Names the page in the console warning when sign-in fails to start. */
  label: string;
}

/**
 * Sign a returning visitor in at the browser's next idle moment, or after two
 * seconds on a page that stays busy, and only when `hasSession` finds a saved
 * session. A signed-out visitor never loads the sign-in code. Returns a cleanup
 * that cancels a start still waiting, for a page that unmounts first.
 */
export function signInWhenIdle({
  hasSession,
  onProbed,
  signIn = () => startAuthState(),
  label,
}: DeferredSignInOptions): () => void {
  let active = true;
  let idleHandle: number | undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  void (async () => {
    const found = await hasSession();
    if (!active) return;
    onProbed?.(found);
    if (!found) return;

    const start = () => {
      if (!active) return;
      void signIn().catch((error) =>
        console.warn(`[${label}] Deferred auth initialization failed:`, error)
      );
    };

    if (typeof requestIdleCallback !== "undefined") {
      idleHandle = requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
    } else {
      timeoutHandle = setTimeout(start, 0);
    }
  })();

  return () => {
    active = false;
    if (idleHandle !== undefined) cancelIdleCallback(idleHandle);
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  };
}
