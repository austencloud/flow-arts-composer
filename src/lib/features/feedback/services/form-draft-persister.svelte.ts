import type { DraftSaveStatus } from "#lib/shared/feedback/domain/feedback-contract-types.js";
import type {
  FeedbackFormData,
  FeedbackDraft,
} from "#lib/shared/feedback/domain/models/feedback-models.js";
import {
  saveDraft as saveToStorage,
  loadDraft as loadFromStorage,
  clearDraft as clearFromStorage,
  hasDraft as hasStoredDraft,
} from "../utils/draft-persistence";

/**
 * Manages auto-saving feedback form drafts with debouncing.
 */
export class FormDraftPersister {
  private _saveStatus = $state<DraftSaveStatus>("idle");
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingDraft: FeedbackFormData | null = null;

  get saveStatus(): DraftSaveStatus {
    return this._saveStatus;
  }

  scheduleSave(formData: FeedbackFormData, debounceMs = 500): void {
    // Clear existing timers
    this.cancelPendingSave();

    // Only save if there's content
    if (
      formData.description.trim().length === 0 &&
      formData.title.trim().length === 0
    ) {
      this.pendingDraft = null;
      clearFromStorage();
      this._saveStatus = "idle";
      return;
    }

    // Snapshot the reactive form object. A later keystroke must not mutate the
    // value associated with this timer behind the persister's back.
    this.pendingDraft = { ...formData };

    this._saveStatus = "saving";

    // Debounce save
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.savePendingDraft();
    }, debounceMs);
  }

  /** Persist the latest keystrokes synchronously before page teardown. */
  flushPendingSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.savePendingDraft();
  }

  loadDraft(): FeedbackDraft | null {
    return loadFromStorage();
  }

  clearDraft(): void {
    this.cancelPendingSave();
    this.pendingDraft = null;
    clearFromStorage();
    this._saveStatus = "idle";
  }

  hasDraft(): boolean {
    return hasStoredDraft();
  }

  cancelPendingSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  private savePendingDraft(): void {
    const draft = this.pendingDraft;
    if (!draft) return;

    saveToStorage(draft);
    this.pendingDraft = null;
    this._saveStatus = "saved";

    this.resetTimer = setTimeout(() => {
      this._saveStatus = "idle";
      this.resetTimer = null;
    }, 2000);
  }
}
