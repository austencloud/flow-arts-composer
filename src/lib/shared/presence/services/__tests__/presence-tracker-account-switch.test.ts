import { beforeEach, describe, expect, it, vi } from "vitest";

// A guest who signs into an existing account changes uid without a sign-out.
// Production (2026-11-07) showed the tracker then writing presence/{guestUid}
// under the new account's token on every module change, and RTDB refusing
// each one as an unhandled PERMISSION_DENIED.

const { authMock, updateMock } = vi.hoisted(() => ({
  authMock: { currentUser: null as { uid: string } | null },
  updateMock: vi.fn(async (_ref: { path: string }, _value: unknown) => {}),
}));

vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => ({ path, key: path.split("/").pop() }),
  push: (parent: { path: string }) => ({
    path: `${parent.path}/conn`,
    key: "conn",
  }),
  update: updateMock,
  onValue: (target: { path: string }, callback: (s: unknown) => void) => {
    if (target.path === ".info/connected") callback({ val: () => true });
    return () => {};
  },
  onDisconnect: () => ({
    remove: async () => {},
    set: async () => {},
  }),
  serverTimestamp: () => "SERVER_TS",
  off: () => {},
  get: async () => ({ val: () => null }),
  remove: async () => {},
}));

vi.mock("firebase/firestore", () => ({
  doc: () => ({}),
  getDoc: async () => ({ exists: () => true }),
  setDoc: async () => {},
  serverTimestamp: () => "FS_TS",
}));

vi.mock("posthog-js", () => ({ default: { get_session_id: () => "s1" } }));

vi.mock("../../../auth/firebase", () => ({
  database: {},
  auth: authMock,
  getFirestoreInstance: async () => ({}),
}));

vi.mock("../../utils/activity-tracker", () => ({
  ActivityTracker: class {
    start() {}
    stop() {}
  },
}));

const { PresenceTracker } = await import("../presence-tracker");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const writtenPaths = () =>
  updateMock.mock.calls.map(([target]) => (target as { path: string }).path);

describe("PresenceTracker after an account switch", () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockImplementation(async () => {});
    authMock.currentUser = { uid: "guest" };
  });

  it("stops writing the guest node and moves to the new account's node", async () => {
    const tracker = new PresenceTracker();
    await tracker.initialize();
    await flush();
    expect(writtenPaths()).toContain("presence/guest");

    updateMock.mockClear();
    authMock.currentUser = { uid: "member" };
    await tracker.updateLocation("browse", null);
    await flush();

    expect(writtenPaths()).not.toContain("presence/guest");
    expect(writtenPaths()).toContain("presence/member");
  });

  it("keeps a refused navigation write from escaping as a rejection", async () => {
    const tracker = new PresenceTracker();
    await tracker.initialize();
    await flush();

    updateMock.mockRejectedValue(new Error("PERMISSION_DENIED: Permission denied"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(tracker.updateLocation("browse", null)).resolves.toBeUndefined();
    await expect(tracker.updateLocation("create", null)).resolves.toBeUndefined();
    const presenceWarnings = warn.mock.calls.filter(([message]) =>
      String(message).includes("Presence write failed")
    );
    expect(presenceWarnings).toHaveLength(1);
    warn.mockRestore();
  });
});
