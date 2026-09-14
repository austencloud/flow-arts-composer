import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(async () => ({ docs: [] })),
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

import {
  batchFetchPublicSequences,
  mapDocToCollection,
} from "$lib/shared/library/services/collection-firestore-mapper";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

describe("collection prop storage", () => {
  it("reads a saved prop and treats missing, cleared, or invalid values as normal selection", () => {
    expect(
      mapDocToCollection({ propType: PropType.FAN }, "fans").propType
    ).toBe(PropType.FAN);
    for (const propType of [undefined, null, "", "not-a-prop", 42]) {
      expect(mapDocToCollection({ propType }, "mixed").propType).toBeNull();
    }
  });
});

describe("foreign public collection member query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the owner's public mirror instead of querying their private library", async () => {
    await batchFetchPublicSequences(
      {} as Firestore,
      ["sequence-a", "sequence-b"],
      "collection-owner"
    );

    expect(mocks.query).toHaveBeenCalledWith(
      { path: "publicSequences" },
      expect.anything(),
      expect.anything()
    );
    expect(mocks.where).toHaveBeenCalledWith(
      "ownerId",
      "==",
      "collection-owner"
    );
    expect(mocks.where).toHaveBeenCalledWith("__name__", "in", [
      "sequence-a",
      "sequence-b",
    ]);
  });
});
