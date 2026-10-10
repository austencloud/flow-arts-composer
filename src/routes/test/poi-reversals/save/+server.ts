import { dev } from "$app/env";
import { error } from "@sveltejs/kit";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parsePoiReversalObservationFile } from "#lib/features/levels/poi-lab/domain/poi-reversal-observations.js";
import type { RequestHandler } from "./$types";

const DATA_FILE = fileURLToPath(
  new URL(
    "../../../../lib/features/levels/poi-lab/data/poi-reversal-observations.json",
    import.meta.url
  )
);

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) error(404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, "Expected a JSON observation file");
  }

  let file;
  try {
    file = parsePoiReversalObservationFile(body);
  } catch (cause) {
    error(400, cause instanceof Error ? cause.message : String(cause));
  }

  try {
    await writeFile(DATA_FILE, `${JSON.stringify(file, null, "\t")}\n`, "utf8");
  } catch (cause) {
    error(500, cause instanceof Error ? cause.message : String(cause));
  }

  return Response.json({ ok: true, count: file.observations.length });
};
