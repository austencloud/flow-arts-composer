import { Quaternion, Vector3 } from "three";
import {
  createPetalBody,
  resolvePetalShape,
  stepPetalBody,
  type PetalBody,
} from "#lib/shared/effects/domain/petal-aero.js";
import { samplePetalAirflow3D } from "#lib/shared/effects/domain/petal-airflow.js";
import type { PetalSpriteShape } from "#lib/shared/effects/domain/petal-palettes.js";
import type { Petals3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";

// The unpooled meshes use the same falling-plate physics as the pooled renderer.
export function createFallbackPetalBody(
  params: Petals3DParams,
  shape: PetalSpriteShape,
  size: number,
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  random: () => number = Math.random
): PetalBody {
  const fallSpeed = params.fallBaseSpeed * (0.3 + 0.7 * params.fallSpeed);
  const body = createPetalBody(
    resolvePetalShape(
      shape,
      size,
      { fallSpeed, sway: params.swayAmplitude, streak: params.streakLength },
      random
    )
  );
  const axis = new Vector3(random() - 0.5, random() - 0.5, random() - 0.5);
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  const rotation = new Quaternion().setFromAxisAngle(
    axis.normalize(),
    random() * Math.PI * 2
  );
  Object.assign(body, {
    x: position.x,
    y: position.y,
    z: position.z,
    vx: velocity.x,
    vy: velocity.y,
    vz: velocity.z,
    qx: rotation.x,
    qy: rotation.y,
    qz: rotation.z,
    qw: rotation.w,
  });
  return body;
}

export function advanceFallbackPetalBody(
  body: PetalBody,
  time: number,
  delta: number
): void {
  const air = samplePetalAirflow3D(body.x, body.y, body.z, time, {
    x: 0,
    y: 0,
    z: 0,
  });
  stepPetalBody(body, air.x, air.y, air.z, delta);
}
