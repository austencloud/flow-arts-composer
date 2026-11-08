import { describe, expect, it, vi } from "vitest";
import {
  classifyLoadFailure,
  profileActionsFor,
} from "#lib/features/creators/domain/profile-viewer.js";
import {
  createProfileSession,
  type ProfileSessionDeps,
} from "#lib/features/creators/state/profile-session.svelte.js";
import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";

function person(
  overrides: Partial<EnhancedUserProfile> = {}
): EnhancedUserProfile {
  return {
    id: "target",
    username: "target",
    displayName: "Target",
    sequenceCount: 0,
    collectionCount: 0,
    followerCount: 3,
    followingCount: 0,
    joinedDate: new Date(0),
    isFollowing: false,
    isFeatured: false,
    ...overrides,
  } as EnhancedUserProfile;
}

function deps(overrides: Partial<ProfileSessionDeps> = {}): ProfileSessionDeps {
  return {
    fetchProfile: vi.fn(async () => person()),
    fetchSequences: vi.fn(async () => []),
    follow: vi.fn(async () => {}),
    unfollow: vi.fn(async () => {}),
    setDisabled: vi.fn(async () => {}),
    startOwnStores: vi.fn(),
    ...overrides,
  };
}

describe("who may do what on a profile", () => {
  it("gives an anonymous guest a gated Follow and no private surfaces", () => {
    expect(
      profileActionsFor({
        viewerId: "anon-uid",
        isFullAccount: false,
        isOwnProfile: false,
      })
    ).toEqual({ follow: "gate", showReport: false, showConnection: false });
  });

  it("treats a signed-out visitor the same as a guest", () => {
    expect(
      profileActionsFor({
        viewerId: undefined,
        isFullAccount: false,
        isOwnProfile: false,
      }).follow
    ).toBe("gate");
  });

  it("gives a full account the real toggle, Report and connection", () => {
    expect(
      profileActionsFor({
        viewerId: "me",
        isFullAccount: true,
        isOwnProfile: false,
      })
    ).toEqual({ follow: "toggle", showReport: true, showConnection: true });
  });

  it("offers nothing on your own profile", () => {
    expect(
      profileActionsFor({
        viewerId: "me",
        isFullAccount: true,
        isOwnProfile: true,
      }).follow
    ).toBe("none");
  });
});

describe("profile session", () => {
  it("a failed follow does not set a failure or change the button", async () => {
    const session = createProfileSession(
      "target",
      deps({
        follow: vi.fn(async () => {
          throw new Error("Missing or insufficient permissions");
        }),
      })
    );
    await session.load("me");

    await expect(session.toggleFollow("me")).resolves.toBeNull();

    expect(session.failure).toBeNull();
    expect(session.profile?.isFollowing).toBe(false);
    expect(session.profile?.followerCount).toBe(3);
    expect(session.followInProgress).toBe(false);
  });

  it("a failed unfollow keeps the person followed", async () => {
    const session = createProfileSession(
      "target",
      deps({
        fetchProfile: vi.fn(async () => person({ isFollowing: true })),
        unfollow: vi.fn(async () => {
          throw new Error("offline");
        }),
      })
    );
    await session.load("me");
    await session.toggleFollow("me");

    expect(session.failure).toBeNull();
    expect(session.profile?.isFollowing).toBe(true);
  });

  it("a confirmed follow updates the flag and count", async () => {
    const session = createProfileSession("target", deps());
    await session.load("me");

    await expect(session.toggleFollow("me")).resolves.toBe(true);

    expect(session.profile?.isFollowing).toBe(true);
    expect(session.profile?.followerCount).toBe(4);
  });

  it("names a missing profile separately from a refused read", async () => {
    const missing = createProfileSession(
      "target",
      deps({ fetchProfile: vi.fn(async () => null) })
    );
    await missing.load("me");
    expect(missing.failure).toBe("not-found");

    const refused = createProfileSession(
      "target",
      deps({
        fetchProfile: vi.fn(async () => {
          throw Object.assign(new Error("secret detail"), {
            code: "permission-denied",
          });
        }),
      })
    );
    await refused.load("me");
    expect(refused.failure).toBe("denied");
  });
});

describe("classifyLoadFailure", () => {
  it("sorts errors into the sentences we can show", () => {
    expect(classifyLoadFailure({ code: "permission-denied" }, true)).toBe(
      "denied"
    );
    expect(classifyLoadFailure({ code: "unavailable" }, true)).toBe("offline");
    expect(classifyLoadFailure(new Error("boom"), false)).toBe("offline");
    expect(classifyLoadFailure(new Error("boom"), true)).toBe("unknown");
  });
});

describe("a viewer who arrives after the profile opened", () => {
  it("reloads for the late viewer, so follow state and own-profile are right", async () => {
    const fetchProfile = vi.fn(async (_id: string, viewerId?: string) =>
      person({ isFollowing: viewerId === "viewer" })
    );
    const d = deps({ fetchProfile });
    const session = createProfileSession("target", d);

    await session.syncViewer(undefined);
    expect(session.profile?.isFollowing).toBe(false);

    await session.syncViewer("viewer");
    expect(fetchProfile).toHaveBeenLastCalledWith("target", "viewer");
    expect(session.profile?.isFollowing).toBe(true);

    // The same viewer again loads nothing.
    await session.syncViewer("viewer");
    expect(fetchProfile).toHaveBeenCalledTimes(2);
  });

  it("starts the saved-art stores when the late viewer owns the profile", async () => {
    const d = deps();
    const session = createProfileSession("target", d);

    await session.syncViewer(undefined);
    expect(d.startOwnStores).not.toHaveBeenCalled();
    await session.syncViewer("target");

    expect(d.startOwnStores).toHaveBeenCalledWith("target");
  });

  it("drops an older load that lands after a newer one", async () => {
    let finishFirst: (value: EnhancedUserProfile) => void = () => undefined;
    const fetchProfile = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishFirst = resolve))
      )
      .mockResolvedValueOnce(person({ isFollowing: true }));
    const session = createProfileSession("target", deps({ fetchProfile }));

    const first = session.syncViewer(undefined);
    await session.syncViewer("viewer");
    finishFirst(person({ isFollowing: false }));
    await first;

    expect(session.profile?.isFollowing).toBe(true);
    expect(session.isLoading).toBe(false);
  });
});
