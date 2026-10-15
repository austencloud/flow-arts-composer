import {
  Quaternion,
  Vector3,
  type Bone,
  type Object3D,
  type Scene,
  type SkinnedMesh,
} from "three";

export interface TransformSample {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

function localTransform(object: Object3D): TransformSample {
  return {
    position: object.position.toArray() as [number, number, number],
    quaternion: object.quaternion.toArray() as [number, number, number, number],
    scale: object.scale.toArray() as [number, number, number],
  };
}

function worldTransform(object: Object3D): TransformSample {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  object.matrixWorld.decompose(position, quaternion, scale);
  return {
    position: position.toArray() as [number, number, number],
    quaternion: quaternion.toArray() as [number, number, number, number],
    scale: scale.toArray() as [number, number, number],
  };
}

/** GLB skins may omit unweighted ancestors from skeleton.bones. Their local
 * transforms still drive every descendant, so include the complete bone chain. */
function posedBones(mesh: SkinnedMesh): Bone[] {
  const result: Bone[] = [];
  const seen = new Set<Bone>();
  function include(bone: Bone): void {
    const parent = bone.parent;
    if (parent && (parent as Bone).isBone) include(parent as Bone);
    if (!seen.has(bone)) {
      seen.add(bone);
      result.push(bone);
    }
  }
  for (const bone of mesh.skeleton.bones) include(bone);
  return result;
}

function boneSamples(mesh: SkinnedMesh) {
  return posedBones(mesh).map((bone) => ({
    name: bone.name,
    parent: (bone.parent as Bone | null)?.isBone ? bone.parent!.name : null,
    local: localTransform(bone),
  }));
}

function containsMesh(root: Object3D, skinned: boolean): boolean {
  let found = false;
  root.traverse((object) => {
    if (
      Boolean((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) ===
        skinned &&
      (object as { isMesh?: boolean }).isMesh
    )
      found = true;
  });
  return found;
}

/** The first direct child of ancestor containing target. */
function directChild(ancestor: Object3D, target: Object3D): Object3D {
  let child = target;
  while (child.parent && child.parent !== ancestor) child = child.parent;
  if (child.parent !== ancestor)
    throw new Error("Performer is outside its rig root");
  return child;
}

function renderedPropBranches(performer: Object3D): Object3D[] {
  const rig = performer.parent;
  if (!rig) return [];
  const avatarBranch = directChild(rig, performer);
  return rig.children.filter(
    (child) =>
      child !== avatarBranch &&
      containsMesh(child, false) &&
      !containsMesh(child, true)
  );
}

export function productionRigReady(scene: Scene, id: string): boolean {
  const performer = scene.getObjectByName(`PERFORMER_${id}`);
  if (!performer || renderedPropBranches(performer).length !== 2) return false;
  let skinned = false;
  performer.traverse((object) => {
    if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned = true;
  });
  return skinned;
}

export function captureNativeFrame(
  scene: Scene,
  id: string,
  frame: number,
  score: number
) {
  scene.updateMatrixWorld(true);
  const performer = scene.getObjectByName(`PERFORMER_${id}`);
  if (!performer || !performer.parent) {
    const names: string[] = [];
    scene.traverse((object) => {
      if (object.name.startsWith("PERFORMER_")) names.push(object.name);
    });
    throw new Error(
      `Production rig ${id} is not rendered; found ${names.join(", ") || "none"}`
    );
  }
  let skinned: SkinnedMesh | null = null;
  performer.traverse((object) => {
    const mesh = object as SkinnedMesh;
    if (
      mesh.isSkinnedMesh &&
      (!skinned || mesh.skeleton.bones.length > skinned.skeleton.bones.length)
    )
      skinned = mesh;
  });
  if (!skinned || skinned.skeleton.bones.length === 0)
    throw new Error(`Production rig ${id} has no skinned bones`);

  // PerformerRig renders the avatar, then blue/left and red/right hand trees.
  // The prop tree is HandAnchor -> PropAnchor -> correction -> Prop3D.
  const propBranches = renderedPropBranches(performer);
  if (propBranches.length !== 2)
    throw new Error(
      `Expected two rendered prop branches for ${id}, found ${propBranches.length}`
    );

  const prop = (branch: Object3D) => {
    const anchor = branch.children[0];
    const correction = anchor?.children[0];
    if (!anchor || !correction || !containsMesh(correction, false))
      throw new Error(`Incomplete corrected prop tree for ${id}`);
    const propRoot = correction.children.find((child) =>
      containsMesh(child, false)
    );
    if (!propRoot) throw new Error(`Animated prop root is missing for ${id}`);
    const meshes: { name: string; world: TransformSample }[] = [];
    correction.traverse((object) => {
      if (
        (object as { isMesh?: boolean }).isMesh &&
        !(object as { isSkinnedMesh?: boolean }).isSkinnedMesh
      )
        meshes.push({ name: object.name, world: worldTransform(object) });
    });
    return {
      correctionWorld: worldTransform(correction),
      propRootWorld: worldTransform(propRoot),
      renderedMeshes: meshes,
    };
  };

  return {
    frame,
    timeSeconds: frame / 30,
    score,
    performerWorld: worldTransform(performer),
    skinnedMeshLocal: localTransform(skinned),
    bones: boneSamples(skinned),
    leftProp: prop(propBranches[0]!),
    rightProp: prop(propBranches[1]!),
  };
}

/** The mounted rig has no props; capture its posed skin and the live pedal basis. */
export function captureMountedFrame(scene: Scene, id: string, frame: number) {
  scene.updateMatrixWorld(true);
  const performer = scene.getObjectByName(`PERFORMER_${id}`);
  if (!performer) throw new Error(`Mounted rig ${id} is not rendered`);
  let mesh: SkinnedMesh | null = null;
  performer.traverse((object) => {
    const candidate = object as SkinnedMesh;
    if (
      candidate.isSkinnedMesh &&
      (!mesh || candidate.skeleton.bones.length > mesh.skeleton.bones.length)
    )
      mesh = candidate;
  });
  if (!mesh) throw new Error(`Mounted rig ${id} has no skinned mesh`);
  const rootBones = posedBones(mesh).filter(
    (bone) => !(bone.parent as Bone | null)?.isBone
  );
  if (rootBones.length !== 1 || !rootBones[0].parent)
    throw new Error(`Mounted rig ${id} needs one parented root bone`);
  const left = scene.getObjectByName("FFS_EUC_LeftPedalCapture");
  const right = scene.getObjectByName("FFS_EUC_RightPedalCapture");
  if (!left || !right) throw new Error("Mounted pedal anchors are missing");
  return {
    frame,
    timeSeconds: frame / 30,
    performerWorld: worldTransform(performer),
    skinnedMeshLocal: localTransform(mesh),
    // Avatar3D normalizes height on a non-bone ancestor. Mesh-local TRS does
    // not include that scale or the ancestor offset needed to reproduce IK.
    boneRootParentWorld: worldTransform(rootBones[0].parent),
    rootBone: rootBones[0].name,
    bones: boneSamples(mesh),
    leftPedalWorld: worldTransform(left),
    rightPedalWorld: worldTransform(right),
  };
}
