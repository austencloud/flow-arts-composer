import { describe, expect, it } from "vitest";
import { splitSections, SPLIT_RULES, type SectionUnit } from "./section-screens";

const h = (section: number, path: string): SectionUnit => ({ section, path, kind: "heading", chars: 0 });
const p = (section: number, path: string, chars: number): SectionUnit => ({ section, path, kind: "text", chars });
const fig = (section: number, path: string, caption?: string): SectionUnit => ({
  section,
  path,
  kind: "figure",
  chars: 0,
  caption,
});

describe("splitSections", () => {
  it("starts every section on its own screen", () => {
    const units = [h(0, "0"), p(0, "1.0", 50), h(1, "0"), p(1, "1.0", 50)];
    const screens = splitSections(units, ["One", "Two"], SPLIT_RULES.large);
    expect(screens.map((s) => [s.section, s.label])).toEqual([
      [0, "One"],
      [1, "Two"],
    ]);
  });

  it("gives each figure a screen, led in by the paragraph before it", () => {
    const units = [
      h(0, "0"),
      p(0, "1.0", 120),
      fig(0, "2"),
      p(0, "3.0", 40),
      p(0, "3.1", 50),
      fig(0, "4", "Antispin"),
      p(0, "5.0", 40),
    ];
    const screens = splitSections(units, ["Shifts"], SPLIT_RULES.medium);
    expect(screens.map((s) => s.paths)).toEqual([
      ["0", "1.0", "2", "3.0"],
      ["3.1", "4", "5.0"],
    ]);
    expect(screens[1]!.label).toBe("Antispin");
  });

  it("gives long words their own screen before a figure on a phone", () => {
    const units = [h(0, "0"), p(0, "1.0", 200), p(0, "1.1", 40), fig(0, "2")];
    const screens = splitSections(units, ["Shifts"], SPLIT_RULES.small);
    expect(screens.map((s) => s.paths)).toEqual([
      ["0", "1.0"],
      ["1.1", "2"],
    ]);
    expect(screens[1]!.label).toBe("Shifts 2");
  });

  it("ends a screen of words alone before it outgrows a phone", () => {
    const units = [h(0, "0"), p(0, "1.0", 200), p(0, "1.1", 200), p(0, "1.2", 100)];
    const screens = splitSections(units, ["Types"], SPLIT_RULES.small);
    expect(screens.map((s) => s.paths)).toEqual([
      ["0", "1.0"],
      ["1.1", "1.2"],
    ]);
  });
});
