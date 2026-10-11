<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import { AdditiveBlending, CanvasTexture, type PointLight } from "three";
  import VolumetricFireComponent from "#lib/shared/3d/effects/volumetric-fire/VolumetricFireComponent.svelte";
  import FallingParticles from "#lib/shared/3d/environments/primitives/FallingParticles.svelte";

  interface Props {
    position: { x: number; y: number; z: number };
    energy?: number;
  }

  const props: Props = $props();

  /**
   * Firelight pooling on the packed dirt around the pit. A point light alone
   * cannot do this: the performance floor is one large low-poly surface, so
   * per-vertex falloff quantises into flat bands. The pool is painted instead.
   */
  function createGroundGlowTexture(): CanvasTexture | null {
    if (typeof document === "undefined") return null;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const center = size / 2;
    const gradient = context.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      center
    );
    gradient.addColorStop(0, "rgba(255,168,92,1)");
    gradient.addColorStop(0.28, "rgba(255,116,42,0.62)");
    gradient.addColorStop(0.62, "rgba(196,64,16,0.2)");
    gradient.addColorStop(1, "rgba(120,32,6,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return new CanvasTexture(canvas);
  }

  const groundGlowTexture = createGroundGlowTexture();
  const logAngles = [0.08, Math.PI / 3 + 0.08, (Math.PI * 2) / 3 + 0.08];
  const coalOffsets = [
    [-0.48, -0.18, 0.82],
    [-0.18, 0.32, 0.66],
    [0.18, -0.34, 0.74],
    [0.46, 0.08, 0.9],
    [0.04, 0.04, 1.04],
    [-0.34, 0.16, 0.76],
    [0.34, 0.31, 0.68],
  ] as const;
  let elapsedSeconds = 0;
  let practical = $state<PointLight>();
  let bounce = $state<PointLight>();
  let glowMesh = $state<{ material: { opacity: number } }>();
  const fireHeight = $derived(2.72 + (props.energy ?? 0) * 1.08);

  // At 2:13 AM the rest of the rig sums to roughly 0.2 in three.js light units,
  // so the practical has to be the brightest thing on the field by an order of
  // magnitude for the night to read as firelit rather than evenly grey.
  const PRACTICAL_BASE_CANDELA = 52;
  const BOUNCE_BASE_CANDELA = 14;

  useTask((delta) => {
    elapsedSeconds += Math.min(Math.max(delta, 0), 0.25);
    const energy = props.energy ?? 0;
    // Three detuned sines: no audible period, no strobing.
    const flicker =
      Math.sin(elapsedSeconds * 7.1) * 0.052 +
      Math.sin(elapsedSeconds * 11.7 + 0.8) * 0.029 +
      Math.sin(elapsedSeconds * 19.3 + 2.2) * 0.013;
    if (practical) {
      practical.intensity =
        PRACTICAL_BASE_CANDELA * (1 + energy * 0.55) * (1 + flicker);
    }
    if (bounce) {
      bounce.intensity =
        BOUNCE_BASE_CANDELA * (1 + energy * 0.45) * (1 + flicker * 0.6);
    }
    if (glowMesh) {
      glowMesh.material.opacity =
        (0.5 + energy * 0.22) * (1 + flicker * 0.85);
    }
  });
</script>

<VolumetricFireComponent
  position={[
    props.position.x,
    props.position.y + fireHeight / 2 + 0.08,
    props.position.z,
  ]}
  width={1.82}
  height={fireHeight}
  depth={1.82}
  sliceSpacing={0.12}
/>

<T.Group position={[props.position.x, props.position.y, props.position.z]}>
  <T.Mesh
    position={[0, 0.055, 0]}
    rotation={[-Math.PI / 2, 0, 0]}
    receiveShadow
  >
    <T.CircleGeometry args={[1.28, 36]} />
    <T.MeshStandardMaterial
      color="#17120f"
      emissive="#421207"
      emissiveIntensity={0.42 + (props.energy ?? 0) * 0.34}
      roughness={1}
      metalness={0}
    />
  </T.Mesh>

  {#each logAngles as angle}
    <T.Group rotation={[0, angle, 0]}>
      <T.Mesh
        position={[0, 0.245, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
        receiveShadow
      >
        <T.CylinderGeometry args={[0.14, 0.18, 1.75, 10]} />
        <T.MeshStandardMaterial
          color="#25160f"
          roughness={0.98}
          metalness={0}
        />
      </T.Mesh>
      <T.Mesh position={[-0.878, 0.245, 0]} rotation={[0, 0, Math.PI / 2]}>
        <T.CircleGeometry args={[0.135, 10]} />
        <T.MeshStandardMaterial color="#5a3320" roughness={0.92} />
      </T.Mesh>
    </T.Group>
  {/each}

  {#each coalOffsets as [x, z, heat]}
    <T.Mesh position={[x, 0.15, z]} scale={[1, 0.58, 0.82]}>
      <T.DodecahedronGeometry args={[0.17, 0]} />
      <T.MeshStandardMaterial
        color="#2a1711"
        emissive="#ff3f12"
        emissiveIntensity={heat + (props.energy ?? 0) * 0.75}
        roughness={0.94}
      />
    </T.Mesh>
  {/each}

  <T.Group position={[0, 0.86, 0]}>
    <FallingParticles
      type="embers"
      count={34 + Math.round((props.energy ?? 0) * 18)}
      area={{ width: 1.7, height: 2.9, depth: 1.7 }}
      speed={0.46}
      colors={["#ffe08a", "#ff9738", "#ff5422"]}
      sizeRange={[0.03, 0.09]}
      spin={true}
    />
  </T.Group>
  {#if groundGlowTexture}
    <T.Mesh
      bind:ref={glowMesh}
      position={[0, -0.028, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
    >
      <T.PlaneGeometry args={[11.4, 11.4]} />
      <T.MeshBasicMaterial
        map={groundGlowTexture}
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </T.Mesh>
  {/if}

  <T.PointLight
    bind:ref={practical}
    position={[0, 1.35, 0]}
    color="#ff8b4c"
    intensity={PRACTICAL_BASE_CANDELA}
    distance={46 + (props.energy ?? 0) * 10}
    decay={2}
  />
  <!-- Wide, slow-falling warm bounce so the clearing edge and the near tree
       line are lit by the fire instead of by an invisible ambient term. -->
  <T.PointLight
    bind:ref={bounce}
    position={[0, 3.6, 0]}
    color="#ff9d5e"
    intensity={BOUNCE_BASE_CANDELA}
    distance={112}
    decay={1.4}
  />
</T.Group>
