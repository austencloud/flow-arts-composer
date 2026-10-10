import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: null as { getIdToken: ReturnType<typeof vi.fn> } | null,
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  auth: {
    get currentUser() {
      return mocks.currentUser;
    },
  },
}));

import { authedFetch } from "#lib/shared/auth/services/authed-fetch.js";

describe("authedFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.currentUser = { getIdToken: vi.fn() };
  });

  it("attaches the cached Firebase token to the request", async () => {
    mocks.currentUser!.getIdToken.mockResolvedValue("cached-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await authedFetch("/api/admin/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(mocks.currentUser!.getIdToken).toHaveBeenCalledWith(false);
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer cached-token");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("force-refreshes once after a 401", async () => {
    mocks
      .currentUser!.getIdToken.mockResolvedValueOnce("cached-token")
      .mockResolvedValueOnce("fresh-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const stableBody = JSON.stringify({
      eventId: "6a0d8c75-cf65-4c53-a378-f6533d654c73",
    });
    const response = await authedFetch("/api/admin/analytics", {
      method: "POST",
      body: stableBody,
    });

    expect(response.status).toBe(200);
    expect(mocks.currentUser!.getIdToken).toHaveBeenNthCalledWith(1, false);
    expect(mocks.currentUser!.getIdToken).toHaveBeenNthCalledWith(2, true);
    const retryHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer fresh-token");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(stableBody);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(stableBody);
  });

  it.each([403, 503])(
    "does not refresh after a %s response",
    async (status) => {
      mocks.currentUser!.getIdToken.mockResolvedValue("cached-token");
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status }));
      vi.stubGlobal("fetch", fetchMock);

      const response = await authedFetch("/api/admin/analytics");

      expect(response.status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mocks.currentUser!.getIdToken).toHaveBeenCalledTimes(1);
    }
  );

  it("returns a second 401 without retrying again", async () => {
    mocks
      .currentUser!.getIdToken.mockResolvedValueOnce("cached-token")
      .mockResolvedValueOnce("fresh-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await authedFetch("/api/admin/analytics");

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects before fetching when no user is signed in", async () => {
    mocks.currentUser = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(authedFetch("/api/admin/analytics")).rejects.toThrow(
      "Not authenticated"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
