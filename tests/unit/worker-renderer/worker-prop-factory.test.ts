import {
  PROP_MODEL_REGISTRY,
  PropType,
  type PropBuild,
} from "@austencloud/scene-3d";
import {
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkerPropVisual,
  EXACT_WORKER_PROP_TYPES,
  type WorkerPropFactoryOptions,
  type WorkerPropModelLoader,
  type WorkerPropVisual,
} from "#lib/shared/3d/worker-renderer/worlds/props/worker-prop-factory.js";
import { resolveWorkerPropModel } from "#lib/shared/3d/worker-renderer/worlds/props/worker-gltf-props.js";

const BUILD: PropBuild = {
  finish: "fire",
  fanBuild: "pictograph",
  fanFrameColor: "black",
  fanCover: "bare",
};

function sourceModel(): Group {
  const root = new Group();
  const mesh = new Mesh(
    new SphereGeometry(0.1, 8, 8),
    new MeshStandardMaterial({ color: "#808080" })
  );
  mesh.material.name = "LegacyMaterial";
  root.add(mesh);
  return root;
}

function options(
  propType: PropType,
  overrides: Partial<WorkerPropFactoryOptions> = {}
): WorkerPropFactoryOptions {
  return {
    propType,
    color: "blue",
    length: 0.8636,
    thickness: 0.012,
    build: BUILD,
    layer: 3,
    loadModel: async () => sourceModel(),
    ...overrides,
  };
}

async function visual(
  propType: PropType,
  overrides: Partial<WorkerPropFactoryOptions> = {}
): Promise<WorkerPropVisual> {
  const result = await createWorkerPropVisual(options(propType, overrides));
  if (!result.ok) throw new Error(result.detail);
  return result.visual;
}

function boundsSize(root: Group): Vector3 {
  root.updateMatrixWorld(true);
  return new Box3().setFromObject(root).getSize(new Vector3());
}

describe("worker prop factory support", () => {
  it("pins exact support to every canonical PropType", () => {
    expect([...new Set(EXACT_WORKER_PROP_TYPES)].sort()).toEqual(
      Object.values(PropType).sort()
    );
  });

  it("constructs every canonical type without falling back to a staff", async () => {
    for (const propType of Object.values(PropType)) {
      const result = await createWorkerPropVisual(options(propType));
      expect(result, propType).toMatchObject({ ok: true });
      if (result.ok) {
        if (
          propType === PropType.STAFF ||
          propType === PropType.SIMPLESTAFF ||
          propType === PropType.STAFF2 ||
          propType === PropType.BIGSTAFF
        ) {
          expect(result.visual.source, propType).toBe("staff");
        } else if (propType === PropType.HAND) {
          expect(result.visual.source, propType).toBe("hand");
        } else {
          expect(result.visual.source, propType).not.toBe("staff");
        }
        result.visual.dispose();
      }
    }
  });

  it("fails explicitly for a type outside the canonical enum", async () => {
    const result = await createWorkerPropVisual(
      options("not-a-prop" as PropType)
    );
    expect(result).toEqual({
      ok: false,
      propType: "not-a-prop",
      reason: "unsupported-prop-type",
      detail: "No exact worker renderer exists for not-a-prop",
    });
  });

  it("fails explicitly when an authored model has no loader", async () => {
    const result = await createWorkerPropVisual(
      options(PropType.CHICKEN, { loadModel: undefined })
    );
    expect(result).toMatchObject({
      ok: false,
      propType: PropType.CHICKEN,
      reason: "model-loader-required",
    });
  });
});

describe("worker prop canonical transforms", () => {
  it.each([
    PropType.STAFF,
    PropType.CLUB,
    PropType.CAPSULE_BATON,
    PropType.FIRE_DOUBLE_STAFF,
  ])(
    "scales joined %s geometry once, including fixed-size models",
    async (propType) => {
      const base = await visual(propType);
      const baseSize = boundsSize(base.root);
      for (const scale of [2 / 3, 1 / 2]) {
        const joined = await visual(propType, {
          length: 0.8636 * scale,
          geometryScale: scale,
        });
        const joinedSize = boundsSize(joined.root);
        for (const axis of ["x", "y", "z"] as const) {
          expect(joinedSize[axis]).toBeCloseTo(baseSize[axis] * scale, 7);
        }
        joined.setState({ worldRotation: new Quaternion() });
        expect(joined.root.scale.toArray()).toEqual([scale, scale, scale]);
        joined.dispose();
      }
      base.dispose();
    }
  );

  it("uses the registry's measured chicken scale, grip offset, and long-axis flip", async () => {
    const entry = PROP_MODEL_REGISTRY[PropType.CHICKEN];
    expect(entry).toBeTruthy();
    const prop = await visual(PropType.CHICKEN);
    const transform = prop.root.getObjectByName("worker-prop-model-transform");
    expect(transform).toBeTruthy();
    expect(transform?.scale.toArray()).toEqual([
      entry?.scale,
      entry?.scale,
      entry?.scale,
    ]);
    expect(transform?.position.y).toBeCloseTo(entry?.gripOffsetY ?? 0, 12);
    expect(transform?.rotation.x).toBeCloseTo(Math.PI, 12);
    prop.dispose();
  });

  it("multiplies only the canonical registry scale for authored big variants", () => {
    const base = PROP_MODEL_REGISTRY[PropType.DOUBLESTAR];
    const big = resolveWorkerPropModel(PropType.BIGDOUBLESTAR);
    expect(base).toBeTruthy();
    expect(big?.entry).toEqual(base);
    expect(big?.scale).toBeCloseTo((base?.scale ?? 0) * 1.4, 12);
  });

  it("keeps fixed-size clubs independent of performer staff length", async () => {
    const short = await visual(PropType.CLUB, { length: 0.6 });
    const long = await visual(PropType.CLUB, { length: 1.2 });
    expect(boundsSize(short.root).toArray()).toEqual(
      boundsSize(long.root).toArray()
    );
    short.dispose();
    long.dispose();
  });

  it("stretches only the fire double staff's long axis to the staff length", async () => {
    const prop = await visual(PropType.FIRE_DOUBLE_STAFF, { length: 1.35 });
    const transform = prop.root.getObjectByName("worker-prop-model-transform");
    expect(transform?.scale.x).toBeCloseTo(1, 12);
    expect(transform?.scale.y).toBeCloseTo(1.35 / 0.9, 12);
    expect(transform?.scale.z).toBeCloseTo(1, 12);
    prop.dispose();

    const chicken = await visual(PropType.CHICKEN, { length: 1.35 });
    const chickenTransform = chicken.root.getObjectByName(
      "worker-prop-model-transform"
    );
    expect(chickenTransform?.scale.y).toBeCloseTo(
      chickenTransform?.scale.x ?? 0,
      12
    );
    chicken.dispose();
  });

  it("keeps the trail at the hand while rotating only the prop body", async () => {
    const prop = await visual(PropType.POI);
    const body = prop.root.getObjectByName("worker-prop-poi-rotated-body");
    const trail = prop.root.getObjectByName("worker-prop-poi-trail-indicator");
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      0.7
    );
    prop.setState({ worldRotation: rotation });
    expect(body?.quaternion.equals(new Quaternion())).toBe(false);
    expect(trail?.quaternion.equals(new Quaternion())).toBe(true);
    expect(trail?.position.toArray()).toEqual([0, 0, 0]);
    prop.dispose();
  });

  it("gives each hand its own stick, both stretched to the staff length", async () => {
    // Cast: the stick reaches scene-3d's PropType through the package patch.
    const stick = "stick" as PropType;
    const urls: Record<string, string> = {};
    for (const color of ["blue", "red"] as const) {
      const loadModel: WorkerPropModelLoader = vi.fn(async () => sourceModel());
      const prop = await visual(stick, { color, length: 1.35, loadModel });
      urls[color] = vi.mocked(loadModel).mock.calls[0]?.[0] ?? "";
      const transform = prop.root.getObjectByName("worker-prop-model-transform");
      expect(transform?.scale.y).toBeCloseTo(1.35 / 0.9, 12);
      expect(transform?.scale.x).toBeCloseTo(1, 12);
      prop.dispose();
    }
    expect(urls).toEqual({
      blue: "/models/props/stick.glb",
      red: "/models/props/stick-right.glb",
    });
  });

  it("loads each authored model from the canonical registry URL", async () => {
    const loadModel: WorkerPropModelLoader = vi.fn(async () => sourceModel());
    const result = await createWorkerPropVisual(
      options(PropType.CAPSULE_BATON, { loadModel })
    );
    expect(result.ok).toBe(true);
    expect(loadModel).toHaveBeenCalledWith(
      PROP_MODEL_REGISTRY[PropType.CAPSULE_BATON]?.modelUrl
    );
    if (result.ok) result.visual.dispose();
  });
});
