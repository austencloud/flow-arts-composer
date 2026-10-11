/**
 * Sheet Router - URL-driven sheet and spotlight navigation
 */

import { browser } from "$app/env";
import { page } from "$app/state";
import type { SheetType, RouteState, AnimationPanelState } from "./types";
import { writeUrl } from "./url-state";


function parseRouteState(): RouteState {
  if (!browser) return {};

  const url = new URL(window.location.href);
  const state: RouteState = {};

  const sheet = url.searchParams.get("sheet");
  if (
    sheet &&
    (sheet === "settings" ||
      sheet === "profile-settings" ||
      sheet === "auth" ||
      sheet === "terms" ||
      sheet === "privacy" ||
      sheet === "inbox" ||
      sheet === "animation")
  ) {
    state.sheet = sheet as SheetType;
  }

  const spotlight = url.searchParams.get("spotlight");
  if (spotlight) {
    state.spotlight = spotlight;
  }

  if (sheet === "animation") {
    const animSeqId = url.searchParams.get("animSeqId");
    const animSpeed = url.searchParams.get("animSpeed");
    const animStep = url.searchParams.get("animStep");
    const animGrid = url.searchParams.get("animGrid");

    state.animationPanel = {
      ...(animSeqId ? { sequenceId: animSeqId } : {}),
      speed: animSpeed ? parseFloat(animSpeed) : 1,
      isPlaying: url.searchParams.get("animPlaying") === "true",
      currentStep: animStep ? parseInt(animStep, 10) : 0,
      gridVisible: animGrid !== "false",
    };
  }

  return state;
}

function updateURL(state: RouteState, mode: "push" | "replace" = "push"): void {
  if (!browser) return;

  const url = new URL(window.location.href);

  url.searchParams.delete("sheet");
  url.searchParams.delete("spotlight");
  url.searchParams.delete("animSeqId");
  url.searchParams.delete("animSpeed");
  url.searchParams.delete("animPlaying");
  url.searchParams.delete("animStep");
  url.searchParams.delete("animGrid");
  url.searchParams.delete("inboxTab");
  url.searchParams.delete("conversation");

  if (state.sheet) {
    url.searchParams.set("sheet", state.sheet);
  }
  if (state.spotlight) {
    url.searchParams.set("spotlight", state.spotlight);
  }

  if (state.sheet === "animation" && state.animationPanel) {
    if (state.animationPanel.sequenceId) {
      url.searchParams.set("animSeqId", state.animationPanel.sequenceId);
    }
    if (
      state.animationPanel.speed !== undefined &&
      state.animationPanel.speed !== 1
    ) {
      url.searchParams.set("animSpeed", state.animationPanel.speed.toString());
    }
    if (state.animationPanel.isPlaying) {
      url.searchParams.set("animPlaying", "true");
    }
    if (
      state.animationPanel.currentStep !== undefined &&
      state.animationPanel.currentStep !== 0
    ) {
      url.searchParams.set(
        "animStep",
        state.animationPanel.currentStep.toString()
      );
    }
    if (state.animationPanel.gridVisible === false) {
      url.searchParams.set("animGrid", "false");
    }
  }

  const urlOverlay =
    mode === "push"
      ? state.sheet
        ? "sheet"
        : state.spotlight
          ? "spotlight"
          : undefined
      : page.state.urlOverlay === "sheet" && state.sheet
        ? "sheet"
        : page.state.urlOverlay === "spotlight" && state.spotlight
          ? "spotlight"
          : undefined;

  writeUrl(url, {
    mode,
    state: {
      ...state,
      ...(urlOverlay ? { urlOverlay } : {}),
    },
    removeState: ["sheet", "spotlight", "animationPanel", "urlOverlay"],
  });
}

function dispatchRouteChange(state: RouteState): void {
  if (!browser) return;
  window.dispatchEvent(new CustomEvent("route-change", { detail: state }));
}


export function openSheet(sheetType: SheetType): void {
  if (!sheetType || !browser) return;

  const currentState = parseRouteState();
  const newState: RouteState = {
    ...(currentState.spotlight ? { spotlight: currentState.spotlight } : {}),
    sheet: sheetType,
  };

  updateURL(newState, "push");
  dispatchRouteChange(newState);
}

export function closeSheet(): void {
  if (!browser) return;

  const currentState = parseRouteState();

  if (currentState.sheet) {
    if (page.state.urlOverlay === "sheet") {
      window.history.back();
      return;
    }

    const newState: RouteState = { ...currentState };
    delete newState.sheet;
    delete newState.animationPanel;

    updateURL(newState, "replace");
    dispatchRouteChange(newState);
  } else {
    dispatchRouteChange(currentState);
  }
}

export function getCurrentSheet(): SheetType {
  const state = parseRouteState();
  return state.sheet ?? null;
}

export function openSpotlight(sequenceId: string): void {
  if (!sequenceId || !browser) return;

  const currentState = parseRouteState();
  const newState: RouteState = { ...currentState, spotlight: sequenceId };

  updateURL(newState, "push");
  dispatchRouteChange(newState);
}

export function closeSpotlight(): void {
  if (!browser) return;

  const currentState = parseRouteState();

  if (currentState.spotlight) {
    if (page.state.urlOverlay === "spotlight") {
      window.history.back();
      return;
    }

    const newState: RouteState = { ...currentState };
    delete newState.spotlight;

    updateURL(newState, "replace");
    dispatchRouteChange(newState);
  } else {
    dispatchRouteChange(currentState);
  }
}

export function getCurrentSpotlight(): string | null {
  const state = parseRouteState();
  return state.spotlight ?? null;
}

export function getSpotlightShareURL(sequenceId: string): string {
  if (!browser) return "";

  const url = new URL(window.location.origin);
  url.searchParams.set("spotlight", sequenceId);
  return url.toString();
}

export function openAnimationPanel(animationState?: AnimationPanelState): void {
  if (!browser) return;

  const currentState = parseRouteState();
  const newState: RouteState = {
    ...currentState,
    sheet: "animation",
    animationPanel: animationState ?? {},
  };

  updateURL(newState, "push");
  dispatchRouteChange(newState);
}

export function updateAnimationPanelState(
  animationState: Partial<AnimationPanelState>
): void {
  if (!browser) return;

  const currentState = parseRouteState();

  if (currentState.sheet !== "animation") {
    console.warn(
      "Cannot update animation panel state when animation sheet is not open"
    );
    return;
  }

  const newState: RouteState = {
    ...currentState,
    animationPanel: {
      ...currentState.animationPanel,
      ...animationState,
    },
  };

  updateURL(newState, "replace");
  dispatchRouteChange(newState);
}

export function getCurrentAnimationPanelState(): AnimationPanelState | null {
  const state = parseRouteState();
  return state.animationPanel ?? null;
}

export function getCurrentRouteState(): RouteState {
  return parseRouteState();
}

export function closeAll(): void {
  if (!browser) return;

  const currentState = parseRouteState();
  const hasAnyRoute = currentState.sheet ?? currentState.spotlight;

  if (hasAnyRoute) {
    updateURL({}, "replace");
    dispatchRouteChange({});
  }
}

export function onRouteChange(
  callback: (state: RouteState) => void
): () => void {
  if (!browser) return () => {};

  const handlePopState = () => {
    const currentState = parseRouteState();
    callback(currentState);
  };

  const handleRouteChange = (event: Event) => {
    const customEvent = event as CustomEvent<RouteState>;
    callback(customEvent.detail);
  };

  window.addEventListener("popstate", handlePopState);
  window.addEventListener("route-change", handleRouteChange);

  return () => {
    window.removeEventListener("popstate", handlePopState);
    window.removeEventListener("route-change", handleRouteChange);
  };
}
