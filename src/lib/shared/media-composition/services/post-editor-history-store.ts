import {
  PostProjectSchema,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import { normalizeProject } from "#lib/shared/media-composition/domain/post-project-normalize.js";
import {
  TakeTimingSchema,
  type TakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";
import { deepEqual } from "#lib/shared/sequence-viewer/services/viewer-url-state-codec.js";

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
const FORMAT_VERSION = 1;
/** How many steps back, and forward, survive a reload. */
const PERSISTED_DEPTH = 50;
/** Most one post's history may take, in characters; the oldest steps go first. */
const CHARACTER_BUDGET = 1_500_000;

/** Timing an edit changed along with the post; undoing it puts the timing back. */
export interface PostTimingEffect {
  takeId: string;
  before: TakeTiming;
  after: TakeTiming;
}

export interface PostHistoryEntry {
  project: PostProject;
  effect?: PostTimingEffect;
}

export interface PostEditorHistory {
  /** The saved post the history leads up to. */
  head: PostProject;
  headEffect?: PostTimingEffect;
  past: readonly PostHistoryEntry[];
  future: readonly PostHistoryEntry[];
}

export interface RestoredPostEditorHistory {
  headEffect?: PostTimingEffect;
  past: PostHistoryEntry[];
  future: PostHistoryEntry[];
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function storageKey(prefix: string, sequenceId: string): string {
  return `${prefix}${sequenceId}`;
}

/**
 * The post as the history saw it. Take timing is left out: the draft loader
 * rebuilds each take's timing from the newest map, so it can differ from the
 * copy carried inside the post without the post itself changing.
 */
function headContent(project: PostProject): PostProject {
  return { ...project, timings: undefined };
}

function forget(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // Blocked storage has nothing to forget.
  }
}

/**
 * Writes the history; when the tab is full, other posts' histories under
 * the same prefix go first. Histories under another prefix are left alone.
 */
function write(
  store: Storage,
  prefix: string,
  key: string,
  text: string
): void {
  try {
    store.setItem(key, text);
    return;
  } catch {
    // Full or blocked; try once more with room made below.
  }
  try {
    const others: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const other = store.key(index);
      if (other?.startsWith(prefix) && other !== key) others.push(other);
    }
    for (const other of others) store.removeItem(other);
    store.setItem(key, text);
  } catch {
    // An older history would no longer lead to the saved post.
    forget(store, key);
  }
}

function saveHistoryAt(prefix: string, history: PostEditorHistory): void {
  const store = storage();
  if (!store) return;
  const key = storageKey(prefix, history.head.sequenceId);
  try {
    const past = history.past
      .slice(-PERSISTED_DEPTH)
      .map((entry) => JSON.stringify(entry));
    const future = history.future
      .slice(-PERSISTED_DEPTH)
      .map((entry) => JSON.stringify(entry));
    const envelope = JSON.stringify({
      version: FORMAT_VERSION,
      sequenceId: history.head.sequenceId,
      headUpdatedAt: history.head.updatedAt,
      head: headContent(history.head),
      headEffect: history.headEffect ?? null,
    });
    let size =
      envelope.length +
      [...past, ...future].reduce((total, text) => total + text.length + 1, 0);
    // Past ends with the newest step and future with the next redo, so the
    // front of each list is the step furthest from what is on screen.
    while (size > CHARACTER_BUDGET && past.length > 0)
      size -= past.shift()!.length + 1;
    while (size > CHARACTER_BUDGET && future.length > 0)
      size -= future.shift()!.length + 1;
    if (past.length === 0 && future.length === 0) {
      forget(store, key);
      return;
    }
    // The steps are already JSON; splice them in rather than encode twice.
    write(
      store,
      prefix,
      key,
      `${envelope.slice(0, -1)},"past":[${past.join(",")}],"future":[${future.join(",")}]}`
    );
  } catch {
    forget(store, key);
  }
}

function parseEffect(value: unknown): PostTimingEffect | null {
  if (!value || typeof value !== "object") return null;
  const { takeId, before, after } = value as Record<string, unknown>;
  const parsedBefore = TakeTimingSchema.safeParse(before);
  const parsedAfter = TakeTimingSchema.safeParse(after);
  return typeof takeId === "string" &&
    parsedBefore.success &&
    parsedAfter.success
    ? { takeId, before: parsedBefore.data, after: parsedAfter.data }
    : null;
}

function parseEntry(
  value: unknown,
  sequenceId: string
): PostHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const { project, effect } = value as Record<string, unknown>;
  const parsed = PostProjectSchema.safeParse(project);
  if (!parsed.success || parsed.data.sequenceId !== sequenceId) return null;
  const entry: PostHistoryEntry = { project: normalizeProject(parsed.data) };
  if (effect === undefined || effect === null) return entry;
  const parsedEffect = parseEffect(effect);
  return parsedEffect ? { ...entry, effect: parsedEffect } : null;
}

function parseHistory(
  value: unknown,
  head: PostProject
): RestoredPostEditorHistory | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Record<string, unknown>;
  if (
    saved.version !== FORMAT_VERSION ||
    saved.sequenceId !== head.sequenceId ||
    saved.headUpdatedAt !== head.updatedAt ||
    !Array.isArray(saved.past) ||
    !Array.isArray(saved.future)
  )
    return null;
  const savedHead = PostProjectSchema.safeParse(saved.head);
  if (
    !savedHead.success ||
    !deepEqual(headContent(savedHead.data), headContent(head))
  )
    return null;
  let headEffect: PostTimingEffect | undefined;
  if (saved.headEffect !== null && saved.headEffect !== undefined) {
    const parsed = parseEffect(saved.headEffect);
    if (!parsed) return null;
    headEffect = parsed;
  }
  // One unreadable step would make Undo skip a state, so it voids the lot.
  const past: PostHistoryEntry[] = [];
  for (const entry of saved.past) {
    const parsed = parseEntry(entry, head.sequenceId);
    if (!parsed) return null;
    past.push(parsed);
  }
  const future: PostHistoryEntry[] = [];
  for (const entry of saved.future) {
    const parsed = parseEntry(entry, head.sequenceId);
    if (!parsed) return null;
    future.push(parsed);
  }
  return { ...(headEffect ? { headEffect } : {}), past, future };
}

function loadHistoryAt(
  prefix: string,
  head: PostProject
): RestoredPostEditorHistory | null {
  const store = storage();
  if (!store) return null;
  const key = storageKey(prefix, head.sequenceId);
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const restored = parseHistory(JSON.parse(raw) as unknown, head);
    if (!restored) forget(store, key);
    return restored;
  } catch {
    forget(store, key);
    return null;
  }
}

export function savePostEditorHistory(history: PostEditorHistory): void {
  saveHistoryAt(PREFIX, history);
}

/**
 * The history kept for this post, when it leads up to exactly this save.
 * Any other history for the post is stale and is cleared.
 */
export function loadPostEditorHistory(
  head: PostProject
): RestoredPostEditorHistory | null {
  return loadHistoryAt(PREFIX, head);
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
  return {
    save: (history) => saveHistoryAt(prefix, history),
    load: (head) => loadHistoryAt(prefix, head),
  };
}
