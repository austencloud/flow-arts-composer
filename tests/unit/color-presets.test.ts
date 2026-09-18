/**
 * Guards the generated swatch matrix behind LabeledColorPairPicker and
 * ProfileColorPicker. 48 = 12 x 4 so the grid fills every row at 12, 8 and
 * 6 columns; a stray entry would bring back the stranded-row bug.
 */
import { describe, expect, it } from "vitest";
import {
  COLOR_PRESETS,
  COLOR_PRESET_COLUMNS,
  type ColorPresetRow,
} from "$lib/shared/ui/color-presets";

const ROWS: ColorPresetRow[] = ["light", "vivid", "deep", "neutral"];

describe("COLOR_PRESETS", () => {
  it("is a 12 x 4 matrix", () => {
    expect(COLOR_PRESET_COLUMNS).toBe(12);
    expect(COLOR_PRESETS).toHaveLength(48);
    for (const [index, row] of ROWS.entries()) {
      const slice = COLOR_PRESETS.slice(index * 12, index * 12 + 12);
      expect(slice.map((preset) => preset.row)).toEqual(Array(12).fill(row));
    }
  });

  it("holds unique lowercase #rrggbb values with names", () => {
    const hexes = COLOR_PRESETS.map((preset) => preset.hex);
    for (const hex of hexes) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const preset of COLOR_PRESETS) expect(preset.name.length).toBeGreaterThan(0);
  });

  it("runs the neutral row from white to black", () => {
    const neutral = COLOR_PRESETS.filter((preset) => preset.row === "neutral");
    expect(neutral[0]).toMatchObject({ hex: "#ffffff", name: "White" });
    expect(neutral[11]).toMatchObject({ hex: "#000000", name: "Black" });
  });
});
