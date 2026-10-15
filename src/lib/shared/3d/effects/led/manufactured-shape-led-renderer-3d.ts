import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";

import {
  manufacturedShapeLedPoints,
  TRIQUETRA_LED_COUNT,
  type ManufacturedLedShapeKind,
  type ManufacturedTriangleGrip,
} from "../../domain/manufactured-shape-geometry";
import { TRIANGLE_STATIONS_M } from "#lib/shared/pictograph/prop/domain/hoop-family-geometry.generated.js";

export interface ManufacturedShapeLedColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface ManufacturedShapeLedFrame {
  readonly kind: ManufacturedLedShapeKind;
  readonly triangleGrip?: ManufacturedTriangleGrip;
  readonly propState: {
    readonly worldRotation: { x: number; y: number; z: number; w: number };
  };
  readonly rigLocalCenter: { x: number; y: number; z: number };
  readonly ledColors: readonly ManufacturedShapeLedColor[];
  readonly brightness: number;
  readonly scale?: number;
}

const TRIQUETRA_SURFACE_OFFSET_M = 0.016;
const HORIZONTAL_QUATERNION = new Quaternion().setFromEuler(
  new Euler(0, 0, Math.PI / 2)
);
const SHAPE_POINTS = {
  triquetra: manufacturedShapeLedPoints("triquetra"),
  triquetra2: manufacturedShapeLedPoints("triquetra2"),
  triangle: manufacturedShapeLedPoints("triangle", "corner"),
  triangle_side: manufacturedShapeLedPoints("triangle", "side"),
};
const MAX_INSTANCE_COUNT = TRIQUETRA_LED_COUNT * 2;

/** Live, two-sided emitters aligned to the manufactured LED shape GLB. */
export class ManufacturedShapeLedRenderer3D {
  private core: InstancedMesh<SphereGeometry, MeshBasicMaterial> | null = null;
  private halo: InstancedMesh<SphereGeometry, MeshBasicMaterial> | null = null;
  private readonly propRotation = new Quaternion();
  private readonly position = new Vector3();
  private readonly local = new Vector3();
  private readonly dummy = new Object3D();
  private readonly color = new Color();

  initialize(parent: Object3D): void {
    if (this.core) return;
    const coreMaterial = new MeshBasicMaterial({
      name: "ManufacturedShapeLedCoreMaterial",
      color: 0xffffff,
      toneMapped: false,
    });
    const haloMaterial = new MeshBasicMaterial({
      name: "ManufacturedShapeLedHaloMaterial",
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.core = new InstancedMesh(
      new SphereGeometry(0.004, 10, 6),
      coreMaterial,
      MAX_INSTANCE_COUNT
    );
    this.halo = new InstancedMesh(
      new SphereGeometry(0.008, 10, 6),
      haloMaterial,
      MAX_INSTANCE_COUNT
    );
    this.core.name = "ManufacturedShapeLedCores";
    this.halo.name = "ManufacturedShapeLedHalos";
    this.color.setRGB(1, 1, 1);
    for (let index = 0; index < MAX_INSTANCE_COUNT; index++) {
      this.core.setColorAt(index, this.color);
      this.halo.setColorAt(index, this.color);
    }
    for (const mesh of [this.core, this.halo]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 100;
      mesh.visible = false;
      parent.add(mesh);
    }
  }

  update(frame: ManufacturedShapeLedFrame): void {
    if (!this.core || !this.halo) return;
    const points =
      SHAPE_POINTS[
        frame.kind === "triangle" && frame.triangleGrip === "side"
          ? "triangle_side"
          : frame.kind
      ];
    const scale = frame.scale ?? 1;
    const surfaceOffset =
      frame.kind === "triangle"
        ? TRIANGLE_STATIONS_M.tubeRadius + 0.0015
        : TRIQUETRA_SURFACE_OFFSET_M;
    this.position.set(
      frame.rigLocalCenter.x,
      frame.rigLocalCenter.y,
      frame.rigLocalCenter.z
    );
    this.propRotation
      .set(
        frame.propState.worldRotation.x,
        frame.propState.worldRotation.y,
        frame.propState.worldRotation.z,
        frame.propState.worldRotation.w
      )
      .multiply(HORIZONTAL_QUATERNION);
    let instanceIndex = 0;
    for (const face of [-1, 1] as const) {
      for (let ledIndex = 0; ledIndex < points.length; ledIndex++) {
        const point = points[ledIndex]!;
        this.local.set(point.x, point.y, point.z + surfaceOffset * face);
        this.local.multiplyScalar(scale).applyQuaternion(this.propRotation);
        this.dummy.position.copy(this.position).add(this.local);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        this.core.setMatrixAt(instanceIndex, this.dummy.matrix);
        this.halo.setMatrixAt(instanceIndex, this.dummy.matrix);

        const source = frame.ledColors[ledIndex];
        const strength = Math.max(0, frame.brightness);
        this.color.setRGB(
          (source?.r ?? 0) * strength * 2.4,
          (source?.g ?? 0) * strength * 2.4,
          (source?.b ?? 0) * strength * 2.4
        );
        this.core.setColorAt(instanceIndex, this.color);
        this.halo.setColorAt(instanceIndex, this.color);
        instanceIndex++;
      }
    }
    this.core.count = instanceIndex;
    this.halo.count = instanceIndex;
    this.core.instanceMatrix.needsUpdate = true;
    this.halo.instanceMatrix.needsUpdate = true;
    if (this.core.instanceColor) this.core.instanceColor.needsUpdate = true;
    if (this.halo.instanceColor) this.halo.instanceColor.needsUpdate = true;
    const visible = frame.brightness > 0;
    this.core.visible = visible;
    this.halo.visible = visible;
  }

  reset(): void {
    if (this.core) this.core.visible = false;
    if (this.halo) this.halo.visible = false;
  }

  dispose(): void {
    for (const mesh of [this.core, this.halo]) {
      if (!mesh) continue;
      mesh.removeFromParent();
      mesh.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.core = null;
    this.halo = null;
  }
}
