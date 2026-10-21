/**
 * Dev-only sink for release example takes. /test/release-media renders each
 * take in the browser and POSTs the MP4 here; `scripts/release-media-grid.mjs`
 * then composes them into the clip a release note carries.
 *
 * Files land in the OS temp directory: they are bake output, never build
 * input. Sibling of `../loop-clip`. Never available in a production build.
 *
 * GET `?file=` serves the composed output and the draft notes back to
 * /test/release-notes-preview, so a release's examples can be seen in the
 * real What's New and Release Notes before anything is uploaded.
 */

import { error } from "@sveltejs/kit";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dev } from "$app/env";
import type { RequestHandler } from "./$types";

const TAKE_DIR = join(tmpdir(), "tka-release-media");
const TAKE_NAME = /^[a-z0-9-]{1,64}$/;
const OUTPUT_FILE = /^[a-z0-9-]{1,64}\.(mp4|gif|jpg|json)$/;
const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  gif: "image/gif",
  jpg: "image/jpeg",
  json: "application/json",
};

export const GET: RequestHandler = async ({ url }) => {
  if (!dev) throw error(403, "release media endpoint is dev-only");

  const file = url.searchParams.get("file") ?? "";
  const match = OUTPUT_FILE.exec(file);
  if (!match) throw error(400, "bad file name");

  try {
    const body = await readFile(join(TAKE_DIR, "out", file));
    return new Response(body, {
      headers: {
        "content-type": CONTENT_TYPES[match[1]!]!,
        "cache-control": "no-store",
      },
    });
  } catch {
    throw error(404, `no ${file} in the release media output`);
  }
};

export const POST: RequestHandler = async ({ request, url }) => {
  if (!dev) throw error(403, "release media endpoint is dev-only");

  const name = url.searchParams.get("name") ?? "";
  if (!TAKE_NAME.test(name)) throw error(400, "bad take name");

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) throw error(400, "empty body");

  await mkdir(TAKE_DIR, { recursive: true });
  const filePath = join(TAKE_DIR, `${name}.mp4`);
  await writeFile(filePath, buf);

  return Response.json({
    ok: true,
    bytes: buf.length,
    path: filePath.replace(/\\/g, "/"),
  });
};
