/**
 * Admin endpoint to proxy PostHog analytics queries.
 * Keeps the PostHog Personal API Key server-side.
 *
 * POST /api/admin/analytics
 * Per-user: { type: "engagement" | "activity" | "content" | "sessions" | "session-events", userId: string, period?, limit?, sessionId? }
 * Global: Pulse queries plus { type: "seo-scorecard" | "seo-history" }
 *
 * Requires admin role.
 */
import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { requireAdmin } from "#lib/server/auth/requireAdmin.js";
import * as env from "$app/env/private";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";
import { logAdminAction } from "#lib/server/security/audit-logger.js";
import { getAdminAuth, getAdminDb } from "#lib/server/firebaseAdmin.js";
import {
  escapeHogQL,
  personIdentityFilter,
  pulseProdFilter,
} from "#lib/server/analytics/hogql-shared.js";

const POSTHOG_API_BASE = "https://us.i.posthog.com/api";

type QueryType =
  | "engagement"
  | "activity"
  | "content"
  | "sessions"
  | "session-events"
  | "pulse-overview"
  | "pulse-breakdown"
  | "pulse-feed"
  | "pulse-live"
  | "seo-scorecard"
  | "seo-history";
type TimePeriod = "today" | "week" | "month" | "all";
type PulseDimension = "country" | "city" | "referrer" | "device";
type AnalyticsStage =
  | "authorize"
  | "rate_limit"
  | "read_request"
  | "build_query"
  | "posthog"
  | "firestore"
  | "audit";

/** Global pulse queries are site-wide; per-user queries require a userId. */
const GLOBAL_QUERY_TYPES: ReadonlySet<string> = new Set([
  "pulse-overview",
  "pulse-breakdown",
  "pulse-feed",
  "pulse-live",
  "seo-scorecard",
  "seo-history",
]);

function getPostHogHeaders() {
  if (!env.POSTHOG_PERSONAL_API_KEY) {
    throw error(500, "POSTHOG_PERSONAL_API_KEY not configured");
  }
  return {
    Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function getProjectId(): string {
  if (!env.POSTHOG_PROJECT_ID) {
    throw error(500, "POSTHOG_PROJECT_ID not configured");
  }
  return env.POSTHOG_PROJECT_ID;
}

function getPeriodInterval(period: Exclude<TimePeriod, "all">): string {
  switch (period) {
    case "today":
      return "1 day";
    case "week":
      return "7 day";
    case "month":
      return "30 day";
  }
}

function periodFilter(period: TimePeriod): string {
  return period === "all"
    ? ""
    : `AND timestamp > now() - interval ${getPeriodInterval(period)}`;
}

function periodStart(period: TimePeriod): Date | null {
  if (period === "all") return null;
  const days = period === "today" ? 1 : period === "week" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function firestoreDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (!value || typeof value !== "object" || !("toDate" in value)) return null;
  const toDate = (value as { toDate?: unknown }).toDate;
  if (typeof toDate !== "function") return null;
  const date = toDate.call(value) as unknown;
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
}

function composerSessionFromDoc(
  id: string,
  data: Record<string, unknown>
): Record<string, unknown> | null {
  const startedAt = firestoreDate(data.createdAt);
  const endedAt = firestoreDate(data.lastModified);
  if (!startedAt || !endedAt) {
    console.warn("[analytics] Ignoring an incomplete Composer session:", id);
    return null;
  }

  const status = ["active", "completed", "abandoned"].includes(
    String(data.status)
  )
    ? String(data.status)
    : null;
  const stepCount =
    typeof data.stepCount === "number" &&
    Number.isFinite(data.stepCount) &&
    data.stepCount >= 0
      ? data.stepCount
      : null;

  return {
    source: "composer",
    sessionId: id,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    duration: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    name: typeof data.name === "string" && data.name ? data.name : null,
    status,
    stepCount,
    isSaved: typeof data.isSaved === "boolean" ? data.isSaved : null,
    lastAutosaveAt: firestoreDate(data.lastAutosave)?.toISOString() ?? null,
  };
}

async function loadComposerSessions(
  userId: string,
  period: TimePeriod,
  limit?: number
): Promise<Array<Record<string, unknown>>> {
  const collection = getAdminDb()
    .collection("users")
    .doc(userId)
    .collection("sessions");
  const start = periodStart(period);
  const periodQuery = start
    ? collection.where("lastModified", ">=", start)
    : collection;
  let query = periodQuery.orderBy("lastModified", "desc");
  if (limit !== undefined) query = query.limit(limit);

  const snapshot = await query.get();
  return snapshot.docs.flatMap((document) => {
    const session = composerSessionFromDoc(document.id, document.data());
    return session ? [session] : [];
  });
}

function composerEngagement(
  sessions: Array<Record<string, unknown>>
): Record<string, unknown> | null {
  if (sessions.length === 0) return null;
  const durations = sessions.map((session) => session.duration as number);
  const totalTimeSpent = durations.reduce((sum, duration) => sum + duration, 0);
  return {
    source: "composer",
    lastActiveAt: sessions[0]!.endedAt,
    memberSince: null,
    sessionsCount: sessions.length,
    avgSessionDuration: totalTimeSpent / sessions.length,
    totalTimeSpent,
  };
}

/**
 * PostHog answers heavy HogQL from a shared query pool, so it hands back a
 * gateway timeout or a throttle instead of an answer under load. Those clear on
 * their own; a bad query never will.
 */
const RETRYABLE_POSTHOG_STATUSES: ReadonlySet<number> = new Set([
  408, 429, 500, 502, 503, 504,
]);
const POSTHOG_QUERY_ATTEMPTS = 3;
const POSTHOG_RETRY_BASE_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeHogQLQuery(
  query: string
): Promise<{ results: unknown[][] }> {
  const projectId = getProjectId();

  let response: Response | null = null;
  let lastFailure = "";
  for (let attempt = 1; attempt <= POSTHOG_QUERY_ATTEMPTS; attempt++) {
    response = await fetch(`${POSTHOG_API_BASE}/projects/${projectId}/query/`, {
      method: "POST",
      headers: getPostHogHeaders(),
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query,
        },
      }),
    });
    if (response.ok) break;

    lastFailure = await response.text().catch(() => "<unreadable body>");
    const retryable = RETRYABLE_POSTHOG_STATUSES.has(response.status);
    console.error(
      "[analytics] PostHog query failed:",
      response.status,
      `attempt ${attempt}/${POSTHOG_QUERY_ATTEMPTS}`,
      retryable ? "(retryable)" : "(final)",
      lastFailure
    );
    if (!retryable || attempt === POSTHOG_QUERY_ATTEMPTS) break;
    await sleep(POSTHOG_RETRY_BASE_MS * 2 ** (attempt - 1));
  }

  if (!response || !response.ok) {
    const status = response?.status ?? 0;
    throw error(
      502,
      RETRYABLE_POSTHOG_STATUSES.has(status)
        ? `PostHog was too busy to answer (${status}). Try again in a moment.`
        : `PostHog API error: ${status}`
    );
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw error(502, "PostHog returned an invalid response");
  }
  const results = (payload as Record<string, unknown>).results;
  if (!Array.isArray(results) || results.some((row) => !Array.isArray(row))) {
    throw error(502, "PostHog returned invalid query results");
  }
  return { results: results as unknown[][] };
}

function buildEngagementQuery(userId: string, period: TimePeriod): string {
  return `
    SELECT
      if(count() = 0, null, max(ended_at)) as last_active,
      count() as sessions_count,
      if(count() = 0, 0, avg(duration_ms)) as avg_duration_ms,
      if(count() = 0, 0, sum(duration_ms)) as total_duration_ms
    FROM (
      SELECT
        min(timestamp) as started_at,
        max(timestamp) as ended_at,
        dateDiff('millisecond', min(timestamp), max(timestamp)) as duration_ms
      FROM events
      WHERE ${personIdentityFilter(userId)}
        AND "$session_id" IS NOT NULL
        ${periodFilter(period)}
      GROUP BY "$session_id"
    )
  `;
}

function buildActivityQuery(userId: string, period: TimePeriod): string {
  // Derive module from the first URL path segment of pageview events.
  // Works with existing autocapture data without custom properties.
  return `
    SELECT
      splitByChar('/', ifNull(path(properties."$current_url"), ''))[2] as module,
      count() as event_count
    FROM events
    WHERE ${personIdentityFilter(userId)}
      ${periodFilter(period)}
      AND event = '$pageview'
      AND properties."$current_url" IS NOT NULL
    GROUP BY module
    HAVING module != ''
    ORDER BY event_count DESC
    LIMIT 10
  `;
}

function buildContentQuery(userId: string, period: TimePeriod): string {
  return `
    SELECT
      event,
      count() as count
    FROM events
    WHERE ${personIdentityFilter(userId)}
      ${periodFilter(period)}
      AND event IN (
        'sequence_create',
        'sequence_save',
        'sequence_export',
        'sequence_share',
        'collection_create'
      )
    GROUP BY event
  `;
}

function buildSessionsQuery(
  userId: string,
  period: TimePeriod,
  limit: number
): string {
  // Derive modules from pageview URLs instead of properties.module
  return `
    SELECT
      "$session_id" as session_id,
      min(timestamp) as started_at,
      max(timestamp) as ended_at,
      dateDiff('millisecond', min(timestamp), max(timestamp)) as duration,
      arrayDistinct(
        arrayFilter(
          x -> x != '',
          groupArray(
            if(event = '$pageview',
              splitByChar('/', ifNull(path(properties."$current_url"), ''))[2],
              ''
            )
          )
        )
      ) as modules,
      count() as event_count,
      countIf(event = '$exception') as exception_count,
      countIf(event IN (
        'sequence_create',
        'sequence_save',
        'sequence_export',
        'sequence_share',
        'collection_create'
      )) as content_action_count,
      argMinIf(
        path(properties."$current_url"),
        timestamp,
        event = '$pageview' AND properties."$current_url" IS NOT NULL
      ) as entry_path,
      argMaxIf(
        path(properties."$current_url"),
        timestamp,
        event = '$pageview' AND properties."$current_url" IS NOT NULL
      ) as exit_path,
      argMax(properties."$browser", timestamp) as browser,
      argMax(properties."$os", timestamp) as operating_system,
      argMax(properties."$device_type", timestamp) as device_type
    FROM events
    WHERE ${personIdentityFilter(userId)}
      AND "$session_id" IS NOT NULL
      ${periodFilter(period)}
    GROUP BY "$session_id"
    ORDER BY started_at DESC
    LIMIT ${Math.min(limit, 50)}
  `;
}

function buildSessionEventsQuery(
  userId: string,
  sessionId: string,
  limit: number
): string {
  const safeSessionId = escapeHogQL(sessionId);
  return `
    SELECT
      toString(uuid) as event_id,
      toString(timestamp) as occurred_at,
      event,
      if(
        properties."$current_url" IS NULL,
        '',
        path(properties."$current_url")
      ) as route,
      coalesce(
        properties."$el_text",
        properties."$event_type",
        ''
      ) as detail,
      properties."$exception_list" as exception_list,
      properties."$exception_type" as exception_type,
      properties."$exception_message" as exception_message
    FROM events
    WHERE ${personIdentityFilter(userId)}
      AND "$session_id" = '${safeSessionId}'
    ORDER BY timestamp ASC
    LIMIT ${Math.min(limit, 500)}
  `;
}

function asFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw error(502, `PostHog returned an invalid ${field}`);
  }
  return value;
}

function requireRowWidth(row: unknown[], width: number, field: string): void {
  if (row.length < width) {
    throw error(502, `PostHog returned an incomplete ${field}`);
  }
}

function asNullableIso(value: unknown, field: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw error(502, `PostHog returned an invalid ${field}`);
  }
  return value;
}

function asNullableString(value: unknown, field: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw error(502, `PostHog returned an invalid ${field}`);
  }
  return value;
}

function exceptionFromRow(
  listValue: unknown,
  typeValue: unknown,
  messageValue: unknown
): { type: string | null; message: string | null } | null {
  const directType = asNullableString(typeValue, "exception type");
  const directMessage = asNullableString(messageValue, "exception message");
  if (directType || directMessage) {
    return { type: directType, message: directMessage };
  }
  if (listValue == null || listValue === "") return null;

  let parsed: unknown = listValue;
  if (typeof parsed === "string") {
    const serialized = parsed;
    try {
      parsed = JSON.parse(serialized) as unknown;
    } catch {
      return { type: null, message: serialized };
    }
  }
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first || typeof first !== "object" || Array.isArray(first)) return null;
  const item = first as Record<string, unknown>;
  return {
    type:
      typeof item.type === "string"
        ? item.type
        : typeof item.name === "string"
          ? item.name
          : null,
    message:
      typeof item.value === "string"
        ? item.value
        : typeof item.message === "string"
          ? item.message
          : null,
  };
}

export function _perUserResult(
  type: QueryType,
  rows: unknown[][],
  projectId?: string
): unknown {
  if (type === "engagement") {
    if (rows.length !== 1) {
      throw error(502, "PostHog returned invalid engagement rows");
    }
    const row = rows[0]!;
    requireRowWidth(row, 4, "engagement row");
    return {
      source: "posthog",
      lastActiveAt: asNullableIso(row[0], "last activity"),
      memberSince: null,
      sessionsCount: asFiniteNumber(row[1], "session count"),
      avgSessionDuration: asFiniteNumber(row[2], "average session duration"),
      totalTimeSpent: asFiniteNumber(row[3], "total session duration"),
    };
  }
  if (type === "activity") {
    const parsed = rows.map((row) => {
      requireRowWidth(row, 2, "activity row");
      if (typeof row[0] !== "string" || !row[0])
        throw error(502, "PostHog returned an invalid module");
      return {
        module: row[0],
        eventCount: asFiniteNumber(row[1], "event count"),
      };
    });
    const total = parsed.reduce((sum, item) => sum + item.eventCount, 0);
    return parsed.map((item) => ({
      ...item,
      percentage: total ? Math.round((item.eventCount / total) * 100) : 0,
    }));
  }
  if (type === "content") {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      requireRowWidth(row, 2, "content row");
      if (typeof row[0] !== "string")
        throw error(502, "PostHog returned an invalid event name");
      counts[row[0]] = asFiniteNumber(row[1], "content event count");
    }
    return {
      sequencesCreated: counts.sequence_create ?? 0,
      sequencesSaved: counts.sequence_save ?? 0,
      sequencesExported: counts.sequence_export ?? 0,
      collectionsCreated: counts.collection_create ?? 0,
      sequencesShared: counts.sequence_share ?? 0,
    };
  }
  if (type === "sessions") {
    return rows.map((row) => {
      requireRowWidth(row, 13, "session row");
      if (typeof row[0] !== "string" || !row[0])
        throw error(502, "PostHog returned an invalid session ID");
      const startedAt = asNullableIso(row[1], "session start");
      if (!startedAt)
        throw error(502, "PostHog returned a session without a start time");
      if (
        !Array.isArray(row[4]) ||
        row[4].some((module) => typeof module !== "string")
      ) {
        throw error(502, "PostHog returned invalid session modules");
      }
      return {
        source: "posthog",
        sessionId: row[0],
        startedAt,
        endedAt: asNullableIso(row[2], "session end"),
        duration: asFiniteNumber(row[3], "session duration"),
        modules: row[4].filter(Boolean),
        eventCount: asFiniteNumber(row[5], "session event count"),
        exceptionCount: asFiniteNumber(row[6], "session exception count"),
        contentActionCount: asFiniteNumber(
          row[7],
          "session content action count"
        ),
        entryPath: asNullableString(row[8], "session entry path"),
        exitPath: asNullableString(row[9], "session exit path"),
        browser: asNullableString(row[10], "session browser"),
        operatingSystem: asNullableString(row[11], "session operating system"),
        deviceType: asNullableString(row[12], "session device type"),
        postHogUrl: projectId
          ? `https://us.posthog.com/project/${encodeURIComponent(projectId)}/replay/${encodeURIComponent(row[0])}`
          : null,
      };
    });
  }
  if (type === "session-events") {
    return rows.map((row) => {
      requireRowWidth(row, 8, "session event row");
      if (typeof row[0] !== "string" || !row[0]) {
        throw error(502, "PostHog returned an invalid session event ID");
      }
      const timestamp = asNullableIso(row[1], "session event timestamp");
      if (!timestamp) {
        throw error(
          502,
          "PostHog returned a session event without a timestamp"
        );
      }
      if (typeof row[2] !== "string" || !row[2]) {
        throw error(502, "PostHog returned an invalid session event name");
      }
      return {
        eventId: row[0],
        timestamp,
        event: row[2],
        path: asNullableString(row[3], "session event path"),
        detail: asNullableString(row[4], "session event detail"),
        exception: exceptionFromRow(row[5], row[6], row[7]),
      };
    });
  }
  return rows;
}

// --- Global Pulse queries (site-wide, not per-user) ---

function buildPulseOverviewQuery(): string {
  return `
    SELECT
      uniqIf(distinct_id, event = '$pageview' AND timestamp > now() - interval 1 day) as visitors_today,
      uniqIf(distinct_id, event = '$pageview' AND timestamp > now() - interval 7 day) as visitors_7d,
      uniqIf(distinct_id, event = '$pageview' AND timestamp > now() - interval 30 day) as visitors_30d,
      countIf(event = 'card_scanned' AND timestamp > now() - interval 1 day) as scans_today,
      countIf(event = 'card_scanned' AND timestamp > now() - interval 7 day) as scans_7d,
      countIf(event = 'card_scanned' AND timestamp > now() - interval 30 day) as scans_30d,
      countIf(event IN ('sequence_save', 'collection_create') AND timestamp > now() - interval 1 day) as saves_today,
      countIf(event IN ('sequence_save', 'collection_create') AND timestamp > now() - interval 7 day) as saves_7d,
      countIf(event IN ('sequence_save', 'collection_create') AND timestamp > now() - interval 30 day) as saves_30d
    FROM events
    WHERE timestamp > now() - interval 30 day
      AND ${pulseProdFilter()}
  `;
}

function buildPulseBreakdownQuery(dimension: PulseDimension): string {
  const dimExpr: Record<PulseDimension, string> = {
    country: `properties."$geoip_country_name"`,
    city: `concat(coalesce(properties."$geoip_city_name", ''), ', ', coalesce(properties."$geoip_country_name", ''))`,
    referrer: `properties."$referring_domain"`,
    device: `concat(coalesce(properties."$browser", '?'), ' · ', coalesce(properties."$os", '?'))`,
  };
  return `
    SELECT
      ${dimExpr[dimension]} as name,
      uniq(distinct_id) as visitors
    FROM events
    WHERE event = '$pageview'
      AND timestamp > now() - interval 30 day
      AND ${pulseProdFilter()}
    GROUP BY name
    HAVING name IS NOT NULL AND name != '' AND name != ', '
    ORDER BY visitors DESC
    LIMIT 12
  `;
}

function buildPulseFeedQuery(limit: number): string {
  return `
    SELECT
      toString(timestamp) as ts,
      event,
      distinct_id,
      properties."$geoip_city_name" as city,
      properties."$geoip_country_name" as country,
      properties."$device_type" as device
    FROM events
    WHERE event IN ('session_start', 'card_scanned', 'sequence_save', 'collection_create', '$identify')
      AND timestamp > now() - interval 14 day
      AND ${pulseProdFilter()}
    ORDER BY timestamp DESC
    LIMIT ${Math.min(limit, 100)}
  `;
}

function buildPulseLiveQuery(): string {
  return `
    SELECT
      uniq(distinct_id) as live_total,
      uniqIf(distinct_id, match(distinct_id, '^[A-Za-z0-9]{28}$') = 0) as live_anon
    FROM events
    WHERE timestamp > now() - interval 5 minute
      AND ${pulseProdFilter()}
  `;
}

function buildSeoScorecardQuery(): string {
  return `
    SELECT
      toString(timestamp) as captured_at,
      properties.snapshot_json as snapshot_json
    FROM events
    WHERE event = 'seo_measurement_snapshot'
      AND distinct_id = 'seo-measurement'
    ORDER BY timestamp DESC
    LIMIT 1
  `;
}

function buildSeoHistoryQuery(): string {
  return `
    SELECT
      toString(timestamp) as captured_at,
      toString(toDate(properties.generated_date)) as generated_date,
      properties.phase as phase,
      properties.decision_status as decision_status,
      properties.head_term_position as head_term_position,
      properties.treatment_impressions as treatment_impressions,
      properties.organic_activation_rate as organic_activation_rate,
      properties.ai_citation_rate as ai_citation_rate,
      properties.indexed_rate as indexed_rate,
      properties.evaluation_mode as evaluation_mode
    FROM events
    WHERE event = 'seo_measurement_snapshot'
      AND distinct_id = 'seo-measurement'
    ORDER BY timestamp ASC
    LIMIT 180
  `;
}

function statusFromError(err: unknown): number | null {
  if (typeof err !== "object" || err === null || !("status" in err)) {
    return null;
  }
  const status = Number((err as { status: unknown }).status);
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : null;
}

function bodyMessageFromError(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("body" in err)) return null;
  const body = (err as { body?: unknown }).body;
  if (typeof body !== "object" || body === null || !("message" in body)) {
    return null;
  }
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" && message ? message : null;
}

function safeAnalyticsFailure(err: unknown, stage: AnalyticsStage): Response {
  const errorStatus = statusFromError(err);
  const status = errorStatus ?? 500;
  const expectedMessage = bodyMessageFromError(err);
  const clientMessage =
    expectedMessage ??
    (status < 500 && err instanceof Error
      ? err.message
      : stage === "posthog"
        ? "PostHog could not answer the analytics request."
        : "Analytics could not complete this request.");

  console.error("[analytics] Request failed:", {
    stage,
    status,
    message: err instanceof Error ? err.message : String(err),
  });

  return Response.json(
    { success: false, message: clientMessage, code: stage },
    { status }
  );
}

export const POST: RequestHandler = async (event) => {
  let stage: AnalyticsStage = "authorize";
  try {
    const caller = await requireAdmin(event);

    stage = "rate_limit";
    const blocked = await withRateLimit(
      event,
      RATE_LIMITS.ADMIN,
      "user",
      caller.uid
    );
    if (blocked) return blocked;

    stage = "read_request";
    const body = await event.request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw error(400, "Analytics request body must be an object");
    }
    const { type, userId, period, limit, dimension, sessionId } = body as {
      type: QueryType;
      userId?: string;
      period?: TimePeriod;
      limit?: number;
      dimension?: PulseDimension;
      sessionId?: string;
    };
    const isGlobal = GLOBAL_QUERY_TYPES.has(type);
    if (!type || (!isGlobal && !userId)) {
      throw error(400, "type and userId are required");
    }

    const periods: TimePeriod[] = ["today", "week", "month", "all"];
    if (period !== undefined && !periods.includes(period)) {
      throw error(400, "Invalid analytics period");
    }
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) ||
        limit < 1 ||
        limit >
          (type === "session-events" ? 500 : type === "pulse-feed" ? 100 : 50))
    ) {
      throw error(400, "Invalid analytics limit");
    }

    if (
      !isGlobal &&
      (typeof userId !== "string" || userId.length === 0 || userId.length > 128)
    ) {
      throw error(400, "Invalid userId format");
    }
    if (
      type === "session-events" &&
      (typeof sessionId !== "string" ||
        sessionId.length === 0 ||
        sessionId.length > 128)
    ) {
      throw error(400, "session-events requires a valid sessionId");
    }

    stage = "build_query";
    let query: string;
    switch (type) {
      case "engagement":
        query = buildEngagementQuery(userId!, period ?? "week");
        break;
      case "activity":
        query = buildActivityQuery(userId!, period ?? "week");
        break;
      case "content":
        query = buildContentQuery(userId!, period ?? "week");
        break;
      case "sessions":
        query = buildSessionsQuery(userId!, period ?? "week", limit ?? 10);
        break;
      case "session-events":
        query = buildSessionEventsQuery(userId!, sessionId!, limit ?? 500);
        break;
      case "pulse-overview":
        query = buildPulseOverviewQuery();
        break;
      case "pulse-breakdown": {
        const dims: PulseDimension[] = [
          "country",
          "city",
          "referrer",
          "device",
        ];
        if (!dimension || !dims.includes(dimension)) {
          throw error(400, "pulse-breakdown requires a valid dimension");
        }
        query = buildPulseBreakdownQuery(dimension);
        break;
      }
      case "pulse-feed":
        query = buildPulseFeedQuery(limit ?? 60);
        break;
      case "pulse-live":
        query = buildPulseLiveQuery();
        break;
      case "seo-scorecard":
        query = buildSeoScorecardQuery();
        break;
      case "seo-history":
        query = buildSeoHistoryQuery();
        break;
      default:
        throw error(400, `Unknown query type: ${type}`);
    }

    stage = "posthog";
    const result = await executeHogQLQuery(query);

    const rows = result.results;
    let data: unknown;
    if (!isGlobal && type === "sessions" && rows.length === 0) {
      stage = "firestore";
      data = await loadComposerSessions(userId!, period ?? "week", limit ?? 10);
    } else {
      data = isGlobal
        ? rows
        : _perUserResult(
            type,
            rows,
            type === "sessions" ? getProjectId() : undefined
          );
    }
    if (
      type === "engagement" &&
      userId &&
      (data as { sessionsCount?: unknown }).sessionsCount === 0
    ) {
      stage = "firestore";
      data =
        composerEngagement(
          await loadComposerSessions(userId, period ?? "week")
        ) ?? data;
    }
    if (type === "engagement" && userId) {
      const userRecord = await getAdminAuth().getUser(userId);
      data = {
        ...(data as Record<string, unknown>),
        memberSince: userRecord.metadata.creationTime ?? null,
      };
    }

    stage = "audit";
    await logAdminAction({
      uid: caller.uid,
      action: "analytics_query",
      target: userId ?? "global",
      metadata: {
        queryType: type,
        ...(period != null && { period }),
        ...(sessionId != null && { sessionId }),
      },
      ip: event.getClientAddress(),
    });
    return Response.json({
      success: true,
      type,
      data,
      ...(isGlobal ? { results: rows } : {}),
    });
  } catch (err: unknown) {
    return safeAnalyticsFailure(err, stage);
  }
};
