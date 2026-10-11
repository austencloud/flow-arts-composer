// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";

// Keep the cloud-sync paths hermetic: no real Firestore in a unit run. The
// state module dynamic-imports these three; with effectiveUserId=null,
// syncToCloud is a no-op and syncFromCloud just resolves the gate.
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => 0),
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { effectiveUserId: null },
}));

type TourState =
  typeof import("#lib/shared/onboarding/state/generate-tour-state.svelte.js").generateTourState;

/** Re-import the singleton with a clean module + localStorage each time so we
 *  can exercise its construction-time read of the persisted flags. */
async function freshState(): Promise<TourState> {
  vi.resetModules();
  const mod = await import(
    "#lib/shared/onboarding/state/generate-tour-state.svelte.js"
  );
  return mod.generateTourState;
}

describe("generateTourState — first-run offer resolution", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("a brand-new user has an unresolved offer", async () => {
    const state = await freshState();
    expect(state.hasCompleted).toBe(false);
    expect(state.wasOffered).toBe(false);
    expect(state.hasResolvedOffer).toBe(false);
  });

  it("dismissing the offer resolves it (offered path)", async () => {
    const state = await freshState();
    state.markOffered();
    expect(state.wasOffered).toBe(true);
    expect(state.hasResolvedOffer).toBe(true);
    // Persisted for this device...
    expect(localStorage.getItem("tka-generate-tour-offered")).toBe("true");
  });

  it("markOffered is idempotent", async () => {
    const state = await freshState();
    state.markOffered();
    state.markOffered();
    expect(state.wasOffered).toBe(true);
  });

  it("completing the tour resolves the offer (completed path)", async () => {
    const state = await freshState();
    state.start();
    state.complete();
    expect(state.hasCompleted).toBe(true);
    expect(state.hasResolvedOffer).toBe(true);
  });

  it("skipping the tour resolves the offer", async () => {
    const state = await freshState();
    state.start();
    state.skip();
    expect(state.hasCompleted).toBe(true);
    expect(state.hasResolvedOffer).toBe(true);
  });

  it("restores a prior offered-dismissal from localStorage", async () => {
    localStorage.setItem("tka-generate-tour-offered", "true");
    const state = await freshState();
    expect(state.hasResolvedOffer).toBe(true);
  });

  it("restores a prior completion from localStorage", async () => {
    localStorage.setItem("tka-generate-tour-completed", "true");
    const state = await freshState();
    expect(state.hasCompleted).toBe(true);
    expect(state.hasResolvedOffer).toBe(true);
  });

  it("resolves the cloud-sync gate even with no account to pull from", async () => {
    const state = await freshState();
    expect(state.cloudSynced).toBe(false);
    await state.syncFromCloud();
    // No userId → nothing to pull, but the gate must resolve so the offer can
    // still render for genuine first-run guests.
    expect(state.cloudSynced).toBe(true);
    expect(state.hasResolvedOffer).toBe(false);
  });

  it("reset clears both the offered and completed flags", async () => {
    localStorage.setItem("tka-generate-tour-offered", "true");
    localStorage.setItem("tka-generate-tour-completed", "true");
    const state = await freshState();
    state.reset();
    expect(state.hasCompleted).toBe(false);
    expect(state.wasOffered).toBe(false);
    expect(state.hasResolvedOffer).toBe(false);
    expect(localStorage.getItem("tka-generate-tour-offered")).toBeNull();
    expect(localStorage.getItem("tka-generate-tour-completed")).toBeNull();
  });
});
