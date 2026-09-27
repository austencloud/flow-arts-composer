import { PropType } from "@austencloud/scene-3d";
import { DoubleSide, Euler, Group, Quaternion } from "three";
import { describe, expect, it } from "vitest";
import {
  WORKER_PERFORMER_PROP_TYPES,
  type WorkerPerformerSnapshot,
  type WorkerPropSnapshot,
} from "$lib/shared/3d/worker-renderer/domain/worker-renderer-protocol";
import { supportsWorkerPerformer } from "$lib/shared/3d/worker-renderer/services/worker-performer-snapshot";
import {
  createWorkerPerformerHoverMarker,
  createWorkerPerformerProp,
} from "$lib/shared/3d/worker-renderer/worlds/worker-performer";
import { EXACT_WORKER_PROP_TYPES } from "$lib/shared/3d/worker-renderer/worlds/props/worker-prop-factory";

const STATE: WorkerPropSnapshot = {
  centerPathAngle: 0.25,
  staffRotationAngle: 0.5,
  plane: "wall",
  handAnchor: [0.25, 0, 0.4],
  flipped: false,
  worldPosition: [1, 2, 3],
  worldRotation: [0, 0, 0, 1],
  gripType: "square",
};

function snapshot(
  propType: WorkerPerformerSnapshot["leftPropType"] = "staff"
): WorkerPerformerSnapshot {
  return {
    id: "prop-test",
    avatarId: "x-bot",
    position: [0, 0, 0],
    facingAngle: 0,
    avatarHeightCm: 190.5,
    groundY: -1.5,
    staffLength: 0.86,
    staffThickness: 0.0125,
    propBuild: {
      finish: "fire",
      fanBuild: "pictograph",
      fanFrameColor: "black",
      fanCover: "bare",
    },
    leftPropType: propType,
    rightPropType: propType,
    leftProp: STATE,
    rightProp: STATE,
    stanceYaw: 0,
    stanceSegments: null,
    spinePitchOffset: 0,
  };
}

describe("worker performer prop geometry", () => {
  it("enumerates the complete canonical worker-safe prop surface", () => {
    expect(WORKER_PERFORMER_PROP_TYPES).toEqual(EXACT_WORKER_PROP_TYPES);

    for (const propType of WORKER_PERFORMER_PROP_TYPES) {
      expect(
        supportsWorkerPerformer({
          leftPropType: propType,
          rightPropType: propType,
        }),
        propType
      ).toBe(true);
    }
  });

  it("covers every production prop with the exact worker factory", () => {
    const supported = new Set<string>(WORKER_PERFORMER_PROP_TYPES);
    const unsupported = Object.values(PropType).filter(
      (propType) => !supported.has(propType)
    );
    expect(unsupported).toEqual([]);
  });

  it.each(["staff", "simple_staff", "staff_v2", "bigstaff"] as const)(
    "routes %s through the canonical staff object",
    async (propType) => {
      const prop = await createWorkerPerformerProp("left", snapshot(propType));

      expect(prop.visual?.root.name).toBe("staff-blue");
      expect(
        prop.correction.getObjectByName("staff-rotated-body")
      ).toBeTruthy();
      expect(prop.correction.getObjectByName("staff-thumb-end")).toBeTruthy();
      expect(
        prop.correction.getObjectByName("staff-trail-indicator")
      ).toBeTruthy();
      expect(prop.anchor.position.toArray()).toEqual([1.25, 2, 3.4]);

      prop.dispose();
      expect(prop.anchor.children).toHaveLength(0);
    }
  );

  it("keeps bare hands in the IK path without mounting a prop mesh", async () => {
    const prop = await createWorkerPerformerProp("right", snapshot("hand"));

    expect(prop.visual.source).toBe("hand");
    expect(prop.visual.root.children).toHaveLength(0);
    expect(prop.anchor.visible).toBe(true);
    expect(prop.anchor.position.toArray()).toEqual([1.25, 2, 3.4]);

    prop.setSnapshot(null);
    expect(prop.anchor.visible).toBe(false);
  });

  it("preserves the canonical rotation composition and red-hand palette", async () => {
    const prop = await createWorkerPerformerProp("right", snapshot());
    const rotation = new Quaternion().setFromEuler(new Euler(0.2, -0.3, 0.4));
    prop.setSnapshot({ ...STATE, worldRotation: rotation.toArray() });

    expect(prop.visual?.root.name).toBe("staff-red");
    const body = prop.correction.getObjectByName("staff-rotated-body");
    const expected = rotation
      .clone()
      .multiply(new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2)));
    expect(body?.quaternion.angleTo(expected)).toBeCloseTo(0, 8);
  });

  it("applies Buugeng chirality at the canonical correction group", async () => {
    const prop = await createWorkerPerformerProp("left", snapshot("staff"));

    prop.setSnapshot({ ...STATE, flipped: true });

    expect(prop.correction.scale.x).toBe(-1);
  });

  it("rejects an invalid snapshot at the renderer boundary", async () => {
    const invalid = {
      ...snapshot(),
      leftPropType: "not-a-prop",
    } as unknown as WorkerPerformerSnapshot;

    await expect(createWorkerPerformerProp("left", invalid)).rejects.toThrow(
      "does not yet own exact not-a-prop geometry"
    );
  });

  it("detaches the canonical prop graph during disposal", async () => {
    const parent = new Group();
    const prop = await createWorkerPerformerProp("left", snapshot());
    parent.add(prop.anchor);

    prop.dispose();

    expect(prop.anchor.parent).toBeNull();
    expect(parent.children).toHaveLength(0);
    expect(prop.anchor.children).toHaveLength(0);
  });

  it("matches the exact hover and dragging ring at the rendered ground point", () => {
    const marker = createWorkerPerformerHoverMarker();
    marker.update(
      {
        groundPosition: [6, -1.2, 7],
        color: 0x3b82f6,
        selected: false,
        allPerformersSelected: false,
        present: true,
        pulsePhase: 0,
        hovered: true,
        dragging: false,
      },
      [6, 0.3, 7]
    );

    expect(marker.mesh.geometry.parameters).toMatchObject({
      innerRadius: 0.48,
      outerRadius: 0.64,
      thetaSegments: 48,
    });
    expect(marker.mesh.position.toArray()).toEqual([0, -1.48, 0]);
    expect(marker.mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(marker.material.side).toBe(DoubleSide);
    expect(marker.material.depthWrite).toBe(false);
    expect(marker.material.opacity).toBe(0.55);
    expect(marker.mesh.visible).toBe(true);

    marker.update(
      {
        groundPosition: [6, -1.2, 7],
        color: 0x3b82f6,
        selected: false,
        allPerformersSelected: false,
        present: true,
        pulsePhase: 0,
        hovered: false,
        dragging: true,
      },
      [6, 0.3, 7]
    );
    expect(marker.material.opacity).toBe(0.86);
    marker.dispose();
  });
});
