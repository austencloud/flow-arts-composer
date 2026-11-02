import { describe, expect, it } from "vitest";
import en from "../../../../../../messages/en.json";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import { combinationScreens } from "./combination-pages";

const t = (key: TranslationKey) => (en as Record<string, string>)[key] ?? key;

describe("combinationScreens", () => {
  it("gives Shift one screen: lede, guide line and closing line", () => {
    const [shift, ...rest] = combinationScreens("hm-type2", t);
    expect(rest).toEqual([]);
    expect(shift).toMatchObject({
      kind: "combination",
      label: "Shift",
      lede: en.verified_level1_hand_motions_80,
      guide: en.verified_level1_hm_type2_115,
      closing: en.verified_level1_hm_type2_118,
    });
  });

  it("cuts Cross-Shift's paragraphs at sentences across its two screens", () => {
    const [cross, breakdown] = combinationScreens("hm-type34", t);
    expect(cross).toMatchObject({
      label: "Cross-Shift",
      guide:
        'A <span class="cross">Cross</span><span class="shift">-Shift</span> combines a shift and a dash.<br>Since a dash has further to travel, it moves slightly faster.',
    });
    expect(breakdown).toMatchObject({
      kind: "breakdown",
      label: "Break it down",
      intro:
        'To understand <span class="cross">Cross</span><span class="shift">-Shifts</span>, let’s break one down into parts:',
      caption: "start → halfway → end = combined",
      after:
        "Note the halfway point. One hand is in the center point and one is on a diagonal hand point.<br>By pausing at this halfway point, it ensures that the dash moves at the correct speed.",
    });
  });

  it("gives Dash, Dual-Dash and Static a screen each, named after them", () => {
    const screens = combinationScreens("hm-type56", t);
    expect(screens.map((s) => s.label)).toEqual([
      "Dash",
      "Dual-Dash",
      "Static",
    ]);
    expect(screens[0]).toMatchObject({
      guide:
        'With a <span class="k-dash">Dash</span>, one hand executes a dash while the other hand remains static.',
      closing: null,
    });
    expect(screens[2]).toMatchObject({
      closing: en.verified_level1_hm_type56_136,
    });
  });

  it("has nothing for pages outside the three", () => {
    expect(combinationScreens("hm-type1", t)).toEqual([]);
    expect(combinationScreens("staff-placements", t)).toEqual([]);
  });
});
