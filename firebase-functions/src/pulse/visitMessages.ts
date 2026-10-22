/**
 * Pure message builders for the site-visit digest notification.
 *
 * A visit doc carries raw facts (referrer host, UTM tags, user agent, landing
 * path, Cloudflare's city and country code). These turn them into the short
 * "who, from where, how they found us" line Austen reads on his phone.
 * Dependency-free so they unit-test without Firebase.
 */

export interface VisitFacts {
  city: string | null;
  region: string | null;
  /** ISO 3166 alpha-2, as Cloudflare reports it. */
  country: string | null;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  userAgent: string;
  landingPath: string;
  /** 1 on a browser's first visit; counts up on later ones. */
  visitNumber: number;
}

/** One entry in a digest's running list. */
export interface VisitSummary {
  place: string;
  source: string;
  device: string;
  landingPath: string;
  visitNumber: number;
  postHogSessionId: string | null;
}

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "FR" → "France". Unknown or malformed codes pass through unchanged. */
export function countryName(code: string | null): string | null {
  if (!code) return null;
  // Cloudflare uses XX for unknown and T1 for Tor exits.
  if (code === "XX") return null;
  if (code === "T1") return "Tor";
  try {
    return countryNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** "Lyon, France" / "France" / "an unknown place". */
export function placeLabel(
  city: string | null,
  country: string | null
): string {
  const parts = [city, countryName(country)].filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
  return parts.length > 0 ? parts.join(", ") : "an unknown place";
}

/**
 * Apps that open links in their own browser often send no referrer at all,
 * but they do stamp their name into the user agent. Order matters: Facebook's
 * tokens also appear inside Instagram's and Messenger's user agents, and
 * Threads (codename Barcelona) is built on Instagram's.
 */
const IN_APP_BROWSERS: Array<[RegExp, string]> = [
  [/\bThreads\b|Barcelona/i, "Threads"],
  [/Instagram/i, "Instagram"],
  [/FB_IAB\/MESSENGER|\bOrca-Android|MessengerForiOS/i, "Messenger"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Pinterest/i, "Pinterest"],
  [/\bLine\//i, "LINE"],
  [/Twitter for|TwitterAndroid/i, "X"],
  [/Discord/i, "Discord"],
  [/WhatsApp/i, "WhatsApp"],
];

/** Referrer hosts, matched as a suffix of the host. First match wins. */
const REFERRER_NAMES: Array<[string, string]> = [
  ["gemini.google.com", "Gemini"],
  ["chatgpt.com", "ChatGPT"],
  ["chat.openai.com", "ChatGPT"],
  ["perplexity.ai", "Perplexity"],
  ["claude.ai", "Claude"],
  ["copilot.microsoft.com", "Copilot"],
  ["search.brave.com", "Brave Search"],
  ["duckduckgo.com", "DuckDuckGo"],
  ["bing.com", "Bing"],
  ["ecosia.org", "Ecosia"],
  ["yahoo.com", "Yahoo"],
  ["yandex.ru", "Yandex"],
  ["yandex.com", "Yandex"],
  ["baidu.com", "Baidu"],
  ["instagram.com", "Instagram"],
  ["threads.net", "Threads"],
  ["threads.com", "Threads"],
  ["facebook.com", "Facebook"],
  ["fb.com", "Facebook"],
  ["messenger.com", "Messenger"],
  ["t.co", "X"],
  ["x.com", "X"],
  ["twitter.com", "X"],
  ["youtube.com", "YouTube"],
  ["youtu.be", "YouTube"],
  ["reddit.com", "Reddit"],
  ["tiktok.com", "TikTok"],
  ["linkedin.com", "LinkedIn"],
  ["lnkd.in", "LinkedIn"],
  ["pinterest.com", "Pinterest"],
  ["discord.com", "Discord"],
  ["github.com", "GitHub"],
  ["tka.run", "a tka.run link"],
];

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Google lives on many country domains: google.fr, google.com.au, … */
function isGoogleSearch(host: string): boolean {
  return /(^|\.)google\.[a-z.]+$/.test(host);
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * How the visitor found the site, in a few words: "Google", "Instagram",
 * "an ad on Facebook", "flowartsinstitute.com", or "a direct link".
 */
export function sourceLabel(facts: VisitFacts): string {
  if (facts.utmSource) {
    const name = titleCase(facts.utmSource.trim());
    const medium = facts.utmMedium?.toLowerCase() ?? "";
    if (/cpc|paid|ads?$|ppc/.test(medium)) return `an ad on ${name}`;
    if (medium === "email") return `an email (${name})`;
    return name;
  }

  const host = facts.referrerHost?.toLowerCase().replace(/^www\./, "") ?? "";
  if (host) {
    for (const [domain, name] of REFERRER_NAMES) {
      if (hostMatches(host, domain)) return name;
    }
    if (isGoogleSearch(host)) return "Google";
    return host;
  }

  for (const [pattern, name] of IN_APP_BROWSERS) {
    if (pattern.test(facts.userAgent)) return name;
  }

  return "a direct link";
}

/** "iPhone", "Android phone", "Mac", "Windows PC", … */
export function deviceLabel(userAgent: string): string {
  const ua = userAgent;
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) {
    return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  }
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux computer";
  return "unknown device";
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function summarizeVisit(
  facts: VisitFacts,
  postHogSessionId: string | null
): VisitSummary {
  return {
    place: placeLabel(facts.city, facts.country),
    source: sourceLabel(facts),
    device: deviceLabel(facts.userAgent),
    landingPath: facts.landingPath || "/",
    visitNumber: facts.visitNumber,
    postHogSessionId,
  };
}

/**
 * First visit in a window, in full:
 * "New visitor in Lyon, France · via Google · iPhone · landed on /learn"
 */
export function singleVisitMessage(visit: VisitSummary): string {
  const who =
    visit.visitNumber > 1
      ? `Returning visitor (${ordinal(visit.visitNumber)} visit)`
      : "New visitor";
  return [
    `${who} in ${visit.place}`,
    `via ${visit.source}`,
    visit.device,
    `landed on ${visit.landingPath}`,
  ].join(" · ");
}

/** How many visitors a digest names before it says "+N more". */
export const DIGEST_LISTED_VISITS = 5;

/**
 * A burst, one short line per visitor:
 * "3 visitors · last 10 min: Lyon, France (Google) · Sydney, Australia
 * (Instagram) · Ghent, Belgium (a direct link)"
 */
export function visitDigestMessage(
  visits: VisitSummary[],
  totalCount: number,
  windowMinutes: number
): string {
  const listed = visits
    .slice(0, DIGEST_LISTED_VISITS)
    .map((v) => `${v.place} (${v.source})`);
  const more = totalCount - listed.length;
  if (more > 0) listed.push(`+${more} more`);
  return `${totalCount} visitors · last ${windowMinutes} min: ${listed.join(" · ")}`;
}
