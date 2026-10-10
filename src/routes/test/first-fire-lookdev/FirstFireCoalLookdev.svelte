<script lang="ts">
  /**
   * First Fire coal-room look-dev.
   *
   * Four stations in one dark basalt box, so the coal vocabulary can be judged
   * side by side before any of it is committed to the museum walk. The question
   * each station answers is written above it in the page chrome.
   *
   * This is deliberately NOT the Cinder Court. Building the art direction
   * inside the real room means every judgement is contaminated by route,
   * performer, collision and procession state. Here there is nothing but the
   * material and the light it throws.
   */
  import { T, useTask, useThrelte } from "@threlte/core";
  import { MeshStandardMaterial } from "three";
  import { userProportionsState } from "@austencloud/scene-3d";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import LavaCracks from "#lib/shared/3d/environments/scenes/ember/LavaCracks.svelte";
  import HeatDistortion from "#lib/shared/3d/environments/scenes/ember/HeatDistortion.svelte";
  import EmberFountains from "#lib/shared/3d/environments/scenes/ember/EmberFountains.svelte";
  import FallingParticles from "#lib/shared/3d/environments/primitives/FallingParticles.svelte";
  import type { LavaCracksConfig } from "#lib/shared/3d/environments/domain/models/scene-configs.js";
  import { FIRST_FIRE_BASALT_COLOR } from "../first-fire-graybox/first-fire-court-identity";
  import FirstFireCoalLamp from "#lib/shared/3d/environments/scenes/first-fire/FirstFireCoalLamp.svelte";
  import FirstFireCoalBank from "#lib/shared/3d/environments/scenes/first-fire/FirstFireCoalBank.svelte";
  import FirstFireCoalWall from "#lib/shared/3d/environments/scenes/first-fire/FirstFireCoalWall.svelte";
  import FirstFireSteamVent from "#lib/shared/3d/environments/scenes/first-fire/FirstFireSteamVent.svelte";
  import {
    LOOKDEV_STATIONS,
    STATION_PITCH,
    type LookdevStationId,
  } from "./lookdev-stations";

  interface Props {
    station: LookdevStationId | "lineup";
    /** Human reference at 1.75m, so every station is judged at body scale. */
    showScaleFigure: boolean;
    /** The A/B this room was built to settle: is coal a shader or geometry? */
    wallTreatment: "shader" | "lumps";
    /**
     * Bounce off glowing coals. The Cinder Court currently runs this at
     * essentially zero on the rule that every photon comes from something
     * burning - but a room packed with live coals HAS enormous bounce, and
     * zeroing it is why the courts read as black voids with orange blobs in
     * them rather than as hot rooms.
     */
    bounce: number;
  }

  const { station, showScaleFigure, wallTreatment, bounce }: Props = $props();

  const STATION_SPAN = Math.max(...LOOKDEV_STATIONS.map((s) => Math.abs(s.x)));
  const ROOM_WIDTH = (STATION_SPAN + STATION_PITCH * 0.6) * 2;
  // Long on purpose. The lineup camera pulls back on narrow viewports to keep
  // all five stations in frame, and a short room would strand it over the void
  // past the floor edge.
  const ROOM_DEPTH = 52;
  const CEILING_Y = 5.2;
  const BACK_Z = -5;

  // Ember components anchor to the avatar ground datum; the room floor is y=0.
  const floorLift = $derived(-userProportionsState.groundY);

  const basalt = new MeshStandardMaterial({
    color: FIRST_FIRE_BASALT_COLOR,
    roughness: 0.95,
    metalness: 0,
  });
  // See FirstFireCoalLamp for why this is not a PBR metal, and why it is not
  // black either: high metalness with no environment map has no diffuse and
  // nothing to reflect, and an 8%-reflectance "soot black" albedo finishes the
  // job - between them every iron fitting in the court rendered as a hole.
  const iron = new MeshStandardMaterial({
    color: "#2b2320",
    roughness: 0.72,
    metalness: 0.2,
  });
  const scaleFigureMaterial = new MeshStandardMaterial({
    color: "#241a16",
    roughness: 1,
    metalness: 0,
  });

  /**
   * The lineup has to fit five stations across whatever width it is given -
   * a 2112px screenshot and a ~800px side panel are both real. Fitting by
   * moving the camera would push it out through the back of the room on narrow
   * viewports, so the distance is fixed and the vertical fov is solved from the
   * aspect instead. Clamped, because past about 80 degrees the perspective
   * stretch at the edges is worse than losing the outer station.
   */
  const { size } = useThrelte();
  const LINEUP_Z = 20;
  const LINEUP_TARGET_Z = -1;
  const lineupHalfSpan = STATION_SPAN + STATION_PITCH * 0.46;

  const lineupFov = $derived.by(() => {
    const aspect = $size.height > 0 ? $size.width / $size.height : 1.6;
    const halfAngle = Math.atan(lineupHalfSpan / (LINEUP_Z - LINEUP_TARGET_Z));
    const fov = (2 * Math.atan(Math.tan(halfAngle) / aspect) * 180) / Math.PI;
    return Math.min(80, Math.max(38, fov));
  });

  const activeCamera = $derived.by(() => {
    if (station === "lineup") {
      return {
        position: [0, 2.9, LINEUP_Z] as [number, number, number],
        target: [0, 1.9, LINEUP_TARGET_Z] as [number, number, number],
        fov: lineupFov,
      };
    }
    const found = LOOKDEV_STATIONS.find((s) => s.id === station)!;
    return {
      position: [
        found.x + (found.eye.offsetX ?? 0),
        found.eye.height,
        found.eye.distance,
      ] as [number, number, number],
      target: [found.x, found.eye.look, found.eye.lookZ] as [
        number,
        number,
        number,
      ],
      fov: 58,
    };
  });

  const x = (id: LookdevStationId) => LOOKDEV_STATIONS.find((s) => s.id === id)!.x;

  // Station A - a bed of coals sunk into the floor behind an iron kerb.
  const bedCoals: LavaCracksConfig = {
    enabled: true,
    crackColor: "#ff5a12",
    intensity: 1.35,
    speed: 0.012,
    scale: 5.5,
    pulseSpeed: 0.35,
    pulseIntensity: 0.55,
  };
  const BED_SIZE = 2.6;
  const bedKerb = [
    { x: 0, z: BED_SIZE / 2, w: BED_SIZE + 0.3, d: 0.15 },
    { x: 0, z: -BED_SIZE / 2, w: BED_SIZE + 0.3, d: 0.15 },
    { x: BED_SIZE / 2, z: 0, w: 0.15, d: BED_SIZE + 0.3 },
    { x: -BED_SIZE / 2, z: 0, w: 0.15, d: BED_SIZE + 0.3 },
  ];
  const bedEmbers = {
    enabled: true,
    count: 26,
    riseSpeed: 0.35,
    colors: ["#ff4400", "#ff6600", "#ffaa00", "#ff2200"],
    sizeRange: [0.02, 0.055] as [number, number],
    spawnRadius: BED_SIZE * 0.42,
    maxHeight: 2.6,
    gravity: 0.42,
    burstInterval: 4.2,
    burstCount: 7,
  };

  // Station B - banked coal held against the wall behind an iron grate.
  const WALL_W = 5.2;
  const WALL_H = 3.1;

  // Station C - a run of lamps down the route. Only the nearest drips: a coal
  // falling out of every fixture at once reads as a malfunction, not as one
  // lamp that happens to be shedding while you walk under it.
  // Spacing is bounded at the far end by the cribbing behind them: the wall's
  // posts stand ~1.1m proud of its face, and the first attempt put the third
  // lamp behind that plane, where it vanished entirely.
  const lampRow = [
    { z: 2.4, intensity: 9, drips: 14 },
    { z: -0.4, intensity: 8, drips: 0 },
    { z: -3.2, intensity: 7, drips: 0 },
  ];

  // Station D - a furnace mouth venting heat and steam into the room.
  const furnaceCoals: LavaCracksConfig = {
    enabled: true,
    crackColor: "#ff8a2a",
    intensity: 2.2,
    speed: 0.03,
    scale: 6,
    pulseSpeed: 0.8,
    pulseIntensity: 0.7,
  };
  const FURNACE_W = 2.1;
  const FURNACE_H = 1.7;
  const FURNACE_SILL = 0.75;
  const furnaceBars = Array.from({ length: 5 }, (_, i) => ({
    y: FURNACE_SILL + 0.22 + i * ((FURNACE_H - 0.44) / 4),
  }));

  // Breathing furnace glow. A furnace that holds one brightness reads as a
  // light fixture; one that swells and settles reads as combustion.
  let breath = $state(1);
  useTask((delta) => {
    breath += delta;
  });
  const furnaceIntensity = $derived(11 + Math.sin(breath * 0.9) * 3.5);
</script>

<T.PerspectiveCamera
  makeDefault
  position={[activeCamera.position[0], activeCamera.position[1], activeCamera.position[2]]}
  fov={activeCamera.fov}
>
  <OrbitControls
    enableDamping
    target={[activeCamera.target[0], activeCamera.target[1], activeCamera.target[2]]}
    minDistance={1.2}
    maxDistance={40}
    maxPolarAngle={Math.PI / 2 + 0.05}
  />
</T.PerspectiveCamera>

<!-- Bounce off the coals. Every direct source in this room is still something
     burning; this is only the light those sources throw back off the rock. -->
<T.HemisphereLight args={["#c4400f", "#1a0b06", bounce]} />

<!-- Room shell -->
<T.Mesh rotation.x={-Math.PI / 2} material={basalt} receiveShadow>
  <T.PlaneGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
</T.Mesh>
<T.Mesh position={[0, CEILING_Y / 2, BACK_Z]} material={basalt}>
  <T.PlaneGeometry args={[ROOM_WIDTH, CEILING_Y]} />
</T.Mesh>
<T.Mesh position={[0, CEILING_Y, 0]} rotation.x={Math.PI / 2} material={basalt}>
  <T.PlaneGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
</T.Mesh>
<T.Mesh
  position={[-ROOM_WIDTH / 2, CEILING_Y / 2, 0]}
  rotation.y={Math.PI / 2}
  material={basalt}
>
  <T.PlaneGeometry args={[ROOM_DEPTH, CEILING_Y]} />
</T.Mesh>
<T.Mesh
  position={[ROOM_WIDTH / 2, CEILING_Y / 2, 0]}
  rotation.y={-Math.PI / 2}
  material={basalt}
>
  <T.PlaneGeometry args={[ROOM_DEPTH, CEILING_Y]} />
</T.Mesh>

<T.Group position.x={x("bed")}>
  {#each bedKerb as kerb, i (i)}
    <T.Mesh position={[kerb.x, 0.075, kerb.z]} material={iron}>
      <T.BoxGeometry args={[kerb.w, 0.15, kerb.d]} />
    </T.Mesh>
  {/each}

  <LavaCracks
    config={bedCoals}
    groundSize={1}
    edgeFade={0}
    placement={{
      position: [0, 0.04, 0],
      rotation: [-Math.PI / 2, 0, 0],
      size: [BED_SIZE, BED_SIZE],
    }}
  />

  <!-- Lumps raked over the crust, so the glow reads as coming from BETWEEN
       coals rather than from a lit rectangle in a box. -->
  <T.Group position={[0, 0.02, BED_SIZE * 0.46]}>
    <FirstFireCoalBank
      width={BED_SIZE * 0.92}
      height={0.16}
      depth={BED_SIZE * 0.92}
      count={210}
      sizeRange={[0.05, 0.13]}
      emberColor="#ff5a12"
      heat="raked"
      seed={3}
    />
  </T.Group>

  <T.PointLight
    position={[0, 0.5, 0]}
    color="#ff5312"
    intensity={9}
    distance={11}
    decay={2}
  />

  <T.Group position.y={floorLift}>
    <EmberFountains config={bedEmbers} />
    <HeatDistortion position={{ x: 0, z: 0 }} radius={BED_SIZE * 0.6} height={3.2} intensity={0.12} />
  </T.Group>
</T.Group>

<T.Group position={[x("wall"), 0, BACK_Z + 0.06]}>
  <FirstFireCoalWall
    bayWidth={WALL_W}
    height={WALL_H}
    treatment={wallTreatment}
    material={iron}
  />
</T.Group>

<!-- Three of them, receding. A single fixture can only answer "does this read
     as a lamp"; the actual brief is that they MARK THE WAY, and one lamp
     cannot mark anything. Spaced 3.4m, which is roughly four walking paces -
     close enough that the next one is already lit when you leave the last. -->
<T.Group position.x={x("lamp")}>
  <!-- The fix the frames demanded. A black iron fixture is read as a SILHOUETTE,
       and there was nothing behind these to be black against - so the hood
       disappeared and only its rim and ribs drew, which looks like a broken
       frame hanging in a void. Cribbing behind the row gives the lamps an edge.

       It is also the honest architecture: a corridor lit by hanging lamps has
       banked coal down its length, which is where the lamps get their fuel. The
       run is taller than the hearth version so it reaches past the hoods -
       stopping it at hearth height would silhouette the baskets and leave the
       pyramids in black, which is the failure with extra steps. -->
  <T.Group position={[0, 0, BACK_Z + 0.06]}>
    <FirstFireCoalWall
      bayWidth={3.2}
      height={4.2}
      bays={2}
      treatment={wallTreatment}
      lumpsPerBay={280}
      lightIntensity={4}
      lightDistance={9}
      seed={41}
      material={iron}
    />
  </T.Group>

  {#each lampRow as lamp, i (i)}
    <T.Group position.z={lamp.z}>
      <FirstFireCoalLamp
        ceilingY={CEILING_Y}
        basketY={2.55}
        lightIntensity={lamp.intensity}
        dripCount={lamp.drips}
      />
    </T.Group>
  {/each}
</T.Group>

<T.Group position={[x("furnace"), 0, BACK_Z + 0.06]}>
  <!-- Recess interior, set back so the mouth has depth to it. -->
  <T.Mesh position={[0, FURNACE_SILL + FURNACE_H / 2, -0.5]} material={basalt}>
    <T.BoxGeometry args={[FURNACE_W, FURNACE_H, 1]} />
  </T.Mesh>
  <LavaCracks
    config={furnaceCoals}
    groundSize={1}
    edgeFade={0}
    placement={{
      position: [0, FURNACE_SILL + FURNACE_H / 2, -0.02],
      rotation: [0, 0, 0],
      size: [FURNACE_W - 0.1, FURNACE_H - 0.1],
    }}
  />

  <!-- Fuel in the mouth. The first pass left this as bare glow behind heat
       haze and it read as a soft orange rectangle - the same failure the wall
       had, for the same reason. A furnace is a fire you are looking INTO, so
       there has to be something in there for the light to come from behind. -->
  <T.Group position={[0, FURNACE_SILL, 0.1]}>
    <FirstFireCoalBank
      width={FURNACE_W - 0.25}
      height={FURNACE_H * 0.72}
      depth={0.42}
      count={260}
      sizeRange={[0.06, 0.17]}
      emberColor="#ff8a2a"
      heat="banked"
      seed={27}
    />
  </T.Group>

  <!-- Fire bars. Horizontal here, vertical on the banked wall: a grate holds
       fuel back, a fire bar holds it UP off the ash pit, and the difference in
       run is what stops the two stations reading as the same fitting twice. -->
  {#each furnaceBars as bar, i (i)}
    <T.Mesh position={[0, bar.y, 0.16]} material={iron}>
      <T.BoxGeometry args={[FURNACE_W, 0.075, 0.11]} />
    </T.Mesh>
  {/each}

  <!-- Iron surround -->
  <T.Mesh position={[0, FURNACE_SILL - 0.12, 0.14]} material={iron}>
    <T.BoxGeometry args={[FURNACE_W + 0.5, 0.24, 0.3]} />
  </T.Mesh>
  <T.Mesh position={[0, FURNACE_SILL + FURNACE_H + 0.12, 0.14]} material={iron}>
    <T.BoxGeometry args={[FURNACE_W + 0.5, 0.24, 0.3]} />
  </T.Mesh>
  <T.Mesh position={[-(FURNACE_W / 2 + 0.13), FURNACE_SILL + FURNACE_H / 2, 0.14]} material={iron}>
    <T.BoxGeometry args={[0.26, FURNACE_H + 0.5, 0.3]} />
  </T.Mesh>
  <T.Mesh position={[FURNACE_W / 2 + 0.13, FURNACE_SILL + FURNACE_H / 2, 0.14]} material={iron}>
    <T.BoxGeometry args={[0.26, FURNACE_H + 0.5, 0.3]} />
  </T.Mesh>

  <T.PointLight
    position={[0, FURNACE_SILL + FURNACE_H / 2, 1.4]}
    color="#ff8a2a"
    intensity={furnaceIntensity}
    distance={16}
    decay={2}
  />

  <T.Group position={[0, FURNACE_SILL + FURNACE_H, 0.9]}>
    <FallingParticles
      type="smoke"
      count={34}
      area={{ width: 2.4, height: 3.4, depth: 1.6 }}
      speed={0.05}
      colors={["#3d322c", "#2a221e", "#4a3c34", "#1c1613"]}
      sizeRange={[0.3, 0.9]}
      opacity={0.16}
      spin={false}
    />
  </T.Group>
  <T.Group position={[0, FURNACE_SILL + FURNACE_H / 2, 0.7]}>
    <HeatDistortion position={{ x: 0, z: 0 }} radius={1.1} height={3} intensity={0.16} />
  </T.Group>
</T.Group>

<T.Group position={[x("steam"), 0, -1.2]}>
  <FirstFireSteamVent ceilingY={CEILING_Y} material={iron} />
</T.Group>

<!-- Ash drifting through the whole room, one atmosphere for all five. Kept to
     the near band rather than the full 52m depth: the room runs long only so
     the lineup camera has floor under it, and seeding ash down all of it would
     spend the budget where nobody is looking. -->
<T.Group position={[0, 2.4, 0]}>
  <FallingParticles
    type="dust"
    count={140}
    area={{ width: ROOM_WIDTH, height: 5, depth: 16 }}
    speed={0.035}
    colors={["#3a2a24", "#2a1a16", "#4a3028", "#1a1010"]}
    sizeRange={[0.015, 0.05]}
    opacity={0.5}
    spin={false}
  />
</T.Group>

{#if showScaleFigure}
  <!-- Pushed to the far side of each station and set back, so the reference
       never parks itself between the camera and the thing being judged. -->
  {#each LOOKDEV_STATIONS as s (s.id)}
    <T.Mesh position={[s.x - 2.5, 0.875, -1.6]} material={scaleFigureMaterial}>
      <T.CapsuleGeometry args={[0.22, 1.31, 4, 10]} />
    </T.Mesh>
  {/each}
{/if}
