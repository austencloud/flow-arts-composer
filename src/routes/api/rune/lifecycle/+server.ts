import * as env from "$app/env/public";

import type { RequestHandler } from "./$types";
import { LifecycleEventEnvelopeSchema } from "#lib/shared/analytics/domain/lifecycle-event.js";
import { capturePostHogLifecycleEvent } from "#lib/server/analytics/posthog-lifecycle-capture.js";
import { requireFirebaseUser } from "#lib/server/auth/requireFirebaseUser.js";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";

const MAX_SESSION_ID_LENGTH = 160;

function postHogSessionId(request: Request): string | null {
  const value = request.headers.get("X-PostHog-Session-ID")?.trim();
  if (!value) return null;
  return value.length <= MAX_SESSION_ID_LENGTH ? value : null;
}

export const POST: RequestHandler = async (event) => {
  let caller;
  try {
    caller = await requireFirebaseUser(event);
  } catch (authError) {
    const status =
      typeof authError === "object" &&
      authError !== null &&
      "status" in authError &&
      typeof authError.status === "number"
        ? authError.status
        : 401;
    return Response.json({ error: "Authentication required" }, { status });
  }

  const blocked = await withRateLimit(
    event,
    RATE_LIMITS.GENERAL,
    "user",
    caller.uid
  );
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = LifecycleEventEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid lifecycle event" }, { status: 400 });
  }
  // Match the browser SDK's dev-capture policy. Local and preview sessions use
  // real Firebase identities, so an API-key check alone would quietly pollute
  // production funnels even though posthog.ts disables its own dev capture.
  if (env.PUBLIC_ENVIRONMENT !== "production") {
    return Response.json({ accepted: false, disabled: true });
  }
  if (!env.PUBLIC_POSTHOG_KEY) {
    console.error("[lifecycle] PUBLIC_POSTHOG_KEY is not configured");
    return Response.json(
      { error: "Lifecycle delivery unavailable" },
      { status: 503 }
    );
  }

  try {
    await capturePostHogLifecycleEvent({
      apiKey: env.PUBLIC_POSTHOG_KEY,
      distinctId: caller.uid,
      envelope: parsed.data,
      sessionId: postHogSessionId(event.request),
      isGuest: caller.signInProvider === "anonymous",
    });
    return Response.json({ accepted: true });
  } catch (captureError) {
    console.error("[lifecycle] PostHog capture failed:", captureError);
    return Response.json(
      { error: "Lifecycle delivery failed" },
      { status: 502 }
    );
  }
};
