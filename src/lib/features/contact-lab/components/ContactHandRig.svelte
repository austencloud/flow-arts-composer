<script lang="ts">
  import { onDestroy } from "svelte";
  import { T, useTask } from "@threlte/core";
  import { useGltf } from "@threlte/extras";
  import {
    AnimationAction,
    AnimationClip,
    AnimationMixer,
    DoubleSide,
    Group,
    Mesh,
    MeshStandardMaterial,
    type Material,
  } from "three";
  import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
  import type {
    ContactDigit,
    ContactHandPose,
  } from "../domain/contact-motion-profile";

  interface Props {
    pose: ContactHandPose;
  }

  let { pose }: Props = $props();
  const gltf = useGltf("/models/rigged-hand.glb");
  let root = $state.raw<Group | null>(null);
  let mixer: AnimationMixer | null = null;
  const digitActions = new Map<ContactDigit, AnimationAction>();
  let clipDuration = 1;
  const digits: readonly ContactDigit[] = [
    "thumb",
    "index",
    "middle",
    "ring",
    "pinky",
  ];

  $effect(() => {
    const loaded = $gltf;
    if (!loaded) return;

    const nextRoot = cloneSkeleton(loaded.scene) as Group;
    nextRoot.traverse((child) => {
      if (child.type === "Camera" || child.type.includes("Light")) {
        child.visible = false;
      }
      if (child instanceof Mesh) {
        child.geometry = child.geometry.clone();
        child.geometry.computeVertexNormals();
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = false;
        const usesMaterialArray = Array.isArray(child.material);
        const sourceMaterials: Material[] = usesMaterialArray
          ? child.material
          : [child.material];
        const nextMaterials = sourceMaterials.map((source) => {
          const material = (source as MeshStandardMaterial).clone();
          material.side = DoubleSide;
          material.flatShading = false;
          material.roughness = 0.72;
          material.metalness = 0;
          material.color.set("#d7a786");
          material.vertexColors = false;
          material.map = null;
          material.alphaMap = null;
          material.aoMap = null;
          material.bumpMap = null;
          material.displacementMap = null;
          material.emissiveMap = null;
          material.lightMap = null;
          material.metalnessMap = null;
          material.normalMap = null;
          material.roughnessMap = null;
          material.needsUpdate = true;
          return material;
        });
        child.material = usesMaterialArray ? nextMaterials : nextMaterials[0]!;
      }
    });

    root = nextRoot;
    mixer = new AnimationMixer(nextRoot);
    const clip = loaded.animations.find((item) => item.name === "Open/Close");
    if (clip) {
      clipDuration = clip.duration || 1;
      for (const digit of digits) {
        const tracks = clip.tracks.filter((track) =>
          track.name.toLowerCase().includes(digit)
        );
        if (tracks.length === 0) continue;
        const digitClip = new AnimationClip(
          `Contact ${digit}`,
          clipDuration,
          tracks,
          clip.blendMode
        );
        const digitAction = mixer.clipAction(digitClip);
        digitAction.play();
        digitAction.timeScale = 0;
        digitActions.set(digit, digitAction);
      }
    }

    return () => {
      mixer?.stopAllAction();
      mixer?.uncacheRoot(nextRoot);
      mixer = null;
      digitActions.clear();
      root = null;
    };
  });

  useTask(() => {
    if (!mixer) return;
    for (const digit of digits) {
      const action = digitActions.get(digit);
      if (!action) continue;
      action.time =
        Math.min(0.999, Math.max(0, pose.fingerOpenness[digit])) * clipDuration;
    }
    mixer.update(0);
  });

  onDestroy(() => {
    mixer?.stopAllAction();
  });

  const mirror = $derived(pose.id === "left" ? -1 : 1);
</script>

<T.Group
  position={pose.position}
  rotation={pose.rotation}
  scale={[mirror, 1, 1]}
>
  {#if root}
    <T is={root} scale={0.8} rotation={[-Math.PI / 2, Math.PI / 2, 0]} />
  {/if}
</T.Group>
