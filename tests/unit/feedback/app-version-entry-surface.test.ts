import { describe, it, expect } from "vitest";
import { AppVersionSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";

// Deep-link fields are new and forward-only. A legacy doc (no fields, or null
// from old scripts) and a hand-edited bad surface must still parse, with the
// note shown as plain text rather than the whole version vanishing.
describe("AppVersionSchema entry deep-link fields", () => {
  const parse = (entry: Record<string, unknown>) =>
    AppVersionSchema.parse({
      id: "0.51.0",
      version: "0.51.0",
      releasedAt: "2026-11-07T00:00:00.000Z",
      changelogEntries: [{ category: "added", text: "A.", ...entry }],
    }).changelogEntries![0]!;

  it("keeps a surface and a highlight's arrival", () => {
    const entry = parse({
      surface: { module: "create", tab: "construct" },
      highlight: true,
      anchor: "mirror-button",
      callout: "Mirror sits under the grid.",
    });
    expect(entry.surface).toEqual({ module: "create", tab: "construct" });
    expect(entry.highlight).toBe(true);
    expect(entry.anchor).toBe("mirror-button");
    expect(entry.callout).toBe("Mirror sits under the grid.");
  });

  it("parses a legacy entry with nothing or null as undefined", () => {
    for (const legacy of [
      {},
      { surface: null, highlight: null, anchor: null, callout: null },
    ]) {
      const entry = parse(legacy);
      expect(entry.text).toBe("A.");
      expect(entry.surface).toBeUndefined();
      expect(entry.highlight).toBeUndefined();
      expect(entry.anchor).toBeUndefined();
    }
  });

  it("drops a malformed surface but keeps the note", () => {
    for (const bad of [{ tab: "x" }, { module: "" }, "create", 7]) {
      const entry = parse({ surface: bad });
      expect(entry.text).toBe("A.");
      expect(entry.surface).toBeUndefined();
    }
  });
});
