/**
 * Spell Tab Persistence (Simplified - 2027 Redesign)
 *
 * Persists spell tab UI state:
 * - Schema versioning and migration
 * - Data validation
 * - Debounced saves
 * - Error recovery
 *
 * NOTE: Sequence data is persisted via sequenceState (not here).
 * NOTE: wizardPhase removed in 2027 redesign - state is now derived from word/sequence.
 */

import { browser } from "$app/env";
import type { SpellPreferences } from "../domain/models/spell-models";
import { DEFAULT_SPELL_PREFERENCES } from "#lib/shared/create/domain/spell-constants.js";
import { debounce } from "#lib/shared/utils/debounce.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";


/**
 * Current schema version
 * Increment when making breaking changes to stored data structure
 */
const SCHEMA_VERSION = 3; // Bumped: removed wizardPhase (now derived)

const STORAGE_KEYS = {
  VERSION: "tka_spell_state_version",
  INPUT_WORD: "tka_spell_input_word",
  EXPANDED_WORD: "tka_spell_expanded_word",
  PREFERENCES: "tka_spell_preferences",
  HAS_GENERATED: "tka_spell_has_generated",
} as const;

// Legacy keys to clean up
const LEGACY_KEYS = [
  "tka_spell_wizard_phase",
  "tka_spell_current_sequence",
];


/**
 * Spell Tab Persisted State
 * NOTE: Sequence is persisted via sequenceState, not here.
 * NOTE: wizardPhase removed - state is derived from word/sequence.
 */
export interface SpellPersistedState {
  inputWord: string;
  expandedWord: string;
  preferences: SpellPreferences;
  hasGeneratedOnce: boolean;
  // Legacy field for backward compat with old saves - ignored on load
  wizardPhase?: "preferences" | "generating" | "results";
}


/**
 * Validate preferences object
 */
function isValidPreferences(data: unknown): data is SpellPreferences {
  if (!data || typeof data !== "object") return false;
  return true;
}


/**
 * Migrate data from old schema versions
 */
function migrateData(version: number): void {
  if (version === SCHEMA_VERSION) {
    return;
  }

  // Clean up legacy keys from all versions
  try {
    LEGACY_KEYS.forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch {
    // Ignore
  }
}


// Saving happens silently in the background on every change, so when the
// browser's storage is full the user would keep typing assuming their word
// and settings survive a reload — when nothing is actually being written.
// We warn them once instead of on every keystroke (saves retry constantly),
// and re-arm the warning after a save succeeds again.
let hasWarnedQuotaExceeded = false;

/**
 * Internal save function (called by debounced wrapper)
 */
function saveSpellStateInternal(state: Partial<SpellPersistedState>): void {
  if (!browser) return;

  try {
    // Always save version
    localStorage.setItem(STORAGE_KEYS.VERSION, String(SCHEMA_VERSION));

    if (state.inputWord !== undefined) {
      localStorage.setItem(STORAGE_KEYS.INPUT_WORD, state.inputWord);
    }

    if (state.expandedWord !== undefined) {
      localStorage.setItem(STORAGE_KEYS.EXPANDED_WORD, state.expandedWord);
    }

    if (state.preferences !== undefined) {
      localStorage.setItem(
        STORAGE_KEYS.PREFERENCES,
        JSON.stringify(state.preferences)
      );
    }

    if (state.hasGeneratedOnce !== undefined) {
      localStorage.setItem(
        STORAGE_KEYS.HAS_GENERATED,
        String(state.hasGeneratedOnce)
      );
    }

    hasWarnedQuotaExceeded = false;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      console.error("[SpellPersistence] Storage quota exceeded.");
      if (!hasWarnedQuotaExceeded) {
        hasWarnedQuotaExceeded = true;
        toast.error(
          "Browser storage is full. Your Spell word and settings aren't being saved."
        );
      }
    } else {
      console.warn("[SpellPersistence] Failed to save state:", error);
    }
  }
}

/**
 * Debounced save function (300ms delay)
 */
export const saveSpellState = debounce(saveSpellStateInternal, 300);

/**
 * Load spell tab state from localStorage with validation
 */
export function loadSpellState(): SpellPersistedState {
  const defaultState: SpellPersistedState = {
    inputWord: "",
    expandedWord: "",
    preferences: { ...DEFAULT_SPELL_PREFERENCES },
    hasGeneratedOnce: false,
  };

  if (!browser) return defaultState;

  try {
    const versionStr = localStorage.getItem(STORAGE_KEYS.VERSION);
    const version = versionStr ? parseInt(versionStr, 10) : 0;

    if (version !== SCHEMA_VERSION) {
      migrateData(version);
      if (version > SCHEMA_VERSION) {
        console.warn(
          `[SpellPersistence] Data from future version (${version} > ${SCHEMA_VERSION}), clearing`
        );
        clearSpellState();
        return defaultState;
      }
    }

    // Load input word
    const inputWord = localStorage.getItem(STORAGE_KEYS.INPUT_WORD) || "";

    // Load expanded word
    const expandedWord =
      localStorage.getItem(STORAGE_KEYS.EXPANDED_WORD) || "";

    // Load and validate preferences
    const preferencesJson = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    let preferences = { ...DEFAULT_SPELL_PREFERENCES };

    if (preferencesJson) {
      try {
        const parsed = JSON.parse(preferencesJson);
        if (isValidPreferences(parsed)) {
          preferences = { ...DEFAULT_SPELL_PREFERENCES, ...parsed };
        }
      } catch {
        console.warn("[SpellPersistence] Invalid preferences, using defaults");
      }
    }

    // Load has generated flag
    const hasGeneratedOnce =
      localStorage.getItem(STORAGE_KEYS.HAS_GENERATED) === "true";

    return {
      inputWord,
      expandedWord,
      preferences,
      hasGeneratedOnce,
    };
  } catch (error) {
    console.warn("[SpellPersistence] Failed to load state:", error);
    return defaultState;
  }
}

/**
 * Clear all spell tab persisted state
 */
export function clearSpellState(): void {
  if (!browser) return;

  try {
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
    LEGACY_KEYS.forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn("[SpellPersistence] Failed to clear state:", error);
  }
}

/**
 * Check storage usage (diagnostic)
 */
export function getStorageSize(): number {
  if (!browser) return 0;

  try {
    let total = 0;
    Object.values(STORAGE_KEYS).forEach((key) => {
      const value = localStorage.getItem(key);
      if (value) {
        total += value.length * 2;
      }
    });
    return total;
  } catch {
    return 0;
  }
}
