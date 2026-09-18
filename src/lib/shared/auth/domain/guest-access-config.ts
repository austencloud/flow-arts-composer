// Guests (unauthenticated users) get a limited view of the app.
// Create and Browse are open with restricted tabs. Creators is readable so a
// visitor can follow an attribution link into a profile; account actions such
// as Follow still enforce sign-in at the action boundary.

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
  // shape-engine is public at /shape-engine already, so the tab is too.
  create: ["assemble", "construct", "generate", "shape-engine"],
  browse: ["explore", "you"],
  creators: [],
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
