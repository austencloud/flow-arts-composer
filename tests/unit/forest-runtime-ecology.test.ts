import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Texture,
  Vector3,
} from "three";
import {
  createForestRuntimeGrassField,
  createForestRuntimeTreeInstances,
  disposeForestRuntimeEcology,
  selectForestRuntimeGrassDensity,
} from "#lib/shared/3d/environments/scenes/forest/forest-runtime-ecology.js";

describe("forest runtime ecology", () => {
  it("uses simplified geometry with the accepted near-tree material payload", () => {
    const placeholderMaterial = new MeshStandardMaterial({ color: "#ffffff" });
    placeholderMaterial.name = "tree-bark";
    const geometrySource = new Group();
    geometrySource.add(new Mesh(new BoxGeometry(1, 2, 1), placeholderMaterial));

    const acceptedTexture = new Texture();
    const acceptedMaterial = new MeshStandardMaterial({
      color: "#48623f",
      map: acceptedTexture,
    });
    acceptedMaterial.name = "tree-bark";
    const materialSource = new Group();
    materialSource.add(new Mesh(new BoxGeometry(1, 2, 1), acceptedMaterial));

    const runtime = createForestRuntimeTreeInstances(
      geometrySource,
      [
        {
          x: 4,
          y: 3,
          z: -6,
          rotation: Math.PI / 4,
          renderedHeightMeters: 10,
        },
      ],
      "test-tree",
      { materialSource, distanceTier: "far" }
    );
    const instances = runtime.children[0] as InstancedMesh;
    const runtimeMaterial = instances.material as MeshStandardMaterial;
    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    instances.getMatrixAt(0, matrix);
    matrix.decompose(position, rotation, scale);

    expect(instances.geometry).toBe(
      (geometrySource.children[0] as Mesh).geometry
    );
    expect(runtimeMaterial).not.toBe(acceptedMaterial);
    expect(runtimeMaterial.name).toBe("tree-bark");
    expect(runtimeMaterial.map).toBe(acceptedTexture);
    expect(runtimeMaterial.color.getHexString()).toBe("48623f");
    expect(instances.userData.forestDistanceTier).toBe("far");
    expect(scale.y).toBeCloseTo(5);
    expect(position).toMatchObject({ x: 4, y: 8, z: -6 });

    disposeForestRuntimeEcology(runtime);
    (geometrySource.children[0] as Mesh).geometry.dispose();
    placeholderMaterial.dispose();
    (materialSource.children[0] as Mesh).geometry.dispose();
    acceptedMaterial.dispose();
    acceptedTexture.dispose();
  });

  it("builds stable spatial density tiers without mutating the authored placements", () => {
    const placements = Array.from({ length: 80 }, (_, index) => ({
      x: index * 1.17,
      y: 2,
      z: (index % 9) * 1.31,
      rotation: index * 0.23,
      widthMeters: 0.45,
      heightMeters: 0.32,
      species:
        index % 2 === 0
          ? ("summer-sward" as const)
          : ("woodland-grass" as const),
      tier: "base" as const,
      colorIndex: index % 4,
    }));

    const first = selectForestRuntimeGrassDensity(placements, 0.5);
    const second = selectForestRuntimeGrassDensity(placements, 0.5);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(25);
    expect(first.length).toBeLessThan(55);
    expect(selectForestRuntimeGrassDensity(placements, 1)).toEqual(placements);
    expect(selectForestRuntimeGrassDensity(placements, 0)).toEqual([]);
    expect(placements).toHaveLength(80);
  });

  it("labels simplified grass instances with their distance tier", () => {
    const material = new MeshStandardMaterial({ color: "#6d7a5c" });
    const sources = new Map([
      ["summer-sward" as const, new Mesh(new BoxGeometry(1, 1, 1), material)],
    ]);
    const runtime = createForestRuntimeGrassField(
      [
        {
          x: 3,
          y: 1,
          z: -4,
          rotation: 0,
          widthMeters: 0.45,
          heightMeters: 0.32,
          species: "summer-sward",
          tier: "base",
          colorIndex: 0,
        },
      ],
      sources,
      { distanceTier: "far" }
    );
    const instances = runtime.children[0] as InstancedMesh;

    expect(runtime.name).toBe("Forest_RuntimeGroundEcosystem_far");
    expect(instances.userData.forestDistanceTier).toBe("far");
    expect(instances.count).toBe(1);

    disposeForestRuntimeEcology(runtime);
    sources.get("summer-sward")!.geometry.dispose();
    material.dispose();
  });
});
