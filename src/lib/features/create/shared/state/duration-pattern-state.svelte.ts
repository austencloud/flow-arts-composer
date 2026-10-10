/**
 * Duration Pattern State
 *
 * Manages duration pattern storage and loading state.
 * Used by the Duration Pattern Drawer UI to display available patterns.
 */

import type { DurationPattern } from "../domain/models/duration-pattern-data";
import {
  loadPatterns as dpLoadPatterns,
  extractPattern as dpExtractPattern,
  savePattern as dpSavePattern,
  deletePattern as dpDeletePattern,
} from "../services/duration-pattern-manager";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const logger = createComponentLogger("DurationPatternState");

// State stored as plain JS to avoid $state module-level issues
let _patterns: DurationPattern[] = [];
let _isLoading = false;
let _selectedPattern: DurationPattern | null = null;
let _error: string | null = null;
let _initialized = false;

export const durationPatternState = {
  // Getters
  get patterns(): DurationPattern[] {
    return _patterns;
  },

  get isLoading(): boolean {
    return _isLoading;
  },

  get selectedPattern(): DurationPattern | null {
    return _selectedPattern;
  },

  get error(): string | null {
    return _error;
  },

  get initialized(): boolean {
    return _initialized;
  },

  // Actions
  async loadPatterns(userId: string): Promise<void> {
    if (!userId) {
      logger.warn("Cannot load patterns - no user ID");
      return;
    }

    _isLoading = true;
    _error = null;

    try {
      _patterns = await dpLoadPatterns(userId);
      _initialized = true;
      logger.log(`Loaded ${_patterns.length} duration patterns`);
    } catch (err) {
      _error =
        err instanceof Error ? err.message : "Failed to load duration patterns";
      logger.error("Failed to load duration patterns:", err);
    } finally {
      _isLoading = false;
    }
  },

  async savePattern(
    name: string,
    userId: string,
    sequence: SequenceData
  ): Promise<DurationPattern | null> {
    if (!userId) {
      _error = "Must be logged in to save patterns";
      return null;
    }

    _isLoading = true;
    _error = null;

    try {
      const patternData = dpExtractPattern(sequence, name);
      const saved = await dpSavePattern(patternData, userId);

      // Add to local state
      _patterns = [saved, ..._patterns];
      logger.log(`Saved duration pattern "${name}"`);
      return saved;
    } catch (err) {
      _error =
        err instanceof Error
          ? err.message
          : "Failed to save duration pattern";
      logger.error("Failed to save duration pattern:", err);
      return null;
    } finally {
      _isLoading = false;
    }
  },

  async deletePattern(patternId: string, userId: string): Promise<boolean> {
    if (!userId) {
      _error = "Must be logged in to delete patterns";
      return false;
    }

    _isLoading = true;
    _error = null;

    try {
      await dpDeletePattern(patternId, userId);

      // Remove from local state
      _patterns = _patterns.filter((p) => p.id !== patternId);

      // Clear selection if deleted pattern was selected
      if (_selectedPattern?.id === patternId) {
        _selectedPattern = null;
      }

      logger.log(`Deleted duration pattern ${patternId}`);
      return true;
    } catch (err) {
      _error =
        err instanceof Error
          ? err.message
          : "Failed to delete duration pattern";
      logger.error("Failed to delete duration pattern:", err);
      return false;
    } finally {
      _isLoading = false;
    }
  },

  selectPattern(pattern: DurationPattern | null): void {
    _selectedPattern = pattern;
  },

  clearError(): void {
    _error = null;
  },

  reset(): void {
    _patterns = [];
    _isLoading = false;
    _selectedPattern = null;
    _error = null;
    _initialized = false;
  },
};
