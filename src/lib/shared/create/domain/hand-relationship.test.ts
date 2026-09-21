import { describe, expect, it } from "vitest";
import {
  DEFAULT_TND_SELECTION,
  HAND_MODE_MAPS,
  LEGACY_HAND_RELATIONSHIP_MODES,
  TND_SELECTIONS,
  describeTnDSelection,
  handModeMaps,
  isReflectionMode,
  isTnDSelection,
  propDirectionOf,
  propModeToEngine,
  propTimingOf,
} from "./hand-relationship";

describe("TnD selection vocabulary", () => {
  it("defaults to free and recognizes only free plus the six modes", () => {
    expect(DEFAULT_TND_SELECTION).toBe("free");
    expect(TND_SELECTIONS).toEqual([
      "free",
      "SS",
      "TS",
      "QS",
      "SO",
      "TO",
      "QO",
    ]);
    expect(isTnDSelection("free")).toBe(true);
    expect(isTnDSelection("QO")).toBe(true);
    expect(isTnDSelection("mirrored")).toBe(false);
    expect(isTnDSelection(undefined)).toBe(false);
  });

  it("maps the four legacy names onto modes", () => {
    expect(LEGACY_HAND_RELATIONSHIP_MODES).toEqual({
      mirrored: "TO",
      flipped: "SO",
      unison: "TS",
      opposite: "SS",
    });
  });

  it("gives every mode its engine maps, two for the quarter modes", () => {
    expect(HAND_MODE_MAPS).toEqual({
      TS: ["identity"],
      TO: ["reflect-north-south"],
      SS: ["rotate-180"],
      SO: ["reflect-east-west"],
      QS: ["rotate-90-cw", "rotate-90-ccw"],
      QO: ["reflect-northeast-southwest", "reflect-northwest-southeast"],
    });
    expect(handModeMaps("QS")).toEqual(["rotate-90-cw", "rotate-90-ccw"]);
  });

  it("knows which modes are reflections", () => {
    expect(isReflectionMode("TO")).toBe(true);
    expect(isReflectionMode("SO")).toBe(true);
    expect(isReflectionMode("QO")).toBe(true);
    expect(isReflectionMode("TS")).toBe(false);
    expect(isReflectionMode("SS")).toBe(false);
    expect(isReflectionMode("QS")).toBe(false);
  });

  it("reads prop direction and timing off the mode letters", () => {
    expect(propDirectionOf("TS")).toBe("same");
    expect(propDirectionOf("QO")).toBe("opp");
    expect(propTimingOf("TS")).toBe("tog");
    expect(propTimingOf("SO")).toBe("split");
    expect(propTimingOf("QS")).toBe("quarter");
  });

  it("builds the engine prop option and nothing for Free", () => {
    expect(propModeToEngine("free")).toBeUndefined();
    expect(propModeToEngine("TO")).toEqual({ direction: "opp", timing: "tog" });
    expect(propModeToEngine("QS")).toEqual({
      direction: "same",
      timing: "quarter",
    });
  });

  it("describes a selection with its two words", () => {
    expect(describeTnDSelection("free")).toBe("Free");
    expect(describeTnDSelection("TS")).toBe("Together Same");
    expect(describeTnDSelection("QO")).toBe("Quarter Opposite");
  });

  it("never uses an em dash in its copy", () => {
    const copy = TND_SELECTIONS.map(describeTnDSelection).join(" ");
    expect(copy).not.toContain("\u2014");
  });
});
