import type { AuthNudgeTrigger } from "../domain/auth-nudge-trigger";
import { AUTH_NUDGE_TEXTS } from "../domain/auth-nudge-trigger";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { trackAuthSurfaceOpened } from "#lib/shared/analytics/auth-events.js";
import {
  showToast,
  removeToast,
  type ShowToastOptions,
} from "#lib/shared/toast/state/toast-state.svelte.js";

// Save and collection actions share one optional invitation. Retain the old
// library key so people who already saw it are not asked again after an update.
const GUEST_SAVE_NUDGE_SEEN_KEY = "tka-guest-save-nudge-seen";
const GUEST_SAVE_TOAST_DURATION_MS = 8_000;
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
// The sequence the person was saving or sharing when the sheet opened. The
// sheet plays it on its art; without one it plays a showcase sequence.
let _artifact = $state.raw<SequenceData | null>(null);

/**
 * The sheet's code arrives through a lazy import, so an ask shows nothing
 * until that chunk has loaded. A first open on a page, a slow or stalled
 * fetch, or (in dev) Vite discovering an unbundled dependency all leave the
 * ask open with nothing on screen, and the sheet is modal, so a later tap on
 * the same thing is only possible while that is the case. Past this grace
 * the ask names what it refused in a toast; the sheet still follows when its
 * code lands. (Austen's silent ninth step on a phone, 2026-10-22.)
 */
export const AUTH_SHEET_FEEDBACK_GRACE_MS = 400;
const AUTH_SHEET_FEEDBACK_TOAST_DURATION_MS = 5_000;

/** What the host that mounts the sheet has reported about its code. */
export type AuthSheetHostStatus = "idle" | "loading" | "loaded" | "error";

let _hostStatus: AuthSheetHostStatus = "idle";
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
let feedbackToastId: string | null = null;

function clearFeedbackTimer() {
  if (feedbackTimer === null) return;
  clearTimeout(feedbackTimer);
  feedbackTimer = null;
}

function removeFeedbackToast() {
  if (feedbackToastId) removeToast(feedbackToastId, "programmatic");
  feedbackToastId = null;
}

/** Say in words what the ask refused, since the sheet is not on screen. */
function showFeedbackToast() {
  const reason = _reason;
  if (!reason) return;
  clearFeedbackTimer();
  removeFeedbackToast();
  feedbackToastId = showToast({
    message: AUTH_NUDGE_TEXTS[reason],
    type: "info",
    duration: AUTH_SHEET_FEEDBACK_TOAST_DURATION_MS,
    announcement: "polite",
  });
}

function scheduleFeedback() {
  clearFeedbackTimer();
  if (!_reason) return;
  feedbackTimer = setTimeout(() => {
    feedbackTimer = null;
    // "idle" means no host has reported; a page with its own mount shows the
    // sheet on its own terms. Only a host still fetching the code is silent.
    if (_open && _hostStatus === "loading") showFeedbackToast();
  }, AUTH_SHEET_FEEDBACK_GRACE_MS);
}

export const authDrawerState = {
  /** One optional invitation across save, scan, and collection flows. */
  offerGuestSaveNudge(
    options: Pick<ShowToastOptions, "message" | "action" | "onDismiss">
  ): boolean {
    if (_open || hasSeenGuestSaveNudge()) return false;
    markGuestSaveNudgeSeen();
    guestSaveToastId = showToast({
      type: "success",
      duration: GUEST_SAVE_TOAST_DURATION_MS,
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
  get artifact() {
    return _artifact;
  },
  get hostStatus() {
    return _hostStatus;
  },
  /**
   * The sheet's host (MainApplication's lazy mount) reports its load here.
   * A failed load closes the ask: left open with nothing on screen, every
   * later ask would be ignored as a repeat, and the next ask retries the load. The refusal is still named in a toast.
   */
  reportHostStatus(status: Exclude<AuthSheetHostStatus, "idle">) {
    _hostStatus = status;
    if (status === "loaded") {
      clearFeedbackTimer();
      if (_open) removeFeedbackToast();
      return;
    }
    if (status === "error" && _open) {
      showFeedbackToast();
      this.hide();
    }
  },
  show(
    mode: "signin" | "signup" = "signup",
    reason?: AuthNudgeTrigger,
    artifact?: SequenceData | null
  ) {
    this.dismissGuestSaveNudge();
    if (_open && _initialMode === mode && _reason === (reason ?? null)) {
      // The sheet is modal, so the same ask can only repeat while its code
      // has not put it on screen. Answer in words instead of swallowing it.
      if (_hostStatus === "loading") showFeedbackToast();
      return;
    }
    _initialMode = mode;
    _reason = reason ?? null;
    _artifact = artifact?.steps?.length ? artifact : null;
    _open = true;
    removeFeedbackToast();
    scheduleFeedback();
    trackAuthSurfaceOpened({
      surface: "guest_nudge_modal",
      origin: reason ?? "generic_account_action",
      auth_mode: mode,
    });
  },
  hide() {
    clearFeedbackTimer();
    _open = false;
    _artifact = null;
  },
  /**
   * Called by the auth listener whenever the user's authenticated status
   * changes. Forces the drawer back to closed so it doesn't auto-re-open the
   * next time the user signs out (MainApplication re-mounts AuthDrawer with
   * `open={authDrawerState.open}`, so stale truth here becomes a ghost sheet).
   * The host unmounts with a sign-in, so its status starts over too.
   */
  reset() {
    if (guestSaveToastId) removeToast(guestSaveToastId, "programmatic");
    guestSaveToastId = null;
    clearFeedbackTimer();
    removeFeedbackToast();
    _hostStatus = "idle";
    _open = false;
    _artifact = null;
    _initialMode = "signup";
    _reason = null;
  },
};
