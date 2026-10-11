import { getSequenceRenderer } from "#lib/shared/render/get-sequence-renderer.js";

import type { RequestHandler } from "./$types";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";

import { getSequencePersister } from "#lib/features/create/shared/get-sequence-persister.js";

export const POST: RequestHandler = async (event) => {
  const blocked = await withRateLimit(event, RATE_LIMITS.AI_RENDER, "ip");
  if (blocked) return blocked;

  const { request } = event;
  try {
    const body = (await request.json()) as { stepSize?: unknown };
    const stepSizeValue = body.stepSize;

    // Resolve services
    const renderService = getSequenceRenderer();
    const persistenceService = getSequencePersister();

    // Load current sequence
    const state = await persistenceService.loadCurrentState();
    if (!state?.currentSequence) {
      return Response.json({ error: "No sequence loaded" }, { status: 400 });
    }

    // Render with specified stepSize
    const stepSize =
      typeof stepSizeValue === "string"
        ? parseInt(stepSizeValue, 10)
        : typeof stepSizeValue === "number"
          ? stepSizeValue
          : 144;

    const blob = await renderService.renderSequenceToBlob(
      state.currentSequence,
      {
        stepSize,
        includeStartPlacement: true,
        addStepNumbers: false,
        addWord: false,
        addUserInfo: false,
        stepScale: 1.0,
        format: "PNG",
        quality: 1.0,
      }
    );

    return new Response(blob, {
      headers: {
        "Content-Type": "image/png",
      },
    });
  } catch (error) {
    console.error("Test render failed:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};
