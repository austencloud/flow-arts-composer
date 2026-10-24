<script lang="ts">
  /**
   * A poi drawn from its string sim (`#lib/shared/poi/poi-tether.ts`): the
   * handle at the hand, lined up with the first stretch of string, the string
   * through the sim's points, and the head on the last one.
   *
   * Sizes and materials follow the rigid `Poi3D` in @austencloud/scene-3d.
   * The meshes are built once; every frame only their matrices are written,
   * in place, so a spinning poi allocates nothing.
   */
  import { T, useTask } from "@threlte/core";
  import { onDestroy } from "svelte";
  import {
    CylinderGeometry,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Quaternion,
    SphereGeometry,
    Vector3,
    type Object3D,
  } from "three";
  import { reactivePropHandPalette } from "@austencloud/scene-3d";
  import {
    POI_TETHER_POINTS,
    POI_TETHER_SEGMENTS,
  } from "#lib/shared/poi/poi-tether.js";

  interface Props {
    /** xyz per sim point, hand first, head last. */
    points: Float64Array;
    /**
     * The object the points are measured in. Its world matrix carries them
     * into the scene; omit it when they are already world positions.
     */
    frame?: Object3D | null;
    color: "blue" | "red";
    /** Staff radius the rigid poi is sized from, metres. */
    thickness?: number;
    visible?: boolean;
  }

  let {
    points,
    frame = null,
    color,
    thickness = 0.0125,
    visible = true,
  }: Props = $props();

  const palette = $derived(reactivePropHandPalette(color));

  // Poi3D's proportions, from the staff radius.
  const handleLength = 0.045;
  const handleGeometry = new CylinderGeometry(1, 0.9, 1, 12);
  const handleMaterial = new MeshStandardMaterial({
    color: "#e8e8e8",
    roughness: 0.3,
    metalness: 0.1,
  });
  const handle = new Mesh(handleGeometry, handleMaterial);

  const stringGeometry = new CylinderGeometry(1, 1, 1, 6);
  const stringMaterial = new MeshStandardMaterial({
    color: "#444444",
    roughness: 0.9,
    metalness: 0,
  });
  const string = new InstancedMesh(
    stringGeometry,
    stringMaterial,
    POI_TETHER_SEGMENTS
  );

  const headGeometry = new SphereGeometry(1, 16, 16);
  const headMaterial = new MeshStandardMaterial({
    roughness: 0.35,
    metalness: 0.15,
  });
  const head = new Mesh(headGeometry, headMaterial);

  for (const mesh of [handle, string, head]) {
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
  }

  $effect(() => {
    headMaterial.color.set(palette.main);
  });

  const world = Array.from({ length: POI_TETHER_POINTS }, () => new Vector3());
  const UP = new Vector3(0, 1, 0);
  const along = new Vector3();
  const middle = new Vector3();
  const size = new Vector3();
  const turn = new Quaternion();
  const matrix = new Matrix4();

  /** A unit cylinder (or sphere) stood from `from` along `along`, `length`
   *  long and `radius` thick, written into `matrix`. */
  function place(from: Vector3, length: number, radius: number): void {
    turn.setFromUnitVectors(UP, along);
    middle
      .copy(along)
      .multiplyScalar(length / 2)
      .add(from);
    size.set(radius, length, radius);
    matrix.compose(middle, turn, size);
  }

  useTask(() => {
    if (!visible) return;
    for (let i = 0; i < POI_TETHER_POINTS; i++) {
      const p = world[i]!;
      p.set(points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!);
      if (frame) p.applyMatrix4(frame.matrixWorld);
    }

    const leash = thickness * 0.15;
    for (let s = 0; s < POI_TETHER_SEGMENTS; s++) {
      along.subVectors(world[s + 1]!, world[s]!);
      const length = along.length();
      if (length > 1e-6) along.divideScalar(length);
      else along.copy(UP);
      place(world[s]!, length, leash);
      string.setMatrixAt(s, matrix);
    }
    string.instanceMatrix.needsUpdate = true;

    // The handle runs back from the hand, in line with the first segment.
    along.subVectors(world[0]!, world[1]!);
    if (along.lengthSq() > 1e-12) along.normalize();
    else along.copy(UP).negate();
    place(world[0]!, handleLength, thickness * 0.8);
    handle.matrix.copy(matrix);

    const r = thickness * 3.5;
    head.matrix.makeScale(r, r, r).setPosition(world[POI_TETHER_POINTS - 1]!);
  });

  onDestroy(() => {
    handleGeometry.dispose();
    handleMaterial.dispose();
    stringGeometry.dispose();
    stringMaterial.dispose();
    headGeometry.dispose();
    headMaterial.dispose();
    string.dispose();
  });
</script>

<T is={handle} {visible} />
<T is={string} {visible} />
<T is={head} {visible} />
