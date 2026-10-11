/**
 * Turn Pattern State
 *
 * Manages turn pattern storage and loading state.
 * Used by the Turn Pattern Applicator UI to display available patterns.
 */

import type { TurnPattern } from "#lib/shared/create/domain/turn-pattern-data.js";
import * as turnPatternManager from "#lib/shared/create/services/turn-pattern-manager.js";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const logger = createComponentLogger("TurnPatternState");

// State stored as plain JS to avoid $state module-level issues
let _patterns: TurnPattern[] = [];
let _isLoading = false;
let _selectedPattern: TurnPattern | null = null;
let _error: string | null = null;
let _initialized = false;


export const turnPatternState = {
  // Getters
  get patterns(): TurnPattern[] {
    return _patterns;
  },

  get isLoading(): boolean {
    return _isLoading;
  },

  get selectedPattern(): TurnPattern | null {
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
      _patterns = await turnPatternManager.loadPatterns(userId);
      _initialized = true;
      logger.log(`Loaded ${_patterns.length} patterns`);
    } catch (err) {
      _error = err instanceof Error ? err.message : "Failed to load patterns";
      logger.error("Failed to load patterns:", err);
    } finally {
      _isLoading = false;
    }
  },

  async savePattern(
    name: string,
    userId: string,
    sequence: SequenceData
  ): Promise<TurnPattern | null> {
    if (!userId) {
      _error = "Must be logged in to save patterns";
      return null;
    }

    _isLoading = true;
    _error = null;

    try {
      const patternData = turnPatternManager.extractPattern(
        sequence,
        name
      );
      const saved = await turnPatternManager.savePattern(
        patternData,
        userId
      );

      // Add to local state
      _patterns = [saved, ..._patterns];
      logger.log(`Saved pattern "${name}"`);
      return saved;
    } catch (err) {
      _error = err instanceof Error ? err.message : "Failed to save pattern";
      logger.error("Failed to save pattern:", err);
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
      await turnPatternManager.deletePattern(patternId, userId);

      // Remove from local state
      _patterns = _patterns.filter((p) => p.id !== patternId);

      // Clear selection if deleted pattern was selected
      if (_selectedPattern?.id === patternId) {
        _selectedPattern = null;
      }

      logger.log(`Deleted pattern ${patternId}`);
      return true;
    } catch (err) {
      _error = err instanceof Error ? err.message : "Failed to delete pattern";
      logger.error("Failed to delete pattern:", err);
      return false;
    } finally {
      _isLoading = false;
    }
  },

  selectPattern(pattern: TurnPattern | null): void {
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
