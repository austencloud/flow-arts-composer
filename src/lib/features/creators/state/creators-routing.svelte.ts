/**
 * Creators Routing
 *
 * Self-contained list<->profile routing for the Creators module. The panel
 * owns its URL/history sync so profile links survive refresh and browser
 * Back/Forward without a second host coordinating its state.
 *
 * Creator profiles use /creators/[userId]. The navigation coordinator rewrites
 * both older homes, /browse/creators/[userId] and
 * /social/creators/[userId], before the panel mounts.
 *
 * The panel drives exactly one state singleton (creatorsViewState); nothing in
 * Browse touches it anymore, so there is no second host to fight the URL.
 */

import { browser } from "$app/env";
import { goto } from "$app/navigation";
import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
import {
  buildCreatorPath,
  parseCreatorPathname,
} from "#lib/shared/navigation/services/creator-routes.js";
import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
import { creatorsViewState } from "./creators-view-state.svelte";
import {
  trackCreatorProfileOpened,
  type CreatorProfileSource,
} from "#lib/shared/analytics/social-events.js";

// The history-state payload the navigation coordinator's popstate handler reads
// to keep the module/section in sync as the user goes back/forward.
const CREATORS_HISTORY_STATE = {
  moduleId: "creators",
} as const;

/**
 * Read the creator ID from the current URL path.
 * Canonical form: /creators/[userId]. Older Browse and Social paths remain
 * readable until the coordinator rewrites them. Returns null during SSR or
 * when the current page does not belong to Creators.
 */
export function getCreatorIdFromURL(): string | null {
  if (typeof window === "undefined") return null;
  return parseCreatorPathname(window.location.pathname)?.creatorId ?? null;
}

/** Whether the address bar currently sits under the creators section. */
function onCreatorsPath(): boolean {
  if (typeof window === "undefined") return false;
  return parseCreatorPathname(window.location.pathname) !== null;
}

/**
 * Push /creators/[userId] onto the history stack. Skips the push if the
 * URL already reflects this creator (e.g., a refresh-restore that re-derives the
 * profile from the URL should not add a duplicate entry).
 */
function pushCreatorProfileURL(userId: string): void {
  if (!browser) return;
  if (getCreatorIdFromURL() === userId && onCreatorsPath()) return;
  const url = new URL(window.location.href);
  url.pathname = buildCreatorPath(userId);
  url.hash = "";
  void goto(url.toString(), {
    shallow: true,
    state: { ...CREATORS_HISTORY_STATE },
  });
}

/**
 * Replace the current history entry with /creators (the list view).
 * Only acts when already in the creators subtree, so it never clobbers an
 * unrelated URL.
 */
function replaceCreatorsListURL(): void {
  if (!browser) return;
  if (!onCreatorsPath()) return;
  const url = new URL(window.location.href);
  url.pathname = buildCreatorPath();
  url.hash = "";
  void goto(url.toString(), {
    shallow: true,
    replace: true,
    state: { ...CREATORS_HISTORY_STATE },
  });
}

/**
 * Open a creator's profile from anywhere in the app.
 *
 * A cross-module jump switches to Creators without first pushing its list URL.
 * Then it sets the view state and pushes /creators/[userId]. The mounted
 * panel renders UserProfilePanel reactively; a later mount re-derives the same
 * profile from the URL, so both entry paths converge.
 */
export async function openCreatorProfile(
  userId: string,
  _displayName: string | undefined,
  source: CreatorProfileSource
): Promise<void> {
  const onCreators = navigationState.currentModule === "creators";
  if (!onCreators) {
    await handleModuleChange("creators", undefined, {
      skipHistory: true,
    });
  }
  creatorsViewState.viewUserProfile(userId);
  pushCreatorProfileURL(userId);
  trackCreatorProfileOpened(source, userId);
}

/**
 * Return from a profile to the creators list (the profile's in-page Back
 * button). Resets the view state and replaces the URL in place, so it is always
 * safe (never navigates the browser out of the app). The browser Back button
 * still walks the full pushed history, including profile -> profile.
 */
export function backToCreatorsList(): void {
  creatorsViewState.reset();
  replaceCreatorsListURL();
}

/**
 * Boot / mount: derive the view state from the URL. A /creators/[id] deep link
 * opens that profile after a fresh load, refresh, or legacy redirect. The plain
 * list URL resets to the list.
 */
export function restoreCreatorProfileFromURL(): void {
  const id = getCreatorIdFromURL();
  if (id) {
    creatorsViewState.viewUserProfile(id);
    trackCreatorProfileOpened("direct_link", id);
  } else {
    creatorsViewState.reset();
  }
}

/**
 * Browser Back/Forward within the creators subtree. The URL changed already;
 * mirror the view state to it. Handles list <-> profile and profile -> profile.
 */
export function syncCreatorsViewFromURL(): void {
  const id = getCreatorIdFromURL();
  if (id) {
    if (creatorsViewState.viewingUserId !== id) {
      creatorsViewState.viewUserProfile(id);
      trackCreatorProfileOpened("history", id);
    }
  } else if (onCreatorsPath()) {
    if (creatorsViewState.currentView !== "list") {
      creatorsViewState.reset();
    }
  }
}
