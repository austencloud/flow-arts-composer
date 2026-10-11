import { describe, expect, it } from "vitest";
import {
  studioKindLabels,
  studioLibraryEntries,
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

  it("names each kind once", () => {
    expect(studioKindLabels.tutorial).toEqual({
      one: "Tutorial",
      many: "Tutorials",
    });
    expect(studioKindLabels.showcase.many).toBe("Showcases");
    expect(studioKindLabels.arrangement.one).toBe("Arrangement");
  });
});
