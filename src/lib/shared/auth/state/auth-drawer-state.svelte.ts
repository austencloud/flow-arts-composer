import type { AuthNudgeTrigger } from "../domain/auth-nudge-trigger";
import { AUTH_NUDGE_TEXTS } from "../domain/auth-nudge-trigger";
import { authNudgeCopy } from "../domain/auth-prompt-copy";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
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

/**
 * One ask, then quiet (Austen, 2026-10-31). A visitor who closed the sheet
 * four times in 19 minutes left. Once a guest closes a sheet a gate opened,
 * or lets the first-save invitation go, any gate that fires within the next
 * day shows a toast instead of the sheet. The toast says what an account
 * gives and offers "Create account". A tap on a Sign in or Create account button still opens
 * the sheet (showOnRequest, or show() without a reason). Signing in clears it.
 */
const GATE_DISMISSED_AT_KEY = "tka-auth-gate-dismissed-at";
export const AUTH_GATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const GATE_COOLDOWN_TOAST_DURATION_MS = 6_000;
let gateDismissedAt: number | null = null;
let gateCooldownToastId: string | null = null;

function readGateDismissedAt(): number | null {
  if (gateDismissedAt !== null) return gateDismissedAt;
  try {
    const stored = Number(localStorage.getItem(GATE_DISMISSED_AT_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

function recordGateDismissal() {
  gateDismissedAt = Date.now();
  try {
    localStorage.setItem(GATE_DISMISSED_AT_KEY, String(gateDismissedAt));
  } catch {
    /* The in-memory time still quiets this page. */
  }
}

function clearGateDismissal() {
  gateDismissedAt = null;
  try {
    localStorage.removeItem(GATE_DISMISSED_AT_KEY);
  } catch {
    /* Nothing stored to clear. */
  }
}

function gateCoolingDown(): boolean {
  const at = readGateDismissedAt();
  return at !== null && Date.now() - at < AUTH_GATE_COOLDOWN_MS;
}

function removeGateCooldownToast() {
  if (gateCooldownToastId) removeToast(gateCooldownToastId, "programmatic");
  gateCooldownToastId = null;
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
// Whether a gate opened the sheet (show() with a reason) rather than a tap on
// a Sign in or Create account button. Only closing a gate's sheet starts the
// day of quiet.
let _openedByGate = false;

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
        onClick: () => this.showOnRequest("signup", "guest-first-save"),
      },
      ...options,
      // Closing this invitation, or letting it run out, is a "not now".
      onDismiss: () => {
        recordGateDismissal();
        options.onDismiss?.();
      },
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
      this.close();
    }
  },
  /**
   * A gate asks for an account. Within a day of the guest closing a sheet
   * that named a reason, this shows the reason's one line in a toast with a
   * "Create account" action instead of opening the sheet. Without a reason it
   * is a plain account button and always opens.
   */
  show(
    mode: "signin" | "signup" = "signup",
    reason?: AuthNudgeTrigger,
    artifact?: SequenceData | null
  ) {
    if (reason && !_open && gateCoolingDown()) {
      this.dismissGuestSaveNudge();
      removeGateCooldownToast();
      gateCooldownToastId = showToast({
        message: authNudgeCopy(reason),
        type: "info",
        duration: GATE_COOLDOWN_TOAST_DURATION_MS,
        announcement: "polite",
        action: {
          label: t("auth_nudge_create_account"),
          onClick: () => this.showOnRequest(mode, reason, artifact),
        },
      });
      return;
    }
    this.showOnRequest(mode, reason, artifact);
    _openedByGate = Boolean(reason);
  },
  /**
   * The person tapped Sign in or Create account. Always opens the sheet, with
   * the reason's copy when one is given, whatever the cooldown says.
   */
  showOnRequest(
    mode: "signin" | "signup" = "signup",
    reason?: AuthNudgeTrigger,
    artifact?: SequenceData | null
  ) {
    this.dismissGuestSaveNudge();
    removeGateCooldownToast();
    _openedByGate = false;
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
  /** The person closed the sheet. Closing one a gate opened is a "not now". */
  hide() {
    if (_open && _openedByGate) recordGateDismissal();
    this.close();
  },
  /** Close without counting it as the person's answer. */
  close() {
    clearFeedbackTimer();
    _open = false;
    _openedByGate = false;
    _artifact = null;
  },
  /** A full account signed in (or the person signed out): gates may ask again. */
  clearGateCooldown() {
    clearGateDismissal();
    removeGateCooldownToast();
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
    removeGateCooldownToast();
    clearFeedbackTimer();
    removeFeedbackToast();
    _hostStatus = "idle";
    _open = false;
    _artifact = null;
    _initialMode = "signup";
    _reason = null;
  },
};
