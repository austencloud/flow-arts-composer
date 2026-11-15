/**
 * The install card's one owner: whether it is open, which install path it
 * shows, and the analytics for it.
 *
 * Create calls `offer("first_sequence")` once the person has made something
 * this visit. The menu's "Get the app" button calls `openFromMenu()`. Both
 * land on InstallNudgeCard.svelte, mounted once in PWAInstallationManager.
 *
 * Events (all carry the `display_mode` super property from posthog.ts):
 *   install_nudge_shown      { route, source }
 *   install_nudge_accepted   { route, source, action }
 *   install_nudge_dismissed  { route, source, how }
 *   install_prompt_result    { outcome, source }   Chrome's own sheet
 *   app_installed            { route }             the browser confirmed it
 */
import { captureEvent } from "#lib/shared/analytics/services/posthog.js";
import { getMobileFullscreenManager } from "#lib/shared/mobile/get-mobile-fullscreen-manager.js";
import { detectPlatformAndBrowser } from "#lib/shared/mobile/services/platform-detector.js";
import type { InAppBrowser } from "#lib/shared/mobile/services/types.js";
import {
  hasBottomNoteShownToday,
  markBottomNoteShownToday,
} from "#lib/shared/components/bottom-note-day.js";
import {
  canAutoShow,
  readMemory,
  writeMemory,
} from "./install-nudge-memory";
import {
  chromeIntentUrl,
  isPhoneRoute,
  resolveInstallRoute,
  safariHidesShareInMoreMenu,
  type InstallRoute,
} from "./install-route";

export type NudgeSource = "first_sequence" | "menu";
export type NudgeDismissal = "not_now" | "close" | "escape";
export type NudgeAction =
  | "prompt"
  | "steps_done"
  | "open_chrome"
  | "copy_link";

let open = $state(false);
let source = $state<NudgeSource>("menu");
let route = $state<InstallRoute>("desktop");
let inAppBrowser = $state<InAppBrowser>("none");
let isAndroid = $state(false);
let shareInMoreMenu = $state(false);
let linkCopied = $state(false);

// One automatic showing per page load, whatever storage says.
let offeredThisVisit = false;
let initialized = false;

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function refreshRoute(): void {
  const info = detectPlatformAndBrowser();
  let canPrompt = false;
  try {
    canPrompt = getMobileFullscreenManager().canInstallPWA();
  } catch {
    canPrompt = false;
  }
  route = resolveInstallRoute({ ...info, canPrompt });
  inAppBrowser = info.inAppBrowser;
  isAndroid = info.platform === "android";
  shareInMoreMenu = safariHidesShareInMoreMenu(navigator.userAgent);
}

function init(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  refreshRoute();
  try {
    getMobileFullscreenManager().onInstallPromptAvailable(() => {
      refreshRoute();
    });
  } catch {
    // Server render or a browser without the manager: route stays as read.
  }
  window.addEventListener("appinstalled", () => {
    captureEvent("app_installed", { route });
    const memory = readMemory(storage());
    writeMemory(storage(), { ...memory, installedAt: Date.now() });
    open = false;
    refreshRoute();
  });
}

function show(from: NudgeSource): void {
  source = from;
  linkCopied = false;
  open = true;
  captureEvent("install_nudge_shown", { route, source: from });
}

export const installNudge = {
  get open() {
    return open;
  },
  get route() {
    return route;
  },
  get source() {
    return source;
  },
  get inAppBrowser() {
    return inAppBrowser;
  },
  get isAndroid() {
    return isAndroid;
  },
  get shareInMoreMenu() {
    return shareInMoreMenu;
  },
  get linkCopied() {
    return linkCopied;
  },

  /** True on a phone still in a browser tab: the menu shows "Get the app". */
  get menuVisible() {
    return isPhoneRoute(route);
  },

  /** Called once from InstallNudgeCard's onMount. Safe to call again. */
  init,

  /** The person just got something out of the app. Show once, if welcome. */
  offer(from: NudgeSource): void {
    init();
    if (offeredThisVisit || open) return;
    refreshRoute();
    if (!isPhoneRoute(route)) return;
    const memory = readMemory(storage());
    if (!canAutoShow(memory, Date.now())) return;
    // One automatic bottom card a day, whichever card it was.
    if (hasBottomNoteShownToday(storage())) return;
    offeredThisVisit = true;
    markBottomNoteShownToday(storage());
    writeMemory(storage(), { ...memory, autoShows: memory.autoShows + 1 });
    show(from);
  },

  openFromMenu(): void {
    init();
    refreshRoute();
    offeredThisVisit = true;
    show("menu");
  },

  dismiss(how: NudgeDismissal): void {
    if (!open) return;
    open = false;
    captureEvent("install_nudge_dismissed", { route, source, how });
    // Waving away the automatic card starts its quiet weeks. Closing the card
    // you opened from the menu yourself says nothing about wanting it later.
    if (source !== "menu") {
      const memory = readMemory(storage());
      writeMemory(storage(), { ...memory, lastDismissedAt: Date.now() });
    }
  },

  /** The card's main button. What it does depends on the route. */
  async accept(): Promise<void> {
    const from = source;
    if (route === "native") {
      captureEvent("install_nudge_accepted", {
        route,
        source: from,
        action: "prompt" satisfies NudgeAction,
      });
      open = false;
      const manager = getMobileFullscreenManager();
      const accepted = await manager.promptInstallPWA();
      captureEvent("install_prompt_result", {
        outcome: accepted ? "accepted" : "dismissed",
        source: from,
      });
      if (accepted) {
        const memory = readMemory(storage());
        writeMemory(storage(), { ...memory, installedAt: Date.now() });
      }
      // Chrome hands out its prompt once. Without it the menu path is next.
      refreshRoute();
      return;
    }

    if (route === "in-app") {
      if (isAndroid) {
        captureEvent("install_nudge_accepted", {
          route,
          source: from,
          action: "open_chrome" satisfies NudgeAction,
        });
        open = false;
        window.location.href = chromeIntentUrl(window.location.href);
        return;
      }
      captureEvent("install_nudge_accepted", {
        route,
        source: from,
        action: "copy_link" satisfies NudgeAction,
      });
      try {
        await navigator.clipboard.writeText(window.location.href);
        linkCopied = true;
      } catch {
        linkCopied = false;
      }
      return;
    }

    // iPhone and Android menu paths: the steps are on the card; Done closes.
    captureEvent("install_nudge_accepted", {
      route,
      source: from,
      action: "steps_done" satisfies NudgeAction,
    });
    open = false;
  },
};
