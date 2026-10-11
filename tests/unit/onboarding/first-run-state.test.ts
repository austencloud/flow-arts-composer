// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  setDoc: vi.fn(async () => undefined),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  authState: {
    effectiveUserId: null as string | null,
  },
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({ name: "firestore" })),
}));

vi.mock("firebase/firestore", () => ({
  doc: h.doc,
  getDoc: vi.fn(),
  setDoc: h.setDoc,
  serverTimestamp: vi.fn(() => "server-time"),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: h.authState,
}));

vi.mock("#lib/shared/analytics/services/onboarding-events.js", () => ({
  logOnboardingFirstRunCompleted: vi.fn(),
}));

type FirstRunState =
  typeof import("#lib/shared/onboarding/state/first-run-state.svelte.js").firstRunState;

async function freshState(): Promise<FirstRunState> {
  vi.resetModules();
  const mod = await import(
    "#lib/shared/onboarding/state/first-run-state.svelte.js"
  );
  return mod.firstRunState;
}

beforeEach(() => {
  localStorage.clear();
  h.authState.effectiveUserId = null;
  h.setDoc.mockClear();
  h.doc.mockClear();
});

describe("firstRunState magic-link setup skip", () => {
  it("persists the skip against the uid supplied by auth completion", async () => {
    localStorage.setItem("tka-first-run-completed", "true");
    localStorage.setItem(
      "tka-first-run-completed-at",
      "2026-07-21T12:00:00.000Z"
    );
    const state = await freshState();

    state.markSkipped("magic-link-user");

    await vi.waitFor(() => expect(h.setDoc).toHaveBeenCalledTimes(1));
    expect(h.doc).toHaveBeenCalledWith(
      { name: "firestore" },
      "users/magic-link-user/onboarding/firstRun"
    );
    expect(h.setDoc.mock.calls[0][1]).toMatchObject({
      completed: false,
      skipped: true,
      completedAt: null,
    });
    expect(localStorage.getItem("tka-first-run-completed")).toBeNull();
    expect(localStorage.getItem("tka-first-run-completed-at")).toBeNull();
    expect(localStorage.getItem("tka-first-run-skipped")).toBe("true");
  });

  it("freezes the skip payload before an overlapping cloud read can reset local state", async () => {
    const state = await freshState();

    state.markSkipped("magic-link-user");
    state.reset();

    await vi.waitFor(() => expect(h.setDoc).toHaveBeenCalledTimes(1));
    expect(h.setDoc.mock.calls[0][1]).toMatchObject({
      completed: false,
      skipped: true,
      completedAt: null,
    });
  });
});
