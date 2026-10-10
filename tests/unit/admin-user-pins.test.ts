import { describe, it, expect } from "vitest";
import { buildUserPins } from "#lib/features/admin/services/user-pins.js";
import type { UserPresenceWithId } from "#lib/shared/presence/domain/models/presence-models.js";

const mk = (over: Partial<UserPresenceWithId>): UserPresenceWithId =>
  ({
    userId: "u1",
    displayName: "Alice",
    online: false,
    activityStatus: "offline",
    lastActivity: 0,
    lastSeen: 0,
    currentModule: "",
    currentTab: null,
    sessionId: "",
    device: "desktop",
    ...over,
  }) as UserPresenceWithId;

describe("buildUserPins", () => {
  it("skips users without coordinates", () => {
    const pins = buildUserPins([
      mk({ userId: "a", location: { city: "X", country: "US", lat: null, lng: null } }),
      mk({ userId: "b", location: undefined }),
    ]);
    expect(pins).toHaveLength(0);
  });

  it("builds a pin with label from city", () => {
    const pins = buildUserPins([
      mk({
        userId: "a",
        displayName: "Bob",
        location: { city: "Berlin", country: "DE", lat: 52.5, lng: 13.4 },
      }),
    ]);
    expect(pins[0]).toEqual({
      id: "a",
      lat: 52.5,
      lng: 13.4,
      label: "Bob · Berlin",
      styleClass: "pin",
    });
  });

  it("active users get pin-new; label falls back to displayName only", () => {
    const pins = buildUserPins([
      mk({
        userId: "a",
        displayName: "Cara",
        activityStatus: "active",
        location: { city: null, country: "US", lat: 1, lng: 2 },
      }),
    ]);
    expect(pins[0].styleClass).toBe("pin-new");
    expect(pins[0].label).toBe("Cara");
  });
});
