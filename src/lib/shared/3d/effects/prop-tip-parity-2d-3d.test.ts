import { describe, expect, it } from "vitest";
import {
  PROP_TIP_POINTS,
  getTipPointsBaseline,
} from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import {
  resolveEffect,
  type TipEffectMap,
} from "$lib/shared/animation-engine/domain/types/tip-effect-types";
import { getDefaultTrailPointConfig } from "$lib/shared/animation-engine/domain/types/trail-point-types";
import { propTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";
import type { PropBuildTipGeometry3D } from "./prop-build-tip-geometry-3d";
import {
  resolvePropTipAnchors3D,
  type PropTipAnchor3D,
} from "./prop-tip-geometry-3d";

/**
 * A saved per-tip effect names a 2D tip: "1-0" is tip 0 of the right prop's
 * `getTipPoints` table. 2D draws that tip at (dx, dy) in the prop's frame, and
 * 3D lays the same frame down with +Y along +dx. So the map that lights 2D
 * tip t must light 3D emitters on the same side of the hand, and the tips the
 * 2D trail follows for LEFT_END and RIGHT_END must be the ones 3D's slots 0
 * and 1 resolve. These run the same map through both halves for every prop in
 * the 2D registry.
 */

const HALF_LENGTH = 0.5;

const FAN_BUILDS: readonly PropBuildTipGeometry3D["fanBuild"][] = [
  "pictograph",
  "fire",
  "lotus",
  "day",
  "moon",
  "flat-grip",
  "star",
];

const cases = Object.keys(PROP_TIP_POINTS)
  .filter((propType) => getTipPointsBaseline(propType).points.length > 0)
  .flatMap((propType) =>
    (propType === "fan" || propType === "bigfan" ? FAN_BUILDS : ["pictograph"])
      .map((fanBuild) => ({
        propType,
        fanBuild,
        build: { fanBuild, finish: "fire" } as PropBuildTipGeometry3D,
      }))
  );

function lightTip(
  anchors: readonly PropTipAnchor3D[],
  tipIndex: number
): PropTipAnchor3D[] {
  const map: TipEffectMap = { [`1-${tipIndex}`]: { effect: "led" } };
  return anchors.filter(
    (anchor) => resolveEffect(1, anchor.effectKeyIndex, map, {}) === "led"
  );
}

describe("2D and 3D per-tip effect parity", () => {
  it.each(cases)(
    "$propType ($fanBuild): a per-tip effect lights the same end in 3D as in 2D",
    ({ propType, build }) => {
      const points = getTipPointsBaseline(propType).points;
      const anchors = resolvePropTipAnchors3D(propType, HALF_LENGTH, build);
      const trail = getDefaultTrailPointConfig(propType, points);
      const trailTips = new Set(
        [trail.left, trail.right].flatMap((source) =>
          source.type === "tip" ? [source.index] : []
        )
      );
      // Emitters that share a slot share one key (a fan's five wicks), so
      // only an emitter that owns its slot alone names a single end.
      const ownsItsSlot = (anchor: PropTipAnchor3D) =>
        anchors.filter((other) => other.effectTipIndex === anchor.effectTipIndex)
          .length === 1;

      points.forEach((point, tipIndex) => {
        const lit = lightTip(anchors, tipIndex);
        if (trailTips.has(tipIndex)) {
          expect(lit.length, `2D tip ${tipIndex} lights no 3D emitter`).toBeGreaterThan(0);
        }
        for (const anchor of lit.filter(ownsItsSlot)) {
          expect(
            Math.sign(anchor.offset.y),
            `2D tip ${tipIndex} (dx ${point.dx}) lit a 3D emitter at y ${anchor.offset.y}`
          ).toBe(Math.sign(point.dx));
        }
      });
    }
  );

  it.each(cases)(
    "$propType ($fanBuild): 3D slots 0 and 1 key the 2D trail's LEFT_END and RIGHT_END tips",
    ({ propType, build }) => {
      const points = getTipPointsBaseline(propType).points;
      const anchors = resolvePropTipAnchors3D(propType, HALF_LENGTH, build);
      const trail = getDefaultTrailPointConfig(propType, points);

      expect([...new Set(anchors.map((a) => a.effectTipIndex))].sort()).toEqual(
        propTipEnds(propType) === 2 ? [0, 1] : [1]
      );
      for (const anchor of anchors) {
        const end = anchor.effectTipIndex === 0 ? trail.left : trail.right;
        expect(end.type).toBe("tip");
        if (end.type === "tip") expect(anchor.effectKeyIndex).toBe(end.index);
      }
    }
  );
});
