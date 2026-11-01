/**
 * The visitor screen's data: who is in a site-visit alert, and how long to
 * keep asking PostHog for a recording that is still arriving.
 *
 * The pulseSiteVisit function writes one rolling notification per burst of
 * visitors. Its `visits` list grows as more people arrive, each with the
 * PostHog session id their browser reported (or null when PostHog never
 * started there).
 */

export interface VisitorEntry {
  place: string;
  source: string;
  device: string;
  landingPath: string;
  visitNumber: number;
  postHogSessionId: string | null;
}

export function buildVisitorReplayUrl(notificationId: string): string {
  return `/admin/visitors?notification=${encodeURIComponent(notificationId)}`;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function sessionId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)
    ? value
    : null;
}

/**
 * The visitors named in a site-visit notification, first arrival first.
 * Alerts written before the list existed carry only a top-level session id.
 */
export function visitorsFromNotification(
  data: Record<string, unknown>
): VisitorEntry[] {
  const raw = Array.isArray(data["visits"]) ? data["visits"] : [];
  const visitors = raw
    .filter(
      (v): v is Record<string, unknown> =>
        !!v && typeof v === "object" && !Array.isArray(v)
    )
    .map((v) => ({
      place: text(v["place"], "an unknown place"),
      source: text(v["source"], "an unknown source"),
      device: text(v["device"], "an unknown device"),
      landingPath: text(v["landingPath"], "/"),
      visitNumber:
        typeof v["visitNumber"] === "number" && v["visitNumber"] > 0
          ? v["visitNumber"]
          : 1,
      postHogSessionId: sessionId(v["postHogSessionId"]),
    }));
  if (visitors.length > 0) return visitors;

  const lone = sessionId(data["postHogSessionId"]);
  return lone
    ? [
        {
          place: "an unknown place",
          source: "an unknown source",
          device: "an unknown device",
          landingPath: "/",
          visitNumber: 1,
          postHogSessionId: lone,
        },
      ]
    : [];
}

/**
 * PostHog answers 404 until the first chunk of a recording lands, usually
 * within a minute or two of the visit. The screen asks again on its own at
 * this pace, then stops and leaves a Retry button.
 */
export const REPLAY_RETRY_MS = 15_000;
export const REPLAY_RETRY_LIMIT = 40;
