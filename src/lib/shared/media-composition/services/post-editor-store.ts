import type { PostProject } from "#lib/shared/media-composition/domain/post-project.js";
import type { TakeTiming } from "#lib/shared/media-composition/domain/take-timing.js";
import {
  loadPostEditorHistory,
  savePostEditorHistory,
  type PostEditorHistory,
  type RestoredPostEditorHistory,
} from "#lib/shared/media-composition/services/post-editor-history-store.js";
import {
  backupPostProjectBeforeImport,
  openPostProject,
  savePostProject,
  type SaveResult,
} from "#lib/shared/media-composition/services/post-project-store.js";
import {
  loadTakeTiming,
  openTakeTiming,
  saveTakeTiming,
} from "#lib/shared/media-composition/services/take-timing-store.js";

/**
 * Where the Post editor keeps a post, each take's timing and the undo
 * history. The ordinary post uses this device's storage; a feature video
 * passes a store backed by its folder on disk, so it never reads or writes
 * the ordinary post for the same sequence.
 */
export interface PostEditorStore {
  /** The saved post for the sequence, or a new empty one. */
  openProject(sequenceId: string, now: number): PostProject;
  saveProject(project: PostProject): SaveResult;
  /** Keeps the current post before an import replaces it. */
  backupBeforeImport(project: PostProject): void;
  loadTiming(sequenceId: string, takeKey: string): TakeTiming | null;
  saveTiming(timing: TakeTiming): SaveResult;
  /** The saved timing for the take, or a new unmapped one. */
  openTiming(input: {
    sequenceId: string;
    takeKey: string;
    durationSeconds: number;
    movesPerPass: number;
    now: number;
  }): TakeTiming;
  loadHistory(head: PostProject): RestoredPostEditorHistory | null;
  saveHistory(history: PostEditorHistory): void;
}

/** This device's storage, as the ordinary post has always used it. */
export const devicePostEditorStore: PostEditorStore = {
  openProject: openPostProject,
  saveProject: savePostProject,
  backupBeforeImport: backupPostProjectBeforeImport,
  loadTiming: loadTakeTiming,
  saveTiming: saveTakeTiming,
  openTiming: (input) => openTakeTiming(input),
  loadHistory: loadPostEditorHistory,
  saveHistory: savePostEditorHistory,
};
