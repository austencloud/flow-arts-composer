import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const identifyUser = vi.hoisted(() => vi.fn());

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({ identifyUser }));

import { identifyFirebaseUserToPostHog } from "#lib/shared/auth/services/posthog-user-identity.js";

beforeEach(() => {
  identifyUser.mockClear();
});

describe("identifyFirebaseUserToPostHog", () => {
  it("maps the same Firebase identity used by auth refresh and the auth listener", () => {
    const user = {
      uid: "same-uid-after-link",
      email: "person@example.com",
      displayName: "Krysten Ryan",
      metadata: { creationTime: "2026-08-19T21:09:06.000Z" },
    } as unknown as User;

    identifyFirebaseUserToPostHog(user, "premium", false);

    expect(identifyUser).toHaveBeenCalledWith("same-uid-after-link", {
      email: "person@example.com",
      name: "Krysten Ryan",
      role: "premium",
      createdAt: new Date("2026-08-19T21:09:06.000Z"),
      isPremium: true,
      isTester: false,
      isAdmin: false,
    });
  });

  it("marks an admin as premium and tester without inventing absent profile fields", () => {
    const user = {
      uid: "admin-uid",
      email: null,
      displayName: null,
      metadata: { creationTime: null },
    } as unknown as User;

    identifyFirebaseUserToPostHog(user, "admin", true);

    expect(identifyUser).toHaveBeenCalledWith("admin-uid", {
      email: undefined,
      name: undefined,
      role: "admin",
      createdAt: undefined,
      isPremium: true,
      isTester: true,
      isAdmin: true,
    });
  });
});
