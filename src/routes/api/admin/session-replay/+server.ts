import type { RequestHandler } from "@sveltejs/kit";

import * as env from "$app/env/private";
import { requireAdmin } from "#lib/server/auth/requireAdmin.js";
import {
  mapPostHogRecordingLookup,
  mapPostHogSharingResponse,
  postHogAppOrigin,
  type PostHogReplayAccessPayload,
} from "#lib/server/analytics/posthog-replay-access.js";
import { logAdminAction } from "#lib/server/security/audit-logger.js";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const POST: RequestHandler = async (event) => {
  const caller = await requireAdmin(event);
  const blocked = await withRateLimit(
    event,
    RATE_LIMITS.ADMIN,
    "user",
    caller.uid
  );
  if (blocked) return blocked;

  const body = (await event.request.json().catch(() => null)) as {
    sessionId?: unknown;
  } | null;
  const sessionId = body?.sessionId;
  if (
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    sessionId.length > 128 ||
    !SESSION_ID_PATTERN.test(sessionId)
  ) {
    return Response.json(
      { message: "Valid session ID required" },
      { status: 400 }
    );
  }

  if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_PROJECT_ID) {
    return Response.json(
      {
        state: "configuration",
        embedUrl: null,
        message: "PostHog replay access is not configured on this server.",
      },
      { status: 503 }
    );
  }

  let appOrigin: string;
  try {
    appOrigin = postHogAppOrigin(env.POSTHOG_API_HOST);
  } catch {
    return Response.json(
      {
        state: "configuration",
        embedUrl: null,
        message: "The configured PostHog application host is invalid.",
      },
      { status: 503 }
    );
  }

  const recordingUrl = `${appOrigin}/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID)}/session_recordings/${encodeURIComponent(sessionId)}/`;
  const authorization = `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`;

  let access: PostHogReplayAccessPayload;
  try {
    // Sharing succeeds even for a session PostHog never recorded, and the
    // embed then shows PostHog's own "Recording not found" page. Ask whether
    // the recording exists first, so a visit opened seconds after it began
    // reads as still arriving and the visitor screen keeps checking.
    const lookup = await fetch(recordingUrl, {
      headers: { Authorization: authorization },
    });
    const lookupAccess = mapPostHogRecordingLookup(lookup.status);
    if (lookupAccess) {
      access = lookupAccess;
    } else {
      const sharing = await fetch(`${recordingUrl}sharing/`, {
        method: "PATCH",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: true }),
      });
      access = mapPostHogSharingResponse(
        sharing.status,
        await sharing.json().catch(() => null),
        appOrigin
      );
    }
  } catch (cause) {
    console.error("[session-replay] PostHog request failed", {
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return Response.json(
      {
        state: "error",
        embedUrl: null,
        message: "PostHog could not be reached.",
      },
      { status: 502 }
    );
  }

  await logAdminAction({
    uid: caller.uid,
    action: "session_replay_opened",
    target: "posthog-session",
    metadata: { result: access.state },
    ip: event.getClientAddress(),
  });

  const status =
    access.state === "ready"
      ? 200
      : access.state === "processing"
        ? 202
        : access.state === "unavailable"
          ? 404
          : access.state === "configuration"
            ? 503
            : 502;
  return Response.json(access, { status });
};
