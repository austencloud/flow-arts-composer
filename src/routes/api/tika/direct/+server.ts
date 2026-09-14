import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { TikaDirectorRequestSchema } from "$lib/features/stage/domain/tika-director";
import { planStageDirection } from "$lib/features/stage/services/server/tika-director-planner";
import { reviewStageDirection } from "$lib/features/stage/services/server/tika-director-reviewer";
import {
  createTikaDirectorModel,
  isTikaDirectorModelConfigured,
} from "$lib/features/stage/services/server/tika-director-models";
import { requireAdmin } from "$lib/server/auth/requireAdmin";
import { requireFirebaseUser } from "$lib/server/auth/requireFirebaseUser";
import { RATE_LIMITS } from "$lib/server/security/rate-limiter";
import { withRateLimit } from "$lib/server/security/withRateLimit";
import { isHttpError, type RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async (event) => {
  try {
    const caller = dev
      ? await requireFirebaseUser(event)
      : await requireAdmin(event);
    const blocked = await withRateLimit(
      event,
      RATE_LIMITS.AI_CHAT,
      "user",
      caller.uid
    );
    if (blocked) return blocked;

    let body: unknown;
    try {
      body = await event.request.json();
    } catch {
      return Response.json(
        { error: "Send a valid JSON direction request." },
        { status: 400 }
      );
    }
    const parsed = TikaDirectorRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "The direction or scene context is invalid." },
        { status: 400 }
      );
    }

    // A local Ollama planner is a per-machine setting for the desktop server;
    // the deployed edge leaves these unset and keeps the hosted models.
    const plannerKey = env.TIKA_DIRECTOR_MODEL || "sonnet-5";
    const reviewerKey = env.TIKA_DIRECTOR_REVIEWER || "sonnet-5";
    const modelEnv = {
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      ollamaBaseUrl: env.OLLAMA_BASE_URL,
    };
    if (
      !isTikaDirectorModelConfigured(plannerKey, modelEnv) ||
      !isTikaDirectorModelConfigured(reviewerKey, modelEnv)
    ) {
      return Response.json(
        { error: "TIKA's model provider is not configured." },
        { status: 503 }
      );
    }

    const signal = AbortSignal.any([
      event.request.signal,
      AbortSignal.timeout(30_000),
    ]);
    const planned = await planStageDirection(
      createTikaDirectorModel(plannerKey, modelEnv),
      parsed.data,
      signal
    );
    const { response } = await reviewStageDirection(
      createTikaDirectorModel(reviewerKey, modelEnv),
      parsed.data,
      planned.response,
      signal
    );
    return Response.json(response);
  } catch (cause) {
    if (isHttpError(cause)) {
      return Response.json(
        { error: cause.body.message },
        { status: cause.status }
      );
    }
    if (cause instanceof Error && "status" in cause && cause.status === 401) {
      return Response.json({ error: cause.message }, { status: 401 });
    }
    if (
      cause instanceof Error &&
      (cause.name === "AbortError" || cause.name === "TimeoutError")
    ) {
      return Response.json(
        { error: "TIKA's request was cancelled or timed out. Try again." },
        { status: 504 }
      );
    }
    // Provider errors can contain request bodies. Keep prompts and credentials
    // out of logs and show a retryable error at the API boundary.
    console.error("[TIKA Director API] Planning failed", {
      name: cause instanceof Error ? cause.name : "UnknownError",
    });
    return Response.json(
      { error: "TIKA's model could not complete this direction. Try again." },
      { status: 502 }
    );
  }
};
