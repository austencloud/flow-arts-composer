import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aggregatePresenceTree,
  aggregateStoredPresence,
} from "#lib/shared/presence/domain/presence-aggregation.js";
import type { UserPresence } from "#lib/shared/presence/domain/models/presence-models.js";

function connection(overrides: Partial<UserPresence> = {}): UserPresence {
  return {
    online: true,
    activityStatus: "active",
    lastActivity: Date.now(),
    lastSeen: Date.now(),
    currentModule: "create",
    currentTab: null,
    sessionId: "session-1",
    device: "desktop",
    ...overrides,
  };
}

describe("presence aggregation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T23:00:00.000Z"));
  });

  it("keeps a legacy user active when a surviving tab writes fresh activity", () => {
    const presence = aggregateStoredPresence(
      "user-1",
      connection({
        online: false,
        activityStatus: "active",
        lastActivity: Date.now() - 30_000,
      })
    );

    expect(presence.online).toBe(true);
    expect(presence.activityStatus).toBe("active");
  });

  it("keeps a genuine legacy disconnect offline even with a fresh timestamp", () => {
    const presence = aggregateStoredPresence(
      "user-1",
      connection({
        online: false,
        activityStatus: "offline",
        lastActivity: Date.now() - 30_000,
      })
    );

    expect(presence.online).toBe(false);
    expect(presence.activityStatus).toBe("offline");
  });

  it("stays active when one of two connection children disconnects", () => {
    const remaining = connection({
      lastActivity: Date.now() - 45_000,
      currentModule: "admin",
      sessionId: "remaining",
    });

    const before = aggregateStoredPresence("user-1", {
      schemaVersion: 2,
      connections: {
        old: connection({ lastActivity: Date.now() - 90_000 }),
        remaining,
      },
    });
    const after = aggregateStoredPresence("user-1", {
      schemaVersion: 2,
      connections: { remaining },
    });

    expect(before.activityStatus).toBe("active");
    expect(after.activityStatus).toBe("active");
    expect(after.currentModule).toBe("admin");
    expect(after.sessionId).toBe("remaining");
  });

  it("reports connected but idle users as inactive", () => {
    const presence = aggregateStoredPresence("user-1", {
      schemaVersion: 2,
      connections: {
        idle: connection({ lastActivity: Date.now() - 6 * 60_000 }),
      },
    });

    expect(presence.online).toBe(true);
    expect(presence.activityStatus).toBe("offline");
  });

  it("preserves user-level last seen after the final connection disappears", () => {
    const lastSeen = Date.now() - 15_000;
    const presence = aggregateStoredPresence("user-1", {
      schemaVersion: 2,
      lastSeen,
      connections: {},
    });

    expect(presence.online).toBe(false);
    expect(presence.lastSeen).toBe(lastSeen);
    expect(presence.lastActivity).toBe(lastSeen);
  });

  it("sorts an active user ahead of an inactive one", () => {
    const users = aggregatePresenceTree({
      inactive: {
        schemaVersion: 2,
        connections: {
          idle: connection({ lastActivity: Date.now() - 6 * 60_000 }),
        },
      },
      active: {
        schemaVersion: 2,
        connections: { live: connection() },
      },
    });

    expect(users.map((user) => user.userId)).toEqual(["active", "inactive"]);
  });
});
