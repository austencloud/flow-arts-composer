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
  ASTRAL_FAN_LED_COUNT,
  ASTRAL_FAN_LED_POINTS as LED_POINTS,
} from "../../domain/astral-fan-geometry";

export interface AstralFanLedColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface AstralFanLedPose {
  readonly worldRotation: { x: number; y: number; z: number; w: number };
}

export interface AstralFanLedFrame {
  readonly propState: AstralFanLedPose;
  readonly rigLocalCenter: { x: number; y: number; z: number };
  readonly ledColors: readonly AstralFanLedColor[];
  readonly brightness: number;
  readonly scale?: number;
}

const SURFACE_OFFSET_M = 0.014;
const HORIZONTAL_QUATERNION = new Quaternion().setFromEuler(
  new Euler(0, 0, Math.PI / 2)
);

const FACE_COUNT = 2;
const INSTANCE_COUNT = ASTRAL_FAN_LED_COUNT * FACE_COUNT;

/**
 * Live optical layer for Astral's 66-pixel fan. The GLB owns the diffuser tubes,
 * frame, and controller ring; this class places one addressable emitter on both
 * faces of each physical LED location so the fan reads correctly through turns.
 */
export class AstralFanLedRenderer3D {
  private core: InstancedMesh<SphereGeometry, MeshBasicMaterial> | null = null;
  private halo: InstancedMesh<SphereGeometry, MeshBasicMaterial> | null = null;
  private readonly rotation = new Quaternion();
  private readonly position = new Vector3();
  private readonly local = new Vector3();
  private readonly dummy = new Object3D();
  private readonly color = new Color();

  initialize(parent: Object3D): void {
    if (this.core) return;

    const coreGeometry = new SphereGeometry(0.0037, 10, 6);
    coreGeometry.name = "AstralFanLedCoreGeometry";
    const haloGeometry = new SphereGeometry(0.0072, 10, 6);
    haloGeometry.name = "AstralFanLedHaloGeometry";
    const coreMaterial = new MeshBasicMaterial({
      name: "AstralFanLedCoreMaterial",
      color: 0xffffff,
      vertexColors: false,
      toneMapped: false,
    });
    const haloMaterial = new MeshBasicMaterial({
      name: "AstralFanLedHaloMaterial",
      color: 0xffffff,
      vertexColors: false,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });

    this.core = new InstancedMesh(coreGeometry, coreMaterial, INSTANCE_COUNT);
    this.halo = new InstancedMesh(haloGeometry, haloMaterial, INSTANCE_COUNT);
    this.core.name = "AstralFanLedCores";
    this.halo.name = "AstralFanLedHalos";
    this.color.setRGB(1, 1, 1);
    for (let index = 0; index < INSTANCE_COUNT; index++) {
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

  update(frame: AstralFanLedFrame): void {
    if (!this.core || !this.halo) return;
    const scale = frame.scale ?? 1;
    this.position.set(
      frame.rigLocalCenter.x,
      frame.rigLocalCenter.y,
      frame.rigLocalCenter.z
    );
    this.rotation
      .set(
        frame.propState.worldRotation.x,
        frame.propState.worldRotation.y,
        frame.propState.worldRotation.z,
        frame.propState.worldRotation.w
      )
      .multiply(HORIZONTAL_QUATERNION);

    let instanceIndex = 0;
    for (const face of [-1, 1] as const) {
      for (let ledIndex = 0; ledIndex < LED_POINTS.length; ledIndex++) {
        const point = LED_POINTS[ledIndex]!;
        this.local
          .set(
            point.x * scale,
            point.y * scale,
            SURFACE_OFFSET_M * face * scale
          )
          .applyQuaternion(this.rotation);
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
