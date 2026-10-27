import { beforeEach, describe, expect, it, vi } from "vitest";

// ISS-031: the rules let only a signed-in account read `videos`, so a
// signed-out visitor's sequence and tunnel lists are empty, not an error.
const auth = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
}));
const getDocs = vi.hoisted(() => vi.fn());

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: async () => ({}),
  getAuthInstance: async () => ({ authStateReady: async () => {} }),
  getAuthSync: () => auth,
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs,
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(() => ({})),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
}));

import {
  getVideosForSequence,
  getVideosForTunnel,
} from "#lib/shared/video-collaboration/services/collaborative-video-manager.js";

describe("video reads for a signed-out visitor", () => {
  beforeEach(() => {
    auth.currentUser = null;
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
  });

  it("returns no sequence videos without querying Firestore", async () => {
    await expect(getVideosForSequence("seq-1")).resolves.toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("returns no tunnel videos without querying Firestore", async () => {
    await expect(getVideosForTunnel("tunnel-1")).resolves.toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("still queries every access path once signed in", async () => {
    auth.currentUser = { uid: "user-1" };
    await expect(getVideosForSequence("seq-1")).resolves.toEqual([]);
    expect(getDocs).toHaveBeenCalledTimes(3);
  });
});
