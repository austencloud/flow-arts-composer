// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Keep the cloud-sync and analytics paths hermetic: no real Firestore/PostHog
// in a unit run. The state module dynamic-imports the first two; with a
// missing doc + no effectiveUserId, syncToCloud is a no-op and syncFromCloud
// just resolves the gate. Mirrors tests/unit/onboarding/generate-tour-state.test.ts.
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

const { mockDocSnap, batchSetSpy, batchCommitSpy, mockBatch } = vi.hoisted(
  () => {
    const batchSetSpy = vi.fn();
    const batchCommitSpy = vi.fn(async () => {});
    return {
      mockDocSnap: { exists: false, data: {} as Record<string, unknown> },
      batchSetSpy,
      batchCommitSpy,
      mockBatch: { set: batchSetSpy, commit: batchCommitSpy },
    };
  }
);
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => mockDocSnap.exists,
    data: () => mockDocSnap.data,
  })),
  writeBatch: vi.fn(() => mockBatch),
  serverTimestamp: vi.fn(() => 0),
}));

const { mockAuthState } = vi.hoisted(() => ({
  mockAuthState: {
    user: null as { uid: string } | null,
    get effectiveUserId(): string | null {
      return this.user?.uid ?? null;
    },
  },
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: mockAuthState,
}));

// AUTO_TOURS_ENABLED/CREATE_TUTORIAL_ENABLED are compile-time constants in
// the real module - mock them as mutable getters so each test can drive the
// seed-permutation matrix without touching the real flag file.
const { flags } = vi.hoisted(() => ({
  flags: { AUTO_TOURS_ENABLED: false, CREATE_TUTORIAL_ENABLED: true },
}));
vi.mock("#lib/shared/onboarding/domain/onboarding-flags.js", () => ({
  get AUTO_TOURS_ENABLED() {
    return flags.AUTO_TOURS_ENABLED;
  },
  get CREATE_TUTORIAL_ENABLED() {
    return flags.CREATE_TUTORIAL_ENABLED;
  },
}));

const { captureEventSpy } = vi.hoisted(() => ({
  captureEventSpy: vi.fn(),
}));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureWhenReady: captureEventSpy,
}));

const { markAppCompletedSpy, markAppSkippedSpy, stageAppTerminalStateSpy } =
  vi.hoisted(() => ({
    markAppCompletedSpy: vi.fn(async () => {}),
    markAppSkippedSpy: vi.fn(async () => {}),
    stageAppTerminalStateSpy: vi.fn(async () => {}),
  }));
vi.mock("#lib/shared/onboarding/get-onboarding-persister.js", () => ({
  getOnboardingPersister: () => ({
    markAppCompleted: markAppCompletedSpy,
    markAppSkipped: markAppSkippedSpy,
    stageAppTerminalState: stageAppTerminalStateSpy,
  }),
}));

type AppEntry =
  typeof import("#lib/shared/onboarding/state/app-entry-state.svelte.js").appEntryState;

/** Re-import the singleton with a clean module + localStorage each time so we
 *  can exercise its construction-time seed derivation. */
async function freshState(): Promise<AppEntry> {
  vi.resetModules();
  const mod =
    await import("#lib/shared/onboarding/state/app-entry-state.svelte.js");
  return mod.appEntryState;
}

function resetMocks() {
  localStorage.clear();
  mockAuthState.user = null;
  mockDocSnap.exists = false;
  mockDocSnap.data = {};
  flags.AUTO_TOURS_ENABLED = false;
  flags.CREATE_TUTORIAL_ENABLED = true;
  captureEventSpy.mockClear();
  markAppCompletedSpy.mockClear();
  markAppSkippedSpy.mockClear();
  stageAppTerminalStateSpy.mockClear();
  batchSetSpy.mockClear();
  batchCommitSpy.mockClear();
}

describe("appEntryState — seed derivation (hasCompleted/phase can never diverge)", () => {
  beforeEach(resetMocks);

  it("completed=true seeds hasCompleted=true and phase=complete regardless of first-run/auto-tours", async () => {
    localStorage.setItem("tka-app-entry-completed", "true");
    flags.AUTO_TOURS_ENABLED = true;
    const state = await freshState();
    expect(state.hasCompleted).toBe(true);
    expect(state.phase).toBe("complete");
  }, 30_000);

  it("REGRESSION: firstRunDone + AUTO_TOURS off seeds hasCompleted=true (was the divergence bug)", async () => {
    localStorage.setItem("tka-first-run-completed", "true");
    flags.AUTO_TOURS_ENABLED = false;
    const state = await freshState();
    // Before the fix: phase became "complete" here but hasCompleted stayed
    // false (seeded from `completed` alone), so a later offerCreateTutorial()
    // call would overwrite phase back to "tutorial-prompt" and re-pop the
    // tutorial for an already-onboarded member.
    expect(state.phase).toBe("complete");
    expect(state.hasCompleted).toBe(true);
  });

  it("firstRunDone + AUTO_TOURS on seeds the tutorial-prompt phase, not onboarded", async () => {
    localStorage.setItem("tka-first-run-completed", "true");
    flags.AUTO_TOURS_ENABLED = true;
    const state = await freshState();
    expect(state.phase).toBe("tutorial-prompt");
    expect(state.hasCompleted).toBe(false);
  });

  it("brand new user (no flags set) seeds wizard-active, not onboarded", async () => {
    const state = await freshState();
    expect(state.phase).toBe("wizard-active");
    expect(state.hasCompleted).toBe(false);
  });

  it("an onboarded member from the divergence-bug scenario is not re-offered the tutorial", async () => {
    localStorage.setItem("tka-first-run-completed", "true");
    flags.AUTO_TOURS_ENABLED = false;
    const state = await freshState();
    await state.offerCreateTutorial();
    // hasCompleted now correctly gates offerCreateTutorial's early return, so
    // phase must stay "complete" rather than being overwritten.
    expect(state.phase).toBe("complete");
  });
});

describe("appEntryState — syncFromCloud reset-on-missing-doc", () => {
  beforeEach(resetMocks);

  it("resets a stale local hasCompleted=true when the cloud doc is missing (reused-device leak)", async () => {
    localStorage.setItem("tka-app-entry-completed", "true");
    mockAuthState.user = { uid: "new-account-uid" };
    mockDocSnap.exists = false;

    const state = await freshState();
    expect(state.hasCompleted).toBe(true); // stale, inherited local flag

    await state.syncFromCloud();

    expect(state.hasCompleted).toBe(false);
    expect(state.phase).toBe("wizard-active");
    expect(localStorage.getItem("tka-app-entry-completed")).toBeNull();
    expect(state.cloudSynced).toBe(true);
  });

  it("confirms hasCompleted=true when the cloud doc says completed", async () => {
    mockAuthState.user = { uid: "returning-uid" };
    mockDocSnap.exists = true;
    mockDocSnap.data = { completed: true };

    const state = await freshState();
    await state.syncFromCloud();

    expect(state.hasCompleted).toBe(true);
    expect(state.phase).toBe("complete");
  });

  it("resolves the sync gate even with no signed-in user (local state governs)", async () => {
    mockAuthState.user = null;
    const state = await freshState();
    expect(state.cloudSynced).toBe(false);
    await state.syncFromCloud();
    expect(state.cloudSynced).toBe(true);
  });
});

describe("appEntryState — cloudSynced gates the guided-build offer", () => {
  beforeEach(resetMocks);

  it("defers the offer for a signed-in user until the cloud read resolves, then replays it", async () => {
    mockAuthState.user = { uid: "authed-uid" };
    mockDocSnap.exists = false; // brand-new account cloud-side too

    const state = await freshState();
    await state.offerCreateTutorial();
    // No cloud read yet — must NOT flash the prompt on.
    expect(state.phase).toBe("wizard-active");

    await state.syncFromCloud();
    // Deferred offer replays once the read resolves and confirms this
    // account genuinely isn't onboarded.
    expect(state.phase).toBe("tutorial-prompt");
  });

  it("offers immediately for a signed-out session (no Firebase user at all)", async () => {
    mockAuthState.user = null;
    const state = await freshState();
    await state.offerCreateTutorial();
    expect(state.phase).toBe("tutorial-prompt");
  });
});

describe("appEntryState — localStorage failure doesn't block Firebase sync", () => {
  beforeEach(resetMocks);

  it("completeEntry still calls the Firebase sync when localStorage.setItem throws (QuotaExceededError)", async () => {
    mockAuthState.user = { uid: "quota-uid" };
    mockDocSnap.exists = false;

    const state = await freshState();
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });

    try {
      // completeEntry() writes APP_ENTRY_COMPLETED_KEY via
      // safeLocalStorageSetItem (guarded) then fires syncToCloud()
      // fire-and-forget - the write throwing internally must not prevent
      // that call from happening.
      state.completeEntry();

      // In-memory state is set synchronously before the guarded localStorage
      // write, so it's unaffected by the throw either way.
      expect(state.hasCompleted).toBe(true);
      expect(state.phase).toBe("complete");

      await vi.waitFor(() => {
        expect(batchCommitSpy).toHaveBeenCalled();
      });
    } finally {
      setItemSpy.mockRestore();
    }
  });
});

describe("appEntryState — analytics events", () => {
  beforeEach(resetMocks);

  it("offer -> accept -> complete fires 3 distinct events", async () => {
    const state = await freshState();
    await state.offerCreateTutorial();
    state.acceptTutorial();
    state.completeEntry();

    const names = captureEventSpy.mock.calls.map((call) => call[0]);
    expect(names).toEqual([
      "onboarding_tutorial_offered",
      "onboarding_tutorial_accepted",
      "onboarding_tutorial_completed",
    ]);
  });

  it("decline fires its own event and does NOT also fire completed", async () => {
    const state = await freshState();
    await state.offerCreateTutorial();
    state.declineTutorial();

    const names = captureEventSpy.mock.calls.map((call) => call[0]);
    expect(names).toEqual([
      "onboarding_tutorial_offered",
      "onboarding_tutorial_declined",
    ]);
    expect(names).not.toContain("onboarding_tutorial_completed");
  });

  it("AUTO_TOURS off records a skip without claiming the tutorial completed", async () => {
    flags.AUTO_TOURS_ENABLED = false;
    mockAuthState.user = { uid: "auto-tours-off-uid" };
    const state = await freshState();

    state.startEntrySequence();

    expect(state.phase).toBe("complete");
    expect(captureEventSpy).not.toHaveBeenCalledWith(
      "onboarding_tutorial_completed",
      expect.anything()
    );
    await vi.waitFor(() => {
      expect(stageAppTerminalStateSpy).toHaveBeenCalledWith(
        mockBatch,
        "auto-tours-off-uid",
        "skipped"
      );
    });
    expect(markAppCompletedSpy).not.toHaveBeenCalled();
  });

  it("a completed tutorial synchronizes app-wide onboarding completion", async () => {
    mockAuthState.user = { uid: "completed-tutorial-uid" };
    const state = await freshState();
    // Earlier cases also exercise fire-and-forget cloud writes. Let their
    // dynamic imports settle before measuring this transition in isolation.
    await new Promise((resolve) => setTimeout(resolve, 0));
    markAppCompletedSpy.mockClear();
    markAppSkippedSpy.mockClear();
    stageAppTerminalStateSpy.mockClear();

    state.completeEntry();

    await vi.waitFor(() => {
      expect(stageAppTerminalStateSpy).toHaveBeenCalledWith(
        mockBatch,
        "completed-tutorial-uid",
        "completed"
      );
    });
    expect(markAppSkippedSpy).not.toHaveBeenCalled();
  });
});
