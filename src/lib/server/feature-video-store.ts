import { error } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { fingerprint } from "$lib/server/post-project-dev-bridge";
import {
  FEATURE_VIDEO_FILE_FORMAT,
  FEATURE_VIDEO_HISTORY_LIMIT,
  FEATURE_VIDEO_MAX_FILE_BYTES,
  FEATURE_VIDEO_MEDIA_FOLDERS,
  FeatureVideoFileSchema,
  isFeatureVideoSlug,
  rehomeFeatureMediaUrls,
  type FeatureVideoFile,
  type FeatureVideoSummary,
} from "$lib/shared/media-composition/domain/feature-video";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "$lib/shared/media-composition/domain/post-project-ops";
import {
  POST_CANVAS_RATIOS,
  POST_DEFAULT_CANVAS,
  PostProjectSchema,
  createEmptyPostProject,
  type PostCanvasRatio,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";

/**
 * Feature videos on disk: one folder per project under a root folder,
 * E:/tka-platform-media/feature-videos unless TKA_FEATURE_VIDEO_ROOT names
 * another. Only dev routes use this, and only for this computer.
 *
 * Each save names the revision it started from. When the file has moved on
 * since, through another editor, the CLI or a hand edit, the save is refused
 * with the newer revision, so nothing on disk is overwritten unseen. Each
 * save first copies the file it replaces into history/.
 */

export type FeatureVideoStatus = 400 | 404 | 409 | 413 | 422 | 500;

export class FeatureVideoError extends Error {
  constructor(
    message: string,
    readonly status: FeatureVideoStatus,
    /** On a 409, the revision now on disk. */
    readonly revision?: number
  ) {
    super(message);
    this.name = "FeatureVideoError";
  }
}

export interface FeatureVideoSaved {
  revision: number;
  savedAt: number;
  fingerprint: string;
}

const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

/** A lock this old was left by a save that stopped partway. */
const LOCK_STALE_MS = 10_000;
/** Longer than LOCK_STALE_MS, so a waiting save clears a lock left behind. */
const LOCK_WAIT_MS = 15_000;
const LOCK_RETRY_MS = 20;

function code(cause: unknown): string | undefined {
  return cause && typeof cause === "object" && "code" in cause
    ? String((cause as { code: unknown }).code)
    : undefined;
}

/** Windows refuses a rename while a scanner or indexer holds the file. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (cause) {
      if (attempt >= 3 || !RETRY_CODES.has(code(cause) ?? "")) throw cause;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/** Two posts that differ at most in when they were saved. */
export function sameContent(a: PostProject, b: PostProject): boolean {
  return (
    JSON.stringify({ ...a, updatedAt: 0 }) ===
    JSON.stringify({ ...b, updatedAt: 0 })
  );
}

/**
 * A feature video plays only files in its folder. A video picked on this
 * device plays only in the browser that picked it, so a post holding one is
 * refused with the command that copies the file in.
 */
function refuseDeviceVideos(slug: string, project: PostProject): void {
  if (project.takes.some((take) => take.ref.kind === "local"))
    throw new FeatureVideoError(
      `${slug} plays only videos in its folder, and this post has one picked on this device. Remove that take, then add the file with: node scripts/post-project.mjs add-take <file> --feature ${slug}`,
      422
    );
}

export function createFeatureVideoStore(
  root: string,
  options: { historyLimit?: number } = {}
) {
  const historyLimit = options.historyLimit ?? FEATURE_VIDEO_HISTORY_LIMIT;
  const chains = new Map<string, Promise<unknown>>();
  const revisions = new Map<string, { signature: string; revision: number }>();

  function folder(slug: string): string {
    if (!isFeatureVideoSlug(slug))
      throw new FeatureVideoError(
        `"${slug}" is not a feature video name. Use lowercase letters, digits and dashes.`,
        400
      );
    return path.join(root, slug);
  }

  /** One change at a time per project, in the order they arrived. */
  function serialize<T>(slug: string, run: () => Promise<T>): Promise<T> {
    const result = (chains.get(slug) ?? Promise.resolve()).then(run);
    const settled = result.then(
      () => undefined,
      () => undefined
    );
    chains.set(slug, settled);
    void settled.then(() => {
      if (chains.get(slug) === settled) chains.delete(slug);
    });
    return result;
  }

  /**
   * Two dev servers on one root, such as the primary checkout's and a
   * worktree's, each keep their own order. A lock file in the project's
   * folder makes a save's read, revision check and write one step across
   * both.
   */
  async function locked<T>(slug: string, run: () => Promise<T>): Promise<T> {
    const lock = path.join(folder(slug), ".lock");
    const started = Date.now();
    for (;;) {
      try {
        await (await fs.open(lock, "wx")).close();
        break;
      } catch (cause) {
        const reason = code(cause) ?? "";
        if (reason === "ENOENT")
          throw new FeatureVideoError(`No feature video named ${slug}.`, 404);
        // Windows answers EPERM while another save is removing its lock.
        if (reason !== "EEXIST" && !RETRY_CODES.has(reason)) throw cause;
      }
      const held = await fs.stat(lock).catch(() => null);
      if (held && Date.now() - held.mtimeMs > LOCK_STALE_MS)
        await fs.rm(lock, { force: true }).catch(() => undefined);
      if (Date.now() - started > LOCK_WAIT_MS)
        throw new FeatureVideoError(
          `${slug} is busy: another dev server is saving it. Try the edit again.`,
          500
        );
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
    try {
      return await run();
    } finally {
      // A lock that will not go now turns stale, and the next save clears it.
      await fs.rm(lock, { force: true }).catch(() => undefined);
    }
  }

  async function readFile(slug: string): Promise<FeatureVideoFile> {
    let text: string;
    try {
      text = await fs.readFile(path.join(folder(slug), "project.json"), "utf8");
    } catch (cause) {
      if (code(cause) === "ENOENT")
        throw new FeatureVideoError(`No feature video named ${slug}.`, 404);
      throw cause;
    }
    const unreadable = new FeatureVideoError(
      `${slug}/project.json is unreadable. Restore it from history/ (the newest file there is the last good save).`,
      422
    );
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw unreadable;
    }
    const parsed = FeatureVideoFileSchema.safeParse(value);
    if (!parsed.success || parsed.data.slug !== slug) throw unreadable;
    return parsed.data;
  }

  async function writeFile(
    slug: string,
    file: FeatureVideoFile
  ): Promise<void> {
    const text = `${JSON.stringify(file, null, 2)}\n`;
    if (Buffer.byteLength(text) > FEATURE_VIDEO_MAX_FILE_BYTES)
      throw new FeatureVideoError(
        `${slug} is too large to save (over 12 MB).`,
        413
      );
    const dir = folder(slug);
    const target = path.join(dir, "project.json");
    const temp = path.join(dir, `.project.${process.pid}.${randomUUID()}.tmp`);
    await fs.writeFile(temp, text, { flag: "wx" });
    try {
      await renameWithRetry(temp, target);
    } catch (cause) {
      await fs.rm(temp, { force: true });
      throw cause;
    }
    if ((await fs.readFile(target, "utf8")) !== text)
      throw new FeatureVideoError(
        `${slug}/project.json did not save as written. Try the edit again.`,
        500
      );
  }

  /** Copies the current file into history/ and keeps the newest saves. */
  async function archive(slug: string, revision: number): Promise<void> {
    const history = path.join(folder(slug), "history");
    await fs.mkdir(history, { recursive: true });
    try {
      await fs.copyFile(
        path.join(folder(slug), "project.json"),
        path.join(history, `r${String(revision).padStart(6, "0")}.json`),
        fsConstants.COPYFILE_EXCL
      );
    } catch (cause) {
      if (code(cause) !== "EEXIST") throw cause;
    }
    const saves = (await fs.readdir(history))
      .filter((name) => /^r\d+\.json$/.test(name))
      .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)));
    for (const name of saves.slice(0, Math.max(0, saves.length - historyLimit)))
      await fs.rm(path.join(history, name), { force: true });
  }

  async function commit(
    slug: string,
    current: FeatureVideoFile,
    project: PostProject,
    now: number
  ): Promise<FeatureVideoSaved> {
    await archive(slug, current.revision);
    const next: FeatureVideoFile = {
      ...current,
      revision: current.revision + 1,
      savedAt: now,
      project,
    };
    await writeFile(slug, next);
    return {
      revision: next.revision,
      savedAt: next.savedAt,
      fingerprint: fingerprint(project),
    };
  }

  async function create(
    input: { slug: string; title: string; sequenceId: string; canvas?: string },
    now = Date.now()
  ): Promise<{ file: FeatureVideoFile; folder: string }> {
    const dir = folder(input.slug);
    if (
      input.canvas !== undefined &&
      !(POST_CANVAS_RATIOS as readonly string[]).includes(input.canvas)
    )
      throw new FeatureVideoError(
        `canvas must be one of ${POST_CANVAS_RATIOS.join(", ")}.`,
        400
      );
    const empty = createEmptyPostProject({ sequenceId: input.sequenceId, now });
    const canvas = input.canvas as PostCanvasRatio | undefined;
    const project =
      canvas && canvas !== POST_DEFAULT_CANVAS ? { ...empty, canvas } : empty;
    const parsed = FeatureVideoFileSchema.safeParse({
      format: FEATURE_VIDEO_FILE_FORMAT,
      slug: input.slug,
      title: input.title,
      revision: 1,
      savedAt: now,
      project,
    });
    if (!parsed.success)
      throw new FeatureVideoError(
        "A feature video needs a title of 1 to 120 characters and a sequence id.",
        400
      );
    const file = parsed.data;
    return serialize(input.slug, async () => {
      await fs.mkdir(root, { recursive: true });
      try {
        await fs.mkdir(dir);
      } catch (cause) {
        if (code(cause) === "EEXIST")
          throw new FeatureVideoError(
            `A feature video named ${input.slug} already exists.`,
            409
          );
        throw cause;
      }
      for (const sub of [
        "history",
        "captures",
        "exports",
        ...FEATURE_VIDEO_MEDIA_FOLDERS.map((name) => path.join("media", name)),
      ])
        await fs.mkdir(path.join(dir, sub), { recursive: true });
      await writeFile(input.slug, file);
      return { file, folder: dir };
    });
  }

  async function read(
    slug: string
  ): Promise<{ file: FeatureVideoFile; fingerprint: string; folder: string }> {
    const file = await readFile(slug);
    return {
      file,
      fingerprint: fingerprint(file.project),
      folder: folder(slug),
    };
  }

  function write(
    slug: string,
    input: { baseRevision: number; project: unknown },
    now = Date.now()
  ): Promise<FeatureVideoSaved> {
    return serialize(slug, () =>
      locked(slug, async () => {
        const current = await readFile(slug);
        if (input.baseRevision !== current.revision)
          throw new FeatureVideoError(
            `${slug} changed on disk (now revision ${current.revision}). Load it again before saving.`,
            409,
            current.revision
          );
        const parsed = PostProjectSchema.safeParse(input.project);
        if (!parsed.success)
          throw new FeatureVideoError("That is not a valid Post project.", 422);
        if (parsed.data.sequenceId !== current.project.sequenceId)
          throw new FeatureVideoError(
            "A feature video keeps its sequence.",
            422
          );
        refuseDeviceVideos(slug, parsed.data);
        return commit(slug, current, parsed.data, now);
      })
    );
  }

  /** The revision on disk, or null when the project is missing or unreadable. */
  async function revision(slug: string): Promise<number | null> {
    const file = path.join(folder(slug), "project.json");
    let signature: string;
    try {
      const stat = await fs.stat(file);
      signature = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    } catch {
      revisions.delete(slug);
      return null;
    }
    const cached = revisions.get(slug);
    if (cached?.signature === signature) return cached.revision;
    try {
      const current = await readFile(slug);
      revisions.set(slug, { signature, revision: current.revision });
      return current.revision;
    } catch {
      revisions.delete(slug);
      return null;
    }
  }

  async function list(): Promise<{
    projects: FeatureVideoSummary[];
    unreadable: string[];
  }> {
    let names: string[];
    try {
      names = await fs.readdir(root);
    } catch (cause) {
      if (code(cause) === "ENOENT") return { projects: [], unreadable: [] };
      throw cause;
    }
    const projects: FeatureVideoSummary[] = [];
    const unreadable: string[] = [];
    for (const name of names.filter(isFeatureVideoSlug).sort()) {
      try {
        const file = await readFile(name);
        projects.push({
          slug: file.slug,
          title: file.title,
          revision: file.revision,
          savedAt: file.savedAt,
          sequenceId: file.project.sequenceId,
        });
      } catch (cause) {
        if (cause instanceof FeatureVideoError && cause.status === 422)
          unreadable.push(name);
      }
    }
    projects.sort(
      (a, b) => b.savedAt - a.savedAt || a.slug.localeCompare(b.slug)
    );
    return { projects, unreadable };
  }

  /**
   * Named edits applied to the file on disk, for when no editor has the
   * project open. The batch is one revision; edits that change nothing
   * write nothing.
   */
  function applyOps(
    slug: string,
    ops: unknown,
    now = Date.now()
  ): Promise<FeatureVideoSaved & { status: "applied" | "unchanged" }> {
    return serialize(slug, () =>
      locked(slug, async () => {
        const current = await readFile(slug);
        let next: PostProject;
        try {
          next = applyPostProjectOps(current.project, ops as PostProjectOp[], {
            now,
          });
        } catch (cause) {
          throw new FeatureVideoError(
            cause instanceof Error ? cause.message : String(cause),
            400
          );
        }
        if (next === current.project || sameContent(next, current.project))
          return {
            status: "unchanged" as const,
            revision: current.revision,
            savedAt: current.savedAt,
            fingerprint: fingerprint(current.project),
          };
        const parsed = PostProjectSchema.safeParse(next);
        if (!parsed.success)
          throw new FeatureVideoError(
            "Those edits would leave the post invalid.",
            400
          );
        refuseDeviceVideos(slug, parsed.data);
        return {
          status: "applied" as const,
          ...(await commit(slug, current, parsed.data, now)),
        };
      })
    );
  }

  /**
   * Copies a project under a new name, such as a 30 s cut of the 60 s
   * promo. The copy starts at revision 1 with an empty history. It gets its
   * own copy of the media unless shareMedia is set; then it plays the
   * original's files, and the original must stay where it is. Either way it
   * gets the capture scripts, so it can record the same shots, but not their
   * frames.
   */
  async function duplicate(
    slug: string,
    input: { slug: string; title?: string; shareMedia?: boolean },
    now = Date.now()
  ): Promise<{ file: FeatureVideoFile; folder: string }> {
    const source = await readFile(slug);
    const dir = folder(input.slug);
    const project = {
      ...(input.shareMedia
        ? source.project
        : rehomeFeatureMediaUrls(source.project, slug, input.slug)),
      updatedAt: now,
    };
    const parsed = FeatureVideoFileSchema.safeParse({
      format: FEATURE_VIDEO_FILE_FORMAT,
      slug: input.slug,
      title: (input.title ?? `${source.title} (copy)`).slice(0, 120),
      revision: 1,
      savedAt: now,
      project,
    });
    if (!parsed.success)
      throw new FeatureVideoError(
        "The copy needs a title of 1 to 120 characters.",
        400
      );
    const file = parsed.data;
    return serialize(input.slug, async () => {
      await fs.mkdir(root, { recursive: true });
      try {
        await fs.mkdir(dir);
      } catch (cause) {
        if (code(cause) === "EEXIST")
          throw new FeatureVideoError(
            `A feature video named ${input.slug} already exists.`,
            409
          );
        throw cause;
      }
      for (const sub of ["history", "captures", "exports"])
        await fs.mkdir(path.join(dir, sub), { recursive: true });
      const captures = path.join(folder(slug), "captures");
      const scripts = await fs
        .readdir(captures, { withFileTypes: true })
        .catch((cause: unknown) => {
          if (code(cause) !== "ENOENT") throw cause;
          return [];
        });
      for (const entry of scripts)
        if (entry.isFile() && entry.name.endsWith(".capture.mjs"))
          await fs.copyFile(
            path.join(captures, entry.name),
            path.join(dir, "captures", entry.name)
          );
      if (!input.shareMedia)
        await fs
          .cp(path.join(folder(slug), "media"), path.join(dir, "media"), {
            recursive: true,
          })
          .catch((cause: unknown) => {
            if (code(cause) !== "ENOENT") throw cause;
          });
      for (const name of FEATURE_VIDEO_MEDIA_FOLDERS)
        await fs.mkdir(path.join(dir, "media", name), { recursive: true });
      await writeFile(input.slug, file);
      return { file, folder: dir };
    });
  }

  return {
    root,
    folder,
    create,
    read,
    write,
    revision,
    list,
    applyOps,
    duplicate,
  };
}

export type FeatureVideoStore = ReturnType<typeof createFeatureVideoStore>;

const DEFAULT_ROOT = "E:/tka-platform-media/feature-videos";
const stores = new Map<string, FeatureVideoStore>();

/** Where feature videos live; TKA_FEATURE_VIDEO_ROOT moves them. */
export function featureVideoRoot(): string {
  return process.env.TKA_FEATURE_VIDEO_ROOT || DEFAULT_ROOT;
}

/** The store for the current root, one per root so saves stay in order. */
export function featureVideos(): FeatureVideoStore {
  const root = path.resolve(featureVideoRoot());
  let store = stores.get(root);
  if (!store) {
    store = createFeatureVideoStore(root);
    stores.set(root, store);
  }
  return store;
}

/** Turns a store refusal into the route's HTTP error. */
export function featureVideoFailure(cause: unknown): never {
  if (cause instanceof FeatureVideoError) error(cause.status, cause.message);
  throw cause;
}
