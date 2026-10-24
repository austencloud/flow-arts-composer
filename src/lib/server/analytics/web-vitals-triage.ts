/**
 * Real-user web vitals triage: query builders and the pure aggregation behind
 * `scripts/triage-web-vitals.ts`.
 *
 * PostHog's web vitals extension sends one `$web_vitals` event per page load
 * with `$web_vitals_<NAME>_value` and `$web_vitals_<NAME>_event`. The event
 * object carries `navigationURL` (the hard load the metric belongs to) and
 * `$current_url` (where the page was when the metric was reported). LCP is a
 * load metric, so it is grouped by `navigationURL`; INP and CLS can happen
 * after client-side navigation, so they are grouped by `$current_url`.
 *
 * Checked 2026-10-22 on 433 events: `entries` arrives as a list of empty
 * objects (PerformanceEntry does not survive JSON) and there is no
 * `attribution`, because the client does not set `web_vitals_attribution`.
 * So the LCP element and INP target are null until that option is enabled.
 */
import { escapeHogQL, pulseProdFilter } from "./hogql-shared";
import { splitLocalePath } from "../../shared/i18n/seo-locales";

export const VITAL_NAMES = ["LCP", "INP", "CLS"] as const;
export type VitalName = (typeof VITAL_NAMES)[number];

/** One `$web_vitals` event, flattened. A value is null when not reported. */
export interface VitalsEventRow {
  occurredAt: string;
  sessionId: string;
  deviceType: string;
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  lcpUrl: string;
  inpUrl: string;
  clsUrl: string;
  /** Element selector from attribution, when the client sends it. */
  lcpElement: string | null;
  inpTarget: string | null;
}

export interface Percentiles {
  n: number;
  p50: number | null;
  p75: number | null;
  p95: number | null;
}

export interface RouteVitals {
  route: string;
  deviceType: string;
  lcp: Percentiles;
  inp: Percentiles;
  cls: Percentiles;
  /** Most frequent LCP element / INP target with its count, when known. */
  topLcpElement: { value: string; count: number } | null;
  topInpTarget: { value: string; count: number } | null;
}

export function buildWebVitalsQuery(sinceIso: string): string {
  const since = escapeHogQL(sinceIso);
  return `
    SELECT
      toString(timestamp) as occurred_at,
      "$session_id" as session_id,
      properties."$device_type" as device_type,
      properties."$web_vitals_LCP_value" as lcp,
      properties."$web_vitals_INP_value" as inp,
      properties."$web_vitals_CLS_value" as cls,
      properties."$web_vitals_LCP_event" as lcp_event,
      properties."$web_vitals_INP_event" as inp_event,
      properties."$web_vitals_CLS_event" as cls_event,
      properties."$current_url" as current_url
    FROM events
    WHERE event = '$web_vitals'
      AND timestamp > toDateTime('${since}')
      AND ${pulseProdFilter()}
    ORDER BY timestamp DESC
    LIMIT 20000
  `;
}

/**
 * The four fields `isLikelyCrawlerSession` reads, for the sessions that sent
 * vitals. Session-level because one page view is a session property.
 */
export function buildVitalsSessionsQuery(
  sinceIso: string,
  sessionIds: string[]
): string {
  const since = escapeHogQL(sinceIso);
  const ids = sessionIds.map((id) => `'${escapeHogQL(id)}'`).join(", ");
  return `
    SELECT
      "$session_id" as session_id,
      countIf(event = '$pageview') as pageview_count,
      maxIf(1, toString(properties."$is_identified") IN ('true', '1')) as identified,
      argMax(properties."$browser_language", timestamp) as locale,
      argMinIf(properties."$referring_domain", timestamp, event = '$pageview') as referring_domain
    FROM events
    WHERE timestamp > toDateTime('${since}')
      AND "$session_id" IN (${ids || "''"})
    GROUP BY session_id
  `;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseJson(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(String(value));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** web-vitals attribution field names: LCP `target`, INP `interactionTarget`. */
function attributionString(
  event: Record<string, unknown> | null,
  key: string
): string | null {
  const attribution = event?.attribution;
  if (!attribution || typeof attribution !== "object") return null;
  const value = (attribution as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : null;
}

export function parseVitalsEventRow(row: unknown[]): VitalsEventRow {
  const lcpEvent = parseJson(row[6]);
  const inpEvent = parseJson(row[7]);
  const clsEvent = parseJson(row[8]);
  const currentUrl = str(row[9]);
  return {
    occurredAt: String(row[0] ?? ""),
    sessionId: String(row[1] ?? ""),
    deviceType: str(row[2]) || "Unknown",
    lcp: num(row[3]),
    inp: num(row[4]),
    cls: num(row[5]),
    lcpUrl:
      str(lcpEvent?.navigationURL) || str(lcpEvent?.$current_url) || currentUrl,
    inpUrl: str(inpEvent?.$current_url) || currentUrl,
    clsUrl: str(clsEvent?.$current_url) || currentUrl,
    lcpElement: attributionString(lcpEvent, "target"),
    inpTarget: attributionString(inpEvent, "interactionTarget"),
  };
}

const ID_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z0-9_-]{20,})$/;

/**
 * Collapse a URL to a route pattern: drop origin, query and hash, drop the
 * language folder, and replace ids. `/sequence/x`, `/guide/x` and everything
 * under `/browse/explore/` are collapsed whole, since each is one page shape.
 */
export function routePattern(url: string): string {
  let path: string;
  try {
    path = new URL(url, "https://tkaflowarts.com").pathname;
  } catch {
    path = url.split(/[?#]/)[0] ?? "";
  }
  path = splitLocalePath(path).path.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const [first, second, third] = parts;

  if (first === "sequence" && second) return "/sequence/[id]";
  if (first === "guide" && second) return "/guide/[slug]";
  if (
    first === "browse" &&
    second === "you" &&
    third === "collections" &&
    parts[3]
  ) {
    return "/browse/you/collections/[id]";
  }
  if (first === "browse" && second === "explore" && third) {
    return third === "collections"
      ? "/browse/explore/collections/[...]"
      : "/browse/explore/[...]";
  }
  return "/" + parts.map((p) => (ID_SEGMENT.test(p) ? "[id]" : p)).join("/");
}

/** Nearest-rank percentile on a sorted copy. Null for no samples. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

function summarize(values: number[]): Percentiles {
  return {
    n: values.length,
    p50: percentile(values, 50),
    p75: percentile(values, 75),
    p95: percentile(values, 95),
  };
}

function mostFrequent(
  values: (string | null)[]
): { value: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts)
    if (!best || count > best.count) best = { value, count };
  return best;
}

/** Group events by route pattern and device type, one metric URL each. */
export function aggregateVitals(rows: VitalsEventRow[]): RouteVitals[] {
  const groups = new Map<
    string,
    {
      route: string;
      deviceType: string;
      lcp: number[];
      inp: number[];
      cls: number[];
      el: (string | null)[];
      tg: (string | null)[];
    }
  >();
  const bucket = (url: string, deviceType: string) => {
    const route = routePattern(url);
    const key = `${route}\u0000${deviceType}`;
    let g = groups.get(key);
    if (!g) {
      g = { route, deviceType, lcp: [], inp: [], cls: [], el: [], tg: [] };
      groups.set(key, g);
    }
    return g;
  };

  for (const row of rows) {
    if (row.lcp !== null) {
      const g = bucket(row.lcpUrl, row.deviceType);
      g.lcp.push(row.lcp);
      g.el.push(row.lcpElement);
    }
    if (row.inp !== null) {
      const g = bucket(row.inpUrl, row.deviceType);
      g.inp.push(row.inp);
      g.tg.push(row.inpTarget);
    }
    if (row.cls !== null) bucket(row.clsUrl, row.deviceType).cls.push(row.cls);
  }

  return [...groups.values()].map((g) => ({
    route: g.route,
    deviceType: g.deviceType,
    lcp: summarize(g.lcp),
    inp: summarize(g.inp),
    cls: summarize(g.cls),
    topLcpElement: mostFrequent(g.el),
    topInpTarget: mostFrequent(g.tg),
  }));
}

const DEVICE_ORDER: Record<string, number> = {
  Mobile: 0,
  Tablet: 1,
  Desktop: 2,
};

/**
 * Ranking for the report: mobile first, then p75 LCP, then p75 INP, then
 * p75 CLS, all descending (worst first). A group needs `minSamples` of at
 * least one metric to be listed; a metric with fewer samples sorts as unknown.
 */
export function rankRouteVitals(
  groups: RouteVitals[],
  minSamples = 10
): RouteVitals[] {
  const p75 = (m: Percentiles) =>
    m.n >= minSamples && m.p75 !== null ? m.p75 : -1;
  return groups
    .filter((g) => Math.max(g.lcp.n, g.inp.n, g.cls.n) >= minSamples)
    .sort(
      (a, b) =>
        (DEVICE_ORDER[a.deviceType] ?? 3) - (DEVICE_ORDER[b.deviceType] ?? 3) ||
        p75(b.lcp) - p75(a.lcp) ||
        p75(b.inp) - p75(a.inp) ||
        p75(b.cls) - p75(a.cls)
    );
}
