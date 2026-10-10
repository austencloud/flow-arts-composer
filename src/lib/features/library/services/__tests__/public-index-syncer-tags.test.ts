import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";

// resolveTagNames maps a sequence's applied tag IDs to human-readable names by
// reading the owner's users/{userId}/tags collection. These tests pin the
// resolution rules at the door: sequenceTags win over legacy tagIds, dangling
// ids are dropped, and a COLLECTION READ FAILURE fails the publish — on the
// public projection an empty `tags` means "untagged", so degrading a failed
// read to [] would store that lie as fact (parity-repair spec, section 5).

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: vi.fn(),
  getDocs: mocks.getDocs,
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

import { PublicIndexSyncer } from "../public-index-syncer";

// A tags-collection snapshot: forEach yields each { id, data() } tag doc.
function tagSnapshot(tags: Array<{ id: string; name?: unknown }>) {
  return {
    forEach(cb: (d: { id: string; data: () => Record<string, unknown> }) => void) {
      for (const t of tags) cb({ id: t.id, data: () => ({ name: t.name }) });
    },
  };
}

function makeSequence(overrides: Partial<LibrarySequence>): LibrarySequence {
  return {
    id: "seq-1",
    word: "ABC",
    tagIds: [],
    sequenceTags: [],
    ...overrides,
  } as unknown as LibrarySequence;
}

// resolveTagNames is a private method whose only dependencies are its params.
function resolveTagNames(
  firestore: unknown,
  userId: string,
  sequence: LibrarySequence,
): Promise<string[]> {
  const syncer = new PublicIndexSyncer();
  const target = syncer as unknown as {
    resolveTagNames(fs: unknown, uid: string, seq: LibrarySequence): Promise<string[]>;
  };
  return target.resolveTagNames.call(syncer, firestore, userId, sequence);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublicIndexSyncer.resolveTagNames", () => {
  it("prefers structured sequenceTags over legacy tagIds", async () => {
    mocks.getDocs.mockResolvedValue(
      tagSnapshot([
        { id: "t-fire", name: "fire" },
        { id: "t-poi", name: "poi" },
        { id: "t-legacy", name: "legacy" },
      ]),
    );
    const sequence = makeSequence({
      sequenceTags: [{ tagId: "t-fire", source: "user", addedAt: new Date() }],
      tagIds: ["t-legacy"],
    });

    const names = await resolveTagNames({}, "owner-1", sequence);

    // Only the sequenceTags id resolves; the legacy id is ignored entirely.
    expect(names).toEqual(["fire"]);
  });

  it("falls back to legacy tagIds when sequenceTags is empty", async () => {
    mocks.getDocs.mockResolvedValue(
      tagSnapshot([{ id: "t-legacy", name: "legacy" }]),
    );
    const sequence = makeSequence({ sequenceTags: [], tagIds: ["t-legacy"] });

    const names = await resolveTagNames({}, "owner-1", sequence);

    expect(names).toEqual(["legacy"]);
  });

  it("drops tag ids that no longer resolve to a tag doc", async () => {
    mocks.getDocs.mockResolvedValue(
      tagSnapshot([{ id: "t-fire", name: "fire" }]),
    );
    const sequence = makeSequence({
      sequenceTags: [
        { tagId: "t-fire", source: "user", addedAt: new Date() },
        { tagId: "t-deleted", source: "ai", addedAt: new Date() },
      ],
    });

    const names = await resolveTagNames({}, "owner-1", sequence);

    // t-deleted has no matching tag doc, so it's silently skipped.
    expect(names).toEqual(["fire"]);
  });

  it("returns an empty list without reading when the sequence has no tags", async () => {
    const sequence = makeSequence({ sequenceTags: [], tagIds: [] });

    const names = await resolveTagNames({}, "owner-1", sequence);

    expect(names).toEqual([]);
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });

  it("fails the publish when the tag read fails — an empty list must mean untagged", async () => {
    // Reversed from the pre-projection contract (degrade to []): the public
    // document's `tags` is rebuilt from this value on every sync, so a failed
    // read silently published "untagged" and the parity audit could not tell
    // drift from truth. A since-deleted id is still dropped (by design); a
    // failed READ is a different thing and stops the caller.
    mocks.getDocs.mockRejectedValue(new Error("offline"));
    const sequence = makeSequence({
      sequenceTags: [{ tagId: "t-fire", source: "user", addedAt: new Date() }],
    });

    await expect(resolveTagNames({}, "owner-1", sequence)).rejects.toThrow(
      /tag read failed/
    );
  });
});
