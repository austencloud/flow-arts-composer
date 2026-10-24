import { Matrix4, Quaternion, Vector3, type Object3D, type Scene } from "three";
import {
  clearCapturedPropTransforms,
  setCapturedPropTransforms,
} from "../effects/captured-prop-transforms";
import {
  findRenderedPropNodes,
  largestSkinnedMesh,
  posedBones,
  renderedPropBranches,
  type captureNativeFrame,
  type TransformSample,
} from "./native-capture";

export type CapturedPoseFrame = ReturnType<typeof captureNativeFrame>;

export interface CapturedPoseClip {
  frames: readonly CapturedPoseFrame[];
  durationSeconds: number;
  loop?: boolean;
}

interface Pose {
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

function pose(sample: TransformSample): Pose {
  if (
    ![...sample.position, ...sample.quaternion, ...sample.scale].every(
      Number.isFinite
    ) ||
    sample.scale.some((value) => value === 0)
  ) {
    throw new Error("Captured pose contains an invalid transform");
  }
  return {
    position: new Vector3(...sample.position),
    quaternion: new Quaternion(...sample.quaternion).normalize(),
    scale: new Vector3(...sample.scale),
  };
}

function matrix(value: Pose): Matrix4 {
  return new Matrix4().compose(value.position, value.quaternion, value.scale);
}

function matrixPose(value: Matrix4): Pose {
  const result = {
    position: new Vector3(),
    quaternion: new Quaternion(),
    scale: new Vector3(),
  };
  value.decompose(result.position, result.quaternion, result.scale);
  return result;
}

function relativeBone(child: Pose, parent: Pose): Pose {
  const inverse = parent.quaternion.clone().invert();
  // Match the native FTransform relative pose, including its scale convention.
  return {
    position: child.position
      .clone()
      .sub(parent.position)
      .applyQuaternion(inverse)
      .divide(parent.scale),
    quaternion: inverse.multiply(child.quaternion),
    scale: child.scale.clone().divide(parent.scale),
  };
}

function blend(
  a: Pose,
  b: Pose,
  alpha: number,
  rotation: "linear" | "spherical" = "linear"
): Pose {
  // FTransform::Blend normalizes a shortest-path linear quaternion blend.
  const weightA = (a.quaternion.dot(b.quaternion) < 0 ? -1 : 1) * (1 - alpha);
  const quaternion =
    rotation === "spherical"
      ? a.quaternion.clone().slerp(b.quaternion, alpha)
      : new Quaternion(
          a.quaternion.x * weightA + b.quaternion.x * alpha,
          a.quaternion.y * weightA + b.quaternion.y * alpha,
          a.quaternion.z * weightA + b.quaternion.z * alpha,
          a.quaternion.w * weightA + b.quaternion.w * alpha
        ).normalize();
  return {
    position: a.position.clone().lerp(b.position, alpha),
    quaternion,
    scale: a.scale.clone().lerp(b.scale, alpha),
  };
}

function write(object: Object3D, value: Pose): void {
  object.position.copy(value.position);
  object.quaternion.copy(value.quaternion);
  object.scale.copy(value.scale);
  object.updateMatrix();
}

function writeMatrix(object: Object3D, value: Matrix4): void {
  value.decompose(object.position, object.quaternion, object.scale);
  // A rotated prop under a scaled performer can have shear relative to its
  // sibling anchor. Keep that matrix intact until the render override ends.
  object.matrixAutoUpdate = false;
  object.matrix.copy(value);
  object.matrixWorldNeedsUpdate = true;
}

function localPose(object: Object3D): Pose {
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  };
}

/** Applies the native capture only for rendering; restore before the next live solver tick. */
export class CapturedPosePlayer {
  private readonly scene: Scene;
  private readonly performer: Object3D;
  private readonly effectsRoot: Object3D;
  private readonly bones: { object: Object3D; root: boolean }[];
  private readonly props: ReturnType<typeof findRenderedPropNodes>[];
  private readonly branches: Object3D[];
  private readonly effectTransforms: { bodyWorld: Matrix4; visible: boolean }[];
  private readonly hands: Object3D[] | undefined;
  private readonly samples: {
    bones: Pose[];
    props: { root: Pose; body: Pose }[];
    palms?: Vector3[];
    grips?: Vector3[];
    visibility: boolean[];
  }[];
  private saved: {
    object: Object3D;
    local: Pose;
    matrix: Matrix4;
    matrixAutoUpdate: boolean;
    visible: boolean;
  }[] = [];

  constructor(
    scene: Scene,
    performerId: string,
    private readonly clip: CapturedPoseClip
  ) {
    this.scene = scene;
    if (
      !Number.isFinite(clip.durationSeconds) ||
      clip.durationSeconds <= 0 ||
      !clip.frames.length
    )
      throw new Error("Captured pose needs frames and a positive duration");
    const performer = scene.getObjectByName(`PERFORMER_${performerId}`);
    const mesh = performer && largestSkinnedMesh(performer);
    if (!performer || !mesh)
      throw new Error(`Captured pose rig ${performerId} is missing`);
    this.performer = performer;
    // Avatar3D's named performer, prop branches and EffectsGroup are siblings
    // inside PerformerRig, rather than children of the named avatar group.
    this.effectsRoot = performer.parent!;
    const source = clip.frames[0]!.bones;
    const targets = posedBones(mesh);
    if (targets.length !== source.length)
      throw new Error("Captured pose has an incomplete bone hierarchy");
    const byName = new Map(targets.map((bone) => [bone.name, bone]));
    if (byName.size !== targets.length)
      throw new Error("Captured pose rig has duplicate bone names");
    const indices = new Map(source.map((bone, index) => [bone.name, index]));
    if (indices.size !== source.length)
      throw new Error("Captured pose has duplicate bone names");
    this.bones = source.map((bone, index) => {
      const object = byName.get(bone.name);
      const parent = object?.parent;
      const actualParent =
        parent && (parent as { isBone?: boolean }).isBone ? parent.name : null;
      if (
        !object ||
        actualParent !== bone.parent ||
        (bone.parent !== null && (indices.get(bone.parent) ?? index) >= index)
      )
        throw new Error(`Captured pose bone hierarchy differs at ${bone.name}`);
      return { object, root: bone.parent === null };
    });
    const handIndices = (["left", "right"] as const).map((side) =>
      source.findIndex((bone) =>
        (side === "left"
          ? /LeftHand$|^l_hand$|^hand\.L$/i
          : /RightHand$|^r_hand$|^hand\.R$/i
        ).test(bone.name)
      )
    );
    this.hands = handIndices.every((index) => index >= 0)
      ? handIndices.map((index) => this.bones[index]!.object)
      : undefined;
    this.branches = renderedPropBranches(performer);
    if (this.branches.length !== 2)
      throw new Error("Captured pose needs both rendered prop branches");
    this.props = this.branches.map((branch) =>
      findRenderedPropNodes(branch, performerId)
    );
    this.effectTransforms = this.props.map(() => ({
      bodyWorld: new Matrix4(),
      visible: false,
    }));
    this.samples = clip.frames.map((frame) => {
      if (frame.bones.length !== source.length)
        throw new Error("Captured pose has an incomplete bone frame");
      const components = frame.bones.map((bone, index) => {
        if (
          bone.name !== source[index]!.name ||
          bone.parent !== source[index]!.parent
        )
          throw new Error(`Captured pose bone order changed at ${index}`);
        return pose(bone.component);
      });
      const performerInverse = matrix(pose(frame.performerWorld)).invert();
      const palms =
        frame.palmLocal?.length === 6 && this.hands
          ? [0, 1].map((index) =>
              new Vector3().fromArray(frame.palmLocal!, index * 3)
            )
          : undefined;
      const grips = palms?.map((palm, index) => {
        const handWorld = matrix(pose(frame.performerWorld)).multiply(
          matrix(pose(frame.bones[handIndices[index]!]!.component))
        );
        const palmWorld = palm.clone().applyMatrix4(handWorld);
        const body = index === 0 ? frame.leftProp : frame.rightProp;
        return palmWorld.applyMatrix4(
          matrix(pose(body.rotatedBodyWorld)).invert()
        );
      });
      return {
        bones: components.map((component, index) => {
          const parent = source[index]!.parent;
          return parent === null
            ? component
            : relativeBone(component, components[indices.get(parent)!]!);
        }),
        props: [frame.leftProp, frame.rightProp].map((prop) => {
          const root = matrix(pose(prop.propRootWorld));
          return {
            root: matrixPose(performerInverse.clone().multiply(root)),
            // Source geometry already carries its reflection. Replaying the raw
            // body transform avoids applying the native FBX reflection twice.
            body: matrixPose(
              root
                .clone()
                .invert()
                .multiply(matrix(pose(prop.rotatedBodyWorld)))
            ),
          };
        }),
        palms,
        grips,
        visibility: frame.propVisibility.map(Boolean),
      };
    });
  }

  /** A prop model may finish loading after its branch first appears. */
  static canBind(scene: Scene, performerId: string): boolean {
    const performer = scene.getObjectByName(`PERFORMER_${performerId}`);
    if (!performer || !largestSkinnedMesh(performer)) return false;
    const branches = renderedPropBranches(performer);
    if (branches.length !== 2) return false;
    return branches.every((branch) => {
      try {
        findRenderedPropNodes(branch, performerId);
        return true;
      } catch (error) {
        if (
          error instanceof Error &&
          /^(Incomplete corrected prop tree|Animated prop root is missing|Rotated prop body is missing)/.test(
            error.message
          )
        )
          return false;
        throw error;
      }
    });
  }

  /** A replaced prop must be rebound before playback writes its next pose. */
  isAttached(): boolean {
    const within = (object: Object3D, ancestor: Object3D): boolean => {
      for (
        let current: Object3D | null = object;
        current;
        current = current.parent
      ) {
        if (current === ancestor) return true;
      }
      return false;
    };
    return (
      within(this.effectsRoot, this.scene) &&
      within(this.performer, this.effectsRoot) &&
      this.props.every(
        ({ propRoot, rotatedBody }, index) =>
          within(this.branches[index]!, this.effectsRoot) &&
          within(propRoot, this.branches[index]!) &&
          within(rotatedBody, propRoot)
      )
    );
  }

  apply(timeSeconds: number): void {
    this.restore();
    const objects = new Set([
      ...this.bones.map(({ object }) => object),
      ...this.props.flatMap(({ propRoot, rotatedBody }) => [
        propRoot,
        rotatedBody,
      ]),
      ...this.branches,
    ]);
    this.saved = [...objects].map((object) => {
      if (object.matrixAutoUpdate) object.updateMatrix();
      return {
        object,
        local: localPose(object),
        matrix: object.matrix.clone(),
        matrixAutoUpdate: object.matrixAutoUpdate,
        visible: object.visible,
      };
    });
    const safe = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    const duration = this.clip.durationSeconds;
    const loop = this.clip.loop !== false;
    const time = loop
      ? ((safe % duration) + duration) % duration
      : Math.max(0, Math.min(safe, duration));
    const frame = (time * this.samples.length) / duration;
    const a = Math.min(Math.floor(frame), this.samples.length - 1);
    const b = loop
      ? (a + 1) % this.samples.length
      : Math.min(a + 1, this.samples.length - 1);
    const alpha = Math.min(frame - a, 1);
    const first = this.samples[a]!;
    const second = this.samples[b]!;
    this.effectsRoot.updateWorldMatrix(true, true);
    this.bones.forEach(({ object, root }, index) => {
      let value = blend(first.bones[index]!, second.bones[index]!, alpha);
      if (root) {
        const world = this.performer.matrixWorld
          .clone()
          .multiply(matrix(value));
        value = matrixPose(
          object.parent!.matrixWorld.clone().invert().multiply(world)
        );
      }
      write(object, value);
    });
    this.effectsRoot.updateWorldMatrix(true, true);
    this.props.forEach(({ propRoot, rotatedBody }, index) => {
      const root = blend(
        first.props[index]!.root,
        second.props[index]!.root,
        alpha
      );
      const rootWorld = this.performer.matrixWorld
        .clone()
        .multiply(matrix(root));
      const bodyWorld = rootWorld
        .clone()
        .multiply(
          matrix(
            blend(
              first.props[index]!.body,
              second.props[index]!.body,
              alpha,
              "spherical"
            )
          )
        );
      if (
        this.hands &&
        first.palms &&
        second.palms &&
        first.grips &&
        second.grips
      ) {
        const palmWorld = first.palms[index]!.clone()
          .lerp(second.palms[index]!, alpha)
          .applyMatrix4(this.hands[index]!.matrixWorld);
        const gripWorld = first.grips[index]!.clone()
          .lerp(second.grips[index]!, alpha)
          .applyMatrix4(bodyWorld);
        const correction = palmWorld.sub(gripWorld);
        rootWorld.setPosition(
          new Vector3().setFromMatrixPosition(rootWorld).add(correction)
        );
        bodyWorld.setPosition(
          new Vector3().setFromMatrixPosition(bodyWorld).add(correction)
        );
      }
      propRoot.parent!.updateWorldMatrix(true, false);
      writeMatrix(
        propRoot,
        propRoot.parent!.matrixWorld.clone().invert().multiply(rootWorld)
      );
      rotatedBody.parent!.updateWorldMatrix(true, false);
      writeMatrix(
        rotatedBody,
        rotatedBody.parent!.matrixWorld.clone().invert().multiply(bodyWorld)
      );
      this.branches[index]!.visible = first.visibility[index]!;
    });
    this.effectsRoot.updateWorldMatrix(true, true);
    this.props.forEach(({ rotatedBody }, index) => {
      this.effectTransforms[index]!.bodyWorld.copy(rotatedBody.matrixWorld);
      this.effectTransforms[index]!.visible = this.branches[index]!.visible;
    });
    setCapturedPropTransforms(this.effectsRoot, this.effectTransforms);
  }

  restore(): void {
    clearCapturedPropTransforms(this.effectsRoot, this.effectTransforms);
    if (!this.saved.length) return;
    for (const {
      object,
      local,
      matrix: savedMatrix,
      matrixAutoUpdate,
      visible,
    } of this.saved) {
      write(object, local);
      object.matrix.copy(savedMatrix);
      object.matrixAutoUpdate = matrixAutoUpdate;
      object.visible = visible;
    }
    this.saved = [];
    this.effectsRoot.updateWorldMatrix(true, true);
  }
}
