import { describe, expect, it } from "vitest";
import {
  buildAdminSessionReplayUrl,
  parseAdminSessionReplayTarget,
} from "#lib/features/admin/domain/session-replay-target.js";

describe("admin session replay target", () => {
  it("round-trips exact user and session IDs through the URL", () => {
    const destination = buildAdminSessionReplayUrl(
      "user/with spaces",
      "session+one"
    );
    const url = new URL(destination, "https://tkaflowarts.com");

    expect(url.pathname).toBe("/admin/users");
    expect(parseAdminSessionReplayTarget(url.searchParams)).toEqual({
      userId: "user/with spaces",
      sessionId: "session+one",
    });
  });

  it("keeps legacy user-only notifications useful", () => {
    const destination = buildAdminSessionReplayUrl("user-123");
    const url = new URL(destination, "https://tkaflowarts.com");

    expect(parseAdminSessionReplayTarget(url.searchParams)).toEqual({
      userId: "user-123",
      sessionId: null,
    });
  });

  it("rejects a session target without a user target", () => {
    expect(
      parseAdminSessionReplayTarget(
        new URLSearchParams({ inspectSession: "orphan-session" })
      )
    ).toBeNull();
  });
});
