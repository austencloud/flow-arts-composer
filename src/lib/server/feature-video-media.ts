import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { FEATURE_VIDEO_MEDIA_TYPES } from "#lib/shared/media-composition/domain/feature-video.js";

/**
 * Serves the files in a feature video's media folder to the editor's video
 * and audio elements. Browsers fetch video in byte ranges to seek, so a
 * range request gets only those bytes. Nothing outside the media folder is
 * served, whether the path tries `..`, a drive letter, an encoded path or a
 * link inside the folder.
 */

export class FeatureMediaError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 415
  ) {
    super(message);
    this.name = "FeatureMediaError";
  }
}

export interface FeatureMediaFile {
  file: string;
  size: number;
  contentType: string;
}

export interface ByteRange {
  start: number;
  end: number;
}

/**
 * The bytes a Range header asks for. Null means send the whole file: no
 * header, a kind this route does not serve (several ranges), or a range that
 * makes no sense. "unsatisfiable" means the range starts past the end.
 */
export function parseByteRange(
  header: string | null,
  size: number
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return null;
  if (from === "") {
    const length = Number(to);
    if (length === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return "unsatisfiable";
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  return end < start ? null : { start, end };
}

const BAD_PATH = /[\\%:\0]/;

/** The file a media path names, once it is known to sit inside media/. */
export async function resolveFeatureMediaFile(
  projectDir: string,
  relativePath: string
): Promise<FeatureMediaFile> {
  const segments = relativePath.split("/");
  if (
    !relativePath ||
    BAD_PATH.test(relativePath) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new FeatureMediaError("Bad media path.", 400);
  const contentType =
    FEATURE_VIDEO_MEDIA_TYPES[path.extname(relativePath).toLowerCase()];
  if (!contentType)
    throw new FeatureMediaError("That kind of file is not served.", 415);
  let root: string;
  let file: string;
  try {
    root = await fs.realpath(path.join(projectDir, "media"));
    file = await fs.realpath(path.join(root, ...segments));
  } catch {
    throw new FeatureMediaError("Media not found.", 404);
  }
  const inside = path.relative(root, file);
  if (
    !inside ||
    inside === ".." ||
    inside.startsWith(`..${path.sep}`) ||
    path.isAbsolute(inside)
  )
    throw new FeatureMediaError("Media must stay inside its project.", 403);
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new FeatureMediaError("Media not found.", 404);
  return { file, size: stat.size, contentType };
}

/** The whole file, or the asked-for bytes of it. */
export function mediaResponse(
  media: FeatureMediaFile,
  rangeHeader: string | null
): Response {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": media.contentType,
  });
  const range = parseByteRange(rangeHeader, media.size);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${media.size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range ?? { start: 0, end: media.size - 1 };
  const length = media.size === 0 ? 0 : end - start + 1;
  headers.set("Content-Length", String(length));
  if (range)
    headers.set("Content-Range", `bytes ${start}-${end}/${media.size}`);
  const body =
    length === 0
      ? null
      : (Readable.toWeb(
          createReadStream(media.file, { start, end })
        ) as unknown as ReadableStream);
  return new Response(body, { status: range ? 206 : 200, headers });
}
