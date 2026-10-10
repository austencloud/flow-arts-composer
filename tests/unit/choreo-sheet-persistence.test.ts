import { describe, it, expect, beforeEach } from "vitest";
import {
  loadDraft,
  loadDraftMeta,
  persistDraft,
} from "#lib/features/write/state/choreo-sheet-state.svelte.js";
import { parseChoreoSheet } from "#lib/features/write/services/choreo-sheet-repository.js";
import { createEmptyChoreoSheet } from "#lib/features/write/domain/types/choreo-sheet.js";

/**
 * The choreo-sheet builder auto-saves a draft to localStorage and restores it on
 * reload/HMR. These guard the serialization contract: what you left is what you
 * get back (ids in order, name, layout), and corrupt/partial data never throws.
 */
describe("choreo-sheet draft persistence", () => {
  const KEY = "test-choreo-draft";
  beforeEach(() => localStorage.clear());

  it("returns null when nothing is persisted", () => {
    expect(loadDraft(KEY)).toBeNull();
  });

  it("round-trips id, name, ordered ids, and layout", () => {
    const base = createEmptyChoreoSheet("owner-1", "My Sheet");
    const sheet = {
      ...base,
      sequenceIds: ["a", "b", "c"],
      layout: { ...base.layout, showStepNumbers: false, groupSeparator: "gap" as const },
    };

    persistDraft(KEY, sheet);
    const restored = loadDraft(KEY);

    expect(restored).not.toBeNull();
    expect(restored!.id).toBe(sheet.id);
    expect(restored!.name).toBe("My Sheet");
    expect(restored!.sequenceIds).toEqual(["a", "b", "c"]);
    expect(restored!.layout.showStepNumbers).toBe(false);
    expect(restored!.layout.groupSeparator).toBe("gap");
    expect(restored!.createdAt).toBeInstanceOf(Date);
    expect(restored!.updatedAt).toBeInstanceOf(Date);
  });

  it("fills missing layout fields from the defaults", () => {
    localStorage.setItem(KEY, JSON.stringify({ sequenceIds: [], layout: { columns: 8 } }));
    const restored = loadDraft(KEY);
    // A partial layout must still yield a complete, valid layout.
    expect(restored!.layout.rowsPerPage).toBe(6);
    expect(restored!.layout.paperSize).toBe("letter");
    expect(restored!.layout.keepBlocksTogether).toBe(true);
  });

  it("returns null on corrupt JSON instead of throwing", () => {
    localStorage.setItem(KEY, "{not valid json");
    expect(loadDraft(KEY)).toBeNull();
  });

  it("returns null when the payload has no sequenceIds array", () => {
    localStorage.setItem(KEY, JSON.stringify({ name: "x" }));
    expect(loadDraft(KEY)).toBeNull();
  });

  it("drops non-string ids defensively", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ sequenceIds: ["ok", 3, null, { bad: 1 }, "fine"] }),
    );
    expect(loadDraft(KEY)!.sequenceIds).toEqual(["ok", "fine"]);
  });

  it("round-trips sequenceMeta through the draft", () => {
    const sheet = { ...createEmptyChoreoSheet("o"), sequenceIds: ["a"] };
    persistDraft("k", sheet, { a: { name: "CΦ-", stepCount: 8 } });
    expect(loadDraftMeta("k")).toEqual({ a: { name: "CΦ-", stepCount: 8 } });
    expect(loadDraft("k")?.sequenceIds).toEqual(["a"]);
  });

  it("draft without sequenceMeta parses with empty meta", () => {
    persistDraft("k2", { ...createEmptyChoreoSheet("o"), sequenceIds: ["a"] });
    expect(loadDraftMeta("k2")).toEqual({});
    expect(loadDraft("k2")).not.toBeNull();
  });
});

/**
 * The cloud document carries the same optional display-meta snapshot, so a sheet
 * opened on another device can label its rows before hydration finishes. Absent
 * on every pre-existing doc — those must parse exactly as they did before.
 */
describe("choreo-sheet doc sequenceMeta", () => {
  const base = {
    id: "s1",
    name: "Sheet",
    ownerId: "o",
    sequenceIds: ["a"],
    layout: {},
    annotations: {},
  };

  it("parses sequenceMeta when present", () => {
    const parsed = parseChoreoSheet({
      ...base,
      sequenceMeta: { a: { name: "CΦ-", stepCount: 8 } },
    });
    expect(parsed.sequenceMeta).toEqual({ a: { name: "CΦ-", stepCount: 8 } });
    expect(parsed.sequenceIds).toEqual(["a"]);
  });

  it("parses a doc with no sequenceMeta exactly as before", () => {
    const parsed = parseChoreoSheet(base);
    expect(parsed.sequenceMeta).toBeUndefined();
    expect(parsed.sequenceIds).toEqual(["a"]);
    expect(parsed.name).toBe("Sheet");
  });
});
