/**
 * experience-persistence legacy concept id fold.
 *
 * `tka_experience_state` is keyed by concept id (per-concept step/phase, plus
 * `_activeConceptId`). A concept id rename does not migrate the state already
 * saved under the old key, so `loadAllStates` folds every legacy id in
 * LEGACY_CONCEPT_ID_ALIASES onto its current id the first time it reads a
 * shape that still has one, then writes the folded shape straight back so
 * the fold only ever has to run once per legacy key.
 *
 * `browser` is stubbed true (the default test stub pins it false, which
 * short-circuits every read/write in this module to a no-op) and jsdom's
 * real localStorage is used, matching concept-progress-tracker.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

import {
  getActiveConceptId,
  getExperiencePersistence,
} from "./experience-persistence.svelte";

const STORAGE_KEY = "tka_experience_state";

function readStored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
}

describe("experience-persistence legacy concept id fold", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("moves a legacy-only key onto the current id", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "hand-positions": { step: 2, phaseData: { seen: true } },
      })
    );

    const state = getExperiencePersistence("hand-placements").load();

    expect(state).toEqual({ step: 2, phaseData: { seen: true } });

    const stored = readStored();
    expect(stored["hand-placements"]).toEqual({
      step: 2,
      phaseData: { seen: true },
    });
    expect(stored).not.toHaveProperty("hand-positions");
  });

  it("keeps the current id's state and drops the legacy one when both exist", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "hand-positions": { step: 5 },
        "hand-placements": { step: 1 },
      })
    );

    const state = getExperiencePersistence("hand-placements").load();

    expect(state).toEqual({ step: 1 });

    const stored = readStored();
    expect(stored["hand-placements"]).toEqual({ step: 1 });
    expect(stored).not.toHaveProperty("hand-positions");
  });

  it("only folds once - a second load of already-clean state changes nothing", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "hand-placements": { step: 3 } })
    );

    getExperiencePersistence("hand-placements").load();
    const afterFirst = readStored();
    getExperiencePersistence("hand-placements").load();
    const afterSecond = readStored();

    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond["hand-placements"]).toEqual({ step: 3 });
  });

  it("folds a legacy id held as the _activeConceptId value", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ _activeConceptId: "staff-positions" })
    );

    expect(getActiveConceptId()).toBe("staff-placements");
    expect(readStored()._activeConceptId).toBe("staff-placements");
  });

  it("leaves state with no legacy id untouched", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ grid: { step: 4 } })
    );

    const state = getExperiencePersistence("grid").load();

    expect(state).toEqual({ step: 4 });
    expect(readStored()).toEqual({ grid: { step: 4 } });
  });
});
