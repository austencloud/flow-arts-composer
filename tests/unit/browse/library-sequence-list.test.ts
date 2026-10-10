import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    isFullAccount: false,
    effectiveUserId: null as string | null,
  },
  getAllSequences: vi.fn(),
  getLibraryRepository: vi.fn(),
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: mocks.auth,
}));
vi.mock(
  "#lib/shared/persistence/services/dexie-persistence-service.js",
  () => ({
    getAllSequences: mocks.getAllSequences,
  })
);
vi.mock("#lib/shared/library/get-library-repository.js", () => ({
  getLibraryRepository: mocks.getLibraryRepository,
}));

import { listLibrarySequences } from "#lib/shared/browse/services/library-sequence-list.js";

describe("listLibrarySequences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.isAuthenticated = false;
    mocks.auth.isFullAccount = false;
  });

  it("reads a guest's local mirror and deduplicates ids", async () => {
    mocks.auth.isAuthenticated = true;
    mocks.getAllSequences.mockResolvedValue([
      { id: "a", word: "A" },
      { id: "a", word: "A" },
      { id: "b", word: "B" },
    ]);
    const sequences = await listLibrarySequences();
    expect(sequences.map((s) => s.id)).toEqual(["a", "b"]);
    expect(mocks.getLibraryRepository).not.toHaveBeenCalled();
  });

  it("reads a full account's library from the repository, never Dexie", async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.isFullAccount = true;
    mocks.getLibraryRepository.mockReturnValue({
      getSequences: vi.fn(async () => [{ id: "x", word: "X" }]),
    });
    const sequences = await listLibrarySequences();
    expect(sequences.map((s) => s.id)).toEqual(["x"]);
    expect(mocks.getAllSequences).not.toHaveBeenCalled();
  });

  it("fails closed when a full account has no repository", async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.isFullAccount = true;
    mocks.getLibraryRepository.mockReturnValue(null);
    await expect(listLibrarySequences()).rejects.toThrow(/library/i);
  });
});
