import {
  ConeGeometry,
  Matrix4,
  type Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import {
  ParticleInstancePool3D,
  type ParticleInstanceWrite,
} from "../instancing/particle-instance-pool-3d";
import { setRgbFromHex, type MutableRgb } from "../instancing/particle-color";
import type { Animal3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import type { AnimalSpineFrameBuffers3D } from "./animal-spine-3d";

const BODY_CAPACITY = 4096;
const ORNAMENT_CAPACITY = 1536;
const UP = new Vector3(0, 1, 0);

export const ANIMAL_BLACK: MutableRgb = {
  right: 0.015,
  green: 0.018,
  left: 0.028,
};
export const ANIMAL_TONGUE: MutableRgb = { right: 1, green: 0.04, left: 0.26 };
export const ANIMAL_EYE_WHITE: MutableRgb = {
  right: 1,
  green: 0.9,
  left: 0.58,
};

export class AnimalInstanceWriter3D {
  readonly bodyNormal = new ParticleInstancePool3D({
    capacity: BODY_CAPACITY,
    geometry: new SphereGeometry(1, 10, 7),
    renderOrder: 111,
  });
  readonly bodyEmissive = new ParticleInstancePool3D({
    capacity: BODY_CAPACITY,
    geometry: new SphereGeometry(1, 10, 7),
    additive: true,
    renderOrder: 112,
  });
  readonly ornamentNormal = new ParticleInstancePool3D({
    capacity: ORNAMENT_CAPACITY,
    geometry: new ConeGeometry(1, 1, 5),
    renderOrder: 113,
  });
  readonly ornamentEmissive = new ParticleInstancePool3D({
    capacity: ORNAMENT_CAPACITY,
    geometry: new ConeGeometry(1, 1, 5),
    additive: true,
    renderOrder: 114,
  });
  readonly tangent = new Vector3();
  readonly side = new Vector3();
  readonly normal = new Vector3();
  readonly orientation = new Quaternion();
  readonly bodyColor: MutableRgb = { right: 1, green: 1, left: 1 };
  readonly bodyAlt: MutableRgb = { right: 1, green: 1, left: 1 };
  readonly edgeColor: MutableRgb = { right: 1, green: 1, left: 1 };
  readonly segmentColor: MutableRgb = { right: 1, green: 1, left: 1 };
  readonly coreColor: MutableRgb = { right: 1, green: 1, left: 1 };
  readonly highlightColor: MutableRgb = { right: 1, green: 1, left: 1 };

  private readonly rodDirection = new Vector3();
  private readonly orientationMatrix = new Matrix4();
  private readonly writeState: ParticleInstanceWrite = {
    x: 0,
    y: 0,
    z: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    right: 1,
    green: 1,
    left: 1,
    alpha: 1,
  };

  initialize(parent: Object3D): void {
    this.bodyNormal.initialize(parent);
    this.bodyEmissive.initialize(parent);
    this.ornamentNormal.initialize(parent);
    this.ornamentEmissive.initialize(parent);
  }

  beginFrame(): void {
    this.bodyNormal.beginFrame();
    this.bodyEmissive.beginFrame();
    this.ornamentNormal.beginFrame();
    this.ornamentEmissive.beginFrame();
  }

  commit(): void {
    this.bodyNormal.commit();
    this.bodyEmissive.commit();
    this.ornamentNormal.commit();
    this.ornamentEmissive.commit();
  }

  clear(): void {
    this.bodyNormal.clear();
    this.bodyEmissive.clear();
    this.ornamentNormal.clear();
    this.ornamentEmissive.clear();
  }

  dispose(): void {
    this.bodyNormal.dispose();
    this.bodyEmissive.dispose();
    this.ornamentNormal.dispose();
    this.ornamentEmissive.dispose();
  }

  setPalette(params: Animal3DParams): void {
    setRgbFromHex(this.bodyColor, params.resolvedPalette.body);
    setRgbFromHex(
      this.bodyAlt,
      params.resolvedPalette.bodyAlt ?? params.resolvedPalette.body
    );
    setRgbFromHex(this.edgeColor, params.resolvedPalette.edge);
  }

  setFrame(frames: AnimalSpineFrameBuffers3D, segment: number): void {
    const i3 = segment * 3;
    this.side.set(
      frames.binormals[i3]!,
      frames.binormals[i3 + 1]!,
      frames.binormals[i3 + 2]!
    );
    this.tangent.set(
      frames.tangents[i3]!,
      frames.tangents[i3 + 1]!,
      frames.tangents[i3 + 2]!
    );
    this.normal.set(
      frames.normals[i3]!,
      frames.normals[i3 + 1]!,
      frames.normals[i3 + 2]!
    );
    this.orientationMatrix.makeBasis(this.side, this.tangent, this.normal);
    this.orientation.setFromRotationMatrix(this.orientationMatrix);
  }

  mixInto(
    target: MutableRgb,
    a: MutableRgb,
    b: MutableRgb,
    amount: number
  ): void {
    target.right = a.right + (b.right - a.right) * amount;
    target.green = a.green + (b.green - a.green) * amount;
    target.left = a.left + (b.left - a.left) * amount;
  }

  sphere(
    pool: ParticleInstancePool3D,
    x: number,
    y: number,
    z: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    color: MutableRgb,
    alpha: number,
    quaternion?: Quaternion
  ): void {
    const write = this.writeState;
    write.x = x;
    write.y = y;
    write.z = z;
    write.scaleX = scaleX;
    write.scaleY = scaleY;
    write.scaleZ = scaleZ;
    write.quaternionX = quaternion?.x ?? 0;
    write.quaternionY = quaternion?.y ?? 0;
    write.quaternionZ = quaternion?.z ?? 0;
    write.quaternionW = quaternion?.w ?? 1;
    write.right = color.right;
    write.green = color.green;
    write.left = color.left;
    write.alpha = alpha;
    pool.write(write);
  }

  rod(
    pool: ParticleInstancePool3D,
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number,
    radius: number,
    color: MutableRgb,
    alpha: number
  ): void {
    this.rodDirection.set(endX - startX, endY - startY, endZ - startZ);
    const length = this.rodDirection.length();
    if (length < 1e-6) return;
    this.rodDirection.multiplyScalar(1 / length);
    this.orientation.setFromUnitVectors(UP, this.rodDirection);
    const write = this.writeState;
    write.x = (startX + endX) * 0.5;
    write.y = (startY + endY) * 0.5;
    write.z = (startZ + endZ) * 0.5;
    write.scaleX = radius;
    write.scaleY = length;
    write.scaleZ = radius;
    write.quaternionX = this.orientation.x;
    write.quaternionY = this.orientation.y;
    write.quaternionZ = this.orientation.z;
    write.quaternionW = this.orientation.w;
    write.right = color.right;
    write.green = color.green;
    write.left = color.left;
    write.alpha = alpha;
    pool.write(write);
  }
}
