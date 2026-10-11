/**
 * Public Page Background Configuration
 *
 * Background picker data and localStorage persistence for public pages
 * (landing, about, privacy, terms, etc.).
 */

import { browser } from "$app/env";
import { BackgroundType } from "@austencloud/backgrounds";

/**
 * Animated background options for public pages.
 * All public pages use the same list for consistency.
 */
export const ANIMATED_BACKGROUNDS = [
  { type: BackgroundType.COSMIC, icon: "fa-moon", label: "Cosmic" },
  { type: BackgroundType.WINTER, icon: "fa-snowflake", label: "Winter" },
  { type: BackgroundType.OCEAN, icon: "fa-water", label: "Ocean" },
  { type: BackgroundType.EMBER, icon: "fa-fire", label: "Ember" },
  { type: BackgroundType.BLOSSOM, icon: "fa-spa", label: "Blossom" },
  { type: BackgroundType.FOREST, icon: "fa-tree", label: "Forest" },
  { type: BackgroundType.AUTUMN, icon: "fa-leaf", label: "Autumn" },
  { type: BackgroundType.PRIDE, icon: "fa-rainbow", label: "Rainbow" },
  { type: BackgroundType.CELESTIAL, icon: "fa-cloud-sun", label: "Celestial" },
  { type: BackgroundType.VOID, icon: "fa-square", label: "Void" },
] as const;

export type AnimatedBackground = (typeof ANIMATED_BACKGROUNDS)[number];

const STORAGE_KEY = "tka-public-theme-index";

/** Get the saved theme index from localStorage, or 0 (Cosmic) as default */
export function getPublicThemeIndex(): number {
  if (!browser) return 0;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const index = parseInt(stored, 10);
      if (!isNaN(index) && index >= 0 && index < ANIMATED_BACKGROUNDS.length) {
        return index;
      }
    }
  } catch {
    // localStorage might be unavailable
  }

  return 0;
}

/** Save the theme index to localStorage */
export function savePublicThemeIndex(index: number): void {
  if (!browser) return;

  try {
    localStorage.setItem(STORAGE_KEY, String(index));
  } catch {
    // localStorage might be unavailable
  }
}

/** Get the next theme index (wrapping around) */
export function getNextThemeIndex(currentIndex: number): number {
  return (currentIndex + 1) % ANIMATED_BACKGROUNDS.length;
}
