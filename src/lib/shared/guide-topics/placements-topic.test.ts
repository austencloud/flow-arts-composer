import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import {
  PLACEMENTS_BY_KIND,
  PLACEMENTS_TOPIC_UNITS,
  PLACEMENT_FAMILIES,
  placementsTopicText,
} from "./placements-topic";

const english = en as Record<string, string>;
const german = de as Record<string, string>;
const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>|<span class="lg"><\/span>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");

describe("Placements topic record", () => {
  it("resolves every unit and family message in English and German", () => {
    const keys = [
      ...Object.values(PLACEMENTS_TOPIC_UNITS),
      ...PLACEMENT_FAMILIES.flatMap((f) => [f.name, f.brief]),
    ];
    for (const key of keys) {
      expect(english[key], key).toBeTruthy();
      expect(german[key], key).toBeTruthy();
    }
  });

  it("splits Austen's intro into its sentences without changing a word", () => {
    for (const [catalog, intro] of [
      [english, english.verified_level1_placements_intro!],
      [german, german.verified_level1_placements_intro!],
    ] as const) {
      const paragraph = plain(intro);
      for (const unit of [
        "combine",
        "transform",
        "redRight",
        "blueLeft",
      ] as const) {
        expect(paragraph).toContain(catalog[PLACEMENTS_TOPIC_UNITS[unit]]);
      }
    }
    expect(placementsTopicText("transform")).toBe(
      "Placements can be rotated or mirrored."
    );
  });

  it("keeps each brief definition as Austen's sentence minus its lead-in", () => {
    for (const family of PLACEMENT_FAMILIES) {
      const name = english[family.name]!;
      const full = english[`verified_level1_${family.kind}_definition`]!;
      const brief = english[family.brief]!;
      const restored = `In ${name}, ${brief[0]!.toLowerCase()}${brief.slice(1)}`;
      expect(restored).toBe(full);
    }
  });

  it("groups the 16 diamond placements 4/4/8 under the family they belong to", () => {
    for (const family of PLACEMENT_FAMILIES) {
      const placements = PLACEMENTS_BY_KIND[family.kind];
      expect(placements).toHaveLength(family.kind === "gamma" ? 8 : 4);
      for (const placement of placements) {
        const left = placement.motions.left?.startLocation;
        const right = placement.motions.right?.startLocation;
        expect(left && right).toBeTruthy();
        expect(getGridPlacementFromLocations(left!, right!)).toMatch(
          new RegExp(`^${family.kind}`)
        );
      }
    }
  });
});
