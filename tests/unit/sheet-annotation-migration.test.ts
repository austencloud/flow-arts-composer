import { describe, it, expect } from "vitest";
import {
  parseLegacyBandKey,
  migrateCue,
  migrateNote,
  migrateCues,
  migrateNotes,
} from "#lib/features/write/domain/annotation-migration.js";

describe("parseLegacyBandKey", () => {
  it("splits a plain key", () => {
    expect(parseLegacyBandKey("abc:2")).toEqual({ sequenceId: "abc", rowInSequence: 2 });
  });

  it("takes the row from the LAST separator — sequence ids may contain colons", () => {
    expect(parseLegacyBandKey("weird:id:3")).toEqual({ sequenceId: "weird:id", rowInSequence: 3 });
  });

  it("rejects a malformed key rather than anchoring it to step 0", () => {
    expect(parseLegacyBandKey("noseparator")).toBeNull();
    expect(parseLegacyBandKey("abc:")).toBeNull();
    expect(parseLegacyBandKey("abc:notanumber")).toBeNull();
    expect(parseLegacyBandKey(":2")).toBeNull();
  });
});

describe("migrateNote — band + count → absolute step", () => {
  it("converts a pinned note using the columns it was saved with", () => {
    // band 1, count 5, saved at 8 columns → step 1*8 + 4 = 12
    const note = migrateNote({ id: "n1", band: "x:1", count: 5, text: "roll" }, 8);
    expect(note).toEqual({
      id: "n1",
      sequenceId: "x",
      stepIndex: 12,
      pinned: true,
      text: "roll",
    });
  });

  it("resolves the SAME note differently per saved layout — that was the bug", () => {
    const legacy = { id: "n1", band: "x:1", count: 3, text: "roll" };
    expect(migrateNote(legacy, 8)!.stepIndex).toBe(10); // 8 + 2
    expect(migrateNote(legacy, 4)!.stepIndex).toBe(6); // 4 + 2
  });

  it("anchors a full-width bullet to its row's first step", () => {
    const note = migrateNote({ id: "n2", band: "x:2", count: null, text: "breathe" }, 8);
    expect(note).toMatchObject({ stepIndex: 16, pinned: false });
  });

  it("migrates an already-demoted out-of-range count as a bullet", () => {
    // count 7 at 4 columns was never pinnable — it rendered as a bullet, and
    // that is what the user saw, so that is what it becomes.
    const note = migrateNote({ id: "n3", band: "x:0", count: 7, text: "oops" }, 4);
    expect(note).toMatchObject({ pinned: false, stepIndex: 0 });
  });

  it("returns null for an unparseable band", () => {
    expect(migrateNote({ id: "n4", band: "garbage", count: 1, text: "" }, 8)).toBeNull();
  });

  it("coerces non-string text rather than dropping the note", () => {
    expect(migrateNote({ id: "n5", band: "x:0", count: 1, text: undefined }, 8)!.text).toBe("");
  });
});

describe("migrateCue — a row-anchored cue lands on the row's first step", () => {
  it("converts using the saved columns", () => {
    const cue = migrateCue({ band: "x:2", timestamp: "0:16", text: "drop" }, 8);
    expect(cue).toEqual({ sequenceId: "x", stepIndex: 16, timestamp: "0:16", text: "drop" });
  });

  it("returns null for an unparseable band", () => {
    expect(migrateCue({ band: "nope", timestamp: "", text: "" }, 8)).toBeNull();
  });
});

describe("mixed lists are safe to migrate on every load", () => {
  it("passes already-migrated marks through untouched", () => {
    const current = { id: "n1", sequenceId: "x", stepIndex: 9, pinned: true, text: "kept" };
    const legacy = { id: "n2", band: "x:1", count: 1, text: "converted" };
    const out = migrateNotes([current, legacy], 8);
    expect(out[0]).toEqual(current); // untouched, not re-derived
    expect(out[1]).toMatchObject({ stepIndex: 8, pinned: true, text: "converted" });
  });

  it("is idempotent — a second pass changes nothing", () => {
    const once = migrateNotes([{ id: "n1", band: "x:1", count: 5, text: "roll" }], 8);
    expect(migrateNotes(once, 4)).toEqual(once); // even at a different width
  });

  it("drops only the unparseable entries, keeping the rest", () => {
    const out = migrateCues(
      [
        { band: "x:0", timestamp: "0:00", text: "keep" },
        { band: "junk", timestamp: "0:04", text: "drop" },
        { sequenceId: "y", stepIndex: 3, timestamp: "0:08", text: "keep too" },
      ],
      8
    );
    expect(out.map((c) => c.text)).toEqual(["keep", "keep too"]);
  });
});
