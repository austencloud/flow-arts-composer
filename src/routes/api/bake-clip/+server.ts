import { error } from "@sveltejs/kit";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { dev } from "$app/env";
import type { RequestHandler } from "./$types";

// Dev-only sink for the Mandala Rosetta bake. The browser renders each clip
// (WebGL2 + WebCodecs) then POSTs the MP4 bytes here; this writes them straight
// into static/mandala-rosetta/<effort>/ so the bake can run unattended (no File
// System Access picker, no downloads). Never available in a production build.
const ROOT = "static/mandala-rosetta";
const EFFORT_RE = /^[a-z]+$/;
const NAME_RE = /^[a-z0-9_-]+\.mp4$/;

export const POST: RequestHandler = async ({ request, url }) => {
  if (!dev) throw error(403, "bake endpoint is dev-only");

  const effort = url.searchParams.get("effort") ?? "";
  const name = url.searchParams.get("name") ?? "";
  if (!EFFORT_RE.test(effort)) throw error(400, "bad effort");
  if (!NAME_RE.test(name)) throw error(400, "bad name");

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) throw error(400, "empty body");

  const dir = join(ROOT, effort);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buf);

  return Response.json({
    ok: true,
    bytes: buf.length,
    path: `${effort}/${name}`,
  });
};
