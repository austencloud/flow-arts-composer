/** Strict client for the named per-user analytics contracts. */
import { authedFetch } from "#lib/shared/auth/services/authed-fetch.js";
import type {
  ContentMetrics,
  ModuleActivityBreakdown,
  PostHogSessionEvent,
  PostHogReplayAccess,
  PostHogReplayAccessState,
  TimePeriod,
  UserActivitySessionSummary,
  UserEngagementSummary,
} from "./types";

type QueryType =
  | "engagement"
  | "activity"
  | "content"
  | "sessions"
  | "session-events";

export class AnalyticsResponseError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "AnalyticsResponseError";
  }
}

export class PostHogUserAnalytics {
  async getSessionReplayAccess(
    sessionId: string,
    signal?: AbortSignal
  ): Promise<PostHogReplayAccess> {
    const response = await authedFetch("/api/admin/session-replay", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });
    const body = (await response.json().catch(() => null)) as {
      state?: unknown;
      embedUrl?: unknown;
      message?: unknown;
    } | null;
    if (body && isReplayAccessState(body.state)) {
      return {
        state: body.state,
        embedUrl: typeof body.embedUrl === "string" ? body.embedUrl : null,
        message:
          typeof body.message === "string"
            ? body.message
            : "Replay access did not include a status message.",
      };
    }
    throw new AnalyticsResponseError(
      typeof body?.message === "string"
        ? body.message
        : `Replay request failed (${response.status})`,
      response.status
    );
  }

  async getEngagementSummary(
    userId: string,
    period: TimePeriod,
    signal?: AbortSignal
  ): Promise<UserEngagementSummary> {
    return parseEngagement(
      await this.query("engagement", userId, { period }, signal)
    );
  }

  async getActivityBreakdown(
    userId: string,
    period: TimePeriod,
    signal?: AbortSignal
  ): Promise<ModuleActivityBreakdown[]> {
    const data = await this.query("activity", userId, { period }, signal);
    if (!Array.isArray(data))
      throw new AnalyticsResponseError(
        "Analytics returned an invalid activity response"
      );
    return data.map(parseActivity);
  }

  async getContentMetrics(
    userId: string,
    period: TimePeriod,
    signal?: AbortSignal
  ): Promise<ContentMetrics> {
    return parseContent(
      await this.query("content", userId, { period }, signal)
    );
  }

  async getRecentSessions(
    userId: string,
    period: TimePeriod,
    limit = 10,
    signal?: AbortSignal
  ): Promise<UserActivitySessionSummary[]> {
    const data = await this.query(
      "sessions",
      userId,
      { period, limit },
      signal
    );
    if (!Array.isArray(data))
      throw new AnalyticsResponseError(
        "Analytics returned an invalid sessions response"
      );
    return data.map(parseSession);
  }

  async getSessionEvents(
    userId: string,
    sessionId: string,
    signal?: AbortSignal
  ): Promise<PostHogSessionEvent[]> {
    const data = await this.query(
      "session-events",
      userId,
      { sessionId, limit: 500 },
      signal
    );
    if (!Array.isArray(data))
      throw new AnalyticsResponseError(
        "Analytics returned an invalid session event response"
      );
    return data.map(parseSessionEvent);
  }

  private async query(
    type: QueryType,
    userId: string,
    extra: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    const response = await authedFetch("/api/admin/analytics", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type, userId, ...extra }),
    });
    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
      data?: unknown;
    } | null;
    if (!response.ok || body?.success !== true) {
      throw new AnalyticsResponseError(
        body?.message || `Analytics request failed (${response.status})`,
        response.status
      );
    }
    if (!("data" in body))
      throw new AnalyticsResponseError("Analytics response omitted data");
    return body.data;
  }
}

function isReplayAccessState(
  value: unknown
): value is PostHogReplayAccessState {
  return [
    "ready",
    "processing",
    "unavailable",
    "configuration",
    "error",
  ].includes(String(value));
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AnalyticsResponseError(`Analytics returned invalid ${label}`);
  return value as Record<string, unknown>;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new AnalyticsResponseError(`Analytics returned invalid ${label}`);
  return value;
}

function nullableDate(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new AnalyticsResponseError(`Analytics returned invalid ${label}`);
  return value;
}

function requiredDate(value: unknown, label: string): string {
  const date = nullableDate(value, label);
  if (date === null)
    throw new AnalyticsResponseError(`Analytics omitted ${label}`);
  return date;
}

function parseEngagement(value: unknown): UserEngagementSummary {
  const item = record(value, "engagement data");
  const source = analyticsSource(item.source, "engagement source");
  return {
    source,
    lastActiveAt: nullableDate(item.lastActiveAt, "last activity"),
    memberSince: nullableDate(item.memberSince, "membership date"),
    sessionsCount: number(item.sessionsCount, "session count"),
    avgSessionDuration: number(item.avgSessionDuration, "average duration"),
    totalTimeSpent: number(item.totalTimeSpent, "total duration"),
  };
}

function parseActivity(value: unknown): ModuleActivityBreakdown {
  const item = record(value, "activity item");
  if (typeof item.module !== "string" || !item.module)
    throw new AnalyticsResponseError("Analytics returned invalid module data");
  return {
    module: item.module,
    eventCount: number(item.eventCount, "event count"),
    percentage: number(item.percentage, "activity percentage"),
  };
}

function parseContent(value: unknown): ContentMetrics {
  const item = record(value, "content metrics");
  return {
    sequencesCreated: number(item.sequencesCreated, "created count"),
    sequencesSaved: number(item.sequencesSaved, "saved count"),
    sequencesExported: number(item.sequencesExported, "exported count"),
    collectionsCreated: number(item.collectionsCreated, "collection count"),
    sequencesShared: number(item.sequencesShared, "shared count"),
  };
}

function parseSession(value: unknown): UserActivitySessionSummary {
  const item = record(value, "session");
  if (typeof item.sessionId !== "string" || !item.sessionId)
    throw new AnalyticsResponseError("Analytics returned invalid session ID");
  const source = analyticsSource(item.source, "session source");
  if (source === "composer") {
    const status = item.status;
    if (
      status !== null &&
      !["active", "completed", "abandoned"].includes(String(status))
    ) {
      throw new AnalyticsResponseError(
        "Analytics returned invalid Composer session status"
      );
    }
    return {
      source,
      sessionId: item.sessionId,
      startedAt: new Date(requiredDate(item.startedAt, "session start")),
      endedAt: new Date(requiredDate(item.endedAt, "session end")),
      duration: number(item.duration, "session duration"),
      name: nullableString(item.name, "session name"),
      status: status as "active" | "completed" | "abandoned" | null,
      stepCount: nullableNumber(item.stepCount, "session step count"),
      isSaved: nullableBoolean(item.isSaved, "session saved state"),
      lastAutosaveAt:
        item.lastAutosaveAt === null
          ? null
          : new Date(
              nullableDate(item.lastAutosaveAt, "session autosave time")!
            ),
    };
  }

  if (
    !Array.isArray(item.modules) ||
    item.modules.some((module) => typeof module !== "string")
  )
    throw new AnalyticsResponseError(
      "Analytics returned invalid session modules"
    );
  return {
    source,
    sessionId: item.sessionId,
    startedAt: new Date(requiredDate(item.startedAt, "session start")),
    endedAt:
      item.endedAt === null
        ? null
        : new Date(nullableDate(item.endedAt, "session end")!),
    duration: number(item.duration, "session duration"),
    modules: item.modules as string[],
    eventCount: number(item.eventCount, "session event count"),
    exceptionCount: number(item.exceptionCount, "session exception count"),
    contentActionCount: number(
      item.contentActionCount,
      "session content action count"
    ),
    entryPath: nullableString(item.entryPath, "session entry path"),
    exitPath: nullableString(item.exitPath, "session exit path"),
    browser: nullableString(item.browser, "session browser"),
    operatingSystem: nullableString(
      item.operatingSystem,
      "session operating system"
    ),
    deviceType: nullableString(item.deviceType, "session device type"),
    postHogUrl: nullableString(item.postHogUrl, "PostHog session URL"),
  };
}

function analyticsSource(
  value: unknown,
  label: string
): "posthog" | "composer" {
  if (value !== "posthog" && value !== "composer") {
    throw new AnalyticsResponseError(`Analytics returned invalid ${label}`);
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  if (value === null) return null;
  return number(value, label);
}

function nullableBoolean(value: unknown, label: string): boolean | null {
  if (value === null) return null;
  if (typeof value !== "boolean") {
    throw new AnalyticsResponseError(`Analytics returned invalid ${label}`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string")
    throw new AnalyticsResponseError(`Analytics returned invalid ${label}`);
  return value || null;
}

function parseSessionEvent(value: unknown): PostHogSessionEvent {
  const item = record(value, "session event");
  if (typeof item.eventId !== "string" || !item.eventId)
    throw new AnalyticsResponseError(
      "Analytics returned invalid session event ID"
    );
  if (typeof item.event !== "string" || !item.event)
    throw new AnalyticsResponseError(
      "Analytics returned invalid session event name"
    );
  const exception = item.exception;
  if (exception !== null) {
    const parsedException = record(exception, "session exception");
    return {
      eventId: item.eventId,
      timestamp: new Date(requiredDate(item.timestamp, "event timestamp")),
      event: item.event,
      path: nullableString(item.path, "event path"),
      detail: nullableString(item.detail, "event detail"),
      exception: {
        type: nullableString(parsedException.type, "exception type"),
        message: nullableString(parsedException.message, "exception message"),
      },
    };
  }
  return {
    eventId: item.eventId,
    timestamp: new Date(requiredDate(item.timestamp, "event timestamp")),
    event: item.event,
    path: nullableString(item.path, "event path"),
    detail: nullableString(item.detail, "event detail"),
    exception: null,
  };
}
