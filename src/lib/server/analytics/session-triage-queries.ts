/**
 * Cross-user session queries for triage.
 *
 * The two session builders in the admin analytics route are hardcoded to a
 * single userId. Triage needs the opposite: recent sessions across ALL real
 * users, ranked by friction. These builders return query strings only — no
 * I/O, no credentials — so both the API route and the CLI can use them.
 */
import { escapeHogQL, pulseProdFilter } from "./hogql-shared";

/** Events that mean the user actually produced something. */
export const CONTENT_ACTION_EVENTS = [
  "sequence_create",
  "sequence_save",
  "sequence_autosaved",
  "sequence_export",
  "sequence_share",
  "collection_create",
] as const;

/** One row of the triage sessions query. */
export interface TriageSessionRow {
  sessionId: string;
  uid: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  eventCount: number;
  exceptionCount: number;
  rageClickCount: number;
  deadClickCount: number;
  pageviewCount: number;
  contentActionCount: number;
  /** First URL segment of each pageview, e.g. "app", "q", "sequence". */
  topSegments: string[];
  /** Second URL segment, meaningful when the first is "app". */
  subSegments: string[];
  entryPath: string;
  exitPath: string;
  browser: string;
  operatingSystem: string;
  deviceType: string;
  /** Browser language of the session's last event, e.g. "zh-CN". Empty if absent. */
  locale: string;
  /** True when the SDK marked any event of the session as coming from an identified user. */
  identified: boolean;
  /** Referring domain of the entry pageview. Empty or "$direct" when none. */
  referringDomain: string;
}

/** One row of the session events query. */
export interface TriageEventRow {
  eventId: string;
  occurredAt: string;
  event: string;
  route: string;
  detail: string;
  exceptionType: string | null;
  exceptionMessage: string | null;
}

const MAX_SESSIONS = 200;
const MAX_EVENTS = 500;

/** Recent sessions across all real users, newest first. */
export function buildTriageSessionsQuery(sinceIso: string, limit: number): string {
  const since = escapeHogQL(sinceIso);
  const contentEvents = CONTENT_ACTION_EVENTS.map((e) => `'${e}'`).join(", ");
  const n = Math.min(Math.max(limit, 1), MAX_SESSIONS);

  return `
    SELECT
      "$session_id" as session_id,
      argMax(distinct_id, timestamp) as uid,
      toString(min(timestamp)) as started_at,
      toString(max(timestamp)) as ended_at,
      dateDiff('millisecond', min(timestamp), max(timestamp)) as duration,
      count() as event_count,
      countIf(event = '$exception') as exception_count,
      countIf(event = '$rageclick') as rage_click_count,
      countIf(event = '$dead_click') as dead_click_count,
      countIf(event = '$pageview') as pageview_count,
      countIf(event IN (${contentEvents})) as content_action_count,
      arrayDistinct(arrayFilter(x -> x != '', groupArray(
        if(event = '$pageview',
           splitByChar('/', ifNull(path(properties."$current_url"), ''))[2], '')
      ))) as top_segments,
      arrayDistinct(arrayFilter(x -> x != '', groupArray(
        if(event = '$pageview',
           splitByChar('/', ifNull(path(properties."$current_url"), ''))[3], '')
      ))) as sub_segments,
      argMinIf(path(properties."$current_url"), timestamp,
        event = '$pageview' AND properties."$current_url" IS NOT NULL) as entry_path,
      argMaxIf(path(properties."$current_url"), timestamp,
        event = '$pageview' AND properties."$current_url" IS NOT NULL) as exit_path,
      argMax(properties."$browser", timestamp) as browser,
      argMax(properties."$os", timestamp) as operating_system,
      argMax(properties."$device_type", timestamp) as device_type,
      argMax(properties."$browser_language", timestamp) as locale,
      maxIf(1, toString(properties."$is_identified") IN ('true', '1')) as identified,
      argMinIf(properties."$referring_domain", timestamp, event = '$pageview') as referring_domain
    FROM events
    WHERE timestamp > toDateTime('${since}')
      AND "$session_id" != ''
      AND ${pulseProdFilter()}
    GROUP BY session_id
    ORDER BY started_at DESC
    LIMIT ${n}
  `;
}

/**
 * Crawler sessions: one page view, never identified, zh-CN browser language,
 * and no referrer. On 2026-10-22, 30 of the top 40 friction slots were this
 * shape (zh-CN Chrome from cloud IP ranges reading one localized /guide page).
 * PostHog data here carries no datacenter-IP flag, so an empty referrer stands
 * in for it. Triage-side only: PostHog itself is untouched, and
 * `--include-crawlers` brings these sessions back.
 */
export function isLikelyCrawlerSession(
  row: Pick<TriageSessionRow, "pageviewCount" | "identified" | "locale" | "referringDomain">
): boolean {
  const noReferrer = row.referringDomain === "" || row.referringDomain === "$direct";
  return (
    row.pageviewCount === 1 &&
    !row.identified &&
    row.locale.toLowerCase().replace("_", "-") === "zh-cn" &&
    noReferrer
  );
}

/** Ordered event stream for one session, any user. */
export function buildTriageSessionEventsQuery(sessionId: string, limit: number): string {
  const safe = escapeHogQL(sessionId);
  const n = Math.min(Math.max(limit, 1), MAX_EVENTS);
  return `
    SELECT
      toString(uuid) as event_id,
      toString(timestamp) as occurred_at,
      event,
      if(properties."$current_url" IS NULL, '', path(properties."$current_url")) as route,
      coalesce(properties."$el_text", properties."$event_type", '') as detail,
      -- The web SDK sends type and message only as lists ($exception_types,
      -- $exception_values); the singular fields stay empty on its events.
      coalesce(properties."$exception_type", properties."$exception_types"[1]) as exception_type,
      coalesce(properties."$exception_message", properties."$exception_values"[1]) as exception_message
    FROM events
    WHERE "$session_id" = '${safe}'
    ORDER BY timestamp ASC
    LIMIT ${n}
  `;
}

/**
 * First-ever event timestamp per uid. Used to decide whether a session belongs
 * to a brand-new user, which weights the friction score up.
 */
export function buildFirstSeenQuery(uids: readonly string[]): string {
  if (uids.length === 0) {
    return `SELECT identities.distinct_id as uid, toString(min(events.timestamp)) as first_seen
            FROM events
            INNER JOIN person_distinct_ids AS identities
              ON events.person_id = identities.person_id
            GROUP BY uid LIMIT 0`;
  }
  const list = uids.map((u) => `'${escapeHogQL(u)}'`).join(", ");
  return `
    SELECT
      identities.distinct_id as uid,
      toString(min(events.timestamp)) as first_seen
    FROM events
    INNER JOIN person_distinct_ids AS identities
      ON events.person_id = identities.person_id
    WHERE identities.distinct_id IN (${list})
    GROUP BY uid
  `;
}

/**
 * ClickHouse returns `2026-08-01 10:00:00` — space separator, no zone. The
 * issue register compares timestamps as strings and parses them with
 * `new Date()`, and BOTH break on that format:
 *
 *   - Lexically, a space (0x20) sorts below every digit and `T` (0x54) above,
 *     so a ClickHouse stamp always compares as older than a same-day ISO one.
 *     `lastSeen` would then refuse to advance, and resolve-on-silence would
 *     read a stale `lastSeen` and close a bug that is still happening.
 *   - `new Date("2026-08-01 10:00:00")` is parsed as LOCAL time, shifting the
 *     14-day silence boundary by the machine's UTC offset.
 *
 * Normalizing here means one canonical ISO-UTC form is the only thing any
 * downstream consumer ever sees. Already-ISO input passes through untouched.
 */
export function toIsoUtc(raw: string): string {
  if (raw === "") return "";
  if (raw.includes("T")) return raw.endsWith("Z") ? raw : `${raw}Z`;
  return `${raw.replace(" ", "T")}Z`;
}

/** Maps a raw HogQL row array to a typed row. Column order must match the SELECT. */
export function parseTriageSessionRow(row: unknown[]): TriageSessionRow {
  return {
    sessionId: String(row[0] ?? ""),
    uid: String(row[1] ?? ""),
    startedAt: toIsoUtc(String(row[2] ?? "")),
    endedAt: toIsoUtc(String(row[3] ?? "")),
    durationMs: Number(row[4] ?? 0),
    eventCount: Number(row[5] ?? 0),
    exceptionCount: Number(row[6] ?? 0),
    rageClickCount: Number(row[7] ?? 0),
    deadClickCount: Number(row[8] ?? 0),
    pageviewCount: Number(row[9] ?? 0),
    contentActionCount: Number(row[10] ?? 0),
    topSegments: Array.isArray(row[11]) ? (row[11] as string[]) : [],
    subSegments: Array.isArray(row[12]) ? (row[12] as string[]) : [],
    entryPath: String(row[13] ?? ""),
    exitPath: String(row[14] ?? ""),
    browser: String(row[15] ?? ""),
    operatingSystem: String(row[16] ?? ""),
    deviceType: String(row[17] ?? ""),
    locale: String(row[18] ?? ""),
    identified: Number(row[19] ?? 0) === 1 || row[19] === true,
    referringDomain: String(row[20] ?? ""),
  };
}

/** Maps a raw HogQL row array to a typed event row. */
export function parseTriageEventRow(row: unknown[]): TriageEventRow {
  return {
    eventId: String(row[0] ?? ""),
    occurredAt: toIsoUtc(String(row[1] ?? "")),
    event: String(row[2] ?? ""),
    route: String(row[3] ?? ""),
    detail: String(row[4] ?? ""),
    exceptionType: row[5] == null ? null : String(row[5]),
    exceptionMessage: row[6] == null ? null : String(row[6]),
  };
}
