import { describe, expect, it } from "vitest";
import {
  CONSTRUCT_PHONE_MAX_WIDTH,
  CONSTRUCT_SHORT_LANDSCAPE_MAX_HEIGHT,
  CONSTRUCT_TYPE_RAIL_MIN_WIDTH,
  constructPhoneSplit,
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
    const widthBoundOption = (412 - 8 - 24) / 4;
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
