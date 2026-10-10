<script lang="ts">
  /**
   * FirstFireEmberDressing
   *
   * Gate 3 environment pass for The Cinder Court. Each court is its own
   * environment rather than one treatment repeated three times, composed from
   * the existing ember scene components instead of re-deriving volcanic
   * shading here.
   *
   * The through-line is one volcano read vertically - magma chamber, then the
   * burn, then the eruption column - documented in first-fire-court-identity.
   *
   * Two hard constraints from the Gate 3 spec:
   *
   * 1. Every photon comes from something burning. There is no ambient fill and
   *    no sky dome, so `lit` can take the room to true black at the
   *    extinguish beat. VolcanicHaze stays unmounted for that reason: it is an
   *    inward-facing additive sphere, which is a sky.
   * 2. Fire never owns collision. Everything here is visual-only; the collider
   *    set in first-fire-graybox-colliders.ts is untouched.
   */
  import { T } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import LavaCracks from "#lib/shared/3d/environments/scenes/ember/LavaCracks.svelte";
  import HeatDistortion from "#lib/shared/3d/environments/scenes/ember/HeatDistortion.svelte";
  import LavaPool from "#lib/shared/3d/environments/scenes/ember/LavaPool.svelte";
  import LavaRivers from "#lib/shared/3d/environments/scenes/ember/LavaRivers.svelte";
  import ObsidianPillars from "#lib/shared/3d/environments/scenes/ember/ObsidianPillars.svelte";
  import EmberFountains from "#lib/shared/3d/environments/scenes/ember/EmberFountains.svelte";
  import { createDefaultEmberConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/ember-scene-config.js";
  import { firstFireCourtIdentity } from "./first-fire-court-identity";
  import type { FirstFireBlenderContract } from "#lib/features/museum/data/first-fire-blender-contract.js";

  interface Props {
    contract: FirstFireBlenderContract;
    /** False from the extinguish beat onward: every ember source goes out. */
    lit: boolean;
    /** The court the visitor is standing in, or null on the approach. */
    activeShrineId: string | null;
  }

  const props: Props = $props();

  const ember = createDefaultEmberConfig();

  // The ember components anchor to the avatar ground datum (about -1.4m); the
  // museum floor is y=0. Same compensation MuseumPerformerStation3D applies.
  const floorLift = $derived(-userProportionsState.groundY);

  // Runtime space is (blender.x, blender.z, -blender.y) per the exporter.
  const courts = $derived(
    props.contract.shrines.map((shrine) => {
      const identity = firstFireCourtIdentity(shrine.id);
      return {
        id: shrine.id,
        x: shrine.blenderCentre.x,
        z: -shrine.blenderCentre.y,
        identity,
        // Outer edge of the walked orbit band. Everything this pass adds sits
        // outboard of it so nothing crowds the floor the visitor walks.
        walkedOuter: shrine.orbitRadius + shrine.orbitWidth / 2,
      };
    })
  );

  /**
   * DJ: the magma chamber. A ring of obsidian columns closes the court in, a
   * molten pool sits outside the walked band feeding rivers back toward it,
   * and embers spout off the pool. This is the room the visitor should read as
   * "inside the mountain" before any prop effect has fired.
   */
  /**
   * The walked route, in coordinates local to a court group, plus the room's
   * own corridor half-width. Anything the ring generator would put here stands
   * in the visitor's way: the rings are laid out by angle alone and know
   * nothing about the plan's path sections.
   *
   * The extra 0.9m is the pillar's own footprint - a scaled shaft is ~0.45m
   * across and its secondary shard leans 0.3m further out, so clearing only to
   * the corridor edge still leaves rock overhanging the walkway.
   */
  const PILLAR_FOOTPRINT = 0.9;
  function routeKeepOut(courtX: number, courtZ: number) {
    return props.contract.pathSections.map((section) => ({
      points: section.blenderPoints.map(
        (point) => [point.x - courtX, -point.y - courtZ] as [number, number]
      ),
      radius: section.width / 2 + PILLAR_FOOTPRINT,
    }));
  }

  /**
   * DJ's ring, sized to the court it closes rather than to the room.
   *
   * The first pass ran the rings at 9.2m and 12.6m around a court whose own
   * outline is radius 7. At that reach the outer ring stopped being the court's
   * wall and became free-standing rock scattered across the whole west end of
   * the room - two of them landed 0.35m and 1.8m from the centre of the walked
   * corridor, which is a 9m obsidian column planted in the middle of the path
   * the visitor is walking down. Pulled in to hug the rim, they read as what
   * they are: the chamber's edge, with a gate cut where the route comes in.
   *
   * Heights are budgeted against the plan's vertical clearance (5.5m over the
   * route, 6m in a court) rather than the open-air ember scene's. The pillar
   * spire adds 30% over its shaft, and the group scale multiplies both, so the
   * tallest instance here finishes at about 5.5m instead of punching 12m
   * through the ceiling.
   */
  const djPillars = {
    ...ember.obsidianPillars,
    clearingRadius: 7.4,
    rings: [
      { radius: 8.3, count: 9, scaleBase: 1.05, scaleVariation: 0.2, radiusJitter: 0.6 },
      { radius: 10.6, count: 12, scaleBase: 0.95, scaleVariation: 0.2, radiusJitter: 0.9 },
    ],
    heightRange: [2.4, 3.4] as [number, number],
    veinColor: "#ff4a12",
    veinIntensity: 0.75,
    baseColor: "#0a0708",
  };

  const djPool = {
    ...ember.lavaPool,
    enabled: true,
    // Local to the DJ court group: off the visitor's path, past the columns.
    position: { x: -9.6, z: 4.2 },
    radius: 3.4,
    // The ember scene's pool lights a whole open crater (14 @ 26m). At court
    // scale that reach floods the walked floor 10m away and turns the court
    // pale terracotta. The pool lights itself and the rock it sits in.
    lightIntensity: 6,
    lightDistance: 12,
  };

  const djRivers = {
    enabled: true,
    // Two channels running from the pool back under the court's outer wall.
    channels: [
      { angle: 0.55, length: 16, curvature: 0.3, widthScale: 1 },
      { angle: 2.35, length: 13, curvature: -0.22, widthScale: 0.8 },
    ],
    baseColor: djPool.baseColor,
    hotColor: djPool.hotColor,
    crustColor: djPool.crustColor,
    flowSpeed: 0.16,
    width: 1.5,
    warpIntensity: 0.5,
  };

  const djFountains = {
    ...(ember.emberFountains ?? {
      count: 40,
      riseSpeed: 0.6,
      colors: ["#ff4400", "#ff6600", "#ffaa00", "#ff2200"],
      sizeRange: [0.03, 0.08] as [number, number],
      maxHeight: 8,
      gravity: 0.3,
      burstInterval: 3.5,
      burstCount: 12,
    }),
    enabled: true,
    count: 34,
    spawnRadius: djPool.radius * 0.85,
    maxHeight: 7,
  };

  // Floor veins span the whole run; the courts differ by what stands on them.
  const cracks = { ...ember.lavaCracks, intensity: 0.28 };
</script>

{#if props.lit}
  <T.Group position.y={floorLift}>
    <!-- Floor veins under the walked route, one plane spanning the court run. -->
    <LavaCracks config={cracks} groundSize={64} />

    <!-- DJ: the magma chamber. -->
    {#each courts.filter((court) => court.id === "dj") as court (court.id)}
      <T.Group position.x={court.x} position.z={court.z}>
        <ObsidianPillars
          config={{ ...djPillars, keepOut: routeKeepOut(court.x, court.z) }}
        />
        <LavaPool config={djPool} />
        <LavaRivers config={djRivers} poolPosition={djPool.position} />
        <EmberFountains config={djFountains} />
        <!-- Heat rises off the molten pool, NOT off the court. Centred on the
             court at walked-band scale this billboard is ~19m across and lays
             a flat orange scrim over the whole room. -->
        <HeatDistortion
          position={djPool.position}
          radius={djPool.radius * 1.15}
          height={4.5}
          intensity={0.1}
        />
      </T.Group>
    {/each}
  </T.Group>

  {#each courts as court (court.id)}
    <!-- The trench itself is authored geometry (FF_Trench_*) re-materialised in
         first-fire-court-materials. Emissive material casts no light, so each
         court still needs its own key at the channel's height. -->
    <T.PointLight
      position={[court.x, court.identity?.keyHeight ?? 0.5, court.z]}
      color={court.identity?.keyColor ?? "#ff5a12"}
      intensity={(court.identity?.keyIntensity ?? 16) *
        (court.id === props.activeShrineId ? 1 : 0.45)}
      distance={14}
      decay={2}
    />
    <!--
      Chamber bounce.

      The shell is carved, so each court now has its own rock wall standing
      7.3m out and a crown 6 to 9.2m up. The key above is a point source at
      decay 2 tuned for the performer: by the time it reaches that wall it is
      worth about a tenth of what it is worth on the pad, and the chamber
      renders black. The visitor then stands on a lit disc in a void, which is
      the exact "floor does not connect to the walls" read that reopened
      Gate 2 - only now the geometry is right and the lighting hides it.

      This is the molten floor throwing light back onto its own chamber. A
      glowing floor is an area source, not a point, so it falls off closer to
      linearly: decay 1 over the chamber radius keeps the wall and the crown
      legible without doubling the exposure on the pad. It still burns - it
      goes out with everything else at the extinguish beat.
    -->
    <T.PointLight
      position={[court.x, (court.identity?.keyHeight ?? 2.4) + 1.2, court.z]}
      color={court.identity?.keyColor ?? "#ff5a12"}
      intensity={court.id === props.activeShrineId ? 2.2 : 1.5}
      distance={26}
      decay={1}
    />
  {/each}
{/if}
