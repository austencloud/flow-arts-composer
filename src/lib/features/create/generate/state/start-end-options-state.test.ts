import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: {
    settings: {
      blockedStartPlacements: [],
      blockedStartPlacementsByGridMode: {},
    },
    updateSettings: vi.fn(),
  },
}));

import { createStartEndOptionsState } from "./start-end-options-state.svelte";

const SESSION_STORAGE_KEY = "tka-start-end-session-options";

describe("createStartEndOptionsState session storage legacy keys", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("honors the pre-rename startPositionLetter/endPositions spellings", () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        startPositionLetter: "A",
        endPositions: ["beta3", "gamma7"],
        mustContainLetters: [],
        mustNotContainLetters: [],
        timestamp: Date.now(),
      })
    );

    const state = createStartEndOptionsState();

    expect(state.options.startPlacement?.letter).toBe("A");
    expect(state.options.endPlacements).toEqual(["beta3", "gamma7"]);
  });

  it("prefers the current startPlacementLetter/endPlacements when both are present", () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        startPositionLetter: "A",
        startPlacementLetter: "B",
        endPositions: ["beta3"],
        endPlacements: ["zeta2"],
        mustContainLetters: [],
        mustNotContainLetters: [],
        timestamp: Date.now(),
      })
    );

    const state = createStartEndOptionsState();

    expect(state.options.startPlacement?.letter).toBe("B");
    expect(state.options.endPlacements).toEqual(["zeta2"]);
  });

  it("never writes the legacy spellings back to session storage", () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        startPositionLetter: "A",
        endPositions: ["beta3"],
        mustContainLetters: [],
        mustNotContainLetters: [],
        timestamp: Date.now(),
      })
    );

    const state = createStartEndOptionsState();
    // Any write (e.g. setting a must-contain letter) re-serializes the whole
    // session blob; it must only ever carry the current spellings.
    state.setMustContainLetters([]);

    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const written = JSON.parse(raw as string) as Record<string, unknown>;
    expect(written).not.toHaveProperty("startPositionLetter");
    expect(written).not.toHaveProperty("endPositions");
    expect(written.startPlacementLetter).toBe("A");
    expect(written.endPlacements).toEqual(["beta3"]);
  });
});
