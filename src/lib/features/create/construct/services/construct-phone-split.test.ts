import { describe, expect, it } from "vitest";
import {
  CONSTRUCT_PHONE_MAX_WIDTH,
  constructPhoneSplit,
  isConstructPhoneTier,
} from "./construct-phone-split";

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

describe("constructPhoneSplit", () => {
  it("returns null off the phone tier so the usual split stays", () => {
    expect(
      constructPhoneSplit({ width: 810, height: 1135, stacked: true })
    ).toBeNull();
    expect(
      constructPhoneSplit({ width: 878, height: 412, stacked: false })
    ).toBeNull();
    expect(
      constructPhoneSplit({ width: 375, height: 0, stacked: true })
    ).toBeNull();
  });

  it("gives a short phone's picker the rest once the sequence has 240px", () => {
    // iPhone SE: the 4-row grid wants more than the height allows, and 38%
    // (236px) would be under the sequence's floor.
    const [workspace, picker] = constructPhoneSplit({
      width: 375,
      height: 622,
      stacked: true,
    })!;
    expect(workspace).toBe(240);
    expect(picker).toBe(382);
  });

  it("keeps the workspace's chrome and a card on a short screen", () => {
    // 375x667 browser with a short keyboard-sized height: 38% would leave the
    // sequence 167px, less than its title row, rail and a card.
    const [workspace] = constructPhoneSplit({
      width: 375,
      height: 440,
      stacked: true,
    })!;
    expect(workspace).toBe(240);
  });

  it("falls back to the old share when even 240px is more than it had", () => {
    // 200% zoom of 1440x900: 38% would leave 154px; the old 5:4 gave 225px.
    const [workspace] = constructPhoneSplit({
      width: 720,
      height: 405,
      stacked: true,
    })!;
    expect(workspace).toBe(225);
  });

  it("never gives a tiny screen's sequence more than its old 5:4 share", () => {
    const [workspace, picker] = constructPhoneSplit({
      width: 320,
      height: 360,
      stacked: true,
    })!;
    expect(workspace).toBe(Math.round(360 - 360 * (4 / 9)));
    expect(picker).toBe(160);
  });

  it("stops growing the picker once its grid is as wide as it can get", () => {
    // Pixel: four width-bound columns fit well inside 60% of the height, so
    // the sequence keeps the rest instead of the grid gaining empty rows.
    const [workspace, picker] = constructPhoneSplit({
      width: 412,
      height: 870,
      stacked: true,
    })!;
    const widthBoundOption = (412 - 8 - 24) / 4;
    expect(picker).toBe(Math.round(52 + 10 + widthBoundOption * 4 + 24));
    expect(picker).toBeLessThan(870 * 0.62);
    expect(workspace + picker).toBe(870);
  });

  it("caps the option size so a wide folded screen does not hoard height", () => {
    const tall = constructPhoneSplit({
      width: 707,
      height: 3000,
      stacked: true,
    })!;
    expect(tall[1]).toBe(52 + 10 + 120 * 4 + 24);
  });
});
