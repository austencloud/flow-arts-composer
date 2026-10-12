import { describe, expect, it } from "vitest";
import {
  arrangementSubtitle,
  studioKindLabels,
  studioLibraryEntries,
  withoutImportedCompositions,
} from "#lib/features/post/components/studio-library-entry.js";
import type { FeatureVideoSummary } from "#lib/shared/media-composition/domain/feature-video.js";

const feature = (
  slug: string,
  title: string,
  savedAt: number
): FeatureVideoSummary => ({
  slug,
  title,
  revision: 1,
  savedAt,
  sequenceId: "DCK",
});

describe("studioLibraryEntries", () => {
  it("tells same-named showcases apart by their folder", () => {
    const entries = studioLibraryEntries(
      [],
      [
        feature("generate-vertical", "Generate", 3),
        feature("generate-desktop", "Generate", 2),
        feature("generate-promo", " generate ", 1),
      ]
    );
    expect(entries.map((entry) => entry.subtitle)).toEqual([
      "Vertical",
      "Desktop",
      "Promo",
    ]);
  });

  it("uses the whole folder name when it does not start with the title", () => {
    const entries = studioLibraryEntries(
      [],
      [feature("launch-a", "Launch", 2), feature("teaser", "Launch", 1)]
    );
    expect(entries.map((entry) => entry.subtitle)).toEqual(["A", "teaser"]);
  });

  it("leaves unique titles without a subtitle", () => {
    const entries = studioLibraryEntries(
      [],
      [feature("promo-1-0", "1.0 promo", 2), feature("generate-promo", "Generate", 1)]
    );
    expect(entries.map((entry) => entry.subtitle)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("carries a project's sync problem to its entry", () => {
    const [entry] = studioLibraryEntries(
      [
        {
          sequenceId: "studio-project:tutorial:abc",
          title: "Lesson",
          word: "",
          updatedAt: 5,
          hasDraft: true,
          problem: "Its source sequence is missing, so it stays on this device.",
        },
      ],
      []
    );
    expect(entry).toMatchObject({
      kind: "tutorial",
      problem: "Its source sequence is missing, so it stays on this device.",
    });
  });

  it("captions an arrangement card with its grid and sequence count", () => {
    const [untitled, titled] = studioLibraryEntries(
      [
        {
          sequenceId: "studio-arrangement:a",
          title: "studio-arrangement:a",
          word: "",
          updatedAt: 9,
          hasDraft: true,
          arrangement: { rows: 2, cols: 2, sequences: 1 },
        },
        {
          sequenceId: "studio-arrangement:b",
          title: "Finale",
          word: "",
          updatedAt: 8,
          hasDraft: true,
          arrangement: { rows: 1, cols: 3, sequences: 2 },
        },
      ],
      []
    );
    expect(untitled).toMatchObject({
      kind: "arrangement",
      title: "Arrangement",
      subtitle: "2 × 2 · 1 sequence",
    });
    expect(titled).toMatchObject({
      title: "Finale",
      subtitle: "3 × 1 · 2 sequences",
    });
    expect(arrangementSubtitle({ rows: 4, cols: 1, sequences: 0 })).toBe(
      "1 × 4 · 0 sequences"
    );
  });

  it("hides a Compose composition once its Studio project exists", () => {
    const entries = studioLibraryEntries(
      [
        {
          sequenceId: "studio-arrangement:opened",
          title: "Opened",
          word: "",
          updatedAt: 3,
          hasDraft: true,
        },
      ],
      []
    );
    expect(
      withoutImportedCompositions(
        [{ id: "opened" }, { id: "fresh" }, { id: "studio-arrangement:opened" }],
        entries
      ).map((composition) => composition.id)
    ).toEqual(["fresh", "studio-arrangement:opened"]);
  });

  it("names each kind once", () => {
    expect(studioKindLabels.tutorial).toEqual({
      one: "Tutorial",
      many: "Tutorials",
    });
    expect(studioKindLabels.showcase.many).toBe("Showcases");
    expect(studioKindLabels.arrangement.one).toBe("Arrangement");
  });
});
