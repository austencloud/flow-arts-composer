import { describe, it, expect } from "vitest";
import { enumerateDiamondInOut } from "#lib/features/lab/tabs/collision-lab/services/diamond-pose-enumerator.js";
import { Plane } from "@austencloud/scene-3d";
import type {
  DiamondPosition,
  HandOrientation,
} from "#lib/features/lab/tabs/collision-lab/domain/types.js";

describe("DiamondPoseEnumerator", () => {

  it("enumerates exactly 576 poses (cross-plane × cross-plane)", () => {
    const poses = enumerateDiamondInOut();
    expect(poses).toHaveLength(576);
  });

  it("generates unique ids for every pose", () => {
    const poses = enumerateDiamondInOut();
    const ids = new Set(poses.map((p) => p.id));
    expect(ids.size).toBe(576);
  });

  it("every combination of (bluePlane, bluePos, blueOri, redPlane, redPos, redOri) appears exactly once", () => {
    const poses = enumerateDiamondInOut();
    const planes: Plane[] = [Plane.WALL, Plane.WHEEL, Plane.FLOOR];
    const positions: DiamondPosition[] = ["N", "E", "S", "W"];
    const orientations: HandOrientation[] = ["in", "out"];

    let matches = 0;
    for (const bPlane of planes)
      for (const bPos of positions)
        for (const bOri of orientations)
          for (const rPlane of planes)
            for (const rPos of positions)
              for (const rOri of orientations) {
                const match = poses.filter(
                  (p) =>
                    p.leftHand.plane === bPlane &&
                    p.leftHand.position === bPos &&
                    p.leftHand.orientation === bOri &&
                    p.rightHand.plane === rPlane &&
                    p.rightHand.position === rPos &&
                    p.rightHand.orientation === rOri
                );
                expect(match).toHaveLength(1);
                matches++;
              }
    expect(matches).toBe(576);
  });

  it("produces the same order on repeated calls (deterministic)", () => {
    const a = enumerateDiamondInOut();
    const b = enumerateDiamondInOut();
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
  });

  it("encodes ids with both planes, e.g., wNi-hEo for blue-wall-N-in / red-wheel-E-out", () => {
    const poses = enumerateDiamondInOut();
    const wNi_hEo = poses.find((p) => p.id === "wNi-hEo");
    expect(wNi_hEo).toBeDefined();
    expect(wNi_hEo!.leftHand).toEqual({
      plane: Plane.WALL,
      position: "N",
      orientation: "in",
    });
    expect(wNi_hEo!.rightHand).toEqual({
      plane: Plane.WHEEL,
      position: "E",
      orientation: "out",
    });
  });

  it("first pose is wNi-wNi (outermost loop at first value)", () => {
    const poses = enumerateDiamondInOut();
    expect(poses[0]!.id).toBe("wNi-wNi");
  });

  it("includes same-plane poses (single-plane combos are a subset)", () => {
    const poses = enumerateDiamondInOut();
    const samePlane = poses.filter(
      (p) => p.leftHand.plane === p.rightHand.plane
    );
    // 3 planes × 4 × 2 × 4 × 2 = 192
    expect(samePlane).toHaveLength(192);
  });

  it("includes cross-plane poses (the main reason for this lab)", () => {
    const poses = enumerateDiamondInOut();
    const crossPlane = poses.filter(
      (p) => p.leftHand.plane !== p.rightHand.plane
    );
    // 576 - 192 = 384
    expect(crossPlane).toHaveLength(384);
  });
});
