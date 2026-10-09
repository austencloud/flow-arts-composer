import {
  createHistoryStorage,
  type EditorHistory,
  type HistoryEntry,
  type RestoredEditorHistory,
} from "@austencloud/video-editor";
import type { PostProject } from "@austencloud/video-editor/core";
import { tkaPlugin } from "$lib/shared/post-studio-plugin";
import {
  TakeTimingSchema,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";

/**
 * Keeps each post's recent undo history in this tab, so Undo still works
 * after the page reloads, whether from a refresh or the dev server. It lives
 * in sessionStorage: a reload keeps it, closing the tab ends it, and other
 * tabs never see it.
 *
 * A history only applies to the exact save it leads up to: same saved time,
 * same content. When the post that opens is a different save, such as a newer
 * draft from the disk archive or another tab, the history is dropped. Undo
 * must never step back into a post that was not the one on screen.
 *
 * Every read and write is guarded: when storage is full or blocked, the
 * history is simply not kept, and editing carries on.
 */

const PREFIX = "tka:post-studio:history:v1:";

/** Timing an edit changed along with the post; undoing it puts the timing back. */
export interface PostTimingEffect {
  takeId: string;
  before: TakeTiming;
  after: TakeTiming;
}

export type PostHistoryEntry = HistoryEntry<PostTimingEffect>;
export type PostEditorHistory = EditorHistory<PostTimingEffect>;
export type RestoredPostEditorHistory = RestoredEditorHistory<PostTimingEffect>;

/** A stored timing effect, or undefined when it does not read as one. */
export function parsePostTimingEffect(
  value: unknown
): PostTimingEffect | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { takeId, before, after } = value as Record<string, unknown>;
  const parsedBefore = TakeTimingSchema.safeParse(before);
  const parsedAfter = TakeTimingSchema.safeParse(after);
  return typeof takeId === "string" &&
    parsedBefore.success &&
    parsedAfter.success
    ? { takeId, before: parsedBefore.data, after: parsedAfter.data }
    : undefined;
}

/**
 * The same history kept under another key prefix, so a post kept somewhere
 * else, such as a feature video on disk, never shares or evicts the
 * ordinary post's history.
 */
export function createPostEditorHistoryStorage(prefix: string): {
  save(history: PostEditorHistory): void;
  load(head: PostProject): RestoredPostEditorHistory | null;
} {
  return createHistoryStorage<PostTimingEffect>({
    plugin: tkaPlugin,
    key: (sequenceId) => `${prefix}${sequenceId}`,
    parseEffect: parsePostTimingEffect,
    volatileFields: ["timings"],
  });
}

const ordinary = createPostEditorHistoryStorage(PREFIX);

export function savePostEditorHistory(history: PostEditorHistory): void {
  ordinary.save(history);
}

/**
 * The history kept for this post, when it leads up to exactly this save.
 * Any other history for the post is stale and is cleared.
 */
export function loadPostEditorHistory(
  head: PostProject
): RestoredPostEditorHistory | null {
  return ordinary.load(head);
}
