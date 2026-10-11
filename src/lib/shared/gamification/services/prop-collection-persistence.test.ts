// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  PROP_COLLECTION_KEY,
  loadGuestCollection,
  saveGuestCollection,
  clearGuestCollection,
} from "./prop-collection-persistence";

describe("prop-collection-persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing stored", () => {
    expect(loadGuestCollection()).toEqual({
      unlockedPropTypes: [],
      creationCount: 0,
      pendingPicks: 0,
    });
  });

  it("round-trips a saved collection", () => {
    const c = { unlockedPropTypes: [PropType.SWORD], creationCount: 4, pendingPicks: 1 };
    saveGuestCollection(c);
    expect(loadGuestCollection()).toEqual(c);
  });

  it("clear removes the key", () => {
    saveGuestCollection({ unlockedPropTypes: [PropType.TORCH], creationCount: 1, pendingPicks: 0 });
    clearGuestCollection();
    expect(localStorage.getItem(PROP_COLLECTION_KEY)).toBeNull();
  });

  it("falls back to defaults on corrupt JSON", () => {
    localStorage.setItem(PROP_COLLECTION_KEY, "{not json");
    expect(loadGuestCollection().creationCount).toBe(0);
  });
});
