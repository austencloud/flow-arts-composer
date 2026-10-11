/**
 * Guest persistence for the prop collection. localStorage only — members use
 * Firestore (owned by PropUnlockManager). Mirrors the house localStorage idiom
 * (browser guard + try/catch + tka- prefixed key).
 */
import { browser } from "$app/env";
import {
  defaultCollection,
  type PropCollection,
} from "../domain/prop-collection";

export const PROP_COLLECTION_KEY = "tka-prop-collection-v1";

export function loadGuestCollection(): PropCollection {
  if (!browser && typeof localStorage === "undefined") return defaultCollection();
  try {
    const raw = localStorage.getItem(PROP_COLLECTION_KEY);
    if (!raw) return defaultCollection();
    const parsed = JSON.parse(raw) as Partial<PropCollection>;
    return {
      unlockedPropTypes: parsed.unlockedPropTypes ?? [],
      creationCount: parsed.creationCount ?? 0,
      pendingPicks: parsed.pendingPicks ?? 0,
    };
  } catch (error) {
    console.error("[prop-collection] failed to load guest collection:", error);
    return defaultCollection();
  }
}

export function saveGuestCollection(c: PropCollection): void {
  if (!browser && typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PROP_COLLECTION_KEY, JSON.stringify(c));
  } catch (error) {
    console.error("[prop-collection] failed to save guest collection:", error);
  }
}

export function clearGuestCollection(): void {
  if (!browser && typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(PROP_COLLECTION_KEY);
  } catch (error) {
    console.error("[prop-collection] failed to clear guest collection:", error);
  }
}
