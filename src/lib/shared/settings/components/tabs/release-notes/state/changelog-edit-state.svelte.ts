// Manages undo/redo state for changelog editing
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type {
  AppVersion,
  ChangelogEntry,
} from "#lib/shared/versioning/domain/models/version-models.js";
import * as versionService from "#lib/shared/feedback/services/version-service.js";

export type UndoAction =
  | { type: "delete"; entry: ChangelogEntry; absoluteIndex: number }
  | { type: "edit"; oldText: string; absoluteIndex: number }
  | { type: "editReleaseNotes"; oldText: string }
  | { type: "add"; absoluteIndex: number };

class ChangelogEditState {
  undoStack = $state<UndoAction[]>([]);
  redoStack = $state<UndoAction[]>([]);

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }

  pushUndo(action: UndoAction) {
    this.undoStack = [...this.undoStack, action];
    this.redoStack = [];
  }

  async undo(version: AppVersion): Promise<string | null> {
    if (!this.canUndo) return null;

    const action = this.undoStack.pop();
    if (!action) return null;
    this.undoStack = [...this.undoStack];

    if (action.type === "delete") {
      const entries = version.changelogEntries || [];
      entries.splice(action.absoluteIndex, 0, action.entry);
      version.changelogEntries = [...entries];
      await versionService.updateChangelogEntries(
        version.version,
        version.changelogEntries
      );
      this.redoStack = [
        ...this.redoStack,
        { type: "add", absoluteIndex: action.absoluteIndex },
      ];
      return t("settings_entry_restored");
    }

    if (action.type === "add") {
      const entries = version.changelogEntries || [];
      const deletedEntry = entries[action.absoluteIndex];
      if (deletedEntry) {
        entries.splice(action.absoluteIndex, 1);
        version.changelogEntries = [...entries];
        await versionService.updateChangelogEntries(
          version.version,
          version.changelogEntries
        );
        this.redoStack = [
          ...this.redoStack,
          {
            type: "delete",
            entry: deletedEntry,
            absoluteIndex: action.absoluteIndex,
          },
        ];
        return t("settings_entry_removed");
      }
    }

    if (action.type === "edit") {
      const entry = version.changelogEntries?.[action.absoluteIndex];
      if (entry) {
        const currentText = entry.text;
        const restoredEntry: ChangelogEntry = {
          category: entry.category,
          text: action.oldText,
          ...(entry.feedbackId && { feedbackId: entry.feedbackId }),
        };
        version.changelogEntries![action.absoluteIndex] = restoredEntry;
        version.changelogEntries = [...version.changelogEntries!];
        await versionService.updateChangelogEntry(
          version.version,
          action.absoluteIndex,
          restoredEntry
        );
        this.redoStack = [
          ...this.redoStack,
          {
            type: "edit",
            oldText: currentText,
            absoluteIndex: action.absoluteIndex,
          },
        ];
        return t("settings_edit_reverted");
      }
    }

    if (action.type === "editReleaseNotes") {
      const currentText = version.releaseNotes || "";
      version.releaseNotes = action.oldText;
      await versionService.updateReleaseNotes(version.version, action.oldText);
      this.redoStack = [
        ...this.redoStack,
        { type: "editReleaseNotes", oldText: currentText },
      ];
      return t("settings_release_notes_reverted");
    }

    return null;
  }

  async redo(version: AppVersion): Promise<string | null> {
    if (!this.canRedo) return null;

    const action = this.redoStack.pop();
    if (!action) return null;
    this.redoStack = [...this.redoStack];

    if (action.type === "delete") {
      const entries = version.changelogEntries || [];
      entries.splice(action.absoluteIndex, 0, action.entry);
      version.changelogEntries = [...entries];
      await versionService.updateChangelogEntries(
        version.version,
        version.changelogEntries
      );
      this.undoStack = [
        ...this.undoStack,
        { type: "add", absoluteIndex: action.absoluteIndex },
      ];
      return t("settings_entry_restored");
    }

    if (action.type === "add") {
      const entries = version.changelogEntries || [];
      const deletedEntry = entries[action.absoluteIndex];
      if (deletedEntry) {
        entries.splice(action.absoluteIndex, 1);
        version.changelogEntries = [...entries];
        await versionService.updateChangelogEntries(
          version.version,
          version.changelogEntries
        );
        this.undoStack = [
          ...this.undoStack,
          {
            type: "delete",
            entry: deletedEntry,
            absoluteIndex: action.absoluteIndex,
          },
        ];
        return t("settings_entry_removed");
      }
    }

    if (action.type === "edit") {
      const entry = version.changelogEntries?.[action.absoluteIndex];
      if (entry) {
        const currentText = entry.text;
        const restoredEntry: ChangelogEntry = {
          category: entry.category,
          text: action.oldText,
          ...(entry.feedbackId && { feedbackId: entry.feedbackId }),
        };
        version.changelogEntries![action.absoluteIndex] = restoredEntry;
        version.changelogEntries = [...version.changelogEntries!];
        await versionService.updateChangelogEntry(
          version.version,
          action.absoluteIndex,
          restoredEntry
        );
        this.undoStack = [
          ...this.undoStack,
          {
            type: "edit",
            oldText: currentText,
            absoluteIndex: action.absoluteIndex,
          },
        ];
        return t("settings_edit_reapplied");
      }
    }

    if (action.type === "editReleaseNotes") {
      const currentText = version.releaseNotes || "";
      version.releaseNotes = action.oldText;
      await versionService.updateReleaseNotes(version.version, action.oldText);
      this.undoStack = [
        ...this.undoStack,
        { type: "editReleaseNotes", oldText: currentText },
      ];
        return t("settings_release_notes_reapplied");
    }

    return null;
  }

  reset() {
    this.undoStack = [];
    this.redoStack = [];
  }
}

export const changelogEditState = new ChangelogEditState();
