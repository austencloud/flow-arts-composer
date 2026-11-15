import { describe, expect, it } from "vitest";
import {
  CONSTRUCT_PHONE_MAX_WIDTH,
  CONSTRUCT_PHONE_MIN_SEQUENCE_ROWS,
  CONSTRUCT_PHONE_OPTION_FLOOR,
  CONSTRUCT_PHONE_SEQUENCE_ROWS,
  CONSTRUCT_SHORT_LANDSCAPE_MAX_HEIGHT,
  CONSTRUCT_TYPE_RAIL_MIN_WIDTH,
  constructPhoneSequenceRows,
  constructPhoneSplit,
  constructPhoneWorkspaceFloor,
  isConstructPhoneTier,
  isConstructTypeRailTier,
} from "./construct-phone-split";
import { workspaceFloorHeight } from "../../shared/services/workspace-split";

describe("isConstructPhoneTier", () => {
  it("covers stacked layouts narrower than the wide option catalog", () => {
    expect(isConstructPhoneTier({ width: 375, stacked: true })).toBe(true);
    expect(isConstructPhoneTier({ width: 707, stacked: true })).toBe(true);
  });

  it("leaves tablets, the unfolded Fold and side-by-side layouts alone", () => {
    expect(
      isConstructPhoneTier({ width: CONSTRUCT_PHONE_MAX_WIDTH, stacked: true })
    ).toBe(false);
    expect(isConstructPhoneTier({ width: 810, stacked: true })).toBe(false);
    expect(isConstructPhoneTier({ width: 420, stacked: false })).toBe(false);
  });

  it("waits for a real measurement", () => {
    expect(isConstructPhoneTier({ width: 0, stacked: true })).toBe(false);
  });
});

describe("isConstructTypeRailTier", () => {
  it("gives the unfolded Fold's picker a left rail of type tabs", () => {
    expect(isConstructTypeRailTier({ width: 707, stacked: true })).toBe(true);
    expect(
      isConstructTypeRailTier({
        width: CONSTRUCT_TYPE_RAIL_MIN_WIDTH,
        stacked: true,
      })
    ).toBe(true);
  });

  it("keeps the tab row on phones and off the phone tier", () => {
    expect(isConstructTypeRailTier({ width: 375, stacked: true })).toBe(false);
    expect(isConstructTypeRailTier({ width: 412, stacked: true })).toBe(false);
    expect(
      isConstructTypeRailTier({
        width: CONSTRUCT_TYPE_RAIL_MIN_WIDTH - 1,
        stacked: true,
      })
    ).toBe(false);
    expect(
      isConstructTypeRailTier({
        width: CONSTRUCT_PHONE_MAX_WIDTH,
        stacked: true,
      })
    ).toBe(false);
    expect(isConstructTypeRailTier({ width: 707, stacked: false })).toBe(false);
  });

  it("gives a short side-by-side picker on a sideways phone the rail", () => {
    // The Fold's cover screen on its side, with and without the browser bar.
    expect(
      isConstructTypeRailTier({ width: 420, height: 340, stacked: false })
    ).toBe(true);
    expect(
      isConstructTypeRailTier({
        width: 420,
        height: CONSTRUCT_SHORT_LANDSCAPE_MAX_HEIGHT,
        stacked: false,
      })
    ).toBe(true);
    // A laptop's side-by-side picker is taller and keeps its tab row.
    expect(
      isConstructTypeRailTier({
        width: 420,
        height: CONSTRUCT_SHORT_LANDSCAPE_MAX_HEIGHT + 1,
        stacked: false,
      })
    ).toBe(false);
    expect(
      isConstructTypeRailTier({
        width: CONSTRUCT_PHONE_MAX_WIDTH,
        height: 340,
        stacked: false,
      })
    ).toBe(false);
  });
});

describe("constructPhoneSplit", () => {
  // A 72px header and a 60px rail around the step grid.
  const floorAt = (width: number) =>
    workspaceFloorHeight({ width, chromeHeight: 72 + 60 });
  const split = (width: number, height: number, stacked = true) =>
    constructPhoneSplit({
      width,
      height,
      stacked,
      workspaceFloor: floorAt(width),
    });

  it("returns null off the phone tier so the usual split stays", () => {
    expect(split(810, 1135)).toBeNull();
    expect(split(878, 412, false)).toBeNull();
    expect(split(375, 0)).toBeNull();
  });

  it("gives an unfolded Fold's sequence two legible rows before the picker", () => {
    // 707x823 portrait: the picker kept 483px and left the sequence 296px,
    // sixteen steps at 48px.
    const [workspace, picker] = split(707, 779)!;
    expect(workspace).toBe(floorAt(707));
    expect(workspace).toBeGreaterThan(296);
    expect(workspace + picker).toBe(779);
  });

  it("gives a short phone's picker the rest once the sequence has its floor", () => {
    const [workspace, picker] = split(375, 622)!;
    expect(workspace).toBe(floorAt(375));
    expect(picker).toBe(622 - floorAt(375));
  });

  it("never gives a tiny screen's sequence more than its old 5:4 share", () => {
    const [workspace, picker] = split(320, 360)!;
    expect(workspace).toBe(Math.round(360 - 360 * (4 / 9)));
    expect(picker).toBe(160);
  });

  it("stops growing the picker once its grid is as wide as it can get", () => {
    // Pixel: four width-bound columns fit well inside the height, so the
    // sequence keeps the rest instead of the grid gaining empty rows.
    const [workspace, picker] = split(412, 870)!;
    // The grid keeps a 14px gutter on each side.
    const widthBoundOption = (412 - 28 - 24) / 4;
    expect(picker).toBe(Math.round(52 + 10 + widthBoundOption * 4 + 24));
    expect(workspace + picker).toBe(870);
  });

  it("caps the option size so a wide phone picker does not hoard height", () => {
    // Just under the rail tier: the tab row still costs its 52px.
    expect(split(599, 3000)![1]).toBe(52 + 10 + 120 * 4 + 24);
  });

  it("asks no height for the tab row once the tabs stand in a rail", () => {
    // Unfolded Fold: the tabs sit in the left rail, so the picker's wanted
    // height is the carousel padding and four capped rows alone.
    expect(split(707, 3000)![1]).toBe(10 + 120 * 4 + 24);
    expect(split(CONSTRUCT_TYPE_RAIL_MIN_WIDTH, 3000)![1]).toBe(
      10 + 120 * 4 + 24
    );
  });

  it("still keeps the unfolded Fold's two legible rows on the rail tier", () => {
    // 707x772 with the app's nav bar: the floor, not the grid, sets the split.
    const [workspace, picker] = split(707, 715)!;
    expect(workspace).toBe(floorAt(707));
    expect(workspace + picker).toBe(715);
  });
});

describe("the slim phone bars share their height (2026-11-13)", () => {
  // The workspace is its 2px frame, the bars (sequence header + button bar)
  // and the sequence's scroll window; the picker is its 52px type tabs, 10px
  // padding and a 4x4 grid with 8px gaps. Before: a 73px header with the
  // badges' own row and a 62px bar around a 50px Play. After: a 48px header
  // with the badges beside the word and a 44px bar of 36px controls.
  const BEFORE_BARS = 73 + 62;
  const AFTER_BARS = 48 + 44;
  const sizes = (
    width: number,
    height: number,
    bars: number,
    rows: number | undefined
  ) => {
    const split = constructPhoneSplit({
      width,
      height,
      stacked: true,
      workspaceFloor: workspaceFloorHeight({ width, chromeHeight: bars, rows }),
    });
    if (!split) throw new Error("not on the phone tier");
    const [workspace, picker] = split;
    return {
      sequenceWindow: workspace - 2 - bars,
      tile: (picker - 52 - 10 - 3 * 8) / 4,
    };
  };

  it("keeps a quarter of a third row only at phone widths", () => {
    expect(constructPhoneSequenceRows(392)).toBe(CONSTRUCT_PHONE_SEQUENCE_ROWS);
    expect(constructPhoneSequenceRows(360)).toBe(CONSTRUCT_PHONE_SEQUENCE_ROWS);
    // The unfolded Fold keeps its two rows.
    expect(constructPhoneSequenceRows(707)).toBeUndefined();
    expect(constructPhoneSequenceRows(0)).toBeUndefined();
  });

  it("grows both the sequence window and the picker's tiles at 392x739", () => {
    // 392x739 leaves 695px for the workspace and the picker.
    const before = sizes(392, 695, BEFORE_BARS, undefined);
    const after = sizes(392, 695, AFTER_BARS, constructPhoneSequenceRows(392));
    expect(before.sequenceWindow).toBeLessThan(182);
    expect(after.sequenceWindow).toBeGreaterThanOrEqual(196);
    expect(after.tile).toBeGreaterThanOrEqual(76);
    expect(after.tile).toBeGreaterThan(before.tile);
  });

  it("grows both at 360 wide too", () => {
    for (const height of [596, 645]) {
      const before = sizes(360, height, BEFORE_BARS, undefined);
      const after = sizes(
        360,
        height,
        AFTER_BARS,
        constructPhoneSequenceRows(360)
      );
      expect(after.sequenceWindow).toBeGreaterThan(before.sequenceWindow);
      expect(after.tile).toBeGreaterThan(before.tile);
    }
  });
});

describe("the sequence yields rows until the tiles reach 68px (2026-11-13)", () => {
  // The slim bars (48px header, 44px button bar) and 18 steps, so the
  // sequence has more rows than either floor shows.
  const BARS = 48 + 44;
  const sizes = (width: number, layoutHeight: number) => {
    const floor = (rows: number) =>
      workspaceFloorHeight({ width, chromeHeight: BARS, rows });
    const fullFloor = floor(CONSTRUCT_PHONE_SEQUENCE_ROWS);
    const minFloor = floor(CONSTRUCT_PHONE_MIN_SEQUENCE_ROWS);
    const workspaceFloor = constructPhoneWorkspaceFloor({
      height: layoutHeight,
      fullFloor,
      minFloor,
    });
    const [workspace, picker] = constructPhoneSplit({
      width,
      height: layoutHeight,
      stacked: true,
      workspaceFloor,
    })!;
    // Type 1's 4x4 grid: height-bound, or width-bound inside the gutters.
    const tile = Math.min(
      (picker - 52 - 10 - 3 * 8) / 4,
      (width - 28 - 3 * 8) / 4
    );
    return { fullFloor, minFloor, workspace, tile };
  };

  it("gives a 360x640 phone 68px tiles instead of 58", () => {
    const { fullFloor, workspace, tile } = sizes(360, 595);
    expect(fullFloor).toBeCloseTo(275, -1);
    expect(workspace).toBeLessThan(fullFloor);
    expect(workspace).toBeCloseTo(237, 0);
    expect(tile).toBeCloseTo(CONSTRUCT_PHONE_OPTION_FLOOR, 0);
    // The grid's empty side strips shrink from 52px to about 32px.
    expect((360 - (4 * tile + 3 * 8)) / 2).toBeCloseTo(32, 0);
  });

  it("stops at 1.25 rows on a shorter 360x591 phone", () => {
    const { minFloor, workspace, tile } = sizes(360, 546);
    expect(workspace).toBe(Math.round(minFloor));
    // 1.25 rows of 360-wide step pictures under the slim bars.
    expect(minFloor).toBeCloseTo(212, 0);
    expect(tile).toBeGreaterThan(61);
    expect(tile).toBeLessThan(CONSTRUCT_PHONE_OPTION_FLOOR);
  });

  it("leaves a 360x689 phone and a 392x739 phone as they were", () => {
    for (const [width, height] of [
      [360, 644],
      [392, 695],
    ] as const) {
      const { fullFloor, workspace, tile } = sizes(width, height);
      expect(workspace).toBeGreaterThanOrEqual(Math.round(fullFloor));
      expect(tile).toBeGreaterThanOrEqual(CONSTRUCT_PHONE_OPTION_FLOOR);
    }
  });
});
