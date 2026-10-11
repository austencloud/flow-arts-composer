import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserDetailModal from "./UserDetailModal.svelte";

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getIdToken: vi.fn().mockResolvedValue("token"),
  getEngagementSummary: vi.fn(),
  getActivityBreakdown: vi.fn(),
  getContentMetrics: vi.fn(),
  getRecentSessions: vi.fn(),
  getSessionEvents: vi.fn(),
  getSessionReplayAccess: vi.fn(),
}));

vi.mock("#lib/shared/community/services/user-repository.js", () => ({
  getUserProfile: mocks.getUserProfile,
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  auth: { currentUser: { getIdToken: mocks.getIdToken } },
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { isAdmin: true, user: { uid: "admin" } },
}));
vi.mock("#lib/features/admin/get-post-hog-user-analytics.js", () => ({
  getPostHogUserAnalytics: () => mocks,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function profile(id: string, name: string) {
  return {
    id,
    displayName: name,
    username: name.toLowerCase(),
    avatar: "",
    sequenceCount: 1,
    collectionCount: 2,
    followerCount: 3,
    followingCount: 4,
    joinedDate: new Date("2026-01-01T00:00:00Z"),
    isFeatured: false,
  };
}

function authPayload(uid: string) {
  return {
    uid,
    email: `${uid}@example.com`,
    emailVerified: true,
    phoneNumber: null,
    disabled: false,
    providers: [{ providerId: "password" }],
    metadata: { creationTime: "2026-01-01T00:00:00Z" },
    multiFactor: null,
    adminMetadata: { adminLabel: null, adminNotes: null },
    contributor: { active: false, id: null },
    privateProfile: { lastLocation: null },
  };
}

function authResponse(uid: string) {
  return new Response(JSON.stringify(authPayload(uid)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("UserDetailModal async identity loading", () => {
  beforeEach(() => {
    mocks.getUserProfile.mockReset();
    mocks.getEngagementSummary.mockReset().mockResolvedValue({
      source: "posthog",
      lastActiveAt: null,
      memberSince: null,
      sessionsCount: 0,
      avgSessionDuration: 0,
      totalTimeSpent: 0,
    });
    mocks.getActivityBreakdown.mockReset().mockResolvedValue([]);
    mocks.getContentMetrics.mockReset().mockResolvedValue({
      sequencesCreated: 0,
      sequencesSaved: 0,
      sequencesExported: 0,
      collectionsCreated: 0,
      sequencesShared: 0,
    });
    mocks.getRecentSessions.mockReset().mockResolvedValue([]);
    mocks.getSessionEvents.mockReset().mockResolvedValue([]);
    mocks.getSessionReplayAccess.mockReset().mockResolvedValue({
      state: "unavailable",
      embedUrl: null,
      message: "No recording",
    });
    vi.unstubAllGlobals();
  });

  it("does not let the previous UID overwrite a rerendered user", async () => {
    const oldProfile = deferred<ReturnType<typeof profile>>();
    const newProfile = deferred<ReturnType<typeof profile>>();
    const oldAuth = deferred<Response>();
    const newAuth = deferred<Response>();
    mocks.getUserProfile.mockImplementation((uid: string) =>
      uid === "old" ? oldProfile.promise : newProfile.promise
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("/old") ? oldAuth.promise : newAuth.promise
      )
    );

    const screen = render(UserDetailModal, {
      open: true,
      userId: "old",
      onclose: vi.fn(),
    });
    await screen.rerender({ open: true, userId: "new", onclose: vi.fn() });
    newProfile.resolve(profile("new", "New User"));
    newAuth.resolve(authResponse("new"));
    await expect
      .element(page.getByRole("heading", { name: "New User" }).first())
      .toBeVisible();

    oldProfile.resolve(profile("old", "Old User"));
    oldAuth.resolve(authResponse("old"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect
      .element(page.getByText("old@example.com"))
      .not.toBeInTheDocument();
    await expect.element(page.getByText("new@example.com")).toBeVisible();
  });

  it("distinguishes an orphaned Firestore profile from generic not-found", async () => {
    mocks.getUserProfile.mockResolvedValue(profile("orphan", "Orphan"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 404 }))
    );
    render(UserDetailModal, { open: true, userId: "orphan", onclose: vi.fn() });
    await expect
      .element(
        page.getByText(
          "The Firestore profile exists, but the Auth account is missing."
        )
      )
      .toBeVisible();
  });

  it("retains fresh activity queries when revisiting the Activity tab", async () => {
    mocks.getUserProfile.mockResolvedValue(profile("uid", "User"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(authResponse("uid")));
    render(UserDetailModal, { open: true, userId: "uid", onclose: vi.fn() });
    await expect
      .element(page.getByRole("tab", { name: "Activity" }))
      .toBeVisible();

    await page.getByRole("tab", { name: "Activity" }).click();
    await expect
      .element(page.getByText("No sessions in this window"))
      .toBeVisible();
    await page.getByRole("tab", { name: "Profile" }).click();
    await expect
      .element(page.getByText("No sessions in this window"))
      .not.toBeVisible();
    await page.getByRole("tab", { name: "Activity" }).click();

    expect(mocks.getEngagementSummary).toHaveBeenCalledTimes(1);
    expect(mocks.getActivityBreakdown).toHaveBeenCalledTimes(1);
    expect(mocks.getContentMetrics).toHaveBeenCalledTimes(1);
    expect(mocks.getRecentSessions).toHaveBeenCalledTimes(1);
  });

  it("updates the parent status badge from the authoritative PATCH response", async () => {
    mocks.getUserProfile.mockResolvedValue(profile("uid", "User"));
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                auth: { ...authPayload("uid"), disabled: true },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        if (url.includes("/user-auth/")) {
          return Promise.resolve(authResponse("uid"));
        }
        return Promise.resolve(new Response("{}"));
      })
    );
    render(UserDetailModal, { open: true, userId: "uid", onclose: vi.fn() });
    await expect
      .element(page.getByText("Enabled", { exact: true }))
      .toBeVisible();
    await page.getByRole("tab", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Disable account" }).click();
    await page.getByRole("button", { name: "Confirm action" }).click();
    await expect
      .element(
        page
          .getByLabelText("Account status")
          .getByText("Disabled", { exact: true })
      )
      .toBeVisible();
  });
});
