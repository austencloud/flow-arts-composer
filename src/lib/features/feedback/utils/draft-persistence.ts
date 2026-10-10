/**
 * Draft Persistence Utility
 *
 * Handles localStorage persistence for feedback form drafts.
 * Prevents data loss from HMR, page refresh, or navigation.
 */

import type { FeedbackFormData } from "#lib/shared/feedback/domain/models/feedback-models.js";

const DRAFT_KEY = "tka-feedback-draft";
// Legacy key from previous implementation - migrate on first load
const LEGACY_DRAFT_KEY = "tka-feedback-form-draft";

export interface FeedbackDraft {
  formData: FeedbackFormData;
  timestamp: number;
}

/**
 * Migrate legacy draft to new format (one-time migration)
 */
function migrateLegacyDraft(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
    if (!legacy) return;

    // Legacy format was just { type, title, description }
    const legacyData = JSON.parse(legacy);
    if (legacyData.type && typeof legacyData.description === "string") {
      // Convert to new format
      const draft: FeedbackDraft = {
        formData: {
          type: legacyData.type,
          title: legacyData.title || "",
          description: legacyData.description,
        },
        timestamp: Date.now(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
    // Remove legacy key after migration
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // Migration failed, just remove the legacy key
    try {
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    } catch {
      // Ignore
    }
  }
}

/**
 * Save draft to localStorage
 */
export function saveDraft(formData: FeedbackFormData): void {
  try {
    const draft: FeedbackDraft = {
      formData,
      timestamp: Date.now(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn("Failed to save feedback draft:", error);
  }
}

/**
 * Load draft from localStorage
 */
export function loadDraft(): FeedbackDraft | null {
  try {
    // Migrate legacy draft on first load
    migrateLegacyDraft();

    const stored = localStorage.getItem(DRAFT_KEY);
    if (!stored) return null;

    const draft: FeedbackDraft = JSON.parse(stored);
    return draft;
  } catch (error) {
    console.warn("Failed to load feedback draft:", error);
    return null;
  }
}

/**
 * Clear draft from localStorage
 */
export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (error) {
    console.warn("Failed to clear feedback draft:", error);
  }
}

/**
 * Check if a draft exists
 */
export function hasDraft(): boolean {
  try {
    return localStorage.getItem(DRAFT_KEY) !== null;
  } catch {
    return false;
  }
}
