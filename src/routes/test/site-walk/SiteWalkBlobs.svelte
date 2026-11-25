<script lang="ts">
  /**
   * A soft dark blob on the ground under each body, so nobody floats.
   *
   * One instanced mesh per group of bodies (guests, the performers, the body
   * you walk in). It costs one draw call each and casts no shadow: the key
   * light's shadow map keeps its job, and this only fills the dim ground under
   * the feet that the map does not reach at night.
   */
  import { onDestroy } from "svelte";
  import { T } from "@threlte/core";
  import {
    CanvasTexture,
    DynamicDrawUsage,
    InstancedMesh,
    MeshBasicMaterial,
    Object3D,
    PlaneGeometry,
  } from "three";

  interface Props {
    /** Where each one stands; `y` is the floor's height there, 0 when left out. */
    points: readonly { x: number; y?: number; z: number }[];
    /** Radius of the blob in metres. */
    radius?: number;
    /** 0 to 1: how dark the centre is. */
    strength: number;
  }
  const props: Props = $props();

  function blobTexture(): CanvasTexture {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext("2d")!;
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(0.45, "rgba(0,0,0,0.6)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
    return new CanvasTexture(canvas);
  }

  const texture = blobTexture();
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    fog: false,
  });
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);

  // Sized to the largest group seen; rebuilt only if a group outgrows it.
  let mesh = $state.raw<InstancedMesh | null>(null);
  let capacity = 0;
  const dummy = new Object3D();

  $effect(() => {
    const points = props.points;
    if (!mesh || capacity < points.length) {
      mesh?.dispose();
      capacity = Math.max(points.length, 8);
      mesh = new InstancedMesh(geometry, material, capacity);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
    }
    const m = mesh;
    const r = (props.radius ?? 0.5) * 2;
    for (let i = 0; i < points.length; i++) {
      dummy.position.set(points[i]!.x, (points[i]!.y ?? 0) + 0.035, points[i]!.z);
      dummy.scale.set(r, 1, r);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.count = points.length;
    m.instanceMatrix.needsUpdate = true;
  });

  $effect(() => {
    material.opacity = Math.min(1, Math.max(0, props.strength));
  });

  onDestroy(() => {
    mesh?.dispose();
    geometry.dispose();
    material.dispose();
    texture.dispose();
  });
</script>

{#if mesh}
  <T is={mesh} />
{/if}
