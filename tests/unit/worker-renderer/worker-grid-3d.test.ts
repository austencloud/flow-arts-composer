import {
  ArrowHelper,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PerspectiveCamera,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import {
  Plane,
  PlaneMode,
  PLANE_COLORS,
  PLANE_MODE_CONFIGS,
} from "@austencloud/scene-3d";
import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { planeAngleToWorldPosition } from "#lib/shared/3d/domain/constants/plane-transforms.js";
import { createWorkerGrid3D } from "#lib/shared/3d/worker-renderer/worlds/grid/worker-grid-3d.js";
import type { WorkerGridOptions } from "#lib/shared/3d/worker-renderer/worlds/grid/worker-grid-types.js";
import { describe, expect, it } from "vitest";

const BASE_OPTIONS: WorkerGridOptions = {
  visiblePlanes: new Set([Plane.WALL]),
  size: 1.2,
  handPointRadius: 0.52,
  outerPointRadius: 0.95,
  showLabels: false,
};

function named<T>(
  root: Group,
  name: string,
  ctor: new (...args: never[]) => T
): T {
  const object = root.getObjectByName(name);
  expect(object).toBeInstanceOf(ctor);
  return object as T;
}

function expectVector(actual: Vector3, expected: Vector3): void {
  for (const [index, component] of actual.toArray().entries()) {
    expect(component).toBeCloseTo(expected.toArray()[index]!, 10);
  }
}

describe("worker grid 3D", () => {
  it("matches the production wall plane surface, rings, markers, and colors", () => {
    const grid = createWorkerGrid3D(BASE_OPTIONS);

    const surface = named(grid.root, "worker-grid-surface:wall", Mesh) as Mesh;
    expect(surface.geometry.type).toBe("PlaneGeometry");
    expect((surface.geometry as PlaneGeometry).parameters).toMatchObject({
      width: 2.4,
      height: 2.4,
    });
    const surfaceMaterial = surface.material as MeshBasicMaterial;
    expect(`#${surfaceMaterial.color.getHexString()}`).toBe(
      PLANE_COLORS[Plane.WALL]
    );
    expect(surfaceMaterial.opacity).toBe(0.15);
    expect(surfaceMaterial.side).toBe(DoubleSide);
    expect(surfaceMaterial.depthWrite).toBe(false);

    const handRing = named(
      grid.root,
      "worker-grid-hand-ring:wall",
      Mesh
    ) as Mesh<RingGeometry, MeshBasicMaterial>;
    expect(handRing.geometry.parameters).toMatchObject({
      innerRadius: 0.505,
      outerRadius: 0.535,
      thetaSegments: 64,
    });
    expect(handRing.position.z).toBe(0.005);
    expect(handRing.material.opacity).toBe(0.5);

    const outerRing = named(
      grid.root,
      "worker-grid-outer-ring:wall",
      Mesh
    ) as Mesh<RingGeometry, MeshBasicMaterial>;
    expect(outerRing.geometry.parameters).toMatchObject({
      innerRadius: 0.94,
      outerRadius: 0.96,
      thetaSegments: 64,
    });
    expect(outerRing.position.z).toBe(0.003);
    expect(outerRing.material.opacity).toBe(0.25);

    const center = named(
      grid.root,
      "worker-grid-plane-center:wall",
      Mesh
    ) as Mesh<SphereGeometry, MeshBasicMaterial>;
    expect(center.geometry.parameters.radius).toBe(0.04);
    expect(center.position.z).toBe(0.01);
    expect(center.material.color.getHex()).toBe(0xf59e0b);

    for (const location of [
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
    ]) {
      const handPoint = named(
        grid.root,
        `worker-grid-hand-point:wall:${location}`,
        Mesh
      ) as Mesh<SphereGeometry, MeshBasicMaterial>;
      expect(handPoint.geometry.parameters.radius).toBe(0.025);
      expectVector(
        handPoint.position,
        planeAngleToWorldPosition(
          Plane.WALL,
          LOCATION_ANGLES[location],
          BASE_OPTIONS.handPointRadius
        )
      );

      const outerPoint = named(
        grid.root,
        `worker-grid-outer-point:wall:${location}`,
        Mesh
      ) as Mesh<SphereGeometry, MeshBasicMaterial>;
      expect(outerPoint.geometry.parameters.radius).toBe(0.018);
      expect(outerPoint.material.opacity).toBe(0.6);
      expectVector(
        outerPoint.position,
        planeAngleToWorldPosition(
          Plane.WALL,
          LOCATION_ANGLES[location],
          BASE_OPTIONS.outerPointRadius
        )
      );
    }

    expect(grid.capability).toMatchObject({
      coreExact: true,
      exact: true,
      supported: true,
      labelMode: "disabled",
      limitations: [],
    });
    grid.dispose();
  });

  it("uses diagonal points in box mode on all nine canonical planes", () => {
    const allPlanes = new Set(Object.values(Plane));
    const grid = createWorkerGrid3D({
      ...BASE_OPTIONS,
      visiblePlanes: allPlanes,
      gridMode: "box",
      showOrientationHelpers: false,
    });

    expect(
      grid.root.children.filter((child) =>
        child.name.startsWith("worker-grid-plane-container:")
      )
    ).toHaveLength(9);
    for (const plane of allPlanes) {
      for (const location of ["ne", "se", "sw", "nw"]) {
        expect(
          grid.root.getObjectByName(
            `worker-grid-hand-point:${plane}:${location}`
          )
        ).toBeInstanceOf(Mesh);
      }
      expect(
        grid.root.getObjectByName(`worker-grid-hand-point:${plane}:n`)
      ).toBeUndefined();
    }
    grid.dispose();
  });

  it("duplicates only the wheel plane at the exact dual-wheel offsets", () => {
    const grid = createWorkerGrid3D({
      ...BASE_OPTIONS,
      visiblePlanes: new Set([Plane.WALL, Plane.WHEEL]),
      planeMode: PlaneMode.DUAL_WHEEL,
      showOrientationHelpers: false,
    });

    const wheelContainers = grid.root.children.filter((child) =>
      child.name.startsWith("worker-grid-plane-container:wheel:")
    );
    expect(wheelContainers.map(({ position }) => position.x)).toEqual([
      PLANE_MODE_CONFIGS[PlaneMode.DUAL_WHEEL].blueLateralOffset,
      PLANE_MODE_CONFIGS[PlaneMode.DUAL_WHEEL].redLateralOffset,
    ]);
    expect(
      grid.root.children.filter((child) =>
        child.name.startsWith("worker-grid-plane-container:wall:")
      )
    ).toHaveLength(1);
    grid.dispose();

    const sized = createWorkerGrid3D({
      ...BASE_OPTIONS,
      visiblePlanes: new Set([Plane.WHEEL]),
      planeMode: PlaneMode.DUAL_WHEEL,
      staffHalfLength: 0.55,
      showOrientationHelpers: false,
    });
    expect(sized.root.children.map(({ position }) => position.x)).toEqual([
      0.55, -0.55,
    ]);
    sized.dispose();
  });

  it("builds the exact center marker and three orientation arrows", () => {
    const grid = createWorkerGrid3D(BASE_OPTIONS);
    const center = named(
      grid.root,
      "worker-grid-orientation-center",
      Mesh
    ) as Mesh<SphereGeometry, MeshBasicMaterial>;
    expect(center.geometry.parameters).toMatchObject({
      radius: 0.04,
      widthSegments: 32,
      heightSegments: 32,
    });

    const expected = [
      { direction: new Vector3(1, 0, 0), color: 0xff4444 },
      { direction: new Vector3(0, 1, 0), color: 0x44ff44 },
      { direction: new Vector3(0, 0, 1), color: 0x4444ff },
    ];
    for (const [index, { direction, color }] of expected.entries()) {
      const arrow = named(
        grid.root,
        `worker-grid-orientation-axis:${index}`,
        ArrowHelper
      ) as ArrowHelper;
      const actualDirection = new Vector3(0, 1, 0).applyQuaternion(
        arrow.quaternion
      );
      expectVector(actualDirection, direction);
      expect(arrow.line.scale.y).toBeCloseTo(BASE_OPTIONS.size * 1.2 - 0.06, 8);
      expect(arrow.cone.scale.y).toBeCloseTo(0.06, 8);
      expect(arrow.cone.scale.x).toBeCloseTo(0.03, 8);
      expect((arrow.line.material as MeshBasicMaterial).color.getHex()).toBe(
        color
      );
    }
    grid.dispose();
  });

  it("does not create orientation helpers when the production option is off", () => {
    const grid = createWorkerGrid3D({
      ...BASE_OPTIONS,
      showOrientationHelpers: false,
    });
    expect(
      grid.root.getObjectByName("worker-grid-orientation-center")
    ).toBeUndefined();
    expect(
      grid.root.children.some((child) => child instanceof ArrowHelper)
    ).toBe(false);
    grid.dispose();
  });

  it("does not change after disposal", () => {
    const grid = createWorkerGrid3D(BASE_OPTIONS);
    grid.dispose();
    expect(grid.root.children).toHaveLength(0);
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    expect(() => grid.updateView(camera, 900)).not.toThrow();
    expect(() => grid.dispose()).not.toThrow();
  });
});
