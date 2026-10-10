/**
 * Modal URL State Manager
 *
 * Syncs modal state with URL search params to survive HMR and enable deep linking.
 *
 * URL Schema:
 * - ?modal=sequence&id=<sequenceId>&view=split|animation|image
 * - ?modal=spotlight&id=<sequenceId>&mode=split|animation|image|stepgrid|video
 *
 * Usage:
 * - Call initModalUrlState() once at app startup (in +layout.svelte)
 * - Use getModalUrlState() to read current state
 * - Use setModalUrlState() to update URL and state together
 * - Use clearModalUrlState() when closing modals
 */

import { goto } from "$app/navigation";
import { page, type ReadonlyURLSearchParams } from "$app/state";
import type { SequenceData } from "../../../foundation/domain/models/sequence-data";
import { writeUrl } from "../../../navigation/services/url-state";

export type ModalType = "sequence" | "spotlight" | null;
export type SequenceViewMode = "split" | "animation" | "image";
export type SpotlightDisplayMode =
  | "image"
  | "stepgrid"
  | "animation"
  | "video"
  | "split";

export interface ModalUrlState {
  modal: ModalType;
  sequenceId: string | null;
  view: SequenceViewMode;
  spotlightMode: SpotlightDisplayMode;
  /** Playback time in milliseconds (for restoring exact position) */
  playbackTimeMs: number;
  /** BPM setting */
  bpm: number;
}

const DEFAULT_STATE: ModalUrlState = {
  modal: null,
  sequenceId: null,
  view: "split",
  spotlightMode: "split",
  playbackTimeMs: 0,
  bpm: 60,
};

// Reactive state that mirrors URL params
let currentState = $state<ModalUrlState>({ ...DEFAULT_STATE });

// Sequence cache for restoring after HMR and page refresh
// Uses sessionStorage to survive page refresh
const SEQUENCE_CACHE_KEY = "tka_modal_sequence_cache";

function getSequenceCacheFromStorage(): Map<string, SequenceData> {
  if (typeof sessionStorage === "undefined") {
    return new Map();
  }
  try {
    const cached = sessionStorage.getItem(SEQUENCE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      return new Map(Object.entries(parsed));
    }
  } catch (err) {
    console.warn("[modal-url-state] Failed to parse sequence cache:", err);
  }
  return new Map();
}

function saveSequenceCacheToStorage(cache: Map<string, SequenceData>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const obj = Object.fromEntries(cache);
    sessionStorage.setItem(SEQUENCE_CACHE_KEY, JSON.stringify(obj));
  } catch (err) {
    console.warn("[modal-url-state] Failed to save sequence cache:", err);
  }
}

// In-memory cache backed by sessionStorage
const sequenceCache = getSequenceCacheFromStorage();

function parseUrlParams(searchParams: ReadonlyURLSearchParams): ModalUrlState {
  const modal = searchParams.get("modal") as ModalType;
  const sequenceId = searchParams.get("id");
  const view = (searchParams.get("view") || "split") as SequenceViewMode;
  const spotlightMode = (searchParams.get("mode") ||
    "split") as SpotlightDisplayMode;
  const playbackTimeMs = parseInt(searchParams.get("t") || "0", 10) || 0;
  const bpm = parseInt(searchParams.get("bpm") || "60", 10) || 60;

  return {
    modal: modal === "sequence" || modal === "spotlight" ? modal : null,
    sequenceId,
    view,
    spotlightMode,
    playbackTimeMs,
    bpm,
  };
}

function buildUrlParams(state: Partial<ModalUrlState>): URLSearchParams {
  const params = new URLSearchParams();

  if (state.modal) {
    params.set("modal", state.modal);
  }
  if (state.sequenceId) {
    params.set("id", state.sequenceId);
  }
  if (state.modal === "sequence" && state.view && state.view !== "split") {
    params.set("view", state.view);
  }
  if (
    state.modal === "spotlight" &&
    state.spotlightMode &&
    state.spotlightMode !== "split"
  ) {
    params.set("mode", state.spotlightMode);
  }
  // Include playback time if > 0 (rounded to avoid excessive URL changes)
  if (state.playbackTimeMs && state.playbackTimeMs > 0) {
    params.set("t", String(Math.round(state.playbackTimeMs)));
  }
  // Include BPM if not default
  if (state.bpm && state.bpm !== 60) {
    params.set("bpm", String(state.bpm));
  }

  return params;
}

/**
 * Get current modal URL state (reactive)
 */
export function getModalUrlState(): ModalUrlState {
  return currentState;
}

/**
 * Check if any modal is open according to URL
 */
export function isModalOpenFromUrl(): boolean {
  return currentState.modal !== null;
}

/**
 * Update URL to reflect sequence details modal state
 */
export function setSequenceModalUrl(
  sequence: SequenceData,
  view: SequenceViewMode = "split"
): void {
  const sequenceId = sequence.id || sequence.word || "unknown";

  // Cache sequence for HMR restoration
  sequenceCache.set(sequenceId, sequence);

  const params = buildUrlParams({
    modal: "sequence",
    sequenceId,
    view,
  });

  updateUrl(params);
}

/**
 * Update view mode in URL (preserves other params)
 */
export function setViewModeUrl(view: SequenceViewMode): void {
  const newState = { ...currentState, view };
  const params = buildUrlParams(newState);
  updateUrl(params);
}

/**
 * Update playback time in URL (debounced to avoid excessive updates)
 * Only updates if time has changed significantly (100ms threshold)
 *
 * Uses SvelteKit's replaceState for URL updates.
 * Debounced since playback time updates happen frequently during animation.
 */
let lastUrlUpdateTime = 0;
const URL_UPDATE_DEBOUNCE_MS = 500; // Update URL at most every 500ms

export function setPlaybackTimeUrl(
  timeMs: number,
  force: boolean = false
): void {
  const now = Date.now();
  const timeDiff = Math.abs(timeMs - currentState.playbackTimeMs);

  // Skip if not enough time has passed and change is small (unless forced)
  if (
    !force &&
    now - lastUrlUpdateTime < URL_UPDATE_DEBOUNCE_MS &&
    timeDiff < 100
  ) {
    return;
  }

  lastUrlUpdateTime = now;
  const newState = { ...currentState, playbackTimeMs: timeMs };
  const params = buildUrlParams(newState);
  updateUrlFast(params); // Use fast update for high-frequency playback time changes
}

/**
 * Update BPM in URL (preserves other params)
 */
export function setBpmUrl(bpm: number): void {
  const newState = { ...currentState, bpm };
  const params = buildUrlParams(newState);
  updateUrl(params);
}

/**
 * Update URL to reflect spotlight viewer state
 */
export function setSpotlightModalUrl(
  sequence: SequenceData,
  mode: SpotlightDisplayMode = "split"
): void {
  const sequenceId = sequence.id || sequence.word || "unknown";

  // Cache sequence for HMR restoration
  sequenceCache.set(sequenceId, sequence);

  const params = buildUrlParams({
    modal: "spotlight",
    sequenceId,
    spotlightMode: mode,
  });

  updateUrl(params);
}

/**
 * Clear modal URL state (close modals)
 */
export function clearModalUrlState(): void {
  updateUrl(new URLSearchParams());
}

/**
 * Get cached sequence by ID (for HMR/refresh restoration)
 */
export function getCachedSequence(id: string): SequenceData | undefined {
  // First check in-memory cache
  let sequence = sequenceCache.get(id);

  // If not found, try to reload from sessionStorage (handles module reload case)
  if (!sequence && typeof sessionStorage !== "undefined") {
    const freshCache = getSequenceCacheFromStorage();
    sequence = freshCache.get(id);
    if (sequence) {
      // Update in-memory cache
      sequenceCache.set(id, sequence);
    }
  }

  return sequence;
}

/**
 * Cache a sequence for later retrieval (survives page refresh via sessionStorage)
 */
export function cacheSequence(sequence: SequenceData): void {
  const id = sequence.id || sequence.word || "unknown";
  sequenceCache.set(id, sequence);
  // Persist to sessionStorage for page refresh survival
  saveSequenceCacheToStorage(sequenceCache);
}

/**
 * Build a new URL with modal params applied.
 * Shared between updateUrl and updateUrlFast.
 */
function buildNewUrl(params: URLSearchParams): URL {
  const newUrl = new URL(page.url.href);

  // Clear existing modal params
  newUrl.searchParams.delete("modal");
  newUrl.searchParams.delete("id");
  newUrl.searchParams.delete("view");
  newUrl.searchParams.delete("mode");
  newUrl.searchParams.delete("t");
  newUrl.searchParams.delete("bpm");

  params.forEach((value, key) => {
    newUrl.searchParams.set(key, value);
  });

  return newUrl;
}

/**
 * Full URL update using SvelteKit's goto().
 * Use for low-frequency updates (modal open/close, view mode changes).
 */
async function updateUrl(params: URLSearchParams): Promise<void> {
  const newUrl = buildNewUrl(params);

  // Update state immediately (optimistic)
  currentState = parseUrlParams(newUrl.searchParams);

  // Navigate without reload
  await goto(newUrl.toString(), {
    replace: true,
    reset: false,
  });
}

/**
 * Fast URL update using replaceState.
 * Used for high-frequency updates (playback time) without full navigation.
 */
function updateUrlFast(params: URLSearchParams): void {
  const newUrl = buildNewUrl(params);

  // Update state immediately (optimistic)
  currentState = parseUrlParams(newUrl.searchParams);

  // Update browser URL without navigation
  writeUrl(newUrl);
}

let initialized = false;
let cleanup: (() => void) | null = null;

export function initModalUrlState(): void {
  if (initialized) return;
  initialized = true;

  cleanup = $effect.root(() => {
    $effect(() => {
      if (page.url) {
        currentState = parseUrlParams(page.url.searchParams);
      }
    });
  });
}

export function cleanupModalUrlState(): void {
  initialized = false;
  cleanup?.();
  cleanup = null;
  currentState = { ...DEFAULT_STATE };
}
