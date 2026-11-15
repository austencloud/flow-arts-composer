import fs from "node:fs/promises";
import path from "node:path";
import {
  buildCometMap,
  writeCometMap,
} from "../../../scripts/feature-video/comet-map.mjs";
import { mediaPathFromUrl } from "../../../scripts/feature-video/align-take.mjs";
import { featureVideos } from "./feature-video-store";

/**
 * Reads a take's light map for one clip's comet trails, from every real
 * camera frame of the stretch the clip plays, and keeps it in the feature
 * video's media/comet folder. The editor and post-project.mjs's `comet-map`
 * both land here or on the same `buildCometMap`.
 */

export class CometMapError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404
  ) {
    super(message);
    this.name = "CometMapError";
  }
}

const ITEM_ID = /^[\w.-]{1,120}$/;

export interface CometMapRequest {
  /** The clip the map is for; names the file. */
  itemId: string;
  /** The take's media URL, or a sharper copy of the same footage. */
  sourceUrl: string;
  fromSeconds: number;
  toSeconds: number;
}

export async function buildFeatureCometMap(
  slug: string,
  input: CometMapRequest
): Promise<{ map: string; frames: number; megabytes: number }> {
  if (!ITEM_ID.test(input.itemId)) throw new CometMapError("Bad clip id.", 400);
  if (
    !Number.isFinite(input.fromSeconds) ||
    !Number.isFinite(input.toSeconds) ||
    input.toSeconds <= input.fromSeconds
  )
    throw new CometMapError("The stretch to read is empty.", 400);
  const folder = featureVideos().folder(slug);
  let file: string;
  try {
    file = mediaPathFromUrl(input.sourceUrl, path.dirname(folder));
    await fs.access(file);
  } catch {
    throw new CometMapError("That footage is not in a feature video folder.", 404);
  }
  const built = await buildCometMap({
    file,
    fromSeconds: input.fromSeconds,
    toSeconds: input.toSeconds,
  });
  const relativePath = await writeCometMap(folder, input.itemId, built.bytes);
  const map = `/api/dev/feature-videos/${encodeURIComponent(slug)}/media/${relativePath}`;
  return {
    map,
    frames: built.frames,
    megabytes: Math.round((built.bytes.length / 1048576) * 10) / 10,
  };
}
