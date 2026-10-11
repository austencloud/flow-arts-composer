<script lang="ts">
  /**
   * Coal lamp - look-dev study.
   *
   * A soot-blackened iron hood on a dungeon chain, holding a bed of live coals
   * that spill as it swings. It is proposed as the connecting thread across all
   * three First Fire courts: the same fixture, the same chain, different thing
   * burning inside it, marking the route the visitor walks.
   *
   * This is a study, not the shipping asset. Its job is to answer whether the
   * silhouette reads at walking distance and whether coals in a hanging basket
   * light the space usefully. Once the proportions are chosen, the fixture is
   * authored in Blender and exported to GLB per blender-first-3d-scenes.md -
   * procedural primitives are not how static set dressing ships here.
   */
  import { T, useTask } from "@threlte/core";
  import {
    BackSide,
    DoubleSide,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
  } from "three";
  import LavaCracks from "#lib/shared/3d/environments/scenes/ember/LavaCracks.svelte";
  import type { LavaCracksConfig } from "#lib/shared/3d/environments/domain/models/scene-configs.js";
  import FirstFireCoalBank from "./FirstFireCoalBank.svelte";

  interface Props {
    /** Ceiling height the chain hangs from. */
    ceilingY?: number;
    /** Height of the basket floor, i.e. where the coals sit. */
    basketY?: number;
    /** Width of the hood across its base. */
    hoodWidth?: number;
    /** How deep the coal basket is. Deeper hides the coals from below. */
    basketDepth?: number;
    /** The colour of whatever is burning in the basket. */
    emberColor?: string;
    /** Light thrown into the room by the basket. */
    lightIntensity?: number;
    /** Live coals falling out of the basket. 0 disables the drip. */
    dripCount?: number;
    /** Slow pendulum swing, in radians. 0 holds it still for silhouette reads. */
    swing?: number;
  }

  const {
    ceilingY = 4.6,
    basketY = 2.4,
    hoodWidth = 1.08,
    basketDepth = 0.34,
    emberColor = "#ff5a12",
    lightIntensity = 9,
    dripCount = 14,
    swing = 0.035,
  }: Props = $props();

  // Soot-blackened forged iron - and deliberately NOT metallic in the PBR
  // sense. A metalness near 1 with no environment map has no diffuse term and
  // nothing to reflect, so in a room lit only by coals it renders pure black
  // and the fixture disappears. Real forged iron under soot is close to a
  // rough dielectric anyway, and at this metalness the coal light actually
  // wraps the hood and picks the chain out of the dark.
  const iron = new MeshStandardMaterial({
    // Not black. #15110e is about 8% reflectance, which is darker than actual
    // soot, and at that albedo no amount of bounce will ever put a value on
    // this fixture - it stays a hole in the frame. Sooted forge iron sits
    // nearer 16%, and that is the difference between a pyramid you can see and
    // one you have to be told is there.
    color: "#2b2320",
    roughness: 0.72,
    metalness: 0.2,
    // The hood and the basket are both open shells, and the visitor is BELOW
    // them looking up into the inside. Front-face-only culls exactly the
    // surfaces they would actually see.
    side: DoubleSide,
  });

  // Inside of the hood only. Nearly black and fully rough, so the coal light
  // dies on it instead of bouncing back at the visitor.
  const soot = new MeshStandardMaterial({
    color: "#0a0706",
    roughness: 1,
    metalness: 0,
    side: BackSide,
  });

  // The lip of the hood, closest to the coals and permanently baked by them.
  // This is the ONE part of the fixture that carries emissive, and it is
  // deliberately a thin ring rather than a face: a bright OUTLINE is what
  // makes a dark object read against a dark room, while a bright surface just
  // reads as a lamp made of light. It also fixes the failure this study found
  // first - a black fixture in a black bay is invisible unless something
  // glowing sits behind it, which cannot be guaranteed everywhere it hangs.
  const rim = new MeshStandardMaterial({
    color: "#241109",
    emissive: emberColor,
    emissiveIntensity: 0.38,
    roughness: 0.8,
    metalness: 0.1,
  });

  // Taller than it is wide. The first proportions were squat - a 1.55m-across
  // cone only 1.03m tall - and from below that reads as an open crate, not as
  // the pyramid the brief asks for. A dungeon fixture is a steep spire.
  const hoodHeight = $derived(hoodWidth * 1.55);
  const hoodRadius = $derived(hoodWidth * 0.5);
  const basketWidth = $derived(hoodWidth * 0.62);
  // Top of the hood, where the chain terminates.
  const hoodApexY = $derived(basketY + basketDepth + hoodHeight);
  const chainSpan = $derived(ceilingY - hoodApexY);

  /**
   * The four ridge ribs of the hood, apex to base corner.
   *
   * The hood's flat faces point up and out, and in this room nothing lights
   * anything above head height - every source is a coal at waist level or
   * lower. So the pyramid's exterior gets no light at all and the fixture
   * reads as a floating bright ring with a void above it.
   *
   * Ribs solve it the way real lanterns always have: they stand proud of the
   * faces, so their undersides catch the basket light raking upward and the
   * silhouette gets DRAWN in light lines. Nothing here is emissive - this is
   * geometry arranged to be lit by a source that already exists.
   */
  const RIB_THICKNESS = 0.038;
  const ribs = $derived.by(() => {
    const slant = Math.sqrt(hoodRadius * hoodRadius + hoodHeight * hoodHeight);
    // The cone's own vertices land on 45/135/225/315 once it is turned a
    // quarter-face, so the ribs have to sit on those same bearings or they
    // stripe the faces instead of tracing the edges.
    return Array.from({ length: 4 }, (_, i) => ({
      yaw: -(Math.PI / 4 + (i * Math.PI) / 2),
      tilt: Math.atan2(hoodRadius, hoodHeight),
      length: slant,
    }));
  });

  const LINK_PITCH = 0.105;
  const links = $derived(
    Array.from({ length: Math.max(1, Math.round(chainSpan / LINK_PITCH)) }, (_, i) => ({
      y: hoodApexY + LINK_PITCH * (i + 0.5),
      // Alternating quarter-turn is what makes a stack of tori read as chain
      // rather than as a column of washers.
      yaw: (i % 2) * (Math.PI / 2),
    }))
  );

  const basketCoals: LavaCracksConfig = $derived({
    enabled: true,
    crackColor: emberColor,
    intensity: 2.1,
    speed: 0.02,
    // Chunky on purpose. At scale 9 the voronoi stippled a 0.4m plane into
    // noise that read as nothing at walking distance.
    scale: 2.2,
    pulseSpeed: 0.5,
    pulseIntensity: 0.5,
  });

  // Coals that have fallen out and are still falling. Instanced so the drip
  // costs one draw call regardless of how many are in the air.
  let dripMesh = $state<InstancedMesh | null>(null);
  const dripMaterial = new MeshStandardMaterial({
    color: "#120806",
    emissive: emberColor,
    emissiveIntensity: 2.4,
    roughness: 1,
  });

  interface Drip {
    x: number;
    y: number;
    z: number;
    velocity: number;
    scale: number;
  }

  function spawnDrip(seed: number): Drip {
    const angle = seed * 2.399963; // golden angle, so spawns never line up
    const radius = (0.12 + ((seed * 0.37) % 1) * 0.28) * basketWidth;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      y: basketY - 0.05 - ((seed * 0.61) % 1) * (basketY - 0.2),
      velocity: 0,
      scale: 0.012 + ((seed * 0.83) % 1) * 0.016,
    };
  }

  const drips: Drip[] = Array.from({ length: dripCount }, (_, i) => spawnDrip(i + 1));

  const matrix = new Matrix4();
  const dripPosition = new Vector3();
  const dripScale = new Vector3();
  const noRotation = new Quaternion();
  let elapsed = $state(0);

  useTask((delta) => {
    elapsed += delta;
    const mesh = dripMesh;
    if (!mesh) return;
    for (const [index, drip] of drips.entries()) {
      drip.velocity += delta * 2.2;
      drip.y -= drip.velocity * delta;
      if (drip.y <= 0.02) {
        const respawned = spawnDrip(index + 1 + elapsed);
        drip.x = respawned.x;
        drip.z = respawned.z;
        drip.scale = respawned.scale;
        drip.y = basketY - 0.05;
        drip.velocity = 0;
      }
      dripPosition.set(drip.x, drip.y, drip.z);
      dripScale.setScalar(drip.scale);
      matrix.compose(dripPosition, noRotation, dripScale);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  // Pendulum about the ceiling anchor, so the whole fixture swings as one body.
  const swingAngle = $derived(swing === 0 ? 0 : Math.sin(elapsed * 0.42) * swing);
</script>

<T.Group position.y={ceilingY} rotation.z={swingAngle}>
  <T.Group position.y={-ceilingY}>
    <!-- Ceiling plate -->
    <T.Mesh position.y={ceilingY - 0.02} material={iron}>
      <T.CylinderGeometry args={[0.11, 0.13, 0.05, 8]} />
    </T.Mesh>

    <!-- Chain -->
    {#each links as link, i (i)}
      <T.Mesh
        position.y={link.y}
        rotation.x={Math.PI / 2}
        rotation.y={link.yaw}
        material={iron}
      >
        <T.TorusGeometry args={[0.066, 0.023, 6, 12]} />
      </T.Mesh>
    {/each}

    <!-- Hood: four-sided pyramid, apex up, OPEN underneath.
         The closed version put a capped face across the bottom, and since the
         coals sit directly under it that face lit up as a flat bright plate -
         from below, which is where a visitor stands, the fixture read as a
         glowing table rather than a lamp. Open-ended, the same coal light
         rakes up the INSIDE of the pyramid instead, which is what gives a
         hood its shape from underneath. -->
    <T.Mesh
      position.y={basketY + basketDepth + hoodHeight / 2}
      rotation.y={Math.PI / 4}
      material={iron}
    >
      <T.ConeGeometry args={[hoodRadius, hoodHeight, 4, 1, true]} />
    </T.Mesh>

    <!-- Soot liner, inside faces only, sitting just inboard of the hood.
         Without it the coal light blasts the hood's own inner surface and the
         brightest thing in frame becomes the inside of the shade - so the
         fixture reads as an open glowing crate instead of a black pyramid with
         fire in the bottom of it. A real hood interior is caked in soot and
         stays near-black no matter what is burning under it. -->
    <T.Mesh
      position.y={basketY + basketDepth + hoodHeight / 2}
      rotation.y={Math.PI / 4}
      material={soot}
    >
      <T.ConeGeometry args={[hoodRadius * 0.96, hoodHeight * 0.96, 4, 1, true]} />
    </T.Mesh>

    {#each ribs as rib, i (i)}
      <T.Group rotation.y={rib.yaw}>
        <T.Mesh
          position={[
            hoodRadius / 2,
            basketY + basketDepth + hoodHeight / 2,
            0,
          ]}
          rotation.z={rib.tilt}
          material={iron}
        >
          <T.BoxGeometry args={[RIB_THICKNESS, rib.length, RIB_THICKNESS]} />
        </T.Mesh>
      </T.Group>
    {/each}

    <!-- Hood lip. Sized to the cone's base radius so it traces the bottom edge
         of the pyramid exactly, which is the line that says "lamp". -->
    <T.Mesh
      position.y={basketY + basketDepth + 0.015}
      rotation.x={Math.PI / 2}
      rotation.z={Math.PI / 4}
      material={rim}
    >
      <T.TorusGeometry args={[hoodRadius, 0.028, 6, 4]} />
    </T.Mesh>

    <!-- Bounce off the inside of the hood, thrown back UP the chain.
         Physically what a reflector does, and the reason the chain was pure
         black before: the basket light is below the hood and every link sits
         above it, so nothing in the scene was lighting them. Short distance
         so it dies before it reaches the ceiling and flattens the room. -->
    <T.PointLight
      position={[0, basketY + basketDepth + hoodHeight * 0.55, 0]}
      color={emberColor}
      intensity={2.4}
      distance={2.6}
      decay={2}
    />

    <!-- Bottom section: the open basket the coals sit in. -->
    <T.Mesh
      position.y={basketY + basketDepth / 2}
      rotation.y={Math.PI / 4}
      material={iron}
    >
      <T.CylinderGeometry
        args={[basketWidth * 0.72, basketWidth * 0.58, basketDepth, 4, 1, true]}
      />
    </T.Mesh>

    <!-- Basket floor, so the coals do not read as floating. -->
    <T.Mesh position.y={basketY} rotation.y={Math.PI / 4} material={iron}>
      <T.CylinderGeometry args={[basketWidth * 0.58, basketWidth * 0.58, 0.02, 4]} />
    </T.Mesh>

    <!-- The coals themselves: the same lumps the beds and the wall are packed
         with, so the lamp carries the room's material rather than a second
         one. The crust shader glows underneath them, between the lumps. -->
    <LavaCracks
      config={basketCoals}
      groundSize={1}
      edgeFade={0}
      placement={{
        position: [0, basketY + 0.015, 0],
        rotation: [-Math.PI / 2, 0, 0],
        size: [basketWidth * 0.82, basketWidth * 0.82],
      }}
    />
    <!-- The bank packs from z=0 backwards, so half its depth centres it. -->
    <T.Group position.y={basketY + 0.02} position.z={basketWidth * 0.37}>
      <FirstFireCoalBank
        width={basketWidth * 0.74}
        height={0.14}
        depth={basketWidth * 0.74}
        count={38}
        sizeRange={[0.035, 0.075]}
        {emberColor}
        heat="raked"
        seed={4}
      />
    </T.Group>

    <T.PointLight
      position={[0, basketY - 0.05, 0]}
      color={emberColor}
      intensity={lightIntensity}
      distance={9}
      decay={2}
    />

    {#if dripCount > 0}
      <T.InstancedMesh
        args={[undefined, undefined, dripCount]}
        material={dripMaterial}
        frustumCulled={false}
        oncreate={(ref: InstancedMesh) => {
          dripMesh = ref;
        }}
      >
        <T.SphereGeometry args={[1, 6, 5]} />
      </T.InstancedMesh>
    {/if}
  </T.Group>
</T.Group>
