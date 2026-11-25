import { describe, expect, it } from "vitest";
import {
  DENSE_GAP,
  DOCK_PICTURE_TILE,
  fitEffectDock,
  fitEffectPicker,
  fitEffectPictures,
  MIN_DOCK_PICTURE_HEIGHT,
  PICTURE_CAPTION_HEIGHT,
  PICTURE_GAP,
  PICTURE_INNER_GAP,
  PICTURE_INSET,
} from "./effect-catalog-fit";

const count = 17;

// A guide screen never scrolls, so this arrangement is the only one its panel
// has. A box it could not fill would put a scrollbar back.
function tiles(width: number, height: number) {
  const fit = fitEffectPicker({ width, height, count });
  if (!fit) throw new Error("no arrangement");
  return {
    fit,
    w: (width - (fit.cols - 1) * fit.gap) / fit.cols,
    h: (height - (fit.rows - 1) * fit.gap) / fit.rows,
  };
}

describe("fitEffectPicker", () => {
  it.each([
    [320, 80],
    [340, 106],
    [340, 160],
    [400, 250],
    [700, 300],
    [500, 410],
    [1000, 700],
  ])("fits every effect inside a %ix%i box", (width, height) => {
    const { fit } = tiles(width, height);
    expect(fit.cols * fit.rows).toBeGreaterThanOrEqual(count);
    expect(fit.fill).toBe(true);
  });

  it("keeps the names on a phone's band", () => {
    const { fit, w, h } = tiles(340, 160);
    expect(fit.orientation).toBe("dense");
    expect(w).toBeGreaterThanOrEqual(46);
    expect(h).toBeGreaterThanOrEqual(34);
  });

  it("drops the names only when a tile cannot hold one", () => {
    expect(tiles(320, 60).fit.orientation).toBe("icons");
  });

  it("shows pictures when the box has room for them", () => {
    const { fit } = tiles(1000, 700);
    expect(fit.portrait).toBeGreaterThan(0);
  });

  it("uses the width and height it is given without overflowing", () => {
    const { fit, h } = tiles(340, 106);
    const used = fit.rows * h + (fit.rows - 1) * DENSE_GAP;
    expect(used).toBeLessThanOrEqual(106 + 0.01);
  });

  it("answers nothing for an empty box", () => {
    expect(fitEffectPicker({ width: 0, height: 100, count })).toBeNull();
    expect(fitEffectPicker({ width: 100, height: 0, count })).toBeNull();
  });
});

describe("fitEffectPictures", () => {
  // The Customize workspace at 1455 x 1139, as measured in the browser: the
  // page's grid box is 565 wide, 632 tall under Trails' three looks and 868
  // with effects off.
  it("gives his window's sixteen effects 135 x 152 tiles and 123 x 112 pictures", () => {
    const fit = fitEffectPictures({ width: 565, height: 632, count: 16 });
    expect(fit).toMatchObject({ cols: 4, rows: 4, gap: PICTURE_GAP });
    expect(fit?.tileWidth).toBeCloseTo(135.25, 2);
    expect(fit?.tileHeight).toBe(152);
    expect(fit?.pictureWidth).toBeCloseTo(123.25, 2);
    expect(fit?.pictureHeight).toBe(112);
    expect(fit?.shape).toBe("tall");
    expect(fit?.cover).toBe(true);
  });

  it("three times the picture the old roster had (101 x 38)", () => {
    for (const height of [632, 868]) {
      const fit = fitEffectPictures({ width: 565, height, count: 16 })!;
      expect(fit.pictureWidth * fit.pictureHeight).toBeGreaterThanOrEqual(
        3 * 101 * 38
      );
    }
  });

  it("rows add up to the height it was given, whatever the height", () => {
    for (const height of [380, 452, 632, 868]) {
      const fit = fitEffectPictures({ width: 565, height, count: 16 })!;
      expect(fit.rows * fit.tileHeight + (fit.rows - 1) * fit.gap).toBeCloseTo(
        height,
        6
      );
      expect(fit.tileHeight).toBe(
        fit.pictureHeight +
          2 * PICTURE_INSET +
          PICTURE_INNER_GAP +
          PICTURE_CAPTION_HEIGHT
      );
    }
  });

  it("keeps the 6:5 painting whole in the tall tiles of an effects-off page", () => {
    const fit = fitEffectPictures({ width: 565, height: 868, count: 16 })!;
    expect(fit.tileHeight).toBe(211);
    expect(fit.shape).toBe("tall");
    expect(fit.cover).toBe(false);
  });

  it("paints the wide card for a short, wide picture box", () => {
    const fit = fitEffectPictures({ width: 565, height: 300, count: 16 })!;
    expect(fit.shape).toBe("wide");
  });

  it("answers null for a box with no room", () => {
    expect(fitEffectPictures({ width: 0, height: 600, count: 16 })).toBeNull();
    expect(
      fitEffectPictures({ width: 565, height: 150, count: 16 })
    ).toBeNull();
  });
});

// The phone dock under a player: its grid is the dock body less 12px of padding,
// the 36px action row and the 6px over it, and 24px narrower than the dock.
describe("fitEffectDock", () => {
  const dock = (bodyWidth: number, bodyHeight: number) =>
    fitEffectDock({
      width: bodyWidth - 24,
      height: bodyHeight - 54,
      count: 16,
    });

  it("draws pictures on an ordinary phone", () => {
    // Fuse's dock body on 412 x 915, 375 x 812, 375 x 667, 360 x 640 and the
    // short landscape 915 x 412.
    for (const [width, height] of [
      [376, 311],
      [339, 300],
      [339, 261],
      [324, 261],
      [369, 251],
    ] as const) {
      const fit = dock(width, height);
      expect(fit).toMatchObject({
        cols: 4,
        rows: 4,
        gap: DOCK_PICTURE_TILE.gap,
      });
      expect(fit!.pictureHeight).toBeGreaterThanOrEqual(
        MIN_DOCK_PICTURE_HEIGHT
      );
    }
  });

  it("fills the height it was given and no more", () => {
    const fit = dock(390, 314)!;
    expect(fit.rows * fit.tileHeight + (fit.rows - 1) * fit.gap).toBeCloseTo(
      260,
      6
    );
    expect(fit.tileHeight).toBeCloseTo(
      fit.pictureHeight +
        2 * DOCK_PICTURE_TILE.inset +
        DOCK_PICTURE_TILE.innerGap +
        DOCK_PICTURE_TILE.caption,
      6
    );
  });

  it("leaves the shortest phones their one-line tiles", () => {
    // 360 x 591 in Fuse, and the Shape Engine's shortest docks.
    for (const height of [242, 231, 221]) expect(dock(324, height)).toBeNull();
  });

  it("goes eight across where that draws each picture bigger", () => {
    // A tablet's dock, and an unfolded Fold's (707 x 772).
    for (const [width, height] of [
      [760, 260],
      [671, 283],
    ] as const) {
      expect(dock(width, height)).toMatchObject({ cols: 8, rows: 2 });
    }
  });
});
