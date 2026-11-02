import { describe, expect, it } from "vitest";
import { GUIDE_BODY_PAGES } from "../_data/guide-manifest";
import {
  HAND_TYPE_SLUGS,
  combinationOpening,
  inkOn,
  nameSegments,
  navCombination,
  pageCombinations,
  runFrame,
  slugOfHref,
  switcherEntries,
} from "./hand-type-switcher";

describe("switcherEntries", () => {
  it("lists the six combinations in record order, each on its own screen", () => {
    expect(
      switcherEntries().map((e) => [e.number, e.combination.id, e.href])
    ).toEqual([
      [1, "dual-shift", "/guide/level-1/hm-type1"],
      [2, "shift", "/guide/level-1/hm-type2"],
      [3, "cross-shift", "/guide/level-1/hm-type34"],
      [4, "dash", "/guide/level-1/hm-type56"],
      [5, "dual-dash", "/guide/level-1/hm-type56?screen=2"],
      [6, "static", "/guide/level-1/hm-type56?screen=3"],
    ]);
  });

  it("links to Guide pages that exist, through the locale prefix", () => {
    for (const slug of HAND_TYPE_SLUGS) {
      expect(GUIDE_BODY_PAGES.some((p) => p.id === slug)).toBe(true);
    }
    expect(switcherEntries((h) => `/de${h}`)[4]!.href).toBe(
      "/de/guide/level-1/hm-type56?screen=2"
    );
  });
});

describe("the run's pages", () => {
  it("knows which combinations each page teaches", () => {
    expect(pageCombinations("hm-type56").map((c) => c.id)).toEqual([
      "dash",
      "dual-dash",
      "static",
    ]);
    expect(combinationOpening("hm-type56")?.id).toBe("dash");
    expect(combinationOpening("hm-type2")?.id).toBe("shift");
    expect(combinationOpening("staff-placements")).toBeNull();
  });

  it("reads the slug off a localized page link", () => {
    expect(slugOfHref("/fr/guide/level-1/hm-type34")).toBe("hm-type34");
    expect(slugOfHref("/guide/level-1/hm-type56?screen=2")).toBe("hm-type56");
  });
});

describe("colours", () => {
  it("splits two-colour names and lifts the Shift purple on dark", () => {
    const dualShift = pageCombinations("hm-type1")[0]!;
    expect(nameSegments(dualShift, "Dual-Shift", true)).toEqual([
      { text: "Dual-", color: "#36c3ff" },
      { text: "Shift", color: "#b48cff" },
    ]);
    expect(nameSegments(dualShift, "Dual-Shift", false)[1]!.color).toBe(
      "#6F2DA8"
    );
    expect(inkOn("#26e600", true)).toBe("#26e600");
  });

  it("deepens the pale screen colours on a light page", () => {
    const dualDash = pageCombinations("hm-type56")[1]!;
    expect(nameSegments(dualDash, "Dual-Dash", false)).toEqual([
      { text: "Dual-", color: "#0b8fd0" },
      { text: "Dash", color: "#2f9e44" },
    ]);
    expect(inkOn("#EB7D00", false)).toBe("#d26b00");
    expect(inkOn("#6F2DA8", false)).toBe("#6F2DA8");
  });

});

describe("Back and Next across the run", () => {
  const name = (c: { id: string }) => c.id;

  it("names neighbouring pages of the run by the combination they open on", () => {
    const frame = runFrame(
      {
        prevPage: { href: "/fr/guide/level-1/hm-type2", title: "Type 2: Shifts" },
        nextPage: { href: "/fr/guide/level-1/hm-type56", title: "Type 4, 5, 6" },
        hubHref: "/fr/guide",
      },
      name
    );
    expect(frame?.prevPage?.title).toBe("shift");
    expect(frame?.nextPage?.title).toBe("dash");
    expect(frame?.nextPage?.href).toBe("/fr/guide/level-1/hm-type56");
  });

  it("leaves pages outside the run as they are", () => {
    const frame = runFrame(
      {
        prevPage: null,
        nextPage: { href: "/guide/level-1/staff-placements", title: "Staff" },
        hubHref: "/guide",
      },
      name
    );
    expect(frame?.prevPage).toBeNull();
    expect(frame?.nextPage?.title).toBe("Staff");
  });

  it("finds the combination behind a screen or a page target", () => {
    const screens = pageCombinations("hm-type56");
    const onScreen = (i: number) => screens[i] ?? null;
    expect(
      navCombination({ kind: "screen", index: 1, text: "x" }, onScreen)?.id
    ).toBe("dual-dash");
    expect(
      navCombination(
        { kind: "page", href: "/guide/level-1/hm-type34", text: "x" },
        onScreen
      )?.id
    ).toBe("cross-shift");
    expect(
      navCombination({ kind: "screen", index: 1, text: "x" }, () => null)
    ).toBeNull();
  });
});
