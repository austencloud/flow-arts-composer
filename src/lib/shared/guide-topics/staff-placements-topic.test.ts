import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import { PLACEMENT_FAMILIES } from "./placements-topic";
import {
  STAFF_CELLS_BY_KIND,
  STAFF_PLACEMENTS_TOPIC_UNITS,
  THUMB_COLUMNS,
} from "./staff-placements-topic";

const english = en as Record<string, string>;
const german = de as Record<string, string>;
const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");

describe("Staff Placements topic record", () => {
  it("resolves every unit in English and German", () => {
    for (const key of Object.values(STAFF_PLACEMENTS_TOPIC_UNITS)) {
      expect(english[key], key).toBeTruthy();
      expect(german[key], key).toBeTruthy();
    }
  });

  it("splits Austen's opening paragraph into its sentences without changing a word", () => {
    for (const catalog of [english, german]) {
      const joined = [
        catalog.guide_topic_staff_mark_thumb,
        catalog.guide_topic_staff_track_rotations,
        catalog.guide_topic_staff_negative_space,
      ].join(" ");
      expect(joined).toBe(plain(catalog.verified_level1_staff_placements_286!));
    }
  });

  it("takes the thumb words from Austen's column labels", () => {
    for (const catalog of [english, german]) {
      const labels = plain(catalog.verified_level1_staff_placements_289!);
      const [inWord, outWord] = [
        catalog.guide_topic_staff_thumb_in!,
        catalog.guide_topic_staff_thumb_out!,
      ];
      expect(labels).toBe(
        `${catalog.verified_level1_print_thumbs}: ${inWord} ${outWord} (${outWord}/${inWord}) (${inWord}/${outWord})`
      );
    }
  });

  it("draws each placement in the four thumb orientations, in column order", () => {
    for (const { kind } of PLACEMENT_FAMILIES) {
      const cells = STAFF_CELLS_BY_KIND[kind];
      expect(cells).toHaveLength(THUMB_COLUMNS.length);
      cells.forEach((cell, n) => {
        const { left, right } = cell.motions;
        if (!left || !right) throw new Error("Staff cell is missing a hand motion");
        expect(
          getGridPlacementFromLocations(left.startLocation, right.startLocation)
        ).toMatch(new RegExp(`^${kind}`));
        expect(left.startOrientation).toBe(THUMB_COLUMNS[n]!.blue);
        expect(right.startOrientation).toBe(THUMB_COLUMNS[n]!.red);
      });
    }
  });
});
