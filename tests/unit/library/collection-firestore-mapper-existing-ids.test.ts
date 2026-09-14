import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(async () => ({ docs: [] as { id: string }[] })),
  query: vi.fn((ref: unknown, ...clauses: unknown[]) => ({ ref, clauses })),
  where: vi.fn((field: unknown, op: string, value: unknown) => ({
    field,
    op,
    value,
  })),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_firestore: unknown, path: string) => ({ path })),
  documentId: vi.fn(() => "__name__"),
  getDocs: mocks.getDocs,
  query: mocks.query,
  where: mocks.where,
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: { effectiveUserId: "viewer" },
}));
vi.mock("$lib/shared/debug/state/user-preview-state.svelte", () => ({
  isPreviewReadOnly: () => false,
}));
vi.mock("$lib/shared/foundation/services/sequence-hydrator", () => ({
  hydrate: vi.fn(),
}));

import { filterExistingSequenceIds } from "$lib/shared/library/services/collection-firestore-mapper";

const firestore = {} as Firestore;

describe("filterExistingSequenceIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports only the ids that resolve to an owner document", async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [{ id: "own-1" }, { id: "own-2" }],
    });

    const existing = await filterExistingSequenceIds(firestore, "viewer", [
      "own-1",
      "foreign-1",
      "own-2",
    ]);

    expect([...existing].sort()).toEqual(["own-1", "own-2"]);
    expect(mocks.where).toHaveBeenCalledWith("__name__", "in", [
      "own-1",
      "foreign-1",
      "own-2",
    ]);
  });

  it("chunks to Firestore's 30-id `in` limit and de-duplicates the request", async () => {
    const ids = Array.from({ length: 65 }, (_, index) => `sequence-${index}`);
    mocks.getDocs.mockImplementation(async () => ({ docs: [] }));

    await filterExistingSequenceIds(firestore, "viewer", [...ids, ...ids]);

    expect(mocks.getDocs).toHaveBeenCalledTimes(3);
    const chunks = mocks.where.mock.calls.map((call) => call[2] as string[]);
    expect(chunks.map((chunk) => chunk.length)).toEqual([30, 30, 5]);
    expect(chunks.flat()).toEqual(ids);
  });

  it("issues no read for an empty membership list", async () => {
    const existing = await filterExistingSequenceIds(firestore, "viewer", []);

    expect(existing.size).toBe(0);
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });
});
