import { dev } from "$app/env";
import type { RequestHandler } from "@sveltejs/kit";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { validateTraceSubmission } from "../_lib/flow-fest-trace";

const OUTPUT_PATH = join(
  process.cwd(),
  "docs/superpowers/specs/flow-fest-sim/austen-traced-connectors.json"
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
      { ok: false, error: "The trace payload is not valid JSON." },
      { status: 400 }
    );
  }

  const validation = validateTraceSubmission(body);
  if (!validation.valid) {
    return Response.json(
      { ok: false, error: validation.error },
      { status: 400 }
    );
  }

  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  try {
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(
      temporaryPath,
      `${JSON.stringify(validation.value, null, 2)}\n`,
      "utf8"
    );
    renameSync(temporaryPath, OUTPUT_PATH);
  } catch (cause) {
    const error =
      cause instanceof Error ? cause.message : "Unknown write failure";
    return Response.json({ ok: false, error }, { status: 500 });
  }

  return Response.json({
    ok: true,
    path: relative(process.cwd(), OUTPUT_PATH).replaceAll("\\", "/"),
    pointCounts: {
      upperToMiddle: validation.value.paths.upperClearingToMiddleEarth.length,
      middleToLower: validation.value.paths.middleEarthToLowerClearing.length,
    },
  });
};
