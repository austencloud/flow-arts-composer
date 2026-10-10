import { describe, expect, it } from "vitest";
import {
  buildProfileReadDenialsQuery,
  buildProfileReadExposureQuery,
  parseProfileReadDenial,
  parseProfileReadExposure,
} from "#lib/server/analytics/profile-read-verification-queries.js";

describe("profile read verification queries", () => {
  it("counts only exact profile-read executions and failures", () => {
    const query = buildProfileReadExposureQuery("2026-08-05T12:34:56.000Z");
    expect(query).toContain("profile_document_read_completed");
    expect(query).toContain("users/{id}");
    expect(query).toContain("telemetry_schema_version");
    expect(query).toContain("toDateTime('2026-08-05 12:34:56')");
    expect(query).toContain("distinct_id NOT LIKE 'agent-%'");
  });

  it("bounds the recurrence query", () => {
    expect(buildProfileReadDenialsQuery("2026-08-05T00:00:00Z", 999)).toContain(
      "LIMIT 500"
    );
  });

  it("parses aggregate exposure", () => {
    expect(parseProfileReadExposure(["101", "63"])).toEqual({
      sessions: 101,
      identities: 63,
    });
  });

  it("normalizes recurrence timestamps", () => {
    expect(
      parseProfileReadDenial([
        "session-1",
        "user-1",
        "2026-08-05 12:34:56",
        "/app/create/generate",
        "2",
      ])
    ).toEqual({
      sessionId: "session-1",
      uid: "user-1",
      occurredAt: "2026-08-05T12:34:56Z",
      route: "/app/create/generate",
      eventCount: 2,
    });
  });
});
