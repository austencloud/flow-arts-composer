<script lang="ts">
  /**
   * The Earth wing as the museum walks it: the authored Root Terrace shell plus
   * everything the museum puts INTO it at runtime.
   *
   * The GLB (`static/models/museum/cave/earth-root-terrace.glb`) is the
   * finished cave - carved from the same digest-stamped plan physics reads,
   * remeshed, textured and baked in Blender by
   * scripts/build-earth-root-terrace-production.py. It carries the rock in two
   * pieces under their own lightmaps (the walked route, and the pit the route
   * looks down into), the brass rail and its lanterns, the cut-stone case
   * letters and the wing stamp, the roots that come through the ceiling, and
   * the disc of sky at the top of the aven.
   *
   * The wing's verb is COMPARE and its barrier is ELEVATION. Everything below
   * follows from that: the three cases stand on the rootbed five metres under
   * the walking line, the visitor never descends to them, and the payoff is the
   * sightline from the landing where the row of three nests away down one axis
   * and unison reads as a single shape. So:
   *
   *   pedestals   the museum-wide standard riser under each case, and one at
   *               the vestibule opener drawing the hand path alone.
   *   performers  three automatons on the bed, one at the opener, all facing
   *               the terrace the visitor walks.
   *   lights      four pooled point lights through the room light plan - the
   *               shaft over the middle case, two lanterns on the rail, and the
   *               green seam at the Fire door. The pool keeps the nearest three.
   *
   * The GLB is authored about the earth room's plan centre, so it mounts at that
   * centre and nothing else moves. Museum3DScene's generic performer loop skips
   * the Earth stations because this file owns them.
   */
  import { T } from "@threlte/core";
  import {
    MeshStandardMaterial,
    Raycaster,
    Vector3,
    type Mesh,
    type Object3D,
  } from "three";
  import GltfAsset from "$lib/shared/3d/environments/primitives/GltfAsset.svelte";
  import PedestalMesh from "../graybox/PedestalMesh.svelte";
  import MuseumPerformerStation3D from "./MuseumPerformerStation3D.svelte";
  import type { MuseumGrid } from "../../domain/museum-grid-types";
  import type {
    AuthoredPointLight,
    AuthoredPointLightPlanChange,
  } from "../../services/museum-room-light-pool";
  import {
    BED_Y,
    DOOR_Y,
    EARTH_ROOM_ID,
    EYE_ABOVE_FLOOR,
    LANDING_Y,
    OVERLOOK_Y,
    buildEarthRootTerraceLayout,
    type EarthCaseLetter,
  } from "../../data/earth-root-terrace-terrain";
  import {
    EARTH_ROOT_TERRACE_GLB_URL,
    buildEarthRootTerraceBlenderContract,
  } from "../../data/earth-root-terrace-blender-contract";
  import { pedestalFaceDataUri } from "../../services/pedestal-face";
  import { PEDESTAL_DIAMETER, sizePedestal } from "../../domain/pedestal-standard";

  interface Props {
    grid: MuseumGrid;
    /** Room the player is standing in; the wing idles when they are elsewhere. */
    currentRoomId?: string | null;
    /** Where the visitor is, in world metres. Wakes the cases they walk toward. */
    playerPosition: { x: number; y: number; z: number };
    visible?: boolean;
    onLightPlanChange?: AuthoredPointLightPlanChange;
  }
  const {
    grid,
    currentRoomId = null,
    playerPosition,
    visible = true,
    onLightPlanChange,
  }: Props = $props();

  /** Living green: the seam Fire hands over at the threshold, carried through. */
  const EARTH_TINT = "#84c060";
  /**
   * The pedestal's default body is the Water gallery's slate (#2b3a41). On a
   * daylight-lit rootbed of pale olive rock that reads as a hole cut in the
   * floor, not as a riser standing on it - and every beat in this wing looks
   * DOWN at these discs, so it is the one fixture the visitor never stops
   * seeing. This is mossy_rock's own mean diffuse taken two stops down: the
   * same stone as the bed, cut and set.
   */
  const EARTH_PEDESTAL_BODY = "#55543f";
  const PEDESTAL_PROP = "staff";
  /** The room IS the exhibit; a case is awake anywhere on the terrace. */
  const PERFORMER_ACTIVE_M = 30;

  const layout = buildEarthRootTerraceLayout(grid);
  const contract = layout ? buildEarthRootTerraceBlenderContract(layout) : null;
  /**
   * The Blender authoring origin: the earth ROOM's plan centre, which is what
   * scripts/export-earth-root-terrace-blender-plan.ts hands the exporter.
   * Blender (x, y, z) lands in the museum as (x + ox, z, oz - y).
   */
  const origin: [number, number, number] = contract
    ? [contract.room.planCentre.x, 0, contract.room.planCentre.z]
    : [0, 0, 0];

  // ── The baked light ───────────────────────────────────────────────────────
  // The lightmaps are baked at Cycles exposure and read dark under the museum's
  // ACES, so they take the same flat lift the Water and Fire shells take. The
  // emissive-ONLY materials must not: they are tuned here by exact name, so a
  // colour change is a reload rather than a rebake.
  const LIGHTMAP_BOOST = 2.6;
  const EMISSIVE_TUNING: Record<
    string,
    { color?: string; base?: string; intensity: number }
  > = {
    // Nineteen metres of rock with a hole in it. The disc is the brightest
    // thing in the wing on purpose: it is the only daylight in the museum, and
    // the climb is toward it.
    "ET Sky": { color: "#dbe9ff", base: "#8fa8c6", intensity: 2.6 },
    // Brass lanterns on the rail. Warm, and weak enough that the shaft still
    // wins the room.
    "ET Lamp": { color: "#ffb45a", base: "#2a1c0a", intensity: 1.5 },
  };

  /**
   * The rootbed is ground, not a slab: the production pass mounds it by up to
   * a sixth of a metre so it does not read as poured concrete. Nothing walks
   * on it, so that is free - but the three cases STAND on it, and a pedestal
   * placed at the plan datum would float or sink by whatever the mound did
   * there. So measure the rock under each case off the loaded GLB, the way the
   * Fire courts measure their stones, and stand the pedestal on what is
   * actually there.
   */
  let bedSurface = $state<Partial<Record<EarthCaseLetter, number>>>({});

  function stageShell(shell: Object3D): void {
    if (!layout) return;
    shell.updateMatrixWorld(true);
    const seen = new Set<MeshStandardMaterial>();
    shell.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!(mat instanceof MeshStandardMaterial) || seen.has(mat)) continue;
        seen.add(mat);
        const tune = EMISSIVE_TUNING[mat.name];
        if (tune) {
          if (tune.color) mat.emissive.set(tune.color);
          if (tune.base) mat.color.set(tune.base);
          mat.emissiveIntensity = tune.intensity;
        } else if (mat.emissiveMap) {
          mat.emissiveIntensity = (mat.emissiveIntensity || 1) * LIGHTMAP_BOOST;
        }
      }
    });

    // The ray is cast in the SHELL's own frame, not the museum's. GltfAsset
    // hands this callback `gltf.scene` at load time, before it is parented to
    // the group that carries `origin`, so its world matrix is still identity
    // and a museum-space ray misses the model entirely - silently, because a
    // miss falls back to the plan datum and the pedestals look plausible.
    // The mount only translates in X and Z, so a local hit's Y is already the
    // museum's Y and needs no transform back.
    const caster = new Raycaster();
    const down = new Vector3(0, -1, 0);
    const measured: Partial<Record<EarthCaseLetter, number>> = {};
    for (const station of layout.stations) {
      // From above the crown and below the terrace deck, so the ray can only
      // meet the bed: a start above the roof would hit the ceiling first.
      caster.set(
        new Vector3(
          station.centre.x - origin[0],
          BED_Y + 3,
          station.centre.z - origin[2]
        ),
        down
      );
      const hit = caster.intersectObject(shell, true)[0];
      measured[station.letter] = hit ? hit.point.y : station.floorY;
    }
    bedSurface = measured;
  }

  /** The wing is live while the visitor stands in it. */
  const near = $derived(visible && currentRoomId === EARTH_ROOM_ID);

  // ── The fixtures ──────────────────────────────────────────────────────────
  /**
   * The riser under a case is the museum's standard riser, NOT the eye-line
   * height the Water cases use. The eye-line rule puts a prop centre at the
   * visitor's eye; here the visitor is five metres above the performer and
   * looking down, which is the entire pedagogy of this wing. Raising the cases
   * to the walking line would put them level with the rail and destroy the
   * overlook. So the riser lifts the drawing clear of the ground and the
   * elevation does the teaching.
   */
  function caseRiser(surfaceY: number) {
    return sizePedestal(surfaceY, surfaceY, EYE_ABOVE_FLOOR);
  }

  function faceUriFor(sequenceId: string, handPathOnly: boolean): string | null {
    try {
      return pedestalFaceDataUri({
        sequenceId,
        propType: PEDESTAL_PROP,
        tint: EARTH_TINT,
        handPathOnly,
      });
    } catch (error) {
      console.error("[earth pedestal]", error);
      return null;
    }
  }

  const caseFaces: Record<string, string | null> = layout
    ? Object.fromEntries(
        layout.stations.map((s) => [s.letter, faceUriFor(s.sequenceId, false)])
      )
    : {};
  /**
   * The opener is propless and draws the hand path alone: the class name before
   * any of its members. Same grammar as the Water and Fire openers.
   */
  const openerFace: string | null = layout
    ? faceUriFor(layout.stations[0]!.sequenceId, true)
    : null;

  /** Face north, at the terrace the visitor walks: yaw pi is toward -z. */
  const FACING_TERRACE = Math.PI;
  /** Face the Fire door, which is due west of the opener: toward -x. */
  const FACING_WEST_DOOR = -Math.PI / 2;

  const cases = $derived.by(() => {
    if (!layout) return [];
    return layout.stations.map((station) => {
      const surfaceY = bedSurface[station.letter] ?? station.floorY;
      const riser = caseRiser(surfaceY);
      const distance = Math.hypot(
        station.centre.x - playerPosition.x,
        station.centre.z - playerPosition.z
      );
      return {
        letter: station.letter,
        stationId: station.performerId,
        sequenceId: station.sequenceId,
        x: station.centre.x,
        z: station.centre.z,
        baseY: riser.baseY,
        topY: riser.topY,
        height: riser.height,
        faceUri: caseFaces[station.letter] ?? null,
        // Keyed on the measurement: the station reads its standing surface once
        // at mount, so a rig mounted before the GLB resolved would keep the plan
        // datum for the rest of the walk.
        key: `${station.letter}:${surfaceY.toFixed(3)}`,
        active: near && distance < PERFORMER_ACTIVE_M,
      };
    });
  });

  const opener = $derived.by(() => {
    if (!layout) return null;
    const riser = caseRiser(layout.opener.floorY);
    const distance = Math.hypot(
      layout.opener.centre.x - playerPosition.x,
      layout.opener.centre.z - playerPosition.z
    );
    return {
      x: layout.opener.centre.x,
      z: layout.opener.centre.z,
      baseY: riser.baseY,
      topY: riser.topY,
      height: riser.height,
      active: near && distance < PERFORMER_ACTIVE_M,
    };
  });

  // ── The pooled lights ─────────────────────────────────────────────────────
  // Four slots, always reported so the renderer keeps its fixed PointLights and
  // only their intensities move. The pool hands the shader the nearest three,
  // which along this route means the shaft plus whichever pair of fixtures the
  // visitor is between.
  const lightPlan = $derived.by((): AuthoredPointLight[] => {
    if (!layout) return [];
    const railZ = layout.bed.minZ;
    // The north lane's lantern, on the overlook rail. It serves the ramp head
    // and the spur together; the catwalk below is lit by the daylight shaft
    // and by its own console caps, which are emissive furniture rather than
    // a fifth light (the pool is fixed at four so the shader never relinks).
    const overlookLamp = {
      x: (layout.overlook.minX + layout.overlook.maxX) / 2,
      z: railZ,
    };
    const landingLamp = {
      x: layout.landing.maxX - 0.35,
      z: (layout.landing.minZ + layout.landing.maxZ) / 2,
    };
    const seam = {
      x: layout.vestibule.minX + 1.4,
      z: (layout.westDoor.min + layout.westDoor.max) / 2,
    };
    return [
      {
        // Daylight, standing in the shaft rather than on the bed: a point
        // this high falls off across the pit the way the baked shaft does,
        // so the runtime light and the lightmap agree about where the pool is.
        x: layout.avenCentre.x,
        y: BED_Y + 7.5,
        z: layout.avenCentre.z,
        color: "#bcd8ff",
        intensity: near ? 34 : 0,
        distance: 26,
      },
      {
        x: overlookLamp.x,
        y: OVERLOOK_Y + 2.0,
        z: overlookLamp.z,
        color: "#ffb45a",
        intensity: near ? 9 : 0,
        distance: 13,
      },
      {
        x: landingLamp.x,
        y: LANDING_Y + 2.0,
        z: landingLamp.z,
        color: "#ffb45a",
        intensity: near ? 9 : 0,
        distance: 13,
      },
      {
        // The green seam Fire lit at its own Earth door, answered on this side:
        // the visitor walks out of a room that has just gone black and into
        // growth. Elemental names are never spoken; the colour carries it.
        x: seam.x,
        y: DOOR_Y + 2.1,
        z: seam.z,
        color: "#72d957",
        intensity: near ? 14 : 0,
        distance: 12,
      },
    ];
  });

  $effect(() => {
    if (!layout || !onLightPlanChange) return;
    onLightPlanChange("earth-root-terrace", {
      roomIds: [EARTH_ROOM_ID],
      lights: lightPlan,
    });
    return () => onLightPlanChange("earth-root-terrace", null);
  });

  // Dev seam, the same idea as window.__firstFire: the measured bed and the
  // light plan are not visible from outside the component, and a browser
  // verification pass needs to read them without guessing from screenshots.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    // Getters, so a read happens when the console asks, not inside an effect
    // that would re-run on every frame the visitor moves.
    (window as unknown as { __earth?: unknown }).__earth = {
      get near() {
        return near;
      },
      get bedSurface() {
        return $state.snapshot(bedSurface);
      },
      get ensemble() {
        return layout ? layout.ensemble : null;
      },
      get cases() {
        return cases.map((c) => ({
          letter: c.letter,
          topY: c.topY,
          active: c.active,
        }));
      },
      get lights() {
        return lightPlan.map((l) => ({ x: l.x, z: l.z, intensity: l.intensity }));
      },
      get player() {
        return { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z };
      },
    };
  }
</script>

{#if layout}
  <T.Group {visible}>
    <GltfAsset url={EARTH_ROOT_TERRACE_GLB_URL} position={origin} onReady={stageShell} />

    {#each cases as station (station.letter)}
      <PedestalMesh
        position={[station.x, station.baseY, station.z]}
        height={station.height}
        diameter={PEDESTAL_DIAMETER}
        faceUri={station.faceUri}
        tint={EARTH_TINT}
        bodyColor={EARTH_PEDESTAL_BODY}
      />
    {/each}

    {#if opener}
      <PedestalMesh
        position={[opener.x, opener.baseY, opener.z]}
        height={opener.height}
        diameter={PEDESTAL_DIAMETER}
        faceUri={openerFace}
        tint={EARTH_TINT}
        bodyColor={EARTH_PEDESTAL_BODY}
        animated={true}
      />
    {/if}

    {#each cases as station (station.letter)}
      {#key station.key}
        <MuseumPerformerStation3D
          stationId={station.stationId}
          worldX={station.x}
          worldY={station.topY}
          worldZ={station.z}
          facingAngle={FACING_TERRACE}
          sequenceId={station.sequenceId}
          autoPlay={true}
          active={station.active}
          showGrid={false}
          showPlatform={false}
          standingSurfaceHeight={0}
        />
      {/key}
    {/each}

    {#if opener}
      <MuseumPerformerStation3D
        stationId="cave-earth-opener"
        worldX={opener.x}
        worldY={opener.topY}
        worldZ={opener.z}
        facingAngle={FACING_WEST_DOOR}
        sequenceId={layout.stations[0]!.sequenceId}
        autoPlay={true}
        active={opener.active}
        showGrid={false}
        showPlatform={false}
        standingSurfaceHeight={0}
      />
    {/if}
  </T.Group>
{/if}
