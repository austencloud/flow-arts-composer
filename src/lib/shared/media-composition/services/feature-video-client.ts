import {
  FEATURE_VIDEO_API,
  FeatureVideoFileSchema,
  type FeatureVideoFile,
  type FeatureVideoSummary,
} from "#lib/shared/media-composition/domain/feature-video.js";
import {
  featureVideoExportUrl,
  isSavedFeatureExport,
  type SavedFeatureExport,
} from "#lib/shared/media-composition/domain/feature-video-export.js";
import {
  PostProjectSchema,
  createEmptyPostProject,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import {
  createTakeTiming,
  type TakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";
import { createPostEditorHistoryStorage } from "#lib/shared/media-composition/services/post-editor-history-store.js";
import type { PostEditorStore } from "#lib/shared/media-composition/services/post-editor-store.js";
import { deepEqual } from "#lib/shared/sequence-viewer/services/viewer-url-state-codec.js";

/**
 * The Post page's side of a feature video: list and load them from the dev
 * server, and keep the open one in step with its folder on disk.
 *
 * Nothing here reads or writes the ordinary post for the same sequence. The
 * editor saves through `store`, whose tab copy and undo history live under
 * `tka:feature-video:v1:<slug>:`, apart from every `tka:post-studio:` key.
 */

type Fetcher = typeof fetch;

const BUFFER_PREFIX = "tka:feature-video:v1:";
const CONFLICT_MESSAGE =
  "This project changed on disk. The newer copy loads in a moment; Undo brings back yours.";

/** The answer's JSON body, or an empty one when it has none. */
async function answer(response: Response): Promise<Record<string, unknown>> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // An empty or broken answer is reported by its status.
  }
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = await answer(response);
  if (!response.ok)
    throw new Error(
      typeof body.message === "string"
        ? body.message
        : `The dev server answered ${response.status}.`
    );
  return body;
}

/** The feature videos on this computer, newest first, and any unreadable ones. */
export async function listFeatureVideos(fetcher: Fetcher = fetch): Promise<{
  projects: FeatureVideoSummary[];
  unreadable: string[];
}> {
  const body = await readJson(await fetcher(FEATURE_VIDEO_API));
  if (!Array.isArray(body.projects) || !Array.isArray(body.unreadable))
    throw new Error(
      "The dev server sent an unreadable list of feature videos."
    );
  return {
    projects: body.projects as FeatureVideoSummary[],
    unreadable: body.unreadable.filter(
      (name): name is string => typeof name === "string"
    ),
  };
}

/** One feature video, read whole from its folder. */
export async function loadFeatureVideo(
  slug: string,
  fetcher: Fetcher = fetch
): Promise<FeatureVideoFile> {
  const body = await readJson(
    await fetcher(`${FEATURE_VIDEO_API}/${encodeURIComponent(slug)}`)
  );
  const parsed = FeatureVideoFileSchema.safeParse(body.file);
  if (!parsed.success)
    throw new Error(`The dev server sent an unreadable copy of ${slug}.`);
  return parsed.data;
}

/** Makes a separate feature video with its own copied media folder. */
export async function duplicateSoftwareFeatureVideo(
  slug: string,
  title: string,
  fetcher: Fetcher = fetch
): Promise<string> {
  if (!import.meta.env.DEV)
    throw new Error("Feature video copies are available on the dev server.");
  const name = title.trim();
  if (!name || name.length > 120)
    throw new Error("Name the copy in 1 to 120 characters.");
  const stem =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "showcase";
  const copySlug = `${stem}-${crypto.randomUUID().slice(0, 8)}`;
  const body = await readJson(
    await fetcher(
      `${FEATURE_VIDEO_API}/${encodeURIComponent(slug)}/duplicate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: copySlug,
          title: name,
          shareMedia: false,
        }),
      }
    )
  );
  const parsed = FeatureVideoFileSchema.safeParse(body.file);
  if (!parsed.success || parsed.data.slug !== copySlug)
    throw new Error("The dev server sent an unreadable feature video copy.");
  return copySlug;
}

/**
 * Sends a finished render to the project's exports/ folder. `name` picks its
 * file name; the dev server numbers it when an earlier render has that name.
 * Aborting `signal` stops the upload.
 */
export async function saveFeatureVideoExport(
  slug: string,
  video: Blob,
  options: { name?: string; fetcher?: Fetcher; signal?: AbortSignal } = {}
): Promise<SavedFeatureExport> {
  const fetcher = options.fetcher ?? fetch;
  const url = featureVideoExportUrl(slug, options.name);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: video,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    throw new Error(
      options.signal?.aborted
        ? "The save was cancelled."
        : "The dev server could not be reached."
    );
  }
  const body = await readJson(response);
  if (!isSavedFeatureExport(body))
    throw new Error(
      "The dev server sent an unreadable answer about the export."
    );
  return { file: body.file, path: body.path, bytes: body.bytes };
}

interface Buffered {
  /** The revision on disk when this copy was kept. */
  baseRevision: number;
  project: PostProject;
  /** True while disk does not have this copy yet. */
  dirty: boolean;
}

function tabStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readBuffer(key: string, sequenceId: string): Buffered | null {
  try {
    const raw = tabStorage()?.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Record<keyof Buffered, unknown>>;
    const project = PostProjectSchema.safeParse(value.project);
    if (
      typeof value.baseRevision !== "number" ||
      typeof value.dirty !== "boolean" ||
      !project.success ||
      project.data.sequenceId !== sequenceId
    )
      return null;
    return {
      baseRevision: value.baseRevision,
      project: project.data,
      dirty: value.dirty,
    };
  } catch {
    return null;
  }
}

function writeBuffer(key: string, value: Buffered): void {
  try {
    tabStorage()?.setItem(key, JSON.stringify(value));
  } catch {
    // A full tab loses only the copy that bridges a reload; disk saves go on.
  }
}

/** A post as saved, apart from when it was saved and an empty timing list. */
function comparable(project: PostProject): PostProject {
  return {
    ...project,
    updatedAt: 0,
    timings:
      project.timings && Object.keys(project.timings).length > 0
        ? project.timings
        : undefined,
  };
}

function sameProject(a: PostProject, b: PostProject): boolean {
  return deepEqual(comparable(a), comparable(b));
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What the sync needs from the open editor; the Post editor state has both. */
export interface FeatureVideoEditor {
  readonly snapshot: PostProject;
  adoptSaved(next: PostProject, options?: { evenIfOlder?: boolean }): boolean;
}

/**
 * Keeps one open feature video in step with its folder.
 *
 * The editor saves through `store`, which keeps a copy in this tab so a
 * reload before the disk save lands loses nothing. `save` writes the post to
 * disk with the revision it started from. When the file has moved on, through
 * another editor, the CLI or a hand edit, disk wins: the newer copy loads as
 * an undo step, so the editor's own version is one Undo away.
 */
export function createFeatureVideoSync(
  file: FeatureVideoFile,
  options: { fetcher?: Fetcher; settleMs?: number } = {}
) {
  const fetcher = options.fetcher ?? fetch;
  const settleMs = options.settleMs ?? 600;
  const slug = file.slug;
  const url = `${FEATURE_VIDEO_API}/${encodeURIComponent(slug)}`;
  const bufferKey = `${BUFFER_PREFIX}${slug}:project`;
  const history = createPostEditorHistoryStorage(
    `${BUFFER_PREFIX}${slug}:history:`
  );
  const timings = new Map<string, TakeTiming>();
  const timingKey = (sequenceId: string, takeKey: string) =>
    `${sequenceId}\n${takeKey}`;

  /** The revision on disk as this tab last saw it, and its post. */
  let known = file.revision;
  let knownProject = file.project;
  /** The newest copy the editor kept; disk may not have it yet. */
  let latest: PostProject | null = null;
  /** Counts disk copies that replaced the editor's post. */
  let adoptions = 0;
  let editor: FeatureVideoEditor | null = null;
  let onLoaded: (() => void) | null = null;
  let checking = false;
  let chain: Promise<unknown> = Promise.resolve();

  // A copy this tab kept but never saved comes back with the revision it
  // started from. When disk moved on since, the first save or heartbeat
  // loads disk's copy over it as an undo step, as for any other conflict.
  const buffered = readBuffer(bufferKey, file.project.sequenceId);
  if (buffered?.dirty) {
    latest = buffered.project;
    known = buffered.baseRevision;
  }

  function keepBuffer(): void {
    const project = latest ?? knownProject;
    writeBuffer(bufferKey, {
      baseRevision: known,
      project,
      dirty: !sameProject(project, knownProject),
    });
  }

  /** Saves and disk checks run one at a time, in the order they came. */
  function inTurn<T>(run: () => Promise<T>): Promise<T> {
    const result = chain.then(run);
    chain = result.catch(() => undefined);
    return result;
  }

  const store: PostEditorStore = {
    // The editor opens initialProject; this answers only a post for another
    // sequence, which a feature video never holds.
    openProject: (sequenceId, now) =>
      createEmptyPostProject({ sequenceId, now }),
    saveProject(project) {
      latest = project;
      keepBuffer();
      // The disk save is what keeps the post; this copy only bridges a
      // reload before it lands.
      return { ok: true };
    },
    backupBeforeImport() {
      // Every earlier save is already kept in the folder's history/.
    },
    // Timings reach disk inside the post: every save embeds them.
    loadTiming: (sequenceId, takeKey) =>
      timings.get(timingKey(sequenceId, takeKey)) ?? null,
    saveTiming(timing) {
      timings.set(timingKey(timing.sequenceId, timing.takeKey), timing);
      return { ok: true };
    },
    openTiming: (input) =>
      timings.get(timingKey(input.sequenceId, input.takeKey)) ??
      createTakeTiming({
        sequenceId: input.sequenceId,
        takeKey: input.takeKey,
        durationSeconds: input.durationSeconds,
        now: input.now,
      }),
    loadHistory: (head) => history.load(head),
    saveHistory: (entry) => history.save(entry),
  };

  /**
   * Loads a newer revision from disk into the editor as one undo step. The
   * heartbeat calls this with the revision it saw, and a refused save with
   * the revision the server named. While the editor is mid-drag or in the
   * crop screen it refuses, and the next heartbeat asks again.
   */
  function checkRevision(revision: number): Promise<void> {
    if (revision === known || checking || !editor) return Promise.resolve();
    checking = true;
    return inTurn(async () => {
      try {
        if (revision === known || !editor) return;
        const next = await loadFeatureVideo(slug, fetcher);
        if (next.revision === known || !editor) return;
        if (!sameProject(next.project, editor.snapshot)) {
          if (!editor.adoptSaved(next.project, { evenIfOlder: true })) return;
          adoptions += 1;
          onLoaded?.();
        }
        known = next.revision;
        knownProject = next.project;
        latest = null;
        keepBuffer();
      } catch {
        // Unreachable or unreadable for now; the next heartbeat asks again.
      } finally {
        checking = false;
      }
    });
  }

  /**
   * Writes the post to disk. The editor's autosave sends one copy at a time
   * and keeps only the newest waiting, so a slider drag saves about once per
   * settle. Resolves to null, onSaveDraft's "nothing newer to adopt"; throws
   * the message the save banner shows.
   */
  function save(project: PostProject): Promise<null> {
    const seen = adoptions;
    return inTurn(async () => {
      await wait(settleMs);
      // Only the newest copy the editor kept goes to disk. A copy made
      // before a newer disk copy loaded is one Undo away, even one the
      // autosave was still holding: that load clears `latest`. Opening a
      // post keeps no copy, so it writes nothing.
      if (
        adoptions !== seen ||
        latest === null ||
        !sameProject(project, latest) ||
        sameProject(project, knownProject)
      )
        return null;
      let response: Response;
      try {
        response = await fetcher(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseRevision: known, project }),
        });
      } catch {
        throw new Error(
          `The dev server could not be reached to save ${slug}. This tab keeps your edits until it can.`
        );
      }
      const body = await answer(response);
      if (response.status === 409) {
        void checkRevision(
          typeof body.revision === "number" ? body.revision : known + 1
        );
        throw new Error(CONFLICT_MESSAGE);
      }
      if (!response.ok || typeof body.revision !== "number")
        throw new Error(
          typeof body.message === "string"
            ? body.message
            : `The dev server could not save ${slug} (${response.status}).`
        );
      known = body.revision;
      knownProject = project;
      keepBuffer();
      return null;
    });
  }

  return {
    slug,
    title: file.title,
    /** What the editor opens: this tab's newest copy, else disk's. */
    get initialProject(): PostProject {
      return latest ?? knownProject;
    },
    store,
    save,
    checkRevision,
    /**
     * Sends a finished render to this project's exports/ folder; aborting
     * `signal` stops the upload.
     */
    saveExport: (video: Blob, name?: string, signal?: AbortSignal) =>
      saveFeatureVideoExport(slug, video, {
        ...(name ? { name } : {}),
        fetcher,
        ...(signal ? { signal } : {}),
      }),
    /**
     * Binds the open editor and what to do when disk's copy replaces its
     * post. Returns the unbind.
     */
    connect(next: FeatureVideoEditor, loaded: () => void): () => void {
      editor = next;
      onLoaded = loaded;
      return () => {
        if (editor !== next) return;
        editor = null;
        onLoaded = null;
      };
    },
    /** The revision on disk as this tab last saw it. */
    get revision(): number {
      return known;
    },
  };
}

export type FeatureVideoSync = ReturnType<typeof createFeatureVideoSync>;
