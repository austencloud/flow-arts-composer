import type { Object3D } from "three";
import { BoundedSourcePath3D } from "../scene-effects/bounded-source-path-3d";
import {
  isTrackedTip,
  type AnimalTipSource3D,
} from "../scene-effects/scene-effect-source-3d";
import type { Animal3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import { shouldResetEffectStateAtStepBoundary } from "#lib/shared/effects/domain/effect-step-boundary.js";
import { AnimalAnatomy3D } from "./animal-anatomy-3d";
import {
  applyAnimalSlither3D,
  animalSlitherMultiplier,
  createAnimalSpineDynamics3D,
  dampAnimalMotionBlend3D,
  stepAnimalSpineDynamics3D,
  writeAnimalRotationMinimizingFrames3D,
  type AnimalHeadFrameSeed3D,
  type AnimalSpineDynamics3D,
} from "./animal-spine-3d";

const PATH_CAPACITY = 384;
const MAX_SEGMENTS = 64;

interface AnimalState {
  path: BoundedSourcePath3D;
  params: Animal3DParams;
  seenEpoch: number;
  currentX: number;
  currentY: number;
  currentZ: number;
  motionBlend: number;
  lastStep: number;
  dynamics: AnimalSpineDynamics3D;
  resetDynamics: boolean;
  hasHeadFrame: boolean;
  headFrameSeed: AnimalHeadFrameSeed3D;
}

export class AnimalRenderer3D {
  private readonly anatomy = new AnimalAnatomy3D();
  private readonly states = new Map<number, AnimalState>();
  private readonly target = new Float32Array(MAX_SEGMENTS * 3);
  private readonly sampled = new Float32Array(MAX_SEGMENTS * 3);
  private readonly tangents = new Float32Array(MAX_SEGMENTS * 3);
  private readonly normals = new Float32Array(MAX_SEGMENTS * 3);
  private readonly binormals = new Float32Array(MAX_SEGMENTS * 3);
  private readonly frames = {
    tangents: this.tangents,
    normals: this.normals,
    binormals: this.binormals,
  };
  private clock = 0;
  private epoch = 0;

  initialize(parent: Object3D): void {
    this.anatomy.initialize(parent);
  }

  update(sources: readonly AnimalTipSource3D[], delta: number): void {
    const dt = Math.min(Math.max(delta, 0), 1 / 15);
    this.clock += dt;
    this.epoch++;
    for (const source of sources) {
      if (!isTrackedTip(source.params.trackingMode, source.tipIndex)) continue;
      let state = this.states.get(source.sourceId);
      if (!state) {
        state = {
          path: new BoundedSourcePath3D(PATH_CAPACITY),
          params: source.params,
          seenEpoch: this.epoch,
          currentX: source.position.x,
          currentY: source.position.y,
          currentZ: source.position.z,
          motionBlend: source.speed > 0.08 ? 1 : 0,
          lastStep: source.currentStep,
          dynamics: createAnimalSpineDynamics3D(MAX_SEGMENTS),
          resetDynamics: false,
          hasHeadFrame: false,
          headFrameSeed: { x: 0, y: 1, z: 0 },
        };
        this.states.set(source.sourceId, state);
      }
      // Scrubbing backward starts a different motion timeline. A seamless LOOP
      // keeps the body it carried through the closing count instead of visibly
      // rebuilding the creature on every pass.
      if (
        shouldResetEffectStateAtStepBoundary({
          previousStep: state.lastStep,
          currentStep: source.currentStep,
          totalSteps: source.totalSteps,
          seamlesslyLoopable: source.seamlesslyLoopable,
        })
      ) {
        state.path.clear();
        state.resetDynamics = true;
        state.hasHeadFrame = false;
      }
      state.params = source.params;
      state.seenEpoch = this.epoch;
      state.currentX = source.position.x;
      state.currentY = source.position.y;
      state.currentZ = source.position.z;
      state.motionBlend = dampAnimalMotionBlend3D(
        state.motionBlend,
        source.speed,
        dt
      );
      state.lastStep = source.currentStep;
      state.path.push(source.position, this.clock, source.speed, 0.028);
    }

    this.anatomy.beginFrame();
    for (const [sourceId, state] of this.states) {
      if (state.seenEpoch !== this.epoch) {
        this.states.delete(sourceId);
        continue;
      }
      const count = Math.min(
        MAX_SEGMENTS,
        Math.max(8, state.params.segmentCount)
      );
      this.sampleSpine(state, count, dt);
      this.anatomy.writeCreature({
        sourceId,
        params: state.params,
        clock: this.clock,
        motionBlend: state.motionBlend,
        sampled: this.sampled,
        frames: this.frames,
      });
    }
    this.anatomy.commit();
  }

  clear(): void {
    this.states.clear();
    this.anatomy.clear();
  }

  dispose(): void {
    this.anatomy.dispose();
  }

  private sampleSpine(state: AnimalState, count: number, delta: number): void {
    const { path, params } = state;
    // History is distance-throttled so the bounded buffer retains useful arc
    // length during slow movement. The head is not: it must remain pinned to
    // the live prop endpoint on every frame, including sub-threshold motion.
    this.target[0] = state.currentX;
    this.target[1] = state.currentY;
    this.target[2] = state.currentZ;
    const spacing = params.bodyLengthWorld / (count - 1);
    let written = 1;
    let targetDistance = spacing;
    let travelled = 0;
    let previousX = state.currentX;
    let previousY = state.currentY;
    let previousZ = state.currentZ;

    // Include the newest retained history point. When the current endpoint has
    // moved less than the path's sampling threshold, this first segment joins
    // the exact live head back to the most recent stored point.
    for (let offset = 0; offset < path.count && written < count; offset++) {
      const index = path.indexFromNewest(offset);
      const currentX = path.xAt(index);
      const currentY = path.yAt(index);
      const currentZ = path.zAt(index);
      const dx = currentX - previousX;
      const dy = currentY - previousY;
      const dz = currentZ - previousZ;
      const segmentLength = Math.hypot(dx, dy, dz);
      while (travelled + segmentLength >= targetDistance && written < count) {
        const amount =
          segmentLength > 0 ? (targetDistance - travelled) / segmentLength : 0;
        const i3 = written * 3;
        this.target[i3] = previousX + dx * amount;
        this.target[i3 + 1] = previousY + dy * amount;
        this.target[i3 + 2] = previousZ + dz * amount;
        written++;
        targetDistance += spacing;
      }
      travelled += segmentLength;
      previousX = currentX;
      previousY = currentY;
      previousZ = currentZ;
    }

    const pathTargetCount = written;
    while (written < count) {
      const previousIndex = (written - 1) * 3;
      const i3 = written * 3;
      // Missing path is not motion. Seed it downward for initialization and
      // let the persistent chain own it until real prop history reaches that
      // segment. Extending one fresh velocity vector through the whole body is
      // what made the tail spear diagonally at the start of B.
      this.target[i3] = this.target[previousIndex]!;
      this.target[i3 + 1] = this.target[previousIndex + 1]! - spacing;
      this.target[i3 + 2] = this.target[previousIndex + 2]!;
      written++;
    }

    const headFrameSeed = state.hasHeadFrame ? state.headFrameSeed : undefined;
    writeAnimalRotationMinimizingFrames3D(
      this.target,
      count,
      this.frames,
      headFrameSeed
    );
    applyAnimalSlither3D(
      this.target,
      count,
      this.frames,
      this.clock,
      spacing,
      params.slitherAmplitudeWorld * animalSlitherMultiplier(params.creature),
      state.motionBlend
    );
    stepAnimalSpineDynamics3D(
      state.dynamics,
      this.target,
      count,
      spacing,
      state.motionBlend,
      delta,
      state.resetDynamics,
      pathTargetCount
    );
    state.resetDynamics = false;
    for (let scalar = 0; scalar < count * 3; scalar++) {
      this.sampled[scalar] = state.dynamics.points[scalar]!;
    }

    // Orient anatomy from the final constrained curve and carry the head frame
    // through time so ornaments cannot roll 180 degrees near a vertical hold.
    writeAnimalRotationMinimizingFrames3D(
      this.sampled,
      count,
      this.frames,
      headFrameSeed
    );
    state.headFrameSeed.x = this.frames.normals[0]!;
    state.headFrameSeed.y = this.frames.normals[1]!;
    state.headFrameSeed.z = this.frames.normals[2]!;
    state.hasHeadFrame = true;
  }
}
