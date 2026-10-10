import { error } from "@sveltejs/kit";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { RequestHandler } from "./$types";
import { isKnownMotionId } from "../../(public)/guide/level-1/_components/guide-motion-configs";

const MOTIONS_DIR = path.join(process.cwd(), "static", "guide", "level-1", "motions");

/** Dev-only: persist a baked mp4 to static/. Rejected in production builds. */
export const POST: RequestHandler = async ({ request, url }) => {
  if (!import.meta.env.DEV) {
    throw error(403, "Bake write endpoint is dev-only");
  }

  const id = url.searchParams.get("id") ?? "";
  if (!isKnownMotionId(id)) {
    throw error(400, `Unknown motion id: ${JSON.stringify(id)}`);
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw error(400, "Empty request body");
  }

  await mkdir(MOTIONS_DIR, { recursive: true });
  // id is allowlisted to a fixed slug set → no traversal possible.
  await writeFile(path.join(MOTIONS_DIR, `${id}.mp4`), buffer);

  return Response.json({ ok: true, id, bytes: buffer.byteLength });
};
