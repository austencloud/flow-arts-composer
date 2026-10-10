import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  FEATURE_EXPORT_MAX_BYTES,
  FEATURE_EXPORT_NAME_RULE,
  isFeatureExportName,
  type SavedFeatureExport,
} from "#lib/shared/media-composition/domain/feature-video-export.js";

/**
 * Keeps a finished render in a feature video's `exports/` folder. The body
 * streams to a hidden part file, so a render never sits whole in memory, and
 * lands under a name no earlier render has: a second `check.mp4` becomes
 * `check-2.mp4`. A render that fails partway leaves nothing behind.
 */

export class FeatureExportError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 413 | 415
  ) {
    super(message);
    this.name = "FeatureExportError";
  }
}

const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

function errorCode(cause: unknown): unknown {
  return cause && typeof cause === "object" && "code" in cause
    ? (cause as { code: unknown }).code
    : undefined;
}

function sizeText(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${Number((bytes / 1024 ** 3).toFixed(1))} GB`;
  if (bytes >= 1024 ** 2) return `${Number((bytes / 1024 ** 2).toFixed(1))} MB`;
  return `${bytes} bytes`;
}

function tooLarge(cap: number): FeatureExportError {
  return new FeatureExportError(
    `A render can be at most ${sizeText(cap)}.`,
    413
  );
}

/** Streams the body into `file`; returns its size and its first 8 bytes. */
async function writePart(
  file: string,
  body: ReadableStream<Uint8Array>,
  cap: number
): Promise<{ bytes: number; head: Buffer }> {
  const handle = await fs.open(file, "wx");
  const reader = body.getReader();
  const head = Buffer.alloc(8);
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (bytes + value.byteLength > cap) {
        void reader.cancel().catch(() => undefined);
        throw tooLarge(cap);
      }
      if (bytes < head.length)
        head.set(value.subarray(0, head.length - bytes), bytes);
      let written = 0;
      while (written < value.byteLength) {
        const { bytesWritten } = await handle.write(
          value,
          written,
          value.byteLength - written
        );
        written += bytesWritten;
      }
      bytes += value.byteLength;
    }
  } finally {
    await handle.close();
  }
  return { bytes, head };
}

/**
 * Claims `name` in `dir` by creating it empty, or `<stem>-2.mp4` and so on
 * when an earlier render has it. Returns the path it claimed.
 */
async function claimName(dir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 1; n <= 999; n += 1) {
    const candidate = path.join(dir, n === 1 ? name : `${stem}-${n}${ext}`);
    try {
      await (await fs.open(candidate, "wx")).close();
      return candidate;
    } catch (cause) {
      if (errorCode(cause) !== "EEXIST") throw cause;
    }
  }
  throw new FeatureExportError(
    `exports/ has no free name left for ${name}.`,
    409
  );
}

/** Windows refuses a rename while a scanner or indexer holds the file. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (cause) {
      if (attempt >= 3 || !RETRY_CODES.has(String(errorCode(cause))))
        throw cause;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

const removeQuietly = (file: string) =>
  fs
    .rm(file, { force: true, recursive: true, maxRetries: 5, retryDelay: 50 })
    .catch(() => undefined);

/**
 * Streams a render into `<projectDir>/exports/<name>`, numbering the name
 * when an earlier render has it.
 */
export async function saveFeatureExport(
  projectDir: string,
  input: {
    name: string;
    body: ReadableStream<Uint8Array>;
    /** The size the sender declared, when it declared one. */
    declaredBytes?: number;
    /** Tests lower this; the route keeps the default. */
    maxBytes?: number;
  }
): Promise<SavedFeatureExport> {
  const cap = input.maxBytes ?? FEATURE_EXPORT_MAX_BYTES;
  if (!isFeatureExportName(input.name))
    throw new FeatureExportError(FEATURE_EXPORT_NAME_RULE, 400);
  if (input.declaredBytes !== undefined && input.declaredBytes > cap)
    throw tooLarge(cap);
  try {
    await fs.access(path.join(projectDir, "project.json"));
  } catch {
    throw new FeatureExportError(
      "This feature video has no project file.",
      404
    );
  }
  const dir = path.join(projectDir, "exports");
  await fs.mkdir(dir, { recursive: true });
  const part = path.join(dir, `.${randomUUID()}.part`);
  let claimed: string | null = null;
  try {
    const { bytes, head } = await writePart(part, input.body, cap);
    if (bytes === 0) throw new FeatureExportError("The render was empty.", 400);
    // Over HTTP/2 a sender that stops partway ends the body as if it were
    // whole; only the declared size shows that the rest never came.
    if (input.declaredBytes !== undefined && bytes < input.declaredBytes)
      throw new FeatureExportError(
        "The upload stopped before the whole render arrived.",
        400
      );
    // An MP4 opens with a box whose type, in bytes 4 to 8, is "ftyp".
    if (head.toString("latin1", 4, 8) !== "ftyp")
      throw new FeatureExportError("That is not an MP4 file.", 415);
    claimed = await claimName(dir, input.name);
    await renameWithRetry(part, claimed);
    return { file: `exports/${path.basename(claimed)}`, path: claimed, bytes };
  } catch (cause) {
    await removeQuietly(part);
    if (claimed) await removeQuietly(claimed);
    throw cause;
  }
}
