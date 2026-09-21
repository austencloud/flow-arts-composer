<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import { TransformControls } from "@threlte/extras";
  import { Group, Vector3, type Bone, type Object3D } from "three";

  import type { PoseHandle, TeachingPose } from "./isolation-teaching";

  interface Props {
    root: Object3D | null;
    pose: TeachingPose;
    selected: PoseHandle;
    visible: boolean;
    hand?: "left" | "right";
    tipPosition: readonly [number, number, number];
    /** The unmodified tip position for the current frozen pose. */
    tipOrigin: readonly [number, number, number];
    onBegin: () => void;
    onChange: (changes: Partial<TeachingPose>) => void;
    onEnd: () => void;
  }

  let {
    root,
    pose,
    selected,
    visible,
    hand = "right",
    tipPosition,
    tipOrigin,
    onBegin,
    onChange,
    onEnd,
  }: Props = $props();

  const chestProxy = new Group();
  const pelvisProxy = new Group();
  const elbowProxy = new Group();
  const tipProxy = new Group();
  const chestWorld = new Vector3();
  const shoulderWorld = new Vector3();
  const hipsWorld = new Vector3();
  const tipWorld = new Vector3();
  const pelvisBase = new Vector3();
  let cachedRoot: Object3D | null = null;
  let spine2: Bone | null = null;
  let hips: Bone | null = null;
  let arm: Bone | null = null;
  let cachedHand: "left" | "right" = hand;
  let dragging = false;

  function findBone(suffix: RegExp): Bone | null {
    let result: Bone | null = null;
    root?.traverse((object) => {
      if (!result && (object as Bone).isBone && suffix.test(object.name)) {
        result = object as Bone;
      }
    });
    return result;
  }

  function refreshBones(): void {
    if (root === cachedRoot && hand === cachedHand) return;
    cachedRoot = root;
    cachedHand = hand;
    spine2 = findBone(/Spine2$/i);
    hips = findBone(/Hips$/i);
    arm = findBone(hand === "left" ? /LeftArm$/i : /RightArm$/i);
    pelvisBase.set(0, 0, 0);
  }

  function selectedProxy(): Group {
    if (selected === "chest") return chestProxy;
    if (selected === "pelvis") return pelvisProxy;
    if (selected === "elbow") return elbowProxy;
    return tipProxy;
  }

  function syncProxies(): void {
    refreshBones();
    if (dragging || !root) return;

    if (spine2) {
      spine2.getWorldPosition(chestWorld);
      chestProxy.position.copy(chestWorld);
    }
    chestProxy.rotation.set(pose.pitch, pose.turn, pose.lean, "YXZ");

    const pelvisOffset = new Vector3(pose.pelvisX, pose.pelvisY, pose.pelvisZ);
    if (hips) {
      hips.getWorldPosition(hipsWorld);
      // The rig may already include the authored offset. Subtract it before
      // placing the proxy so re-rendering never makes a drag compound itself.
      pelvisBase.copy(hipsWorld).sub(pelvisOffset);
    }
    pelvisProxy.position.copy(pelvisBase).add(pelvisOffset);

    if (arm) arm.getWorldPosition(shoulderWorld);
    elbowProxy.position
      .copy(shoulderWorld)
      .addScaledVector(new Vector3(pose.elbowX, pose.elbowY, pose.elbowZ), 0.25);

    tipWorld.set(tipPosition[0], tipPosition[1], tipPosition[2]);
    tipProxy.position.copy(tipWorld);
  }

  function begin(): void {
    dragging = true;
    onBegin();
  }

  function changeChest(): void {
    onChange({
      pitch: chestProxy.rotation.x,
      turn: chestProxy.rotation.y,
      lean: chestProxy.rotation.z,
    });
  }

  function changePelvis(): void {
    const offset = pelvisProxy.position.clone().sub(pelvisBase);
    onChange({ pelvisX: offset.x, pelvisY: offset.y, pelvisZ: offset.z });
  }

  function changeElbow(): void {
    const offset = elbowProxy.position.clone().sub(shoulderWorld);
    onChange({ elbowX: offset.x / 0.25, elbowY: offset.y / 0.25, elbowZ: offset.z / 0.25 });
  }

  function changeTip(): void {
    const offset = tipProxy.position.clone().sub(new Vector3(...tipOrigin));
    onChange({ tipX: offset.x, tipY: offset.y, tipZ: offset.z });
  }

  function changeSelected(): void {
    if (!dragging) return;
    if (selected === "chest") changeChest();
    else if (selected === "pelvis") changePelvis();
    else if (selected === "elbow") changeElbow();
    else changeTip();
  }

  function end(): void {
    if (!dragging) return;
    dragging = false;
    onEnd();
  }

  useTask(() => syncProxies());
</script>

<svelte:window onpointerup={end} onpointercancel={end} onblur={end} />

{#if visible && root}
  <T is={chestProxy}>
    {#if selected === "chest"}<T.Mesh renderOrder={10}><T.SphereGeometry args={[0.035, 16, 12]} /><T.MeshBasicMaterial color="#f3c46e" depthTest={false} /></T.Mesh>{/if}
  </T>
  <T is={pelvisProxy}>
    {#if selected === "pelvis"}<T.Mesh renderOrder={10}><T.SphereGeometry args={[0.035, 16, 12]} /><T.MeshBasicMaterial color="#f3c46e" depthTest={false} /></T.Mesh>{/if}
  </T>
  <T is={elbowProxy}>
    {#if selected === "elbow"}<T.Mesh renderOrder={10}><T.SphereGeometry args={[0.035, 16, 12]} /><T.MeshBasicMaterial color="#f3c46e" depthTest={false} /></T.Mesh>{/if}
  </T>
  <T is={tipProxy}>
    {#if selected === "tip"}<T.Mesh renderOrder={10}><T.SphereGeometry args={[0.035, 16, 12]} /><T.MeshBasicMaterial color="#f3c46e" depthTest={false} /></T.Mesh>{/if}
  </T>

  <TransformControls
    object={selectedProxy()}
    mode={selected === "chest" ? "rotate" : "translate"}
    space="world"
    translationSnap={0.005}
    rotationSnap={Math.PI / 180}
    onmouseDown={begin}
    onchange={changeSelected}
    onobjectChange={changeSelected}
    onmouseUp={end}
  />
{/if}
