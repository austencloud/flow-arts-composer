import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANVAS_HAND_UNIT,
  QFT_UNIT_IN_VIEWBOX,
  qftPropState,
} from "../../src/lib/shared/notation/qft/qft-canvas-poses";
import {
  createPendulumTrajectory,
  trajectoryFromKnobs,
  trajectoryPosesAt,
} from "@tka/shape-domain";

/** Hand to the far end of the head, read from a poi drawing the app ships. */
function drawnPoiLength(file: string): number {
  const svg = readFileSync(`static/images/props/${file}/poi.svg`, "utf8");
  const regular = svg.slice(svg.indexOf('data-poi-art="regular"'));
  const head =
    /data-poi-part="head" cx="([\d.]+)" cy="[\d.]+" r="([\d.]+)"/.exec(
      regular
    )!;
  const width = Number(/viewBox="0 0 ([\d.]+) /.exec(svg)![1]);
  return Number(head[1]) + Number(head[2]) - width / 2;
}

const POI_LENGTH = drawnPoiLength("pictograph");

/** Where the canvas draws the end of the poi: the grip plus its length along its angle. */
function canvasEnd(state: ReturnType<typeof qftPropState>) {
  const gripX = (state.x ?? 0) * CANVAS_HAND_UNIT;
  const gripY = (state.y ?? 0) * CANVAS_HAND_UNIT;
  return {
    x: gripX + Math.cos(state.staffRotationAngle) * POI_LENGTH,
    y: gripY + Math.sin(state.staffRotationAngle) * POI_LENGTH,
  };
}

describe("QfT poses on the shared canvas", () => {
  it("measures a prop length to the end of the poi the app draws", () => {
    for (const file of ["pictograph", "animated"]) {
      expect(drawnPoiLength(file), file).toBeCloseTo(QFT_UNIT_IN_VIEWBOX, 1);
    }
  });

  // Austen, 2026-11-23: the end of the head reaches the middle, not its middle.
  it("touches the centre with the end of the poi on a radius-1 antispin", () => {
    const flower = trajectoryFromKnobs({
      radius: 1,
      downbeats: 3,
      spin: "antispin",
    });
    const nearest = Math.min(
      ...Array.from({ length: 801 }, (_, i) => {
        const end = canvasEnd(qftPropState(trajectoryPosesAt(flower, i / 100)));
        return Math.hypot(end.x, end.y);
      })
    );
    expect(nearest).toBeLessThan(0.1);
  });

  it("puts the drawn poi's end exactly where QfT puts it, through a whole flower", () => {
    const flowers = [
      trajectoryFromKnobs({ radius: 1, downbeats: 3, spin: "antispin" }),
      trajectoryFromKnobs({ radius: 1.5, downbeats: 1, spin: "inspin" }),
      createPendulumTrajectory(0.08),
    ];
    for (const flower of flowers) {
      for (let cursor = 0; cursor < 8; cursor += 0.137) {
        const pose = trajectoryPosesAt(flower, cursor);
        const end = canvasEnd(qftPropState(pose));
        expect(end.x).toBeCloseTo(pose.head.x * QFT_UNIT_IN_VIEWBOX, 1);
        expect(end.y).toBeCloseTo(pose.head.y * QFT_UNIT_IN_VIEWBOX, 1);
      }
    }
  });

  it("keeps radius 1 one poi length out", () => {
    const pose = trajectoryPosesAt(
      trajectoryFromKnobs({ radius: 1, downbeats: 1, spin: "inspin" }),
      0
    );
    const state = qftPropState(pose);
    const grip = Math.hypot(state.x ?? 0, state.y ?? 0) * CANVAS_HAND_UNIT;
    expect(grip).toBeCloseTo(POI_LENGTH, 1);
  });

  it("points a poi at position 8 straight up the screen", () => {
    const state = qftPropState({ hand: { x: 0, y: 0 }, head: { x: 0, y: -1 } });
    expect(state.staffRotationAngle).toBeCloseTo(-Math.PI / 2, 9);
  });
});
