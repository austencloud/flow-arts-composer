<script lang="ts">
  /**
   * Everything alive in the trench.
   *
   * The middle leg shipped as a flat teal gradient with a performer standing in
   * it: no seabed, no light, nothing moving. It is a third of the walk and it
   * was the worst third. The ocean scene already owns every part needed to fix
   * that, so none of it is rebuilt here — this module only RE-AIMS those systems
   * at a 138 m trench instead of the 30 m stage they were authored around.
   *
   * Two things make the re-aim necessary:
   *
   *  1. They are all anchored to `userProportionsState.groundY` (0) with the
   *     ocean's own water plane 12 above it. Our seabed is at -18 and our
   *     waterline is 0, so each system needs its own offset to land.
   *
   *     `worldYOffset` does NOT move them. It is a world<->local hint the
   *     components use for cursor rays and shader uniforms; the move is done
   *     by an ANCESTOR GROUP (see Environment3D.svelte:221, which translates
   *     the whole ocean and passes the same number down). Passing the prop
   *     without the group leaves every system at ocean-local y=0 — which here
   *     is the waterline, so the entire seabed rendered on the surface.
   *     Group position and prop always carry the same value.
   *  2. They are sized for a stage you stand in front of, not a corridor you
   *     walk down. One instance at the centre leaves both ends dead, so the
   *     atmosphere systems are TILED down the route.
   *
   * The root OceanScene is deliberately not used: it mutates scene.fog,
   * scene.background and scene.environment directly, which would fight the
   * traverse's own continuous atmosphere field.
   */
  import { T, useThrelte, useTask } from "@threlte/core";
  import {
    PMREMGenerator,
    Vector3,
    type Camera,
    type Group,
    type Mesh,
    type Material,
  } from "three";
  import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
  import type { OceanQualityConfig } from "#lib/shared/3d/environments/scenes/ocean/quality/ocean-quality.js";
  import GodRayShafts from "#lib/shared/3d/environments/scenes/ocean/runtime/atmosphere/GodRayShafts.svelte";
  import MarineParticles from "#lib/shared/3d/environments/scenes/ocean/runtime/atmosphere/MarineParticles.svelte";
  import FishBoids from "#lib/shared/3d/environments/scenes/ocean/runtime/fauna/fish/FishBoids.svelte";
  import { createFishScatterState } from "#lib/shared/3d/environments/scenes/ocean/runtime/interaction/fish-scatter.js";
  import JellyfishSwarm from "#lib/shared/3d/environments/scenes/ocean/runtime/fauna/jellyfish/JellyfishSwarm.svelte";
  import TrenchGallery from "./TrenchGallery.svelte";
  import { WATER_Y } from "#lib/shared/3d/environments/scenes/ocean/runtime/atmosphere/god-ray-axis.js";

  interface Props {
    quality: OceanQualityConfig;
    /** Seabed elevation. Everything here is placed relative to it. */
    floorY: number;
    /** The traverse's single waterline. God rays hang from it. */
    waterlineY: number;
    /** Trench extent along the route. */
    fromZ: number;
    toZ: number;
    /** Half-width of the trench floor, for fauna bounds. */
    halfWidth: number;
    onFloraProgress?: (fraction: number) => void;
    onFloraReady?: () => void;
  }

  const {
    quality,
    floorY,
    waterlineY,
    fromZ,
    toZ,
    halfWidth,
    onFloraProgress,
    onFloraReady,
  }: Props = $props();

  const length = $derived(toZ - fromZ);

  /**
   * God rays are an 18 m column hung from the ocean's own water plane at local
   * y = WATER_Y. Aligning that plane with OUR waterline is the whole placement:
   * the column then falls 18 m from the surface, which is exactly our trench
   * depth, so the shafts stand on the seabed. Note this is NOT floor-relative —
   * anchoring it to floorY put the whole column below the seabed.
   */
  const godRayY = $derived(waterlineY - WATER_Y);

  /**
   * Tile spacing. The shaft cluster covers a radius of about 15, so a stride
   * near 34 leaves a readable gap between clusters instead of a continuous
   * curtain — light should pool, not wash.
   */
  const SHAFT_STRIDE = 34;
  const PARTICLE_STRIDE = 30;

  /** Evenly spaced tile centres covering [fromZ, toZ] with no end left dark. */
  function tiles(stride: number): number[] {
    const count = Math.max(1, Math.round(length / stride));
    const step = length / count;
    return Array.from({ length: count }, (_, i) => fromZ + step * (i + 0.5));
  }

  /**
   * The reef is authored for image-based lighting: every coral material is
   * `metalness: 1`, which has NO diffuse response at all. Lit by the traverse's
   * sun and hemisphere alone it renders pure black — the reef was present,
   * correctly placed, and invisible.
   *
   * OceanScene solves this by assigning a PMREM RoomEnvironment to
   * `scene.environment`. Doing that here would light every PBR material in the
   * whole traverse, including the ice chamber, which is not this module's
   * business. So the same probe is generated and assigned per material, on the
   * reef subtree only. Intensity is under 1 because RoomEnvironment is a bright
   * studio box and this is 18 m of water.
   */
  const { renderer, camera } = useThrelte();
  const REEF_ENV_INTENSITY = 0.55;
  let reefGroup = $state.raw<Group | null>(null);

  function lightTheReef(): void {
    const group = reefGroup;
    if (!group) return;

    const pmrem = new PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    group.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const mats: Material[] = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const mat of mats) {
        const std = mat as Material & {
          envMap?: unknown;
          envMapIntensity?: number;
        };
        if (!("envMapIntensity" in std)) continue;
        std.envMap = envTex;
        std.envMapIntensity = REEF_ENV_INTENSITY;
        std.needsUpdate = true;
      }
    });

    envTexture = envTex;
  }

  let envTexture: { dispose: () => void } | null = null;
  $effect(() => () => envTexture?.dispose());

  function handleFloraReady(): void {
    lightTheReef();
    onFloraReady?.();
  }

  /**
   * Fish scatter, driven by the visitor instead of by a cursor over a canvas.
   *
   * The whole scatter system already exists on FishBoids — `cursorRay`,
   * `scatterRadius`, `scatterForce` — and the boid shader tests each fish's
   * perpendicular distance to that ray. It was simply never supplied here, so
   * the school ignored the person swimming through it.
   *
   * ONE ray covers both things a walker expects, because of how the shader
   * measures: `alongRay` is clamped at zero, so a fish beside the ORIGIN is
   * measured straight to the origin.
   *
   *   - Origin is the eye. Walk into a school and it breaks around you.
   *   - Direction is the look vector. Fish out along the sightline scatter
   *     too — and in this walk the mouse IS the look vector, so aiming at a
   *     shoal spooks it.
   *
   * OceanInteraction is not reused wholesale: it also owns the ocean's audio,
   * and its NDC pointer tracking goes dead under pointer lock, which is the
   * normal state of this walk. Only the ray state itself is shared.
   */
  const scatter = createFishScatterState();
  const cursorRay = $state({
    origin: new Vector3(),
    dir: new Vector3(0, 0, -1),
    active: false,
  });

  // Pointer lock parks the OS cursor, so screen-space NDC stops meaning
  // anything; the reticle at (0, 0) is where the visitor is actually looking.
  // Unlocked (a review pass, or a menu open) the real pointer drives it again.
  let pointerNdcX = 0;
  let pointerNdcY = 0;

  function onPointerMove(event: PointerEvent): void {
    pointerNdcX = (event.clientX / window.innerWidth) * 2 - 1;
    pointerNdcY = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  $effect(() => {
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  });

  useTask(() => {
    const cam = (camera as unknown as { current?: Camera })?.current ??
      (camera as unknown as Camera);
    if (!cam) return;
    const locked =
      typeof document !== "undefined" && document.pointerLockElement !== null;
    scatter.update(locked ? 0 : pointerNdcX, locked ? 0 : pointerNdcY, cam);
    cursorRay.origin.copy(scatter.origin);
    cursorRay.dir.copy(scatter.dir);
    // Unlike the ocean's hero camera, the visitor is always in the water. There
    // is no "cursor left the canvas" state to go quiet for.
    cursorRay.active = true;
  });

  const shaftTiles = $derived(tiles(SHAFT_STRIDE));
  const particleTiles = $derived(tiles(PARTICLE_STRIDE));
  const midZ = $derived((fromZ + toZ) / 2);
</script>

<!--
  The reef, composed for THIS trench rather than borrowed from the ocean stage.
  It carries absolute route z for all 98 m, so it is not centred and not tiled —
  TrenchGallery applies only the seabed elevation. The island of coral that used
  to sit at midZ with bare sand either side of it is gone.
-->
{#if quality.enableAuthoredFlora}
  <T.Group bind:ref={reefGroup}>
    <TrenchGallery
      {floorY}
      onProgress={onFloraProgress}
      onReady={handleFloraReady}
    />
  </T.Group>
{/if}

{#if quality.enableGodRays}
  {#each shaftTiles as z, index (index)}
    <T.Group position={[0, godRayY, z]}>
      <GodRayShafts halfRes={quality.godRayHalfRes} worldYOffset={godRayY} />
    </T.Group>
  {/each}
{/if}

{#if quality.enableAtmosphere}
  {#each particleTiles as z, index (index)}
    <T.Group position={[0, floorY, z]}>
      <MarineParticles count={Math.round(quality.particleCount / 2)} />
    </T.Group>
  {/each}
{/if}

{#if quality.enableFauna}
  <!--
    One school for the whole trench rather than one per tile: a shoal that
    crosses the route is worth more than three that each circle their own patch.
    swimHeight is measured from the seabed, so 4-14 keeps them off the floor and
    under the surface.
  -->
  <!--
    No wrapping group: the fish vertex shader builds gl_Position straight from
    the GPGPU world position and never reads modelMatrix, so a parent transform
    does nothing at all. Placed at the world origin the school swam at y=4..14
    over the frozen river, in open air. worldOffset is the seam that moves it.
  -->
  <!--
    Sized to the EYE, not to the trench. The roster is 87 reef fish and most of
    them are 16-60 cm; spread across a 78 m disc they were a few pixels each and
    read as nothing. Bound to a 22 m disc around the reef they become a shoal
    the visitor walks into, and targetSize is pushed past life-size because this
    is an exhibit 18 m down in fog — legibility beats accuracy.
    swimHeight is measured from the seabed and the eye is 0.9 above it, so
    1-9 puts most of the school at and just above eye level.
  -->
  <!--
    scatterRadius is pulled in from the ocean's 8.5: that default is sized for
    a hero camera looking at the whole stage, and on a 14 m school it scatters
    everything at once. At 5 m the school parts around the visitor and closes
    again behind, which is the effect worth having.
  -->
  <FishBoids
    {cursorRay}
    scatterRadius={5.0}
    worldOffset={[0, floorY, midZ]}
    swimHeight={[2, 10]}
    stageRadius={4}
    boundRadius={14}
    targetSize={2.2}
    fogColor="#0a3b4e"
    fogNear={26}
    fogFar={70}
    ambient={0.8}
  />

  {#if quality.maxJellyfish > 0}
    <T.Group position={[0, floorY, midZ]}>
      <JellyfishSwarm {quality} />
    </T.Group>
  {/if}
{/if}
