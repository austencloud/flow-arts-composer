import { describe, expect, it } from "vitest";
import { showOnlyUnits, splitSections, type SectionUnit } from "./section-screens";
import { screenRoom, type ScreenRoom } from "../../_components/fit/guide-screen-url";

const h = (section: number, path: string): SectionUnit => ({ section, path, kind: "heading", chars: 0 });
const p = (section: number, path: string, chars: number, sentences?: number[]): SectionUnit => ({
  section,
  path,
  kind: "text",
  chars,
  sentences,
});
const fig = (section: number, path: string, caption?: string): SectionUnit => ({
  section,
  path,
  kind: "figure",
  chars: 0,
  caption,
});
const room = (over: number, alone = over): ScreenRoom => ({
  beside: over,
  over,
  band: over,
  tiles: 12,
  alone,
  stripCols: 8,
  stripRowChars: 100,
});

describe("splitSections", () => {
  it("starts every section on its own screen", () => {
    const units = [h(0, "0"), p(0, "1.0", 50), h(1, "0"), p(1, "1.0", 50)];
    const screens = splitSections(units, ["One", "Two"], room(400));
    expect(screens.map((s) => [s.section, s.label])).toEqual([
      [0, "One"],
      [1, "Two"],
    ]);
  });

  it("gives each figure a screen; notes stay with the figure while they fit", () => {
    const units = [
      h(0, "0"),
      p(0, "1.0", 120),
      fig(0, "2"),
      p(0, "3.0", 40),
      p(0, "3.1", 50),
      fig(0, "4", "Antispin: the other way"),
      p(0, "5.0", 40),
    ];
    const screens = splitSections(units, ["Shifts"], room(270));
    expect(screens.map((s) => s.paths)).toEqual([
      ["0", "1.0", "2", "3.0"],
      ["3.1", "4", "5.0"],
    ]);
    expect(screens[1]!.label).toBe("Antispin");
  });

  it("runs long words across screens with the figure on each", () => {
    const units = [h(0, "0"), p(0, "1.0", 200), p(0, "1.1", 200), fig(0, "2")];
    const screens = splitSections(units, ["Shifts"], room(260));
    expect(screens.map((s) => s.paths)).toEqual([
      ["0", "1.0", "2"],
      ["1.1", "2"],
    ]);
    expect(screens[1]!.label).toBe("Shifts");
  });

  it("breaks a paragraph longer than a screen at its sentences", () => {
    const units = [p(0, "1.0", 400, [200, 200]), fig(0, "2")];
    const screens = splitSections(units, ["Shifts"], room(240));
    expect(screens.map((s) => s.paths)).toEqual([
      ["1.0@0-1", "2"],
      ["1.0@1-2", "2"],
    ]);
  });

  it("lends a section with no figure the page's nearest one", () => {
    const units = [p(0, "1", 50), fig(0, "2"), h(1, "0"), p(1, "1.0", 50)];
    const screens = splitSections(units, ["One", "Two"], room(400));
    expect(screens[1]).toMatchObject({
      section: 1,
      borrowed: { section: 0, path: "2" },
    });
    const later = [h(0, "0"), p(0, "1.0", 50), p(1, "1", 50), fig(1, "2")];
    expect(splitSections(later, ["One", "Two"], room(400))[0]!.borrowed).toEqual({
      section: 1,
      path: "2",
    });
  });

  it("cuts a page with no figure by words alone", () => {
    const units = [h(0, "0"), p(0, "1.0", 200), p(0, "1.1", 200), p(0, "1.2", 100)];
    const screens = splitSections(units, ["Types"], room(100, 360));
    expect(screens.map((s) => s.paths)).toEqual([
      ["0", "1.0"],
      ["1.1", "1.2"],
    ]);
    expect(screens.every((s) => !s.borrowed)).toBe(true);
  });

  describe.each([
    [375, 667],
    [960, 412],
    [1000, 800],
    [1366, 768],
    [3840, 2160],
  ])("a long page with figures at %ix%i", (w, height) => {
    const units = [
      h(0, "0"),
      ...Array.from({ length: 12 }, (_, n) => p(0, `1.${n}`, 180)),
      fig(0, "2", "One"),
      ...Array.from({ length: 12 }, (_, n) => p(0, `3.${n}`, 180)),
      h(1, "0"),
      ...Array.from({ length: 6 }, (_, n) => p(1, `1.${n}`, 180)),
    ];
    const screens = splitSections(units, ["First", "Second"], screenRoom(w, height));

    it("has no screen without a figure", () => {
      const bare = screens.filter((s) => !s.borrowed && !s.paths.includes("2"));
      expect(bare).toEqual([]);
    });
    it("never names a screen Part N or a bare number", () => {
      expect(screens.filter((s) => /^(Part )?\d+$|\d$/.test(s.label))).toEqual([]);
    });
    it("shows every paragraph", () => {
      const text = units.filter((u) => u.kind === "text");
      for (const u of text) {
        const shown = screens.filter(
          (s) => s.section === u.section && s.paths.includes(u.path)
        );
        expect(shown.length, u.path).toBe(1);
      }
    });
  });
});

describe("showOnlyUnits", () => {
  it("shows only the listed sentences of a paragraph", () => {
    const sentence = (hidden = false) => ({ hidden, tagName: "SPAN" });
    const a = sentence();
    const b = sentence();
    const para = {
      hidden: false,
      classList: { contains: () => false },
      querySelectorAll: () => [a, b],
    };
    const other = {
      hidden: false,
      classList: { contains: () => false },
      querySelectorAll: () => [],
    };
    const section = { children: [para, other] } as unknown as Element;
    showOnlyUnits(section, ["0@1-2"]);
    expect([para.hidden, other.hidden, a.hidden, b.hidden]).toEqual([false, true, true, false]);
    showOnlyUnits(section, ["0"]);
    expect([a.hidden, b.hidden]).toEqual([false, false]);
  });
});
