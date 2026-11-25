<script lang="ts">
  /**
   * The fire show on the stage: two or three performers spinning lit props.
   *
   * Nothing here is new. It is the jam's own path laid out at plain spots:
   * `LiveSequencePerformer3D` with the prop from `jamFireProp`, a LOOP from the
   * jam's pool, the jam's avatar picker, the jam's ground glow and a warm
   * flickering point light per performer, the way `FlowFestJamPeople` does it.
   * The scene mounts this only while Fire is on, so turning it off removes the
   * performers, their props and their lights together.
   */
  import { onDestroy, onMount } from "svelte";
  import { T, useTask } from "@threlte/core";
  import { Color, PointLight, type MeshBasicMaterial } from "three";
  import { propFinishState } from "@austencloud/scene-3d";
  import LiveSequencePerformer3D from "#lib/shared/3d/performers/LiveSequencePerformer3D.svelte";
  import type { JamPropFamily } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";
  import {
    createFlowFestPlaceholderPool,
    flowFestSequenceForPerformer,
    type FlowFestPerformerSequencePool,
  } from "../flow-fest-sim/flow-fest-performer-sequences";
  import { buildFireGroundGlow, jamAvatarFor, jamFireProp, jamSequencePool } from "../flow-fest-jam/flow-fest-jam-people";
  import { yawToward, type Pt } from "./site-walk-plan";

  interface Props {
    /** Where they stand, with the ground's height there (0 when left out). */
    spots: readonly (Pt & { y?: number })[];
    /** Where the performers face: the guests. */
    toward: Pt;
    /** 0 in daylight, 1 at night: how much the fire's light and glow count. */
    dark: number;
  }
  const props: Props = $props();

  /** What each stands with, in turn: poi, a double staff, poi. */
  const FAMILIES: readonly JamPropFamily[] = ["poi", "double-staff", "poi"];
  const LIGHT_HEIGHT = 1.75;
  const MAX_SPOTS = 3;

  let sequencePool = $state.raw<FlowFestPerformerSequencePool>(createFlowFestPlaceholderPool());
  onMount(() => {
    let cancelled = false;
    void jamSequencePool()
      .then((pool) => {
        if (!cancelled) sequencePool = pool;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  const performers = $derived(
    props.spots.slice(0, MAX_SPOTS).map((spot, i) => {
      const id = `site-fire-${i}`;
      return {
        id,
        spot,
        facing: yawToward(spot, props.toward),
        fire: jamFireProp(FAMILIES[i % FAMILIES.length]!, false, propFinishState.build),
        seed: ((i * 37 + 11) % 100) / 100,
      };
    }),
  );

  // A real warm light per performer lights the stage floor, the front rows and the canopy. It swings
  // in front of them as the fire does, so the light on every face near the stage moves too.
  const lights = Array.from({ length: MAX_SPOTS }, () => {
    const light = new PointLight(new Color(1.0, 0.38, 0.08), 0, 30, 1.45);
    light.castShadow = false;
    return light;
  });
  const glow = buildFireGroundGlow(MAX_SPOTS);
  let clock = 0;

  useTask((delta) => {
    clock += delta;
    const dark = props.dark;
    glow.mesh.count = performers.length;
    performers.forEach((p, i) => {
      const light = lights[i]!;
      const flicker = 0.82 + 0.12 * Math.sin(clock * 11 + i * 2.1) + 0.06 * Math.sin(clock * 27 + i * 5.3);
      const away = Math.hypot(props.toward.x - p.spot.x, props.toward.z - p.spot.z) || 1;
      const fx = (props.toward.x - p.spot.x) / away;
      const fz = (props.toward.z - p.spot.z) / away;
      const swing = clock * 3.4 + i * 2.3;
      const side = Math.sin(swing) * 0.55;
      light.position.set(p.spot.x + fx * 1.15 - fz * side, (p.spot.y ?? 0) + LIGHT_HEIGHT + Math.cos(swing) * 0.35, p.spot.z + fz * 1.15 + fx * side);
      // Lit by day too, but the fire is the main light only once the sun is low.
      light.intensity = 17 * flicker * (0.35 + 0.65 * dark);
      const r = 2.6 * (0.85 + 0.15 * Math.sin(clock * 9 + i * 1.7));
      glow.matrix.makeScale(r, 1, r).setPosition(p.spot.x, (p.spot.y ?? 0) + 0.07, p.spot.z);
      glow.mesh.setMatrixAt(i, glow.matrix);
    });
    for (let i = performers.length; i < lights.length; i++) lights[i]!.intensity = 0;
    glow.mesh.instanceMatrix.needsUpdate = true;
    const g = 0.06 + 0.12 * dark;
    (glow.mesh.material as MeshBasicMaterial).color.setRGB(1.4 * g, 0.6 * g, 0.18 * g);
  });

  onDestroy(() => {
    glow.mesh.geometry.dispose();
    (glow.mesh.material as { dispose(): void }).dispose();
  });
</script>

{#each lights as light, i (i)}
  <T is={light} />
{/each}
<T is={glow.mesh} />

{#each performers as p (p.id)}
  <LiveSequencePerformer3D
    id={p.id}
    position={{ x: p.spot.x, y: (p.spot.y ?? 0) + 0.04, z: p.spot.z }}
    facingAngle={p.facing}
    characterId={jamAvatarFor(p.id)}
    propType={p.fire.propType}
    propBuild={p.fire.propBuild ? { ...propFinishState.build, ...p.fire.propBuild } : undefined}
    sequence={flowFestSequenceForPerformer(sequencePool, p.id)}
    effectId="fire"
    contactMode="legacy"
    effectQualityTier="low"
    showEffects={true}
    posePlayback="live"
    phaseOffsetSteps={p.seed * 8}
    playbackSpeed={0.9 + p.seed * 0.2}
    active={true}
  />
{/each}
