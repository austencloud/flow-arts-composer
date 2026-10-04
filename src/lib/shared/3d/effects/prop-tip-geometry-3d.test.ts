import { describe, expect, it } from "vitest";
import { PropType } from "@austencloud/scene-3d";
import {
  BUUGENG_ARTWORK_GEOMETRY,
  BUUGENG_TIP_POINTS,
  FAN_TIP_POINTS,
  QUIAD_TIP_POINTS,
  TRIAD_TIP_POINTS,
  TRIGENG_ARTWORK_GEOMETRY,
  TRIGENG_TIP_POINTS,
  type PropTipConfig,
} from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import {
  FAN_DAY_RIM_POINTS_M,
  FAN_FIRE_WICK_CENTERS_M,
  FAN_LOTUS_WICK_CENTERS_M,
} from "./prop-build-tip-geometry-3d";
import { resolvePropTipAnchors3D } from "./prop-tip-geometry-3d";

const PICTOGRAPH = { fanBuild: "pictograph", finish: "day" } as const;
const FIRE = { fanBuild: "fire", finish: "fire" } as const;
const LOTUS = { fanBuild: "lotus", finish: "fire" } as const;
const DAY = { fanBuild: "day", finish: "day" } as const;

/** `Prop3D.svelte` scales the whole prop group for every "big" variant. */
const BIG_SCALE = 1.4;

function maxRadius(config: PropTipConfig): number {
  return Math.max(...config.points.map(({ dx, dy }) => Math.hypot(dx, dy)));
}

function expectSilhouette(
  anchors: readonly { offset: { x: number; y: number; z: number } }[],
  config: PropTipConfig,
  reach: number
): void {
  const scale = reach / maxRadius(config);
  expect(anchors).toHaveLength(config.points.length);
  anchors.forEach((anchor, index) => {
    const point = config.points[index];
    if (!point) throw new Error(`config has no point at index ${index}`);
    expect(anchor.offset.x).toBeCloseTo(point.dy * scale);
    expect(anchor.offset.y).toBeCloseTo(point.dx * scale);
    expect(anchor.offset.z).toBe(0);
  });
}

describe("resolvePropTipAnchors3D", () => {
  it("places all five fire fan emitters at measured wick centres", () => {
    const anchors = resolvePropTipAnchors3D(PropType.FAN, 0.5, FIRE);
    expect(anchors).toEqual(
      FAN_FIRE_WICK_CENTERS_M.map((offset) => ({
        effectTipIndex: 1,
        // Every wick shares slot 1, so every wick keys the centre rib, the
        // 2D fan's primary trail tip.
        effectKeyIndex: 2,
        offset: { ...offset },
      }))
    );
  });

  it("places all five day fan emitters on the traced rim", () => {
    const anchors = resolvePropTipAnchors3D(PropType.FAN, 0.5, DAY);
    expect(anchors).toEqual(
      FAN_DAY_RIM_POINTS_M.map((offset) => ({
        effectTipIndex: 1,
        // Every wick shares slot 1, so every wick keys the centre rib, the
        // 2D fan's primary trail tip.
        effectKeyIndex: 2,
        offset: { ...offset },
      }))
    );
  });

  it("places all five Lotus emitters at the measured wick centres", () => {
    const anchors = resolvePropTipAnchors3D(PropType.FAN, 0.5, LOTUS);
    expect(anchors).toEqual(
      FAN_LOTUS_WICK_CENTERS_M.map((offset) => ({
        effectTipIndex: 1,
        // Every wick shares slot 1, so every wick keys the centre rib, the
        // 2D fan's primary trail tip.
        effectKeyIndex: 2,
        offset: { ...offset },
      }))
    );
  });

  it("keeps the GLB fan builds independent of staff length", () => {
    const short = resolvePropTipAnchors3D(PropType.FAN, 0.3, FIRE);
    const long = resolvePropTipAnchors3D(PropType.FAN, 0.9, FIRE);
    expect(short).toEqual(long);
  });

  it("reaches further on a day fan than on the smaller fire fan", () => {
    const dayCentre = resolvePropTipAnchors3D(PropType.FAN, 0.5, DAY)[2];
    const fireCentre = resolvePropTipAnchors3D(PropType.FAN, 0.5, FIRE)[2];
    if (!dayCentre || !fireCentre) {
      throw new Error("a fan should expose at least three tip anchors");
    }
    expect(dayCentre.offset.y).toBeGreaterThan(fireCentre.offset.y);
  });

  it("scales five pictograph fan rib ends with staff length", () => {
    const staffLength = 0.8636;
    const anchors = resolvePropTipAnchors3D(
      PropType.FAN,
      staffLength / 2,
      PICTOGRAPH
    );
    expectSilhouette(anchors, FAN_TIP_POINTS, staffLength * 0.50831);
  });

  it.each([
    [PropType.TRIAD, TRIAD_TIP_POINTS, 0.44707],
    [PropType.QUIAD, QUIAD_TIP_POINTS, 0.43202],
  ])(
    "puts an emitter on every %s arm at its frame reach",
    (propType, points, ratio) => {
      const anchors = resolvePropTipAnchors3D(propType, 0.5, PICTOGRAPH);
      expectSilhouette(anchors, points, ratio);
    }
  );

  it.each([
    [PropType.BIGFAN, PropType.FAN],
    [PropType.BIGTRIAD, PropType.TRIAD],
    [PropType.BIGBUUGENG, PropType.BUUGENG],
  ])("scales %s emitters by the big-variant group scale", (big, base) => {
    const bigAnchors = resolvePropTipAnchors3D(big, 0.5, FIRE);
    const baseAnchors = resolvePropTipAnchors3D(base, 0.5, FIRE);
    expect(bigAnchors).toHaveLength(baseAnchors.length);
    bigAnchors.forEach((anchor, index) => {
      const baseAnchor = baseAnchors[index];
      if (!baseAnchor) {
        throw new Error(`base prop has no tip anchor at index ${index}`);
      }
      expect(anchor.offset.x).toBeCloseTo(baseAnchor.offset.x * BIG_SCALE);
      expect(anchor.offset.y).toBeCloseTo(baseAnchor.offset.y * BIG_SCALE);
    });
  });

  it.each([
    [PropType.STAFF, 0.5, [-0.5, 0.5]],
    [PropType.CLUB, 0.5, [0.50343]],
    [PropType.SWORD, 0.5, [0.61706]],
    [PropType.CAPSULE_BATON, 0.5, [-0.4099367, 0.4099367]],
    [PropType.FIRE_DOUBLE_STAFF, 0.5, [-0.413, 0.413]],
  ])("keeps %s emitter reach unchanged", (propType, halfLength, expectedY) => {
    const anchors = resolvePropTipAnchors3D(propType, halfLength, PICTOGRAPH);
    expect(anchors.map((anchor) => anchor.offset)).toEqual(
      expectedY.map((y) => ({ x: 0, y, z: 0 }))
    );
  });

  it("places all three Trigeng emitters inside its fixed GLB silhouette", () => {
    const short = resolvePropTipAnchors3D(PropType.TRIGENG, 0.3, PICTOGRAPH);
    const long = resolvePropTipAnchors3D(PropType.TRIGENG, 0.9, PICTOGRAPH);

    expect(short).toEqual(long);
    expectSilhouette(
      short,
      TRIGENG_TIP_POINTS,
      0.56 * (TRIGENG_ARTWORK_GEOMETRY.trackedRadius / 250)
    );
    short.forEach(({ offset }) => {
      expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(
        0.56 * (TRIGENG_ARTWORK_GEOMETRY.trackedRadius / 250),
        10
      );
    });
  });

  it("keeps the user-chosen Buugeng pair horizontal in its fixed GLB", () => {
    const short = resolvePropTipAnchors3D(PropType.BUUGENG, 0.3, PICTOGRAPH);
    const long = resolvePropTipAnchors3D(PropType.BUUGENG, 0.9, PICTOGRAPH);
    const reach =
      (0.83 * BUUGENG_ARTWORK_GEOMETRY.trackedRadius) /
      BUUGENG_ARTWORK_GEOMETRY.viewBox.width;

    expect(short).toEqual(long);
    expect(short.map(({ effectTipIndex }) => effectTipIndex)).toEqual([0, 1]);
    expectSilhouette(short, BUUGENG_TIP_POINTS, reach);
    short.forEach(({ offset }) => {
      expect(offset.x).toBeCloseTo(0, 12);
      expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(reach, 10);
    });
  });
});
