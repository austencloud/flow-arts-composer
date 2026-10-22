/**
 * Site-visit reports: what the browser sends, what gets kept.
 *
 * The page posts one small report per visit (see visit-report.ts). This turns
 * it into the siteVisits document that the pulseSiteVisit Cloud Function
 * words into Austen's "someone from Lyon found the site via Google" alert.
 * Everything here is pure so the gates can be tested without a Worker.
 */

/** Only the real site reports visits. Local, dev-tunnel and preview copies
 * would buzz Austen's phone with his own testing. */
export const LIVE_SITE_HOSTS: ReadonlySet<string> = new Set([
  "tkaflowarts.com",
  "www.tkaflowarts.com",
]);

/** Visit docs age out through the Firestore TTL policy on `expiresAt`. */
export const SITE_VISIT_RETENTION_DAYS = 90;

const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|headless|python|curl|wget|httpclient|axios|node-fetch|go-http|java\/|facebookexternalhit|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|scanner|phantom|puppeteer|playwright|selenium/i;

/**
 * Cloudflare's bot score (1 = certainly a bot) when the plan exposes it, and
 * its verified-bot flag for well-behaved crawlers; otherwise the user agent.
 */
export function looksLikeBot(
  userAgent: string,
  cf: Record<string, unknown> | undefined
): boolean {
  if (!userAgent || userAgent.length < 20 || BOT_UA.test(userAgent))
    return true;
  const botManagement = cf?.["botManagement"] as
    | { score?: unknown; verifiedBot?: unknown }
    | undefined;
  if (botManagement?.verifiedBot === true) return true;
  if (typeof botManagement?.score === "number" && botManagement.score < 30) {
    return true;
  }
  return false;
}

export interface SiteVisitDocument {
  referrerHost: string | null;
  landingPath: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  visitNumber: number;
  /** Milliseconds since this browser's previous reported visit, if any. */
  sinceLastVisitMs: number | null;
  postHogSessionId: string | null;
  language: string | null;
  timezone: string | null;
  viewport: string | null;
  userAgent: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  /** The visitor's network operator, e.g. "Orange" or "Amazon.com". */
  network: string | null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

function coordinate(value: unknown, limit: number): number | null {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= limit
    ? n
    : null;
}

/**
 * The referring site's host, or null for none. The site's own host counts as
 * none: that is a reload or a link inside the app, not how they found it.
 */
export function referrerHostOf(
  referrer: unknown,
  ownHost: string
): string | null {
  const raw = text(referrer, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    const bare = (h: string) => h.replace(/^www\./, "");
    if (bare(host) === bare(ownHost.toLowerCase())) return null;
    return host.slice(0, 253);
  } catch {
    return null;
  }
}

/** A same-site path; anything else becomes "/". Query strings are dropped,
 * since they can carry tokens. */
export function landingPathOf(value: unknown): string {
  const raw = text(value, 300);
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw.split(/[?#]/)[0] || "/";
}

export type ParsedVisitReport =
  | { ok: true; value: SiteVisitDocument }
  | { ok: false; error: string };

/** Validate the browser's report and merge in the request's own facts. */
export function parseVisitReport(
  body: unknown,
  context: {
    ownHost: string;
    userAgent: string;
    cf: Record<string, unknown> | undefined;
  }
): ParsedVisitReport {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object" };
  }
  const report = body as Record<string, unknown>;
  const utm =
    report["utm"] && typeof report["utm"] === "object"
      ? (report["utm"] as Record<string, unknown>)
      : {};
  const cf = context.cf;

  return {
    ok: true,
    value: {
      referrerHost: referrerHostOf(report["referrer"], context.ownHost),
      landingPath: landingPathOf(report["landingPath"]),
      utmSource: text(utm["source"], 100),
      utmMedium: text(utm["medium"], 100),
      utmCampaign: text(utm["campaign"], 150),
      utmContent: text(utm["content"], 150),
      utmTerm: text(utm["term"], 150),
      visitNumber: wholeNumber(report["visitNumber"], 1, 100_000) ?? 1,
      sinceLastVisitMs: wholeNumber(
        report["sinceLastVisitMs"],
        0,
        Number.MAX_SAFE_INTEGER
      ),
      postHogSessionId: text(report["postHogSessionId"], 100),
      language: text(report["language"], 35),
      timezone: text(report["timezone"], 64),
      viewport: text(report["viewport"], 20),
      userAgent: context.userAgent.slice(0, 500),
      city: text(cf?.["city"], 120),
      region: text(cf?.["region"], 120),
      country: text(cf?.["country"], 8),
      lat: coordinate(cf?.["latitude"], 90),
      lng: coordinate(cf?.["longitude"], 180),
      network: text(cf?.["asOrganization"], 120),
    },
  };
}
