import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  withRateLimit: vi.fn(),
  listUsers: vi.fn(),
  getProfiles: vi.fn(),
  logAdminAction: vi.fn(),
}));

vi.mock("#lib/server/auth/requireAdmin.js", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("#lib/server/security/withRateLimit.js", () => ({
  withRateLimit: mocks.withRateLimit,
}));
vi.mock("#lib/server/security/audit-logger.js", () => ({
  logAdminAction: mocks.logAdminAction,
}));
vi.mock("#lib/server/auth/firebase-auth-rest.js", () => ({
  getFirebaseAuthRest: () => ({ listUsers: mocks.listUsers }),
}));
vi.mock("#lib/server/firestore/firestore-rest.js", () => ({
  fromFirestoreFields: (fields: {
    isAnonymous?: { booleanValue: boolean };
  }) => ({ isAnonymous: fields.isAnonymous?.booleanValue }),
  getFirestoreRest: () => ({ listDocuments: mocks.getProfiles }),
}));

import { GET } from "../../src/routes/api/admin/user-summary/+server";

function authUser(uid: string, options: { anonymous?: boolean } = {}) {
  return {
    uid,
    email: options.anonymous ? undefined : `${uid}@example.com`,
    providerData: options.anonymous ? [] : [{ providerId: "password", uid }],
  };
}

function profile(id: string, isAnonymous: boolean) {
  return {
    name: `projects/test/databases/(default)/documents/users/${id}`,
    fields: { isAnonymous: { booleanValue: isAnonymous } },
  };
}

function event() {
  return {
    getClientAddress: () => "127.0.0.1",
  } as never;
}

describe("admin user summary route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ uid: "admin" });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.logAdminAction.mockResolvedValue(undefined);
    mocks.listUsers.mockResolvedValue({ users: [], pageToken: undefined });
    mocks.getProfiles.mockResolvedValue({ documents: [] });
  });

  it("paginates Auth and reports registered accounts missing profiles", async () => {
    mocks.listUsers
      .mockResolvedValueOnce({
        users: [
          authUser("registered-1"),
          authUser("guest", { anonymous: true }),
        ],
        pageToken: "next",
      })
      .mockResolvedValueOnce({
        users: [authUser("registered-2")],
        pageToken: undefined,
      });
    mocks.getProfiles.mockResolvedValue({
      documents: [profile("registered-1", false), profile("guest", true)],
    });

    const response = await GET(event());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totalAuthAccounts: 3,
      registeredAccounts: 2,
      anonymousAccounts: 1,
      totalProfiles: 2,
      registeredProfiles: 1,
      anonymousProfiles: 1,
      missingRegisteredProfiles: 1,
    });
    expect(mocks.listUsers).toHaveBeenNthCalledWith(2, 1000, "next");
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "admin",
        action: "user_summary_query",
        metadata: {
          registeredAccounts: 2,
          missingRegisteredProfiles: 1,
        },
      }),
      undefined
    );
  });

  it("returns authorization failures before reading Auth or profiles", async () => {
    mocks.requireAdmin.mockRejectedValue(
      Object.assign(new Error("Admin access required"), { status: 403 })
    );

    const response = await GET(event());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Admin access required",
    });
    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.getProfiles).not.toHaveBeenCalled();
  });

  it("returns rate limiting before reading Auth or profiles", async () => {
    const blocked = new Response("blocked", { status: 429 });
    mocks.withRateLimit.mockResolvedValue(blocked);

    expect(await GET(event())).toBe(blocked);
    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.getProfiles).not.toHaveBeenCalled();
  });
});
