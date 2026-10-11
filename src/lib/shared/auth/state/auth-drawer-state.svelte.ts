import type { AuthNudgeTrigger } from "../domain/auth-nudge-trigger";
import { trackAuthSurfaceOpened } from "#lib/shared/analytics/auth-events.js";
import { createGuestEncoreState } from "./guest-encore-state.svelte";

const guestEncore = createGuestEncoreState(() =>
  typeof window === "undefined" ? null : window.localStorage
);
import {
  showToast,
  removeToast,
  type ShowToastOptions,
} from "#lib/shared/toast/state/toast-state.svelte.js";

// Save and collection actions share one optional invitation. Retain the old
// library key so people who already saw it are not asked again after an update.
const GUEST_SAVE_NUDGE_SEEN_KEY = "tka-guest-save-nudge-seen";
let guestSaveNudgeSeen = $state(false);
let guestSaveToastId: string | null = null;

function markGuestSaveNudgeSeen() {
  guestSaveNudgeSeen = true;
  try {
    localStorage.setItem(GUEST_SAVE_NUDGE_SEEN_KEY, "true");
  } catch {
    /* Session guard still applies when storage is unavailable. */
  }
}

function hasSeenGuestSaveNudge(): boolean {
  if (guestSaveNudgeSeen) return true;
  try {
    return localStorage.getItem(GUEST_SAVE_NUDGE_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

let _open = $state(false);
let _initialMode = $state<"signin" | "signup">("signup");
// Why the drawer is opening (e.g. "export"), so AuthModal can show that
// trigger's copy instead of the generic "Free. Save your work." subtitle.
// Cleared on every show() call that doesn't pass one, so a reason never
// bleeds into an unrelated later open.
let _reason = $state<AuthNudgeTrigger | null>(null);
let _stepCapAttempts = $state(0);
let _stepCapSequenceId = $state<string | null>(null);

export const authDrawerState = {
  guestEncore,
  get encorePrompt() {
    return _reason === "step-cap-guest"
      ? guestEncore.prompt(_stepCapSequenceId, _stepCapAttempts)
      : null;
  },
  claimEncore() {
    if (!_open || _reason !== "step-cap-guest") return false;
    if (!guestEncore.claim(_stepCapSequenceId, _stepCapAttempts)) return false;
    _open = false;
    return true;
  },
  /** One optional invitation across save, scan, and collection flows. */
  offerGuestSaveNudge(
    options: Pick<ShowToastOptions, "message" | "action" | "onDismiss">
  ): boolean {
    if (_open || hasSeenGuestSaveNudge()) return false;
    markGuestSaveNudgeSeen();
    guestSaveToastId = showToast({
      type: "success",
      duration: 8000,
      announcement: "polite",
      action: {
        label: "Create account",
        onClick: () => this.show("signup", "guest-first-save"),
      },
      ...options,
    });
    return true;
  },
  /** An explicit account prompt replaces any optional save invitation. */
  dismissGuestSaveNudge() {
    markGuestSaveNudgeSeen();
    if (guestSaveToastId) removeToast(guestSaveToastId, "programmatic");
    guestSaveToastId = null;
  },
  get open() {
    return _open;
  },
  get initialMode() {
    return _initialMode;
  },
  get reason() {
    return _reason;
  },
  get stepCapAttempts() {
    return _stepCapAttempts;
  },
  show(
    mode: "signin" | "signup" = "signup",
    reason?: AuthNudgeTrigger,
    sequenceId?: string
  ) {
    guestEncore.restore();
    this.dismissGuestSaveNudge();
    if (
      _open &&
      _initialMode === mode &&
      _reason === (reason ?? null) &&
      _stepCapSequenceId ===
        (reason === "step-cap-guest" ? (sequenceId ?? null) : null)
    )
      return;
    // Count encounters, not duplicate calls while the same dialog is open.
    if (reason === "step-cap-guest" && (!_open || _reason !== reason)) {
      _stepCapAttempts += 1;
    }
    _initialMode = mode;
    _reason = reason ?? null;
    _stepCapSequenceId =
      reason === "step-cap-guest" ? (sequenceId ?? null) : null;
    _open = true;
    trackAuthSurfaceOpened({
      surface: "guest_nudge_modal",
      origin: reason ?? "generic_account_action",
      auth_mode: mode,
    });
  },
  hide() {
    _open = false;
  },
  /**
   * Called by the auth listener whenever the user's authenticated status
   * changes. Forces the drawer back to closed so it doesn't auto-re-open the
   * next time the user signs out (MainApplication re-mounts AuthDrawer with
   * `open={authDrawerState.open}`, so stale truth here becomes a ghost sheet).
   */
  reset() {
    if (guestSaveToastId) removeToast(guestSaveToastId, "programmatic");
    guestSaveToastId = null;
    _open = false;
    _initialMode = "signup";
    _reason = null;
    _stepCapAttempts = 0;
    _stepCapSequenceId = null;
  },
};
