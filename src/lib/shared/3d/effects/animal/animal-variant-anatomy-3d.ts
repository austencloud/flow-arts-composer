import type { Animal3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import {
  ANIMAL_TONGUE,
  type AnimalInstanceWriter3D,
} from "./animal-instance-writer-3d";
import {
  animalBodyRadiusProfile,
  type AnimalSpineFrameBuffers3D,
} from "./animal-spine-3d";

export interface AnimalVariantAnatomyContext3D {
  writer: AnimalInstanceWriter3D;
  params: Animal3DParams;
  sourceId: number;
  count: number;
  baseRadius: number;
  alpha: number;
  clock: number;
  motionBlend: number;
  sampled: Float32Array;
  frames: AnimalSpineFrameBuffers3D;
  headX: number;
  headY: number;
  headZ: number;
  headRadius: number;
}

export function writeAnimalVariantAnatomy3D(
  context: AnimalVariantAnatomyContext3D
): void {
  const { params } = context;
  if (params.creature === "dragon") {
    writeDragonHead(context);
    writeDragonBody(context);
  } else if (params.creature === "caterpillar") {
    writeCaterpillarAntennae(context);
    writeCaterpillarBody(context);
  } else {
    writeSnakeTongue(context);
  }
}

function writeDragonHead(context: AnimalVariantAnatomyContext3D): void {
  const { writer: w, headX, headY, headZ, headRadius: radius, alpha } = context;
  w.setFrame(context.frames, 0);
  for (const sign of [-1, 1] as const) {
    const rootX =
      headX - w.tangent.x * radius * 0.3 + w.side.x * radius * 0.52 * sign;
    const rootY =
      headY - w.tangent.y * radius * 0.3 + w.side.y * radius * 0.52 * sign;
    const rootZ =
      headZ - w.tangent.z * radius * 0.3 + w.side.z * radius * 0.52 * sign;
    w.rod(
      w.ornamentEmissive,
      rootX,
      rootY,
      rootZ,
      rootX -
        w.tangent.x * radius * 1.45 +
        w.normal.x * radius * 0.72 +
        w.side.x * radius * 0.44 * sign,
      rootY -
        w.tangent.y * radius * 1.45 +
        w.normal.y * radius * 0.72 +
        w.side.y * radius * 0.44 * sign,
      rootZ -
        w.tangent.z * radius * 1.45 +
        w.normal.z * radius * 0.72 +
        w.side.z * radius * 0.44 * sign,
      radius * 0.18,
      w.highlightColor,
      alpha
    );

    const whiskerRootX =
      headX + w.tangent.x * radius * 1.1 + w.side.x * radius * 0.45 * sign;
    const whiskerRootY =
      headY + w.tangent.y * radius * 1.1 + w.side.y * radius * 0.45 * sign;
    const whiskerRootZ =
      headZ + w.tangent.z * radius * 1.1 + w.side.z * radius * 0.45 * sign;
    w.rod(
      w.ornamentEmissive,
      whiskerRootX,
      whiskerRootY,
      whiskerRootZ,
      whiskerRootX +
        w.tangent.x * radius * 1.4 +
        w.side.x * radius * 1.55 * sign +
        w.normal.x * radius * 0.25,
      whiskerRootY +
        w.tangent.y * radius * 1.4 +
        w.side.y * radius * 1.55 * sign +
        w.normal.y * radius * 0.25,
      whiskerRootZ +
        w.tangent.z * radius * 1.4 +
        w.side.z * radius * 1.55 * sign +
        w.normal.z * radius * 0.25,
      radius * 0.075,
      w.highlightColor,
      alpha * 0.84
    );
  }
}

function writeDragonBody(context: AnimalVariantAnatomyContext3D): void {
  const { writer: w, sampled, frames, count, baseRadius, alpha } = context;
  const { tangents, normals, binormals } = frames;
  for (let segment = 6; segment < count - 4; segment += 6) {
    const i3 = segment * 3;
    const progress = segment / (count - 1);
    const radius = baseRadius * animalBodyRadiusProfile("dragon", progress);
    w.rod(
      w.ornamentEmissive,
      sampled[i3]! + normals[i3]! * radius * 0.55,
      sampled[i3 + 1]! + normals[i3 + 1]! * radius * 0.55,
      sampled[i3 + 2]! + normals[i3 + 2]! * radius * 0.55,
      sampled[i3]! +
        normals[i3]! * radius * 1.45 -
        tangents[i3]! * radius * 0.22,
      sampled[i3 + 1]! +
        normals[i3 + 1]! * radius * 1.45 -
        tangents[i3 + 1]! * radius * 0.22,
      sampled[i3 + 2]! +
        normals[i3 + 2]! * radius * 1.45 -
        tangents[i3 + 2]! * radius * 0.22,
      radius * 0.24,
      w.highlightColor,
      alpha * 0.45 * (1 - progress * 0.58)
    );
  }

  for (const segment of [14]) {
    if (segment >= count - 5) continue;
    const i3 = segment * 3;
    const radius =
      baseRadius * animalBodyRadiusProfile("dragon", segment / (count - 1));
    for (const sign of [-1, 1] as const) {
      const rootX = sampled[i3]! + binormals[i3]! * radius * 0.45 * sign;
      const rootY =
        sampled[i3 + 1]! + binormals[i3 + 1]! * radius * 0.45 * sign;
      const rootZ =
        sampled[i3 + 2]! + binormals[i3 + 2]! * radius * 0.45 * sign;
      const tipX =
        sampled[i3]! +
        binormals[i3]! * radius * 1.65 * sign -
        tangents[i3]! * radius * 0.35 +
        normals[i3]! * radius * 0.95;
      const tipY =
        sampled[i3 + 1]! +
        binormals[i3 + 1]! * radius * 1.65 * sign -
        tangents[i3 + 1]! * radius * 0.35 +
        normals[i3 + 1]! * radius * 0.95;
      const tipZ =
        sampled[i3 + 2]! +
        binormals[i3 + 2]! * radius * 1.65 * sign -
        tangents[i3 + 2]! * radius * 0.35 +
        normals[i3 + 2]! * radius * 0.95;
      const rearX =
        sampled[i3]! +
        binormals[i3]! * radius * 2.35 * sign -
        tangents[i3]! * radius * 2.4 +
        normals[i3]! * radius * 0.2;
      const rearY =
        sampled[i3 + 1]! +
        binormals[i3 + 1]! * radius * 2.35 * sign -
        tangents[i3 + 1]! * radius * 2.4 +
        normals[i3 + 1]! * radius * 0.2;
      const rearZ =
        sampled[i3 + 2]! +
        binormals[i3 + 2]! * radius * 2.35 * sign -
        tangents[i3 + 2]! * radius * 2.4 +
        normals[i3 + 2]! * radius * 0.2;
      w.rod(
        w.ornamentNormal,
        rootX,
        rootY,
        rootZ,
        tipX,
        tipY,
        tipZ,
        radius * 0.13,
        w.edgeColor,
        alpha * 0.76
      );
      w.rod(
        w.ornamentNormal,
        tipX,
        tipY,
        tipZ,
        rearX,
        rearY,
        rearZ,
        radius * 0.09,
        w.edgeColor,
        alpha * 0.7
      );
      w.rod(
        w.ornamentNormal,
        rearX,
        rearY,
        rearZ,
        rootX,
        rootY,
        rootZ,
        radius * 0.09,
        w.edgeColor,
        alpha * 0.7
      );
    }
  }
}

function writeCaterpillarAntennae(
  context: AnimalVariantAnatomyContext3D
): void {
  const { writer: w, headX, headY, headZ, headRadius: radius, alpha } = context;
  w.setFrame(context.frames, 0);
  for (const sign of [-1, 1] as const) {
    const tipX =
      headX +
      w.tangent.x * radius * 2 +
      w.side.x * radius * 1.05 * sign +
      w.normal.x * radius * 1.15;
    const tipY =
      headY +
      w.tangent.y * radius * 2 +
      w.side.y * radius * 1.05 * sign +
      w.normal.y * radius * 1.15;
    const tipZ =
      headZ +
      w.tangent.z * radius * 2 +
      w.side.z * radius * 1.05 * sign +
      w.normal.z * radius * 1.15;
    w.rod(
      w.ornamentNormal,
      headX + w.tangent.x * radius * 0.45 + w.side.x * radius * 0.35 * sign,
      headY + w.tangent.y * radius * 0.45 + w.side.y * radius * 0.35 * sign,
      headZ + w.tangent.z * radius * 0.45 + w.side.z * radius * 0.35 * sign,
      tipX,
      tipY,
      tipZ,
      radius * 0.1,
      w.edgeColor,
      alpha
    );
    w.sphere(
      w.bodyEmissive,
      tipX,
      tipY,
      tipZ,
      radius * 0.24,
      radius * 0.24,
      radius * 0.24,
      w.highlightColor,
      alpha
    );
  }
}

function writeCaterpillarBody(context: AnimalVariantAnatomyContext3D): void {
  const {
    writer: w,
    sampled,
    frames,
    count,
    baseRadius,
    alpha,
    clock,
    motionBlend,
  } = context;
  const { tangents, normals, binormals } = frames;
  for (let segment = 4; segment < count - 3; segment += 4) {
    const i3 = segment * 3;
    const radius =
      baseRadius *
      animalBodyRadiusProfile("caterpillar", segment / (count - 1));
    const walking =
      Math.sin(clock * 6 + segment * 0.9) * radius * 0.42 * motionBlend;
    for (const sign of [-1, 1] as const) {
      w.rod(
        w.ornamentNormal,
        sampled[i3]! +
          binormals[i3]! * radius * 0.62 * sign -
          normals[i3]! * radius * 0.28,
        sampled[i3 + 1]! +
          binormals[i3 + 1]! * radius * 0.62 * sign -
          normals[i3 + 1]! * radius * 0.28,
        sampled[i3 + 2]! +
          binormals[i3 + 2]! * radius * 0.62 * sign -
          normals[i3 + 2]! * radius * 0.28,
        sampled[i3]! +
          binormals[i3]! * radius * 1.25 * sign -
          normals[i3]! * radius * 0.85 +
          tangents[i3]! * walking,
        sampled[i3 + 1]! +
          binormals[i3 + 1]! * radius * 1.25 * sign -
          normals[i3 + 1]! * radius * 0.85 +
          tangents[i3 + 1]! * walking,
        sampled[i3 + 2]! +
          binormals[i3 + 2]! * radius * 1.25 * sign -
          normals[i3 + 2]! * radius * 0.85 +
          tangents[i3 + 2]! * walking,
        radius * 0.12,
        w.edgeColor,
        alpha * 0.9
      );
    }
  }
}

function writeSnakeTongue(context: AnimalVariantAnatomyContext3D): void {
  const {
    writer: w,
    sampled,
    sourceId,
    baseRadius: radius,
    alpha,
    clock,
  } = context;
  const phase = (clock + hashPhase(sourceId) * 3) % 3;
  if (phase > 0.66) return;
  w.setFrame(context.frames, 0);
  const extension = Math.sin((phase / 0.66) * Math.PI) * radius * 3.2;
  if (extension < radius * 0.15) return;
  const rootX = sampled[0]! + w.tangent.x * radius * 1.75;
  const rootY = sampled[1]! + w.tangent.y * radius * 1.75;
  const rootZ = sampled[2]! + w.tangent.z * radius * 1.75;
  const forkX = rootX + w.tangent.x * extension * 0.62;
  const forkY = rootY + w.tangent.y * extension * 0.62;
  const forkZ = rootZ + w.tangent.z * extension * 0.62;
  w.rod(
    w.ornamentNormal,
    rootX,
    rootY,
    rootZ,
    forkX,
    forkY,
    forkZ,
    radius * 0.07,
    ANIMAL_TONGUE,
    alpha
  );
  for (const sign of [-1, 1] as const) {
    w.rod(
      w.ornamentNormal,
      forkX,
      forkY,
      forkZ,
      rootX + w.tangent.x * extension + w.side.x * radius * 0.42 * sign,
      rootY + w.tangent.y * extension + w.side.y * radius * 0.42 * sign,
      rootZ + w.tangent.z * extension + w.side.z * radius * 0.42 * sign,
      radius * 0.055,
      ANIMAL_TONGUE,
      alpha
    );
  }
}

function hashPhase(sourceId: number): number {
  return (Math.imul(sourceId | 0, -1640531527) >>> 0) / 0xffffffff;
}
