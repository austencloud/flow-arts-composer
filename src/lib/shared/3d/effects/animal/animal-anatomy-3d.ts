import type { Object3D } from "three";
import type { Animal3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import {
  ANIMAL_BLACK,
  ANIMAL_EYE_WHITE,
  AnimalInstanceWriter3D,
} from "./animal-instance-writer-3d";
import {
  animalBodyRadiusProfile,
  animalBuildMultiplier,
  type AnimalSpineFrameBuffers3D,
} from "./animal-spine-3d";
import { writeAnimalVariantAnatomy3D } from "./animal-variant-anatomy-3d";

export interface AnimalAnatomySource3D {
  sourceId: number;
  params: Animal3DParams;
  clock: number;
  motionBlend: number;
  sampled: Float32Array;
  frames: AnimalSpineFrameBuffers3D;
}

export class AnimalAnatomy3D {
  private readonly writer = new AnimalInstanceWriter3D();

  initialize(parent: Object3D): void {
    this.writer.initialize(parent);
  }

  beginFrame(): void {
    this.writer.beginFrame();
  }

  commit(): void {
    this.writer.commit();
  }

  clear(): void {
    this.writer.clear();
  }

  dispose(): void {
    this.writer.dispose();
  }

  writeCreature(source: AnimalAnatomySource3D): void {
    const { sourceId, params, sampled, frames, clock } = source;
    const w = this.writer;
    const count = Math.min(64, Math.max(8, params.segmentCount));
    w.setPalette(params);
    const alpha = 0.38 + params.intensity * 0.6;
    const highlightAlpha = 0.15 + params.intensity * 0.34;
    const baseRadius =
      params.baseRadiusWorld *
      (0.58 + params.intensity * 0.52) *
      animalBuildMultiplier(params.creature);
    const spacing = params.bodyLengthWorld / (count - 1);
    const visualStride = params.creature === "caterpillar" ? 4 : 1;

    for (let segment = 0; segment < count; segment++) {
      if (
        params.creature === "caterpillar" &&
        segment % visualStride !== 0 &&
        segment !== count - 1
      ) {
        continue;
      }
      const i3 = segment * 3;
      const progress = segment / (count - 1);
      const radius =
        baseRadius * animalBodyRadiusProfile(params.creature, progress);
      w.mixInto(
        w.segmentColor,
        w.bodyColor,
        w.bodyAlt,
        params.resolvedPalette.hueShift ? progress : 0
      );
      w.mixInto(
        w.coreColor,
        w.segmentColor,
        w.edgeColor,
        params.creature === "caterpillar" && segment % 4 === 0 ? 0.5 : 0.18
      );
      w.setFrame(frames, segment);
      const segmentLength =
        params.creature === "caterpillar"
          ? Math.max(radius * 0.7, spacing * visualStride * 0.72)
          : params.creature === "snake"
            ? Math.max(radius * 1.08, spacing * 1.12)
            : Math.max(radius * 1.08, spacing * 0.82);
      w.sphere(
        w.bodyNormal,
        sampled[i3]!,
        sampled[i3 + 1]!,
        sampled[i3 + 2]!,
        radius,
        segmentLength,
        radius * (params.creature === "caterpillar" ? 1.08 : 0.92),
        w.coreColor,
        alpha,
        w.orientation
      );

      // The offset ridge keeps dark palettes readable and joins the segmented
      // body into one visible volume without another geometry type.
      w.mixInto(
        w.highlightColor,
        w.edgeColor,
        ANIMAL_EYE_WHITE,
        params.resolvedPalette.emissive ? 0.18 : 0.06
      );
      const ridgeScale = params.creature === "caterpillar" ? 0.3 : 0.25;
      w.sphere(
        w.bodyEmissive,
        sampled[i3]! +
          frames.normals[i3]! * radius * 0.62 +
          frames.binormals[i3]! * radius * 0.16,
        sampled[i3 + 1]! +
          frames.normals[i3 + 1]! * radius * 0.62 +
          frames.binormals[i3 + 1]! * radius * 0.16,
        sampled[i3 + 2]! +
          frames.normals[i3 + 2]! * radius * 0.62 +
          frames.binormals[i3 + 2]! * radius * 0.16,
        radius * ridgeScale,
        segmentLength * 0.72,
        radius * ridgeScale,
        w.highlightColor,
        highlightAlpha * (1 - progress * 0.48),
        w.orientation
      );
      if (params.creature === "dragon" && segment > 1 && segment % 4 === 0) {
        this.writeDorsalScale(
          sampled,
          frames,
          segment,
          radius,
          highlightAlpha,
          true
        );
      }
    }

    const head = this.writeHead(source, baseRadius, alpha, highlightAlpha);
    writeAnimalVariantAnatomy3D({
      writer: w,
      params,
      sourceId,
      count,
      baseRadius,
      alpha,
      clock,
      motionBlend: source.motionBlend,
      sampled,
      frames,
      ...head,
    });
  }

  private writeDorsalScale(
    sampled: Float32Array,
    frames: AnimalSpineFrameBuffers3D,
    segment: number,
    radius: number,
    alpha: number,
    isDragon: boolean
  ): void {
    const w = this.writer;
    const i3 = segment * 3;
    w.setFrame(frames, segment);
    const stagger = segment % 2 === 0 ? 1 : -1;
    const height = isDragon ? 0.88 : 0.68;
    w.sphere(
      w.bodyEmissive,
      sampled[i3]! +
        frames.normals[i3]! * radius * height +
        frames.binormals[i3]! * radius * 0.1 * stagger,
      sampled[i3 + 1]! +
        frames.normals[i3 + 1]! * radius * height +
        frames.binormals[i3 + 1]! * radius * 0.1 * stagger,
      sampled[i3 + 2]! +
        frames.normals[i3 + 2]! * radius * height +
        frames.binormals[i3 + 2]! * radius * 0.1 * stagger,
      radius * (isDragon ? 0.3 : 0.18),
      radius * (isDragon ? 0.58 : 0.34),
      radius * 0.12,
      w.highlightColor,
      alpha * (isDragon ? 0.82 : 0.58),
      w.orientation
    );
  }

  private writeHead(
    source: AnimalAnatomySource3D,
    baseRadius: number,
    alpha: number,
    highlightAlpha: number
  ): { headX: number; headY: number; headZ: number; headRadius: number } {
    const { sourceId, params, sampled, frames, clock } = source;
    const w = this.writer;
    w.setFrame(frames, 0);
    const headRadius =
      baseRadius *
      (params.creature === "dragon"
        ? 1.42
        : params.creature === "caterpillar"
          ? 1.18
          : 1.08);
    // sampled[0] is the tracked prop endpoint. Keep the visible skull centered
    // on that contract instead of pushing it ahead of the source and making
    // the neck look like the thing attached to the prop.
    const headX = sampled[0]!;
    const headY = sampled[1]!;
    const headZ = sampled[2]!;
    w.mixInto(w.coreColor, w.bodyColor, w.edgeColor, 0.24);
    w.sphere(
      w.bodyNormal,
      headX,
      headY,
      headZ,
      headRadius * 0.94,
      headRadius * 1.46,
      headRadius * 0.84,
      w.coreColor,
      alpha,
      w.orientation
    );
    w.sphere(
      w.bodyEmissive,
      headX + w.normal.x * headRadius * 0.42,
      headY + w.normal.y * headRadius * 0.42,
      headZ + w.normal.z * headRadius * 0.42,
      headRadius * 0.5,
      headRadius * 0.84,
      headRadius * 0.22,
      w.highlightColor,
      highlightAlpha,
      w.orientation
    );

    w.mixInto(
      w.segmentColor,
      w.edgeColor,
      ANIMAL_EYE_WHITE,
      params.creature === "dragon" ? 0.58 : 0.36
    );
    for (const sign of [-1, 1] as const) {
      const eyeX =
        headX +
        w.tangent.x * headRadius * 0.55 +
        w.side.x * headRadius * 0.72 * sign +
        w.normal.x * headRadius * 0.22;
      const eyeY =
        headY +
        w.tangent.y * headRadius * 0.55 +
        w.side.y * headRadius * 0.72 * sign +
        w.normal.y * headRadius * 0.22;
      const eyeZ =
        headZ +
        w.tangent.z * headRadius * 0.55 +
        w.side.z * headRadius * 0.72 * sign +
        w.normal.z * headRadius * 0.22;
      w.sphere(
        w.bodyNormal,
        eyeX,
        eyeY,
        eyeZ,
        headRadius * 0.26,
        headRadius * 0.3,
        headRadius * 0.18,
        ANIMAL_BLACK,
        1,
        w.orientation
      );
      w.sphere(
        w.bodyEmissive,
        eyeX + w.side.x * sign * headRadius * 0.07,
        eyeY + w.side.y * sign * headRadius * 0.07,
        eyeZ + w.side.z * sign * headRadius * 0.07,
        headRadius * 0.17,
        headRadius * 0.2,
        headRadius * 0.11,
        w.segmentColor,
        0.96,
        w.orientation
      );
      w.sphere(
        w.bodyNormal,
        eyeX + w.side.x * sign * headRadius * 0.13,
        eyeY + w.side.y * sign * headRadius * 0.13,
        eyeZ + w.side.z * sign * headRadius * 0.13,
        headRadius * 0.055,
        headRadius * (params.creature === "caterpillar" ? 0.07 : 0.15),
        headRadius * 0.05,
        ANIMAL_BLACK,
        1,
        w.orientation
      );
    }

    const breath = 0.72 + Math.sin(clock * 3.4 + sourceId * 0.73) * 0.12;
    w.sphere(
      w.bodyEmissive,
      sampled[0]!,
      sampled[1]!,
      sampled[2]!,
      baseRadius * breath,
      baseRadius * breath,
      baseRadius * breath,
      w.highlightColor,
      highlightAlpha * 0.42
    );
    return { headX, headY, headZ, headRadius };
  }
}
