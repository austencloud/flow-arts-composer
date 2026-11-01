export type PostHogReplayAccessState =
  | "ready"
  | "processing"
  | "unavailable"
  | "configuration"
  | "error";

export interface PostHogReplayAccessPayload {
  state: PostHogReplayAccessState;
  embedUrl: string | null;
  message: string;
}

function sharingToken(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const token = record.access_token ?? record.accessToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function postHogAppOrigin(configuredHost?: string): string {
  const rawHost = configuredHost?.trim() || "us.posthog.com";
  const candidate = rawHost.includes("://") ? rawHost : `https://${rawHost}`;
  const url = new URL(candidate);
  if (url.protocol !== "https:") {
    throw new Error("POSTHOG_API_HOST must use HTTPS");
  }
  return url.origin;
}

/**
 * The recording lookup that runs before sharing. Null means the recording
 * exists and sharing can go ahead; anything else is the answer to return.
 */
export function mapPostHogRecordingLookup(
  status: number
): PostHogReplayAccessPayload | null {
  if (status >= 200 && status < 300) return null;
  return mapPostHogSharingResponse(status, null, "");
}

export function mapPostHogSharingResponse(
  status: number,
  body: unknown,
  appOrigin: string
): PostHogReplayAccessPayload {
  if (status >= 200 && status < 300) {
    const token = sharingToken(body);
    if (!token) {
      return {
        state: "error",
        embedUrl: null,
        message: "PostHog returned replay access without an embed token.",
      };
    }
    return {
      state: "ready",
      embedUrl: `${appOrigin}/embedded/${encodeURIComponent(token)}`,
      message: "Replay ready",
    };
  }

  if (status === 401 || status === 403) {
    return {
      state: "configuration",
      embedUrl: null,
      message:
        "The PostHog key needs session recording and sharing configuration scopes.",
    };
  }

  if (status === 404) {
    return {
      state: "processing",
      embedUrl: null,
      message:
        "PostHog has not made this recording available yet. It may still be processing.",
    };
  }

  if (status === 410) {
    return {
      state: "unavailable",
      embedUrl: null,
      message: "PostHog no longer has a recording for this session.",
    };
  }

  return {
    state: "error",
    embedUrl: null,
    message: "PostHog could not prepare this replay.",
  };
}
