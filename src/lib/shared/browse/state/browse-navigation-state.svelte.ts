import {
  BROWSE_NAV_SCHEMA_VERSION,
  browseLocationsEqual,
  buildBrowsePath,
  defaultBrowseLocation,
  migratePersistedBrowseNavigation,
  resolveBrowsePathname,
  type BrowseLocation,
  type BrowsePrimary,
  type BrowseVisualType,
  type PersistedBrowseNavigation,
} from "#lib/shared/browse/navigation/browse-route-resolver.js";
import {
  pruneParamsForNavigation,
  pruneRouteScopedParams,
} from "#lib/shared/navigation/services/url-parameter-policy.js";
import { writeUrl } from "#lib/shared/navigation/services/url-state.js";

export type { BrowseLocation } from "#lib/shared/browse/navigation/browse-route-resolver.js";

interface BrowseNavigationStateData {
  history: BrowseLocation[];
  currentIndex: number;
}

interface NavigateOptions {
  replace?: boolean;
  syncUrl?: boolean;
}

const STORAGE_KEY = "tka-browse-nav-state";
const MAX_HISTORY_SIZE = 50;

export interface CollectionScanTarget {
  collectionId: string;
  scan: boolean;
}

export function getCollectionScanTargetFromURL(): CollectionScanTarget | null {
  if (typeof window === "undefined") return null;
  const route = resolveBrowsePathname(window.location.pathname);
  if (
    !route ||
    route.location.primary !== "you" ||
    route.location.section !== "collections" ||
    route.location.view !== "detail" ||
    !route.location.contextId
  ) {
    return null;
  }

  return {
    collectionId: route.location.contextId,
    scan: new URLSearchParams(window.location.search).get("scan") === "1",
  };
}

function browserHistoryState(
  location: BrowseLocation
): Record<string, unknown> {
  const existing =
    typeof window !== "undefined" && window.history.state
      ? (window.history.state as Record<string, unknown>)
      : {};
  return {
    ...existing,
    moduleId: "browse",
    sectionId: location.primary,
  };
}

export function createBrowseNavigationState() {
  const state = $state<BrowseNavigationStateData>({
    history: [],
    currentIndex: -1,
  });
  let isNavigating = $state(false);
  let started = false;

  const canGoBack = $derived(state.currentIndex > 0);
  const canGoForward = $derived(state.currentIndex < state.history.length - 1);
  const currentLocation = $derived<BrowseLocation | null>(
    state.currentIndex >= 0 && state.currentIndex < state.history.length
      ? (state.history[state.currentIndex] ?? null)
      : null
  );

  function persistedData(): PersistedBrowseNavigation {
    return {
      schemaVersion: BROWSE_NAV_SCHEMA_VERSION,
      history: state.history,
      currentIndex: state.currentIndex,
    };
  }

  function persistState(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedData()));
    } catch (error) {
      console.warn("[BrowseNav] Failed to persist state:", error);
    }
  }

  function restoreState(): boolean {
    if (typeof localStorage === "undefined") return false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return false;
      const migrated = migratePersistedBrowseNavigation(JSON.parse(stored));
      if (!migrated) return false;
      state.history = migrated.history;
      state.currentIndex = migrated.currentIndex;
      persistState();
      return true;
    } catch (error) {
      console.warn("[BrowseNav] Failed to restore state:", error);
      return false;
    }
  }

  function writeLocation(location: BrowseLocation, replace: boolean): void {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.pathname = buildBrowsePath(location);
    url.hash = "";
    if (replace) {
      pruneRouteScopedParams(url, url.pathname);
    } else {
      pruneParamsForNavigation(url, url.pathname);
    }
    writeUrl(url, {
      mode: replace ? "replace" : "push",
      state: browserHistoryState(location),
    });
  }

  function applyLocation(
    location: BrowseLocation,
    { replace = false, syncUrl = true }: NavigateOptions = {}
  ): void {
    const current = state.history[state.currentIndex];
    if (current && browseLocationsEqual(current, location)) {
      if (replace && syncUrl) writeLocation(location, true);
      return;
    }

    if (replace && state.currentIndex >= 0) {
      state.history[state.currentIndex] = location;
    } else {
      const nextHistory = state.history.slice(0, state.currentIndex + 1);
      nextHistory.push(location);
      if (nextHistory.length > MAX_HISTORY_SIZE) nextHistory.shift();
      state.history = nextHistory;
      state.currentIndex = nextHistory.length - 1;
    }

    persistState();
    if (syncUrl) writeLocation(location, replace);
  }

  function syncFromBrowser(): void {
    if (typeof window === "undefined") return;
    const route = resolveBrowsePathname(window.location.pathname);
    if (!route || route.externalRedirect) return;
    isNavigating = true;
    applyLocation(route.location, { replace: true, syncUrl: false });
    queueMicrotask(() => {
      isNavigating = false;
    });
  }

  function initialize(): void {
    if (started || typeof window === "undefined") return;
    started = true;
    restoreState();

    const route = resolveBrowsePathname(window.location.pathname);
    if (route && !route.externalRedirect) {
      applyLocation(route.location, { replace: true, syncUrl: true });
    } else if (state.currentIndex < 0) {
      applyLocation(defaultBrowseLocation(), { replace: true, syncUrl: true });
    }

    window.addEventListener("popstate", syncFromBrowser);
  }

  function destroy(): void {
    if (!started || typeof window === "undefined") return;
    window.removeEventListener("popstate", syncFromBrowser);
    started = false;
  }

  return {
    get canGoBack() {
      return canGoBack;
    },
    get canGoForward() {
      return canGoForward;
    },
    get currentLocation() {
      return currentLocation;
    },
    get historyLength() {
      return state.history.length;
    },
    get isNavigating() {
      return isNavigating;
    },

    navigateTo(location: BrowseLocation, options?: NavigateOptions) {
      applyLocation(location, options);
    },

    replace(location: BrowseLocation) {
      applyLocation(location, { replace: true });
    },

    selectPrimary(primary: BrowsePrimary, replace = false) {
      if (currentLocation?.primary === primary) return;
      applyLocation(
        { primary, section: "sequences", view: "list" },
        { replace }
      );
    },

    viewExploreSequences() {
      applyLocation({ primary: "explore", section: "sequences", view: "list" });
    },

    viewExploreCollections() {
      applyLocation({
        primary: "explore",
        section: "collections",
        view: "list",
      });
    },

    viewPublicCollectionDetail(
      ownerId: string,
      collectionId: string,
      collectionName?: string
    ) {
      applyLocation({
        primary: "explore",
        section: "collections",
        view: "detail",
        ownerId,
        contextId: collectionId,
        filter: collectionName
          ? { type: "collectionName", value: collectionName }
          : undefined,
      });
    },

    viewSequenceDetail(sequenceId: string) {
      applyLocation({
        primary: "explore",
        section: "sequences",
        view: "detail",
        contextId: sequenceId,
      });
    },

    viewCreatorSequences(userId: string, displayName?: string) {
      applyLocation({
        primary: "explore",
        section: "sequences",
        view: "list",
        filter: { type: "creator", value: userId, displayName },
      });
    },

    viewCollectionDetail(collectionId: string, collectionName?: string) {
      if (collectionId === "all") {
        applyLocation({ primary: "you", section: "sequences", view: "list" });
        return;
      }

      const visualTypeByShelf: Record<string, BrowseVisualType> = {
        art_tunnels: "tunnels",
        art_mandala: "mandalas",
        art_scenes: "scenes",
      };
      const visualType = visualTypeByShelf[collectionId];
      if (visualType) {
        applyLocation({
          primary: "you",
          section: "visuals",
          view: "list",
          visualType,
          contextId: collectionId,
          filter: collectionName
            ? { type: "collectionName", value: collectionName }
            : undefined,
        });
        return;
      }

      if (collectionId === "video_performances") {
        applyLocation({ primary: "you", section: "videos", view: "list" });
        return;
      }

      const separator = collectionId.indexOf(":");
      const ownerId =
        separator > 0 ? collectionId.slice(0, separator) : undefined;
      const contextId =
        separator > 0 ? collectionId.slice(separator + 1) : collectionId;
      applyLocation({
        primary: "you",
        section: "collections",
        view: "detail",
        ownerId,
        contextId,
        filter: collectionName
          ? { type: "collectionName", value: collectionName }
          : undefined,
      });
    },

    viewCollections() {
      applyLocation({ primary: "you", section: "collections", view: "list" });
    },

    goBack(): BrowseLocation | null {
      if (!canGoBack || typeof window === "undefined") return null;
      window.history.back();
      return currentLocation;
    },

    goForward(): BrowseLocation | null {
      if (!canGoForward || typeof window === "undefined") return null;
      window.history.forward();
      return currentLocation;
    },

    initialize,
    destroy,

    clearHistory() {
      state.history = [];
      state.currentIndex = -1;
      localStorage.removeItem(STORAGE_KEY);
    },

    setNavigating(value: boolean) {
      isNavigating = value;
    },
  };
}

export type BrowseNavigationState = ReturnType<
  typeof createBrowseNavigationState
>;
