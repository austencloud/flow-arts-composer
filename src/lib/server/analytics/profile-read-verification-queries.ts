import { escapeHogQL, pulseProdFilter } from "./hogql-shared";
import { toIsoUtc } from "./session-triage-queries";

export const PROFILE_READ_EXPOSURE_EVENT = "profile_document_read_completed";
export const PROFILE_READ_PATH_SHAPE = "users/{id}";

export interface ProfileReadExposure {
  sessions: number;
  identities: number;
}

export interface ProfileReadDenial {
  sessionId: string;
  uid: string;
  occurredAt: string;
  route: string;
  eventCount: number;
}

function toClickHouseDateTime(iso: string): string {
  return escapeHogQL(
    iso
      .replace("T", " ")
      .replace(/\.\d+Z?$/, "")
      .replace("Z", "")
  );
}

const exactProfileReadFailure = `
  event = '$exception'
  AND toString(properties."telemetry_schema_version") = '2'
  AND properties."telemetry_path_shape" = '${PROFILE_READ_PATH_SHAPE}'
  AND properties."telemetry_module" = 'firestore'
  AND properties."telemetry_action" = 'get'
  AND (
    -- The web SDK leaves $exception_message empty and sends the text in
    -- the $exception_values list, so search that list as one string.
    positionCaseInsensitiveUTF8(toString(properties."$exception_values"), 'missing or insufficient permissions') > 0
    OR positionCaseInsensitiveUTF8(toString(properties."$exception_values"), 'permission-denied') > 0
    OR positionCaseInsensitiveUTF8(coalesce(properties."$exception_message", ''), 'missing or insufficient permissions') > 0
    OR positionCaseInsensitiveUTF8(coalesce(properties."$exception_message", ''), 'permission-denied') > 0
  )
`;

/** Count only sessions that executed the exact owner-profile read under review. */
export function buildProfileReadExposureQuery(sinceIso: string): string {
  const since = toClickHouseDateTime(sinceIso);
  return `
    SELECT
      countDistinct("$session_id") as sessions,
      countDistinct(distinct_id) as identities
    FROM events
    WHERE timestamp >= toDateTime('${since}')
      AND "$session_id" != ''
      AND (
        event = '${PROFILE_READ_EXPOSURE_EVENT}'
        OR (${exactProfileReadFailure})
      )
      AND ${pulseProdFilter()}
  `;
}

/** Return each session carrying the exact versioned denial fingerprint. */
export function buildProfileReadDenialsQuery(
  sinceIso: string,
  limit = 200
): string {
  const since = toClickHouseDateTime(sinceIso);
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
  return `
    SELECT
      "$session_id" as session_id,
      argMax(distinct_id, timestamp) as uid,
      toString(max(timestamp)) as occurred_at,
      argMaxIf(path(properties."$current_url"), timestamp, properties."$current_url" IS NOT NULL) as route,
      count() as event_count
    FROM events
    WHERE timestamp >= toDateTime('${since}')
      AND "$session_id" != ''
      AND ${exactProfileReadFailure}
      AND ${pulseProdFilter()}
    GROUP BY session_id
    ORDER BY occurred_at DESC
    LIMIT ${boundedLimit}
  `;
}

export function parseProfileReadExposure(
  row: unknown[] | undefined
): ProfileReadExposure {
  return {
    sessions: Number(row?.[0] ?? 0),
    identities: Number(row?.[1] ?? 0),
  };
}

export function parseProfileReadDenial(row: unknown[]): ProfileReadDenial {
  return {
    sessionId: String(row[0] ?? ""),
    uid: String(row[1] ?? ""),
    occurredAt: toIsoUtc(String(row[2] ?? "")),
    route: String(row[3] ?? ""),
    eventCount: Number(row[4] ?? 0),
  };
}
