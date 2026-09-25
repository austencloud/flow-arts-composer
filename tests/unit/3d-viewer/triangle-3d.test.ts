import { afterEach, describe, expect, it } from "vitest";
import { resolvePropTipAnchors3D } from "$lib/shared/3d/effects/prop-tip-geometry-3d";
import { PropType, propFinishState } from "@austencloud/scene-3d";
import { toScenePropType } from "$lib/shared/3d/domain/scene-prop-type";
import { PropType as AppPropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HOOP_FAMILY_REACH_M,
  HOOP_HARDWARE_M,
  TRIANGLE_STATIONS_M,
} from "$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated";
import {
  TRIANGLE_ARC_ANGLE,
  TRIANGLE_BOW_RADIUS_M,
  TRIANGLE_ELBOW_LEG_M,
  TRIANGLE_REACH_M,
  TRIANGLE_SLEEVE_RADIUS_M,
  triangleSideArcs,
  triangleVertices,
} from "../../../node_modules/@austencloud/scene-3d/src/lib/components/props/triangle-geometry";
import {
  HOOP_GRIP_TAPE_M,
  HOOP_JOIN_TAPE_M,
  HOOP_BUTTON_RADIUS_M,
  HOOP_HARDWARE_RADIUS_M,
  HOOP_CENTERLINE_RADIUS_M,
  HOOP_TUBE_RADIUS_M,
} from "../../../node_modules/@austencloud/scene-3d/src/lib/components/props/hoop-geometry";

const STAFF_HALF_M = 0.8636 / 2;
const BUILD = { fanBuild: "pictograph", finish: "day" } as const;

afterEach(() => {
  propFinishState.setTriangleGrip("corner");
});

describe("hoop family 3D reach", () => {
  it("tracks one tip at an absolute reach that ignores the staff length", () => {
    for (const [prop, reach] of [
      ["triangle", HOOP_FAMILY_REACH_M.triangle],
      ["minihoop", HOOP_FAMILY_REACH_M.minihoop],
      ["bighoop", HOOP_FAMILY_REACH_M.bighoop],
    ] as const) {
      const anchors = resolvePropTipAnchors3D(prop, STAFF_HALF_M, BUILD);
      expect(anchors, prop).toHaveLength(1);
      expect(anchors[0]!.effectTipIndex).toBe(1);
      expect(anchors[0]!.offset.y, prop).toBeCloseTo(reach, 6);
      const shorter = resolvePropTipAnchors3D(prop, STAFF_HALF_M * 0.8, BUILD);
      expect(shorter[0]!.offset.y, prop).toBeCloseTo(reach, 6);
    }
  });
});

describe("triangle 3D geometry", () => {
  it("passes straight through to the scene enum", () => {
    expect(toScenePropType(AppPropType.TRIANGLE)).toBe(PropType.TRIANGLE);
    expect(PropType.TRIANGLE).toBe("triangle");
  });

  it("restates the station table to the metre", () => {
    expect(TRIANGLE_BOW_RADIUS_M).toBeCloseTo(TRIANGLE_STATIONS_M.bowRadius, 6);
    expect(TRIANGLE_ARC_ANGLE).toBeCloseTo(TRIANGLE_STATIONS_M.arcAngle, 9);
    expect(TRIANGLE_REACH_M).toBeCloseTo(TRIANGLE_STATIONS_M.reach, 6);
    expect(TRIANGLE_SLEEVE_RADIUS_M).toBeCloseTo(
      TRIANGLE_STATIONS_M.sleeveRadius,
      9
    );
    expect(TRIANGLE_ELBOW_LEG_M).toBe(TRIANGLE_STATIONS_M.elbowLeg);
  });

  it("puts the far point at the reach for both grips, along +y", () => {
    for (const grip of ["corner", "side"] as const) {
      const vertices = triangleVertices(grip);
      const arcs = triangleSideArcs(grip);
      expect(arcs).toHaveLength(3);
      // Every arc endpoint lands on a vertex.
      for (const arc of arcs) {
        for (const angle of [
          arc.startAngle,
          arc.startAngle + TRIANGLE_ARC_ANGLE,
        ]) {
          const x = arc.centre.x + TRIANGLE_BOW_RADIUS_M * Math.cos(angle);
          const y = arc.centre.y + TRIANGLE_BOW_RADIUS_M * Math.sin(angle);
          const onVertex = vertices.some(
            (v) => Math.hypot(v.x - x, v.y - y) < 1e-9
          );
          expect(onVertex, `${grip} ${angle}`).toBe(true);
        }
      }
      // The furthest point on any arc from the hand is the reach.
      const far = Math.max(
        ...arcs.map((arc) => {
          const mid = arc.startAngle + TRIANGLE_ARC_ANGLE / 2;
          return arc.centre.y + TRIANGLE_BOW_RADIUS_M * Math.sin(mid);
        }),
        ...vertices.map((v) => v.y)
      );
      expect(far, grip).toBeCloseTo(TRIANGLE_REACH_M, 9);
    }
    expect(triangleVertices("corner")[0]).toEqual({ x: 0, y: 0 });
    expect(triangleVertices("side")[2].y).toBeCloseTo(TRIANGLE_REACH_M, 9);
  });

  it("dresses the hoop with tape, a button and a grip wrap at real sizes", () => {
    expect(HOOP_HARDWARE_RADIUS_M).toBeCloseTo(
      HOOP_TUBE_RADIUS_M * HOOP_HARDWARE_M.hardwareRatio,
      9
    );
    expect(HOOP_JOIN_TAPE_M).toBe(HOOP_HARDWARE_M.joinTape);
    expect(HOOP_GRIP_TAPE_M).toBe(HOOP_HARDWARE_M.gripTape);
    expect(HOOP_BUTTON_RADIUS_M).toBe(HOOP_HARDWARE_M.button / 2);
    expect(HOOP_JOIN_TAPE_M / HOOP_CENTERLINE_RADIUS_M).toBeLessThan(
      Math.PI / 4
    );
  });

  it("carries the grip in the scene build", () => {
    expect(propFinishState.build.triangleGrip).toBe("corner");
    propFinishState.setTriangleGrip("side");
    expect(propFinishState.triangleGrip).toBe("side");
    expect(propFinishState.build.triangleGrip).toBe("side");
  });
});
