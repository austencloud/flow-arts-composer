import { describe, expect, it } from "vitest";
import {
  EFFECT_GLYPH_WIDTH,
  chooseDockTabForm,
  topRowCount,
  type DockTabFormInput,
} from "../../../src/lib/shared/sequence-viewer/components/control-dock-tab-form";

// The Tunnel dock's seven English names at 12 px, measured on the real screen
// (Effects, Props, Effort, Playback, Display, Formation, Copy Speed).
const TUNNEL_EN = [37.7, 32.1, 32.2, 49.7, 41.3, 58.3, 67.4];
const GLYPHS_7 = Array(7).fill(20);

function tunnel(
  barWidth: number,
  overrides: Partial<DockTabFormInput> = {}
): DockTabFormInput {
  return {
    labelWidths: TUNNEL_EN,
    glyphWidths: GLYPHS_7,
    barWidth,
    rowActionsWidth: 46,
    hasTrailing: true,
    allowTwoRows: true,
    ...overrides,
  };
}

describe("chooseDockTabForm", () => {
  it("puts the Tunnel names in two rows on phones from 344 to 412 wide", () => {
    for (const windowWidth of [344, 360, 375, 390, 412]) {
      expect(
        chooseDockTabForm(tunnel(windowWidth - 12)),
        `${windowWidth}`
      ).toBe("two-rows");
    }
  });

  it("keeps one row once every name is whole in an equal share", () => {
    // 707 window: the strip shares 643 px between seven tabs.
    expect(chooseDockTabForm(tunnel(695))).toBe("row");
  });

  it("falls back to pictures when two rows can't hold the names either", () => {
    // Russian-length names (the longest 116 px) on a 360 phone.
    const long = [70, 60, 80, 116, 90, 100, 110];
    expect(chooseDockTabForm(tunnel(348, { labelWidths: long }))).toBe("icons");
  });

  it("counts the trailing action on the bottom row", () => {
    // Fits at 332 with the film button; 20 px less and the bottom row spills.
    expect(chooseDockTabForm(tunnel(332))).toBe("two-rows");
    expect(chooseDockTabForm(tunnel(312))).toBe("icons");
    expect(chooseDockTabForm(tunnel(312, { hasTrailing: false }))).toBe(
      "two-rows"
    );
  });

  it("never adds a tab row to a dock that stacks its own actions", () => {
    expect(chooseDockTabForm(tunnel(348, { allowTwoRows: false }))).toBe(
      "icons"
    );
  });

  it("decides the one-row form from the widest name, not the total", () => {
    // Six short names and one long one: the total fits, the long one doesn't.
    const names = [20, 20, 20, 20, 20, 20, 60];
    expect(
      chooseDockTabForm(tunnel(400, { labelWidths: names, rowActionsWidth: 0 }))
    ).not.toBe("row");
    expect(
      chooseDockTabForm(
        tunnel(400, { labelWidths: Array(7).fill(40), rowActionsWidth: 0 })
      )
    ).toBe("row");
  });

  it("keeps a dock whose names still fit one row at 12 px in one row", () => {
    // The 2D Animation dock: six tabs, no trailing action.
    const six = {
      labelWidths: [37.7, 32.1, 32.2, 49.7, 41.3, 36.9],
      glyphWidths: Array(6).fill(20),
      rowActionsWidth: 0,
      hasTrailing: false,
    };
    expect(chooseDockTabForm(tunnel(378, six))).toBe("row");
    expect(chooseDockTabForm(tunnel(348, six))).toBe("two-rows");
  });

  it("puts the larger half on top", () => {
    expect(topRowCount(7)).toBe(4);
    expect(topRowCount(6)).toBe(3);
    expect(topRowCount(5)).toBe(3);
  });

  it("counts the 29 px Effects slot among the 20 px slots on 344 to 412 phones", () => {
    // Effects is the first Tunnel tab; its slot is 29 wide in every state.
    const glyphs = [EFFECT_GLYPH_WIDTH, ...Array(6).fill(20)];
    expect(EFFECT_GLYPH_WIDTH).toBe(29);
    for (const windowWidth of [344, 360, 375, 390, 412]) {
      expect(
        chooseDockTabForm(tunnel(windowWidth - 12, { glyphWidths: glyphs })),
        `${windowWidth}`
      ).toBe("two-rows");
    }
  });

  it("lets the wider slot tip a row that just fit into pictures only", () => {
    // 9 px wider on the top row: fits at 332 with 20s, spills with the 29.
    const wide = [EFFECT_GLYPH_WIDTH, ...Array(6).fill(20)];
    expect(chooseDockTabForm(tunnel(332))).toBe("two-rows");
    expect(chooseDockTabForm(tunnel(332, { glyphWidths: wide }))).toBe(
      "two-rows"
    );
    expect(chooseDockTabForm(tunnel(322, { glyphWidths: wide }))).toBe(
      "icons"
    );
  });
});
