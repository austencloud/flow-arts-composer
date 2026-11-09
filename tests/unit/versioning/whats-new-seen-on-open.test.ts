import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppVersion } from "#lib/shared/versioning/domain/models/version-models.js";

// Read means opened. If opening stopped marking notes read, the dot would
// never clear; if something else marked them, the dot would clear unseen.
vi.mock("#lib/shared/onboarding/get-onboarding-persister.js", () => ({
  getOnboardingPersister: () => {
    throw new Error("no persister in tests");
  },
}));
vi.mock("#lib/shared/feedback/services/version-service.js", () => ({
  getVersions: vi.fn(async () => []),
}));

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { whatsNewState } = await import(
  "#lib/shared/settings/state/whats-new-state.svelte.js"
);

const release = (version: string): AppVersion => ({
  version,
  releasedAt: new Date(0),
  feedbackCount: 0,
  feedbackSummary: { bugs: 0, features: 0, general: 0 },
  changelogEntries: [{ category: "added", text: version }],
});

describe("whatsNewState read-on-open", () => {
  beforeEach(() => {
    store.clear();
    store.set("tka-last-seen-version", "0.47.0");
    whatsNewState.reset();
    whatsNewState.setUnseen([release("0.50.0"), release("0.48.0")]);
  });

  it("does not mark anything read when the toast fires", () => {
    whatsNewState.markToasted("0.50.0");
    expect(whatsNewState.hasUnread).toBe(true);
    expect(whatsNewState.lastSeenVersion()).toBe("0.47.0");
    expect(whatsNewState.lastToastedVersion()).toBe("0.50.0");
  });

  it("marks every rolled-up release read when the sheet opens", () => {
    whatsNewState.openRollup(whatsNewState.unseen);
    expect(whatsNewState.rollup.map((v) => v.version)).toEqual([
      "0.50.0",
      "0.48.0",
    ]);
    expect(whatsNewState.lastSeenVersion()).toBe("0.50.0");
    expect(whatsNewState.hasUnread).toBe(false);
  });

  it("clears the dot when Release Notes opens", () => {
    whatsNewState.markReleaseNotesOpened();
    expect(whatsNewState.lastSeenVersion()).toBe("0.50.0");
    expect(whatsNewState.hasUnread).toBe(false);
  });

  it("opening the version number shows the unread rollup first", async () => {
    await whatsNewState.openManual();
    expect(whatsNewState.isOpen).toBe(true);
    expect(whatsNewState.rollup).toHaveLength(2);
    expect(whatsNewState.hasUnread).toBe(false);
  });
});
