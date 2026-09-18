import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getDocs: vi.fn(),
  whereCalls: [] as unknown[][],
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_firestore: unknown, path: string) => path),
  doc: vi.fn((_firestore: unknown, path: string) => path),
  documentId: vi.fn(() => "__name__"),
  getCountFromServer: vi.fn(),
  getDoc: vi.fn(),
  getDocs: h.getDocs,
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((value: unknown) => value),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn((...args: unknown[]) => {
    h.whereCalls.push(args);
    return args;
  }),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({ name: "firestore" })),
}));

vi.mock("$lib/shared/firestore", async () => {
  const { z } = await import("zod");
  return {
    firestoreDate: z.any(),
    firestoreGet: vi.fn(),
    firestoreList: vi.fn(),
  };
});

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("$lib/shared/offline/state/sync-status-state.svelte", () => ({
  trackWrite: vi.fn(),
}));

import {
  getVisibleOwnerNames,
  getVisibleOwnerProfiles,
} from "$lib/shared/community/services/user-repository";

function snapshotOf(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    forEach: (visit: (snap: { id: string; data: () => unknown }) => void) => {
      for (const entry of docs) {
        visit({ id: entry.id, data: () => entry.data });
      }
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.whereCalls.length = 0;
});

describe("getVisibleOwnerProfiles", () => {
  it("returns display name and avatar for visible owners only", async () => {
    h.getDocs.mockResolvedValue(
      snapshotOf([
        {
          id: "shown",
          data: { displayName: "Austen", photoURL: "https://x/a.png" },
        },
        { id: "hidden", data: { displayName: "Moderated", isHidden: true } },
        { id: "guest", data: { displayName: "Guest", isAnonymous: true } },
        { id: "nameless", data: {} },
      ])
    );

    const profiles = await getVisibleOwnerProfiles([
      "shown",
      "hidden",
      "guest",
      "nameless",
      "missing",
    ]);

    expect(profiles.get("shown")).toEqual({
      displayName: "Austen",
      photoURL: "https://x/a.png",
    });
    expect(profiles.get("nameless")).toEqual({
      displayName: "Someone",
      photoURL: undefined,
    });
    expect(profiles.has("hidden")).toBe(false);
    expect(profiles.has("guest")).toBe(false);
    expect(profiles.has("missing")).toBe(false);
  });

  it("skips the query for an empty id list", async () => {
    const profiles = await getVisibleOwnerProfiles([]);
    expect(profiles.size).toBe(0);
    expect(h.getDocs).not.toHaveBeenCalled();
  });

  it("chunks ids by 30 and dedupes", async () => {
    h.getDocs.mockResolvedValue(snapshotOf([]));
    const ids = Array.from({ length: 31 }, (_, index) => `u${index}`);

    await getVisibleOwnerProfiles([...ids, "u0"]);

    expect(h.getDocs).toHaveBeenCalledTimes(2);
    const inChunks = h.whereCalls
      .filter((call) => call[1] === "in")
      .map((call) => call[2] as string[]);
    expect(inChunks.map((chunk) => chunk.length)).toEqual([30, 1]);
  });
});

describe("getVisibleOwnerNames", () => {
  it("maps profiles down to display names", async () => {
    h.getDocs.mockResolvedValue(
      snapshotOf([{ id: "shown", data: { displayName: "Austen" } }])
    );

    const names = await getVisibleOwnerNames(["shown"]);

    expect([...names]).toEqual([["shown", "Austen"]]);
  });
});
