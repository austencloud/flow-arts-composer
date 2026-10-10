import { dev } from "$app/env";
import type { RequestHandler } from "@sveltejs/kit";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { validateFlowFestSiteMarkerSubmission } from "../_lib/flow-fest-site-markers";

const OUTPUT_PATH = join(
  process.cwd(),
  "docs/superpowers/specs/flow-fest-sim/austen-site-markers.json"
);

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) {
    return Response.json(
      {
        ok: false,
        error: "This authoring endpoint is available only in development.",
      },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "The marker payload is not valid JSON." },
      { status: 400 }
    );
  }

  try {
    const validation = validateFlowFestSiteMarkerSubmission(body);
    if (!validation.valid) {
      return Response.json(
        { ok: false, error: validation.error },
        { status: 400 }
      );
    }
    const temporaryPath = `${OUTPUT_PATH}.tmp`;
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(
      temporaryPath,
      `${JSON.stringify(validation.value, null, 2)}\n`,
      "utf8"
    );
    renameSync(temporaryPath, OUTPUT_PATH);
    return Response.json({
      ok: true,
      path: relative(process.cwd(), OUTPUT_PATH).replaceAll("\\", "/"),
      markerCount: validation.value.markers.length,
    });
  } catch (cause) {
    const error =
      cause instanceof Error ? cause.message : "Unknown write failure";
    return Response.json({ ok: false, error }, { status: 500 });
  }
};
