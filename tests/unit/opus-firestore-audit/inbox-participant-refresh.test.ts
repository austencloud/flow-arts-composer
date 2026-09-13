/**
 * Inbox conversation listener — participant-refresh amplification.
 *
 * Executable evidence for the Firestore cost audit
 * (docs/reports/opus-batch-2026-09-12/firestore-cost.md, finding H4).
 *
 * READ-ONLY AUDIT ARTEFACT. Assertions pin what production does TODAY.
 *
 * The call chain:
 *
 *   InboxSubscriptionProvider  (mounted at app root for EVERY signed-in user)
 *     -> conversationService.subscribeToConversations()
 *        [conversations where participants array-contains uid, limit 50]
 *        -> per snapshot, per doc: previewNeedsRefresh(preview)
 *           -> refreshParticipantInfo()
 *              -> fetchUserInfo()  [getDoc on users/{uid}]     1 read
 *              -> updateDoc(conversations/{id})                1 write
 *
 * Two properties make this expensive:
 *
 *   1. There is no in-flight guard and no negative cache. The work is redone
 *      from scratch on every snapshot, and a snapshot arrives on every
 *      incoming message to any of the user's 50 most recent conversations.
 *
 *   2. The exit condition can never be satisfied for some participants.
 *      previewNeedsRefresh() clears only when the stored
 *      `participantInfo.{uid}.username` is no longer `undefined`, but
 *      refreshParticipantInfo() omits the username key entirely when
 *      fetchUserInfo() could not produce one — which is exactly what happens
 *      when the participant's user document is missing or the read is denied.
 *      That conversation is then taxed 1 read + 1 write on every future
 *      snapshot, permanently.
 *
 * Firestore bills a write at roughly 3x a read, so the write is the larger
 * half of this.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  userReads: [] as string[],
  conversationWrites: [] as { path: string; data: Record<string, unknown> }[],
  /** users/{uid} documents that exist in the fixture. */
  userDocs: new Map<string, Record<string, unknown>>(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  getDoc: vi.fn(async (ref: { path: string }) => {
    mocks.userReads.push(ref.path);
    const uid = ref.path.split("/")[1]!;
    const data = mocks.userDocs.get(uid);
    return { exists: () => data !== undefined, data: () => data };
  }),
  updateDoc: vi.fn(
    async (ref: { path: string }, data: Record<string, unknown>) => {
      mocks.conversationWrites.push({ path: ref.path, data });
    }
  ),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIME"),
  increment: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  startAfter: vi.fn(),
  query: vi.fn((ref: unknown, ...clauses: unknown[]) => [ref, ...clauses]),
  where: vi.fn((field: unknown, op: string, value: unknown) => ({
    field,
    op,
    value,
  })),
  onSnapshot: vi.fn(),
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
}));

/**
 * previewNeedsRefresh + refreshParticipantInfo + mapDocToPreview are the units
 * under test and are imported for real. Everything below is inert scaffolding
 * they pull in transitively.
 */
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
  showToast: vi.fn(),
}));

import { doc, getDoc } from "firebase/firestore";
import {
  mapDocToPreview,
  previewNeedsRefresh,
  refreshParticipantInfo,
} from "$lib/shared/messaging/services/conversation-mappers";

const VIEWER = "viewer-uid";
const OTHER = "other-uid";

/** Mirrors fetchUserInfo() in conversation-manager.ts:96. */
async function fetchUserInfo(userId: string): Promise<{
  displayName: string;
  username?: string | null;
  photoURL?: string;
}> {
  const snap = await getDoc(doc({} as never, "users", userId) as never);
  if (snap.exists()) {
    const data = snap.data() as Record<string, unknown>;
    const username =
      typeof data["username"] === "string" && data["username"].trim()
        ? (data["username"] as string).trim()
        : null;
    return {
      displayName: (data["displayName"] as string) || "Unknown User",
      username,
      photoURL: (data["photoURL"] as string) || undefined,
    };
  }
  return { displayName: "Unknown User" };
}

/**
 * One pass of the onSnapshot handler in subscribeToConversations
 * (conversation-manager.ts:441-463), over a set of stored conversation docs.
 */
async function runSnapshotPass(
  stored: Map<string, Record<string, unknown>>
): Promise<void> {
  const refreshes: Promise<void>[] = [];
  for (const [id, data] of stored) {
    const preview = mapDocToPreview(id, data, VIEWER);
    if (!preview) continue;
    const refreshUserId = previewNeedsRefresh(preview);
    if (refreshUserId) {
      refreshes.push(
        refreshParticipantInfo({} as never, id, refreshUserId, fetchUserInfo)
      );
    }
  }
  await Promise.all(refreshes);
}

/** Apply the dotted-path updates refreshParticipantInfo wrote, as Firestore would. */
function applyWrites(stored: Map<string, Record<string, unknown>>): void {
  for (const write of mocks.conversationWrites) {
    const id = write.path.split("/")[1]!;
    const data = stored.get(id);
    if (!data) continue;
    const info = data["participantInfo"] as Record<
      string,
      Record<string, unknown>
    >;
    for (const [key, value] of Object.entries(write.data)) {
      const [, uid, field] = key.split(".");
      info[uid!] = { ...(info[uid!] ?? {}), [field!]: value };
    }
  }
  mocks.conversationWrites.length = 0;
}

function conversationDoc(
  participantInfo: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  return {
    participants: [VIEWER, OTHER],
    participantInfo,
    unreadCount: {},
    updatedAt: { toDate: () => new Date() },
  };
}

beforeEach(() => {
  mocks.userReads.length = 0;
  mocks.conversationWrites.length = 0;
  mocks.userDocs.clear();
});

describe("the terminating case: participant has a user document", () => {
  it("costs one read + one write once, then goes quiet", async () => {
    mocks.userDocs.set(OTHER, { displayName: "Ada", username: "ada" });

    const stored = new Map([
      [
        "conv-1",
        conversationDoc({
          [OTHER]: { userId: OTHER, displayName: "Loading..." },
        }),
      ],
    ]);

    await runSnapshotPass(stored);
    expect(mocks.userReads).toEqual(["users/other-uid"]);
    expect(mocks.conversationWrites).toHaveLength(1);
    applyWrites(stored);

    // Second snapshot (a new message arrives): username is now stored, so the
    // refresh condition clears. This is the path that works.
    await runSnapshotPass(stored);
    expect(mocks.userReads).toHaveLength(1);
    expect(mocks.conversationWrites).toHaveLength(0);
  });

  it("still self-heals when the participant has no username field", async () => {
    // fetchUserInfo returns username: null (not undefined), so the key IS
    // written and previewNeedsRefresh stops firing.
    mocks.userDocs.set(OTHER, { displayName: "Ada" });

    const stored = new Map([
      [
        "conv-1",
        conversationDoc({
          [OTHER]: { userId: OTHER, displayName: "Loading..." },
        }),
      ],
    ]);

    await runSnapshotPass(stored);
    applyWrites(stored);
    await runSnapshotPass(stored);

    expect(mocks.userReads).toHaveLength(1);
    expect(mocks.conversationWrites).toHaveLength(0);
  });
});

describe("H4 — the non-terminating case: participant's user document is unreadable", () => {
  it("re-reads and re-writes on every snapshot, forever", async () => {
    // No entry in mocks.userDocs: a deleted account, or a read the rules deny.
    // fetchUserInfo falls through to `{ displayName: "Unknown User" }` with
    // username UNDEFINED, so refreshParticipantInfo omits the username key and
    // previewNeedsRefresh can never clear.
    const stored = new Map([
      [
        "conv-1",
        conversationDoc({
          [OTHER]: { userId: OTHER, displayName: "Loading..." },
        }),
      ],
    ]);

    for (let snapshotN = 0; snapshotN < 5; snapshotN++) {
      await runSnapshotPass(stored);
      applyWrites(stored);
    }

    // DEFECT PINNED (H4): five snapshots, five user reads, five conversation
    // writes, and the stored state is no closer to satisfying the exit
    // condition than it was at the start. A fix (writing an explicit
    // `username: null` sentinel on lookup failure, or a negative cache) makes
    // both of these 1.
    expect(mocks.userReads).toHaveLength(5);
    expect(mocks.userReads.every((p) => p === "users/other-uid")).toBe(true);

    const info = (
      stored.get("conv-1")!["participantInfo"] as Record<
        string,
        Record<string, unknown>
      >
    )[OTHER]!;
    expect(info["username"]).toBeUndefined();
  });

  it("multiplies by the number of affected conversations in the 50-doc window", async () => {
    const stored = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < 12; i++) {
      stored.set(
        `conv-${i}`,
        conversationDoc({
          [`ghost-${i}`]: { userId: `ghost-${i}`, displayName: "Loading..." },
        })
      );
      // Each conversation is with a different unreadable participant.
      (stored.get(`conv-${i}`) as Record<string, unknown>)["participants"] = [
        VIEWER,
        `ghost-${i}`,
      ];
    }

    await runSnapshotPass(stored);

    // One snapshot: 12 reads + 12 writes of pure waste. Every subsequent
    // snapshot on this listener repeats it — and the listener is mounted at
    // the app root, so it is live for the whole session whether or not the
    // user ever opens the Inbox.
    expect(mocks.userReads).toHaveLength(12);
    expect(mocks.conversationWrites).toHaveLength(12);
  });

  it("has no in-flight guard, so one burst issues duplicate reads for one uid", async () => {
    // Two conversations with the SAME unreadable participant, in one snapshot.
    const stored = new Map([
      [
        "conv-a",
        conversationDoc({
          [OTHER]: { userId: OTHER, displayName: "Loading..." },
        }),
      ],
      [
        "conv-b",
        conversationDoc({
          [OTHER]: { userId: OTHER, displayName: "Loading..." },
        }),
      ],
    ]);

    await runSnapshotPass(stored);

    // The same user document is fetched twice in a single snapshot pass.
    // fetchUserInfo has no request coalescing and no short-lived cache.
    expect(mocks.userReads).toEqual(["users/other-uid", "users/other-uid"]);
  });
});
