import { dev } from "$app/env";
import type { RequestHandler } from "@sveltejs/kit";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseFlowFestRuntimeContract } from "../../flow-fest-graybox/flow-fest-runtime-contract";
import { validateFlowFestLowerLayoutSubmission } from "../_lib/flow-fest-lower-layout";

const RUNTIME_CONTRACT_PATH = join(
  process.cwd(),
  "static/data/flow-fest-sim/gate2-runtime-contract.json"
);
const OUTPUT_PATH = join(
  process.cwd(),
  "docs/superpowers/specs/flow-fest-sim/austen-lower-campground-layout.json"
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
      { ok: false, error: "The lower-campground payload is not valid JSON." },
      { status: 400 }
    );
  }

  try {
    const contract = parseFlowFestRuntimeContract(
      JSON.parse(readFileSync(RUNTIME_CONTRACT_PATH, "utf8"))
    );
    const validation = validateFlowFestLowerLayoutSubmission(
      body,
      contract.coordinateContentFingerprint.canonicalPayloadSha256
    );
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
      featureCount: 4,
    });
  } catch (cause) {
    const error =
      cause instanceof Error ? cause.message : "Unknown write failure";
    return Response.json({ ok: false, error }, { status: 500 });
  }
};
