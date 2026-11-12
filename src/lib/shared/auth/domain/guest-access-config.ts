// What a guest (no account, or an anonymous one) can open. The rule since
// 2026-10-31: an account is asked for only when it gives the person something
// they cannot have without one, such as keeping work on every device, a library
// beyond GUEST_SAVE_CAP, publishing, or following. Opening a part of the app is
// never a toll, so every Create method opens for guests and the limits live at
// the action itself (save, publish, export, follow). After a guest says "not
// now" to a gate, auth-drawer-state keeps quiet for a day and answers later
// gates with a toast. Creators is readable so a visitor can follow an
// attribution link into a profile.

import type { AccessTier } from "./access-tier";

// How many sequences a guest (unauthenticated / anonymous) may keep on-device
// before they must create an account to save more. Re-saving an existing
// sequence is an update and does NOT count against this cap.
export const GUEST_SAVE_CAP = 3;

// Guests get the community Gallery AND their own Library tab — the standalone
// Library module was folded into Browse, so their saved sequences (up to
// GUEST_SAVE_CAP, kept locally) live under browse > library. Without it a guest
// could save but never see what they saved.
const GUEST_MODULE_ACCESS: Record<string, string[]> = {
  // Every Create method. Saving past the cap, publishing and exporting still
  // ask for an account inside each method.
  create: [
    "construct",
    "generate",
    "shape-engine",
    "fuse",
    "tunnel",
    "assemble",
  ],
  browse: [
    "sequences",
    "collections",
    "visuals",
    "drafts",
    "saved",
    "your-visuals",
    "your-videos",
    "following",
  ],
  post: [],
  creators: [],
  // The written Guide is public at /guide/level-1 already, so a guest can
  // read it here too. Lessons and Play keep progress on an account.
  learn: ["guide"],
  // Device preferences and appearance belong to the visitor's browser.
  // Notifications still require an account. Profile shows a guest a short
  // invitation card, and opening Settings never lands on it.
  settings: [
    "profile",
    "preferences",
    "display",
    "props",
    "keyboard",
    "release-notes",
  ],
};

export function isModuleAccessible(
  moduleId: string,
  tier: AccessTier
): boolean {
  if (tier !== "guest") return true;
  return moduleId in GUEST_MODULE_ACCESS;
}

export function isTabAccessible(
  moduleId: string,
  tabId: string,
  tier: AccessTier
): boolean {
  if (tier !== "guest") return true;
  const allowedTabs = GUEST_MODULE_ACCESS[moduleId];
  if (!allowedTabs) return false;
  return allowedTabs.includes(tabId);
}

export function getAccessibleTabs(
  moduleId: string,
  tier: AccessTier
): string[] | null {
  if (tier !== "guest") return null;
  return GUEST_MODULE_ACCESS[moduleId] ?? [];
}

/**
 * The tab a guest lands on when they open Settings without naming one. Their
 * last tab if they can use it, otherwise the first usable tab in Settings
 * order. Never Profile: for a guest it only invites them to create an account,
 * and opening Settings is not a request to sign in.
 */
export function guestSettingsEntryTab(
  orderedTabIds: readonly string[],
  savedTab: string | null
): string | undefined {
  const usable = (tab: string) =>
    tab !== "profile" && isTabAccessible("settings", tab, "guest");
  if (savedTab && usable(savedTab)) return savedTab;
  return orderedTabIds.find(usable);
}
