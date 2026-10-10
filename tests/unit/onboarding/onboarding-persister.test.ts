// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthState, batchSetSpy, mockBatch } = vi.hoisted(() => ({
  mockAuthState: { user: null as { uid: string } | null },
  batchSetSpy: vi.fn(),
  mockBatch: { set: vi.fn() },
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: mockAuthState,
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_firestore: unknown, path: string) => ({ path })),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => "server-timestamp"),
}));

import { OnboardingPersister } from "#lib/shared/onboarding/services/onboarding-persister.js";

describe("OnboardingPersister terminal state", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthState.user = null;
    mockBatch.set = batchSetSpy;
    batchSetSpy.mockClear();
  });

  it("completion replaces an earlier skip", async () => {
    localStorage.setItem("tka-onboarding-skipped", "true");
    const persister = new OnboardingPersister();

    await persister.markAppCompleted();

    expect(localStorage.getItem("tka-onboarding-completed")).toBe("true");
    expect(localStorage.getItem("tka-onboarding-skipped")).toBeNull();
    expect(localStorage.getItem("tka-onboarding-completed-at")).not.toBeNull();
  });

  it("skip replaces an earlier completion", async () => {
    localStorage.setItem("tka-onboarding-completed", "true");
    localStorage.setItem(
      "tka-onboarding-completed-at",
      "2026-07-23T00:00:00.000Z"
    );
    const persister = new OnboardingPersister();

    await persister.markAppSkipped();

    expect(localStorage.getItem("tka-onboarding-skipped")).toBe("true");
    expect(localStorage.getItem("tka-onboarding-completed")).toBeNull();
    expect(localStorage.getItem("tka-onboarding-completed-at")).toBeNull();
  });

  it("can stage terminal status in the caller's atomic batch", async () => {
    mockAuthState.user = { uid: "user-1" };
    const persister = new OnboardingPersister();

    await persister.stageAppTerminalState(
      mockBatch as never,
      "user-1",
      "completed"
    );

    expect(batchSetSpy).toHaveBeenCalledWith(
      { path: "users/user-1/onboarding/status" },
      expect.objectContaining({
        appCompleted: true,
        appSkipped: false,
        updatedAt: "server-timestamp",
      }),
      { merge: true }
    );
  });
});
