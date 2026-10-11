/**
 * Rotation Direction Pattern State
 *
 * Manages rotation direction pattern storage and loading state.
 * Used by the Rotation Direction Applicator UI to display available patterns.
 */

import type { RotationDirectionPattern } from "../domain/models/rotation-direction-pattern-data";
import {
  loadPatterns as rdLoadPatterns,
  extractPattern as rdExtractPattern,
  savePattern as rdSavePattern,
  deletePattern as rdDeletePattern,
} from "../services/rotation-direction-pattern-manager";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const logger = createComponentLogger("RotationDirectionPatternState");

// State stored as plain JS to avoid $state module-level issues
let _patterns: RotationDirectionPattern[] = [];
let _isLoading = false;
let _selectedPattern: RotationDirectionPattern | null = null;
let _error: string | null = null;
let _initialized = false;

export const rotationDirectionPatternState = {
  // Getters
  get patterns(): RotationDirectionPattern[] {
    return _patterns;
  },

  get isLoading(): boolean {
    return _isLoading;
  },

  get selectedPattern(): RotationDirectionPattern | null {
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
      _patterns = await rdLoadPatterns(userId);
      _initialized = true;
      logger.log(`Loaded ${_patterns.length} rotation direction patterns`);
    } catch (err) {
      _error = err instanceof Error ? err.message : "Failed to load patterns";
      logger.error("Failed to load rotation direction patterns:", err);
    } finally {
      _isLoading = false;
    }
  },

  async savePattern(
    name: string,
    userId: string,
    sequence: SequenceData
  ): Promise<RotationDirectionPattern | null> {
    if (!userId) {
      _error = "Must be logged in to save patterns";
      return null;
    }

    _isLoading = true;
    _error = null;

    try {
      const patternData = rdExtractPattern(sequence, name);
      const saved = await rdSavePattern(patternData, userId);

      // Add to local state
      _patterns = [saved, ..._patterns];
      logger.log(`Saved rotation direction pattern "${name}"`);
      return saved;
    } catch (err) {
      _error = err instanceof Error ? err.message : "Failed to save pattern";
      logger.error("Failed to save rotation direction pattern:", err);
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
      await rdDeletePattern(patternId, userId);

      // Remove from local state
      _patterns = _patterns.filter((p) => p.id !== patternId);

      // Clear selection if deleted pattern was selected
      if (_selectedPattern?.id === patternId) {
        _selectedPattern = null;
      }

      logger.log(`Deleted rotation direction pattern ${patternId}`);
      return true;
    } catch (err) {
      _error = err instanceof Error ? err.message : "Failed to delete pattern";
      logger.error("Failed to delete rotation direction pattern:", err);
      return false;
    } finally {
      _isLoading = false;
    }
  },

  selectPattern(pattern: RotationDirectionPattern | null): void {
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
