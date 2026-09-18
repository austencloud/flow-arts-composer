import { Box3, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createProceduralWorkerProp } from "$lib/shared/3d/worker-renderer/worlds/props/worker-procedural-props";
import type { WorkerPropFactoryOptions } from "$lib/shared/3d/worker-renderer/worlds/props/worker-prop-factory-types";
import {
  HOOP_FAMILY_REACH_M,
  TRIANGLE_STATIONS_M,
} from "$lib/shared/pictograph/prop/domain/hoop-family-geometry.generated";

function options(
  propType: string,
  triangleGrip: "corner" | "side" = "corner"
): WorkerPropFactoryOptions {
  return {
    propType,
    color: "blue",
    length: 0.8636,
    thickness: 0.012,
    build: {
      finish: "day",
      fanBuild: "pictograph",
      fanFrameColor: "black",
      fanCover: "bare",
      triangleGrip,
    },
    layer: 3,
  };
}

function meshes(root: { traverse(cb: (o: unknown) => void): void }): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) out.push(o);
  });
  return out;
}

function bodyBounds(visual: { root: { children: unknown[] } }): Box3 {
  // createVisual adds the rotated body first, then the trail indicator.
  const body = visual.root.children[0] as Parameters<Box3["setFromObject"]>[0];
  body.updateMatrixWorld(true);
  // precise = true walks the vertices; the default corner-transform box
  // over-estimates a rotated torus arc by a few millimetres.
  return new Box3().setFromObject(body, true);
}

describe("worker hoop family", () => {
  it("dresses the hoop with a ring, two bands and a button", () => {
    const visual = createProceduralWorkerProp(options("minihoop"));
    expect(visual).not.toBeNull();
    // ring + join tape + button + grip tape + trail indicator
    expect(meshes(visual!.root)).toHaveLength(5);
    const box = bodyBounds(visual!);
    const size = box.getSize(new Vector3());
    // Ring top is 2 x centreline; the button sits one hardware radius above
    // that and is 3 mm in radius.
    expect(box.max.y).toBeCloseTo(
      HOOP_FAMILY_REACH_M.minihoop + TRIANGLE_STATIONS_M.sleeveRadius + 0.003,
      3
    );
    expect(size.x).toBeCloseTo(
      HOOP_FAMILY_REACH_M.minihoop + 2 * TRIANGLE_STATIONS_M.tubeRadius,
      2
    );
  });

  it("builds the triangle from three sides, six legs and three vertices", () => {
    for (const grip of ["corner", "side"] as const) {
      const visual = createProceduralWorkerProp(options("triangle", grip));
      expect(visual, grip).not.toBeNull();
      expect(meshes(visual!.root), grip).toHaveLength(3 + 6 + 3 + 1);
      const box = bodyBounds(visual!);
      expect(box.max.y, grip).toBeCloseTo(
        TRIANGLE_STATIONS_M.reach + TRIANGLE_STATIONS_M.tubeRadius,
        2
      );
      expect(box.max.x, grip).toBeCloseTo(
        TRIANGLE_STATIONS_M.sideChord / 2 + TRIANGLE_STATIONS_M.sleeveRadius,
        2
      );
      expect(box.min.x, grip).toBeCloseTo(-box.max.x, 2);
    }
    // The corner grip has nothing behind the hand but the sleeve sphere; the
    // side grip has only the tube radius.
    const corner = bodyBounds(
      createProceduralWorkerProp(options("triangle", "corner"))!
    );
    const side = bodyBounds(
      createProceduralWorkerProp(options("triangle", "side"))!
    );
    expect(corner.min.y).toBeCloseTo(-TRIANGLE_STATIONS_M.sleeveRadius, 3);
    expect(side.min.y).toBeCloseTo(-TRIANGLE_STATIONS_M.tubeRadius, 3);
  });
});
