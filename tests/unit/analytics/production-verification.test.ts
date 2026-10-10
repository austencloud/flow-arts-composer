import { describe, expect, it } from "vitest";
import { evaluateProductionVerification } from "#lib/server/analytics/production-verification.js";

function observation(
  overrides: Partial<Parameters<typeof evaluateProductionVerification>[0]> = {}
) {
  return {
    now: new Date("2026-08-20T00:00:00Z"),
    deployedSourceMatches: true,
    canaryPassed: true,
    startedAt: "2026-08-05T00:00:00Z",
    eligibleSessions: 100,
    matchingSessions: 0,
    ...overrides,
  };
}

describe("evaluateProductionVerification", () => {
  it("waits until the reviewed source is deployed", () => {
    expect(
      evaluateProductionVerification(
        observation({ deployedSourceMatches: false })
      ).status
    ).toBe("waiting-for-deploy");
  });

  it("fails when the live authorization canary is denied", () => {
    expect(
      evaluateProductionVerification(observation({ canaryPassed: false }))
        .status
    ).toBe("canary-failed");
  });

  it("treats any matching session as a recurrence", () => {
    expect(
      evaluateProductionVerification(observation({ matchingSessions: 1 }))
        .status
    ).toBe("recurred");
  });

  it("does not pass on time without enough exposure", () => {
    const result = evaluateProductionVerification(
      observation({ eligibleSessions: 99 })
    );
    expect(result.status).toBe("observing");
    expect(result.sessionsRemaining).toBe(1);
  });

  it("does not pass on exposure before the quiet period", () => {
    expect(
      evaluateProductionVerification(
        observation({ startedAt: "2026-08-10T00:00:00Z" })
      ).status
    ).toBe("observing");
  });

  it("passes only after both gates are satisfied", () => {
    const result = evaluateProductionVerification(observation());
    expect(result.status).toBe("passed");
    expect(result.sessionsRemaining).toBe(0);
  });
});
