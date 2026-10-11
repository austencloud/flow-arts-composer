// Per-uid saved-sequence ledger: the scoping mechanism that stops a
// guest→account upgrade from importing a prior user's library on a shared,
// never-cleared Dexie store (SP2 capture-source fix).

import { beforeEach, describe, expect, it } from "vitest";
import {
  recordSavedSequenceId,
  getSavedSequenceIds,
  removeSavedSequenceIds,
} from "#lib/shared/library/services/saved-sequence-ledger.js";

beforeEach(() => localStorage.clear());

describe("saved-sequence-ledger", () => {
  it("records ids per uid and reads them back", () => {
    recordSavedSequenceId("uid-a", "s1");
    recordSavedSequenceId("uid-a", "s2");
    expect(getSavedSequenceIds("uid-a").sort()).toEqual(["s1", "s2"]);
  });

  it("scopes ids to their uid — one uid never sees another's saves", () => {
    recordSavedSequenceId("uid-a", "s1");
    recordSavedSequenceId("uid-b", "s2");
    expect(getSavedSequenceIds("uid-a")).toEqual(["s1"]);
    expect(getSavedSequenceIds("uid-b")).toEqual(["s2"]);
  });

  it("dedupes repeated ids", () => {
    recordSavedSequenceId("uid-a", "s1");
    recordSavedSequenceId("uid-a", "s1");
    expect(getSavedSequenceIds("uid-a")).toEqual(["s1"]);
  });

  it("returns [] for an unknown uid, null, or empty uid", () => {
    expect(getSavedSequenceIds("nobody")).toEqual([]);
    expect(getSavedSequenceIds(null)).toEqual([]);
    expect(getSavedSequenceIds("")).toEqual([]);
  });

  it("no-ops on missing uid/id without throwing", () => {
    expect(() => recordSavedSequenceId(null, "s1")).not.toThrow();
    expect(() => recordSavedSequenceId("uid-a", "")).not.toThrow();
    expect(getSavedSequenceIds("uid-a")).toEqual([]);
  });

  it("removes only the requested ids from one user's ledger", () => {
    recordSavedSequenceId("uid-a", "s1");
    recordSavedSequenceId("uid-a", "s2");
    recordSavedSequenceId("uid-a", "s3");
    recordSavedSequenceId("uid-b", "s2");

    removeSavedSequenceIds("uid-a", ["s1", "s3"]);

    expect(getSavedSequenceIds("uid-a")).toEqual(["s2"]);
    expect(getSavedSequenceIds("uid-b")).toEqual(["s2"]);
  });

  it("removes the storage record when no saved ids remain", () => {
    recordSavedSequenceId("uid-a", "s1");

    removeSavedSequenceIds("uid-a", ["s1"]);

    expect(getSavedSequenceIds("uid-a")).toEqual([]);
    expect(localStorage.getItem("tka-saved-seq-ids:uid-a")).toBeNull();
  });
});
