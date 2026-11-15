/**
 * The returning-guest note's one owner: whether it shows, and its analytics.
 *
 * A guest (no full account) who opens the app on a later day than their
 * first gets one short note from Austen inviting them to make an account.
 * Shown once, ever, on that device. "Later day" is counted only in this
 * browser's storage (guest-note-memory.ts); nothing new is sent anywhere.
 * Austen picked the design (B, signed by him) and the wording on 2026-11-14.
 *
 * Turn-taking with the install card: Create calls `offer()` first at the
 * moment it would offer the install card; when the note shows, the install
 * card waits for another visit. The note also stays out of sight while the
 * install card is open (from the menu), so one card shows at a time. Across
 * page loads the two share one automatic card per day (bottom-note-day).
 *
 * Who it is for: a guest on a device that has never held an account (the
 * stored last sign-in method is the marker), on a real return visit decided
 * once at page load (guest-note-memory). It stays quiet while the app's
 * one-day "not now" runs or the sign-up sheet is open, and closing it by any
 * route starts that quiet day.
 *
 * Events (all carry the `display_mode` super property from posthog.ts):
 *   guest_note_shown     { trigger: create | browse }
 *   guest_note_closed    { how: not_now | close | escape }
 *   guest_note_account   tapped Create account; the sign-up sheet then
 *                        reports with origin "returning-guest"
 */
import { captureEvent } from "#lib/shared/analytics/services/posthog.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";
import { getLastAuthMethod } from "#lib/shared/auth/services/last-auth-method.svelte.js";
import {
  hasBottomNoteShownToday,
  markBottomNoteShownToday,
} from "#lib/shared/components/bottom-note-day.js";
import { installNudge } from "#lib/shared/pwa/install-nudge-state.svelte.js";
import {
  canShowGuestNote,
  isReturnVisit,
  localDay,
  readGuestNoteMemory,
  recordVisit,
  writeGuestNoteMemory,
} from "./guest-note-memory";

export type GuestNoteClose = "not_now" | "close" | "escape";
export type GuestNoteTrigger = "create" | "browse";

let open = $state(false);
let initialized = false;
// Decided once, from the memory as it stood before this load wrote its own
// last-seen time.
let returnVisit = false;

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isGuest(): boolean {
  return authState.isInitialized() && !authState.isFullAccount;
}

/** Stamps "last seen" now, leaving the rest of the memory alone. */
function touch(): void {
  const store = storage();
  writeGuestNoteMemory(store, {
    ...readGuestNoteMemory(store),
    lastSeenAt: Date.now(),
  });
}

/**
 * Decides once whether this load is a return visit, then notes today as a
 * visit day (the first one becomes the guest's first day) and keeps the
 * last-seen time current while the page is open.
 */
function init(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const store = storage();
  const now = Date.now();
  const today = localDay(new Date(now));
  const before = readGuestNoteMemory(store);
  returnVisit = isReturnVisit(before, today, now);
  writeGuestNoteMemory(store, { ...recordVisit(before, today), lastSeenAt: now });
  window.addEventListener("pagehide", touch);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") touch();
  });
}

/**
 * Shows the note when it is due. Returns true when it showed, so the caller
 * holds the install card back for this visit. Declining never spends the
 * note's one showing.
 */
function offer(trigger: GuestNoteTrigger = "create"): boolean {
  init();
  if (open || installNudge.open || !isGuest()) return false;
  if (getLastAuthMethod() !== null) return false;
  if (authDrawerState.quietDayRunning || authDrawerState.open) return false;
  const store = storage();
  const memory = readGuestNoteMemory(store);
  if (!canShowGuestNote(memory, returnVisit)) return false;
  if (hasBottomNoteShownToday(store)) return false;
  writeGuestNoteMemory(store, { ...memory, shownAt: Date.now() });
  markBottomNoteShownToday(store);
  open = true;
  captureEvent("guest_note_shown", { trigger });
  return true;
}

function close(how: GuestNoteClose): void {
  if (!open) return;
  open = false;
  authDrawerState.recordNotNow();
  captureEvent("guest_note_closed", { how });
}

function makeAccount(): void {
  if (!open) return;
  open = false;
  captureEvent("guest_note_account");
  // Backing out of the sheet is a "not now" too; signing in clears it.
  authDrawerState.recordNotNow();
  authDrawerState.showOnRequest("signup", "returning-guest");
}

export const guestNote = {
  /** Hidden while the install card is up, so the two never stack. */
  get open() {
    return open && !installNudge.open && !authState.isFullAccount;
  },
  init,
  offer,
  close,
  makeAccount,
};
