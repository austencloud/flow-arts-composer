import { describe, it, expect } from "vitest";
import { AppVersionSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";

/**
 * Release entries now keep the surface they were authored for, plus the
 * highlight flag and its arrival hints. Legacy docs have none of these, and
 * a malformed value must degrade to a plain entry rather than dropping the
 * whole version from Release Notes.
 */
describe("AppVersionSchema changelog entry surface fields", () => {
  const base = {
    id: "0.50.0",
    version: "0.50.0",
    releasedAt: "2026-11-01T00:00:00.000Z",
  };
  const parseEntries = (entries: unknown[]) =>
    AppVersionSchema.parse({ ...base, changelogEntries: entries })
      .changelogEntries!;

  it("keeps a module surface, a global surface and the highlight fields", () => {
    const [tabbed, global] = parseEntries([
      {
        category: "added",
        text: "A.",
        surface: { module: "create", tab: "construct" },
        highlight: true,
        anchor: "start-pad",
        callout: "Tap a start position.",
      },
      { category: "improved", text: "B.", surface: "global" },
    ]);
    expect(tabbed).toMatchObject({
      surface: { module: "create", tab: "construct" },
      highlight: true,
      anchor: "start-pad",
      callout: "Tap a start position.",
    });
    expect(global!.surface).toBe("global");
    expect(global!.highlight).toBeUndefined();
  });

  it("leaves legacy entries without the fields as undefined, null included", () => {
    const [absent, nulled] = parseEntries([
      { category: "fixed", text: "A." },
      {
        category: "fixed",
        text: "B.",
        surface: null,
        highlight: null,
        anchor: null,
        callout: null,
      },
    ]);
    for (const entry of [absent!, nulled!]) {
      expect(entry.surface).toBeUndefined();
      expect(entry.highlight).toBeUndefined();
      expect(entry.anchor).toBeUndefined();
      expect(entry.callout).toBeUndefined();
    }
  });

  it("drops a malformed surface or hint but keeps the entry", () => {
    const [entry] = parseEntries([
      {
        category: "added",
        text: "A.",
        surface: { tab: "construct" },
        highlight: "yes",
        anchor: "",
      },
    ]);
    expect(entry!.text).toBe("A.");
    expect(entry!.surface).toBeUndefined();
    expect(entry!.highlight).toBeUndefined();
    expect(entry!.anchor).toBeUndefined();
  });
});
