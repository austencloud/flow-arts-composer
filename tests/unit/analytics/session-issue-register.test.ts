import { describe, it, expect } from "vitest";
import {
  matchIssue,
  applySighting,
  shouldResolveOnSilence,
  nextWatermark,
  type SessionIssue,
  type Sighting,
} from "#lib/server/analytics/session-issue-register.js";

function issue(over: Partial<SessionIssue> = {}): SessionIssue {
  return {
    id: "ISS-001",
    title: "Sign-in click does nothing",
    status: "open",
    codeSite: "AccountPopover.svelte:114",
    route: "/",
    feedbackId: "FB-248",
    firstSeen: "2026-07-29T00:00:00Z",
    lastSeen: "2026-07-29T00:00:00Z",
    affectedUids: ["u_a"],
    evidence: [
      { sessionId: "s_1", uid: "u_a", occurredAt: "2026-07-29T00:00:00Z", summary: "x", replayUrl: "" },
    ],
    resolvedAt: null,
    resolvedReason: null,
    ...over,
  };
}

function sighting(over: Partial<Sighting> = {}): Sighting {
  return {
    sessionId: "s_2",
    uid: "u_b",
    occurredAt: "2026-08-02T00:00:00Z",
    summary: "4 rage clicks, bounced in 11s",
    replayUrl: "https://us.posthog.com/replay/s_2",
    codeSite: "AccountPopover.svelte:114",
    route: "/",
    ...over,
  };
}

describe("matchIssue", () => {
  it("matches on code site first", () => {
    const m = matchIssue([issue()], sighting({ route: "/somewhere-else" }));
    expect(m?.id).toBe("ISS-001");
  });

  it("falls back to route when the sighting has no code site", () => {
    const m = matchIssue([issue()], sighting({ codeSite: null }));
    expect(m?.id).toBe("ISS-001");
  });

  it("returns null for an unrelated sighting", () => {
    const m = matchIssue([issue()], sighting({ codeSite: "Other.svelte:1", route: "/browse" }));
    expect(m).toBeNull();
  });

  it("never matches a dismissed issue", () => {
    expect(matchIssue([issue({ status: "dismissed" })], sighting())).toBeNull();
  });

  it("matches a resolved issue so it can reopen", () => {
    const m = matchIssue([issue({ status: "resolved" })], sighting());
    expect(m?.id).toBe("ISS-001");
  });

  it("prefers a code-site match over a route match", () => {
    const routeOnly = issue({ id: "ISS-ROUTE", codeSite: null, route: "/" });
    const codeMatch = issue({ id: "ISS-CODE", codeSite: "AccountPopover.svelte:114", route: "/other" });
    expect(matchIssue([routeOnly, codeMatch], sighting())?.id).toBe("ISS-CODE");
  });

  it("does not match a different code site on the same route", () => {
    const other = issue({ codeSite: "Other.svelte:9", route: "/" });
    expect(matchIssue([other], sighting())).toBeNull();
  });
});

describe("applySighting", () => {
  it("adds a new uid to affectedUids", () => {
    const out = applySighting(issue(), sighting());
    expect(out.affectedUids).toEqual(["u_a", "u_b"]);
  });

  it("does not double-count a repeat visitor", () => {
    const out = applySighting(issue(), sighting({ uid: "u_a" }));
    expect(out.affectedUids).toEqual(["u_a"]);
  });

  it("is idempotent for a session already recorded", () => {
    const once = applySighting(issue(), sighting());
    const twice = applySighting(once, sighting());
    expect(twice.evidence).toHaveLength(2);
  });

  it("advances lastSeen", () => {
    expect(applySighting(issue(), sighting()).lastSeen).toBe("2026-08-02T00:00:00Z");
  });

  it("backdates firstSeen when an older sighting arrives", () => {
    const out = applySighting(issue(), sighting({ occurredAt: "2026-07-01T00:00:00Z" }));
    expect(out.firstSeen).toBe("2026-07-01T00:00:00Z");
    expect(out.lastSeen).toBe("2026-07-29T00:00:00Z");
  });

  it("reopens a resolved issue", () => {
    const out = applySighting(issue({ status: "resolved", resolvedAt: "2026-08-01T00:00:00Z" }), sighting());
    expect(out.status).toBe("open");
    expect(out.resolvedAt).toBeNull();
  });

  it("does not mutate the input issue", () => {
    const original = issue();
    applySighting(original, sighting());
    expect(original.affectedUids).toEqual(["u_a"]);
    expect(original.evidence).toHaveLength(1);
  });
});

describe("shouldResolveOnSilence", () => {
  const now = new Date("2026-08-20T00:00:00Z");

  it("resolves when quiet 14 days AND feedback completed", () => {
    expect(shouldResolveOnSilence(issue({ lastSeen: "2026-08-01T00:00:00Z" }), "completed", now)).toBe(true);
  });

  it("does NOT resolve on silence alone", () => {
    expect(shouldResolveOnSilence(issue({ lastSeen: "2026-08-01T00:00:00Z" }), "in-progress", now)).toBe(false);
  });

  it("does NOT resolve when recently seen even if feedback completed", () => {
    expect(shouldResolveOnSilence(issue({ lastSeen: "2026-08-19T00:00:00Z" }), "completed", now)).toBe(false);
  });

  it("does NOT resolve an issue with no linked feedback", () => {
    expect(shouldResolveOnSilence(issue({ lastSeen: "2026-08-01T00:00:00Z", feedbackId: null }), null, now)).toBe(false);
  });

  it("leaves an already-resolved issue alone", () => {
    expect(shouldResolveOnSilence(issue({ status: "resolved", lastSeen: "2026-08-01T00:00:00Z" }), "completed", now)).toBe(false);
  });

  it("leaves a dismissed issue alone", () => {
    expect(shouldResolveOnSilence(issue({ status: "dismissed", lastSeen: "2026-08-01T00:00:00Z" }), "completed", now)).toBe(false);
  });
});

describe("nextWatermark", () => {
  it("returns the newest session start", () => {
    expect(nextWatermark("2026-08-01T00:00:00Z", ["2026-08-03T00:00:00Z", "2026-08-02T00:00:00Z"]))
      .toBe("2026-08-03T00:00:00Z");
  });

  it("never moves backwards", () => {
    expect(nextWatermark("2026-08-05T00:00:00Z", ["2026-08-02T00:00:00Z"]))
      .toBe("2026-08-05T00:00:00Z");
  });

  it("holds steady on an empty run", () => {
    expect(nextWatermark("2026-08-05T00:00:00Z", [])).toBe("2026-08-05T00:00:00Z");
  });
});
