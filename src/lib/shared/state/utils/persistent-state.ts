/**
 * Persistent State Utility
 *
 * Provides a unified approach to localStorage persistence for Svelte 5 state factories.
 * Uses reactive $effect for automatic save-on-change pattern.
 *
 * Usage:
 * ```typescript
 * const { load, setupAutoSave } = createPersistenceHelper<MyStateType>(
 *   'my-state-key',
 *   { default: 'values' }
 * );
 *
 * let state = $state(load());
 *
 * $effect(() => {
 *   void state.someProperty; // Track changes
 *   setupAutoSave(state);     // Auto-save to localStorage
 * });
 * ```
 */

import { browser } from "$app/env";

export interface PersistenceOptions<T> {
  key: string;
  defaultValue: T;
  migrate?: (value: unknown) => T;
}

export function createPersistenceHelper<T>(options: PersistenceOptions<T>) {
  const { key, defaultValue, migrate } = options;

  /**
   * Load state from localStorage, with error handling and fallback to defaults
   */
  function load(): T {
    if (!browser) return structuredClone(defaultValue);

    try {
      const stored = localStorage.getItem(key);
      if (!stored) return structuredClone(defaultValue);

      const parsed = migrate
        ? migrate(JSON.parse(stored))
        : (JSON.parse(stored) as T);
      // Deep merge with defaults to handle schema evolution
      return mergeWithDefaults(parsed, defaultValue);
    } catch (error) {
      console.error(
        `Failed to load state from localStorage (key: ${key}):`,
        error
      );
      return structuredClone(defaultValue);
    }
  }

  /**
   * Save state to localStorage with error handling
   */
  function save(state: T): void {
    if (!browser) return;

    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(
        `Failed to save state to localStorage (key: ${key}):`,
        error
      );
    }
  }

  /**
   * Setup auto-save via $effect
   * Call this in an $effect block, passing the state to track
   *
   * Example:
   * ```typescript
   * $effect(() => {
   *   void state.property; // Track all properties you want to persist
   *   setupAutoSave(state);
   * });
   * ```
   */
  function setupAutoSave(state: T): void {
    save(state);
  }

  return { load, save, setupAutoSave };
}

/**
 * Deep merge helper: fills missing keys from defaults
 * Preserves structure while ensuring all default keys exist
 */
function mergeWithDefaults<T>(current: T, defaults: T): T {
  if (
    typeof defaults !== "object" ||
    defaults === null ||
    Array.isArray(defaults)
  ) {
    return current ?? defaults;
  }

  const result = { ...defaults };

  if (
    typeof current === "object" &&
    current !== null &&
    !Array.isArray(current)
  ) {
    for (const key in current) {
      if (
        key in defaults &&
        typeof defaults[key as keyof T] === "object" &&
        !Array.isArray(defaults[key as keyof T])
      ) {
        (result as Record<string, unknown>)[key] = mergeWithDefaults(
          current[key],
          defaults[key as keyof T]
        );
      } else {
        (result as Record<string, unknown>)[key] = current[key];
      }
    }
  }

  return result as T;
}
