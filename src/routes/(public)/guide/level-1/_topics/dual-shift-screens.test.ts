import { describe, expect, it } from "vitest";
import en from "../../../../../../messages/en.json";
import { DUAL_SHIFT_MODES } from "#lib/shared/guide-topics/dual-shifts-topic.js";
import { GUIDE_BODY_PAGES } from "../_data/guide-manifest";
import { dualShiftScreenNumber, dualShiftScreens } from "./dual-shift-screens";

const english = en as Record<string, string>;
const name = (id: string) =>
  english[DUAL_SHIFT_MODES.find((m) => m.id === id)!.name]!;

describe("dualShiftScreens", () => {
  it("draws one mode per screen, with no key or switching screen", () => {
    const { views, labels } = dualShiftScreens(name);
    expect(views).toEqual(
      [
        "split-same",
        "tog-same",
        "split-opp",
        "tog-opp",
        "quarter-opp",
        "quarter-same",
      ].map((mode) => ({ kind: "mode", mode }))
    );
    expect(labels).toEqual([
      "Split-Same",
      "Tog-Same",
      "Split-Opp",
      "Tog-Opp",
      "Quarter-Opp",
      "Quarter-Same",
    ]);
  });

  it("sends the old Gamma page to the Quarter-Opp screen", () => {
    expect(dualShiftScreenNumber("quarter-opp")).toBe(5);
    const gamma = GUIDE_BODY_PAGES.find((p) => p.id === "hm-gamma");
    expect(gamma?.web).toEqual({
      into: "hm-type1",
      screen: dualShiftScreenNumber("quarter-opp"),
    });
  });
});
