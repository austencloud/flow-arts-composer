import type { User } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFirestoreInstance: vi.fn(),
  initMandala: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: mocks.getFirestoreInstance,
}));
vi.mock(
  "#lib/features/mandala/tabs/collection/state/mandala-collection-state.svelte.js",
  () => ({ mandalaCollectionState: { init: mocks.initMandala } })
);

import { initializeMandalaCollection } from "#lib/shared/auth/services/auth-boot-orchestrator.js";

function user(uid: string): User {
  return { uid } as User;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initMandala.mockResolvedValue(undefined);
});

describe("mandala auth boot", () => {
  it.each([
    { name: "sign-out", nextUser: null },
    { name: "account switch", nextUser: user("new-user") },
  ])("skips a stale initialization after $name", async ({ nextUser }) => {
    let finishFirestore!: (value: object) => void;
    mocks.getFirestoreInstance.mockReturnValue(
      new Promise((resolve) => {
        finishFirestore = resolve;
      })
    );
    let currentUser: User | null = user("old-user");
    const boot = initializeMandalaCollection(
      user("old-user"),
      () => currentUser
    );

    await vi.waitFor(() =>
      expect(mocks.getFirestoreInstance).toHaveBeenCalled()
    );
    currentUser = nextUser;
    finishFirestore({});
    await boot;

    expect(mocks.initMandala).not.toHaveBeenCalled();
  });

  it("initializes the writable store when the same user remains signed in", async () => {
    mocks.getFirestoreInstance.mockResolvedValue({});

    await initializeMandalaCollection(user("owner"), () => user("owner"));

    expect(mocks.initMandala).toHaveBeenCalledExactlyOnceWith("owner");
  });
});
