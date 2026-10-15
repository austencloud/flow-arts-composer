/**
 * Dev-only sink for the loop-clip bake. The browser renders each clip
 * (WebGL2 + WebCodecs) and POSTs the MP4 bytes here; this writes the file
 * and keeps the index document beside it, so `scripts/upload-loop-clips.mjs`
 * can push the whole set to the assets bucket afterwards.
 *
 * Files land in the OS temp directory, not under static/: they are bake
 * output, never build input. Sibling of `../view-capture`. Never available
 * in a production build.
 */

import { error } from "@sveltejs/kit";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dev } from "$app/env";
import type { RequestHandler } from "./$types";
import {
  LOOP_CLIP_RENDERER_VERSION,
  emptyLoopClipIndex,
  isLoopClipSequenceId,
  loopClipKey,
  type LoopClipEntry,
  type LoopClipIndex,
} from "#lib/shared/sequence-clips/loop-clip-spec.js";

const BAKE_DIR = join(
  tmpdir(),
  "tka-loop-clips",
  `r${LOOP_CLIP_RENDERER_VERSION}`
);
const INDEX_PATH = join(BAKE_DIR, "index.json");

async function readIndex(): Promise<LoopClipIndex> {
  try {
    const parsed = JSON.parse(
      await readFile(INDEX_PATH, "utf8")
    ) as LoopClipIndex;
    if (parsed.rendererVersion === LOOP_CLIP_RENDERER_VERSION && parsed.clips) {
      return parsed;
    }
  } catch {
    // No index yet, or an unreadable one: start over.
  }
  return emptyLoopClipIndex();
}

function parseEntry(raw: string | null): Omit<LoopClipEntry, "key" | "bytes"> {
  if (!raw) throw error(400, "missing meta");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw error(400, "meta is not JSON");
  }
  const seconds = Number(parsed.seconds);
  const fps = Number(parsed.fps);
  const size = Number(parsed.size);
  if (!(seconds > 0) || !(fps > 0) || !(size > 0)) {
    throw error(400, "meta needs positive seconds, fps and size");
  }
  const leftPropType = String(parsed.leftPropType ?? "");
  const rightPropType = String(parsed.rightPropType ?? "");
  if (!leftPropType || !rightPropType)
    throw error(400, "meta needs prop types");
  return {
    seconds,
    fps,
    size,
    leftPropType,
    rightPropType,
    renderedAt: new Date().toISOString(),
  };
}

export const GET: RequestHandler = async () => {
  if (!dev) throw error(403, "loop-clip bake endpoint is dev-only");
  return Response.json({ dir: BAKE_DIR, index: await readIndex() });
};

export const POST: RequestHandler = async ({ request, url }) => {
  if (!dev) throw error(403, "loop-clip bake endpoint is dev-only");

  const id = url.searchParams.get("id") ?? "";
  if (!isLoopClipSequenceId(id)) throw error(400, "bad sequence id");
  const entry = parseEntry(url.searchParams.get("meta"));

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) throw error(400, "empty body");

  await mkdir(BAKE_DIR, { recursive: true });
  const filePath = join(BAKE_DIR, `${id}.mp4`);
  await writeFile(filePath, buf);

  const index = await readIndex();
  index.clips[id] = { ...entry, key: loopClipKey(id), bytes: buf.length };
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2));

  return Response.json({
    ok: true,
    bytes: buf.length,
    path: filePath.replace(/\\/g, "/"),
    clips: Object.keys(index.clips).length,
  });
};
