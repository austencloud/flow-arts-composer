<!--
  VillageFireLight - Firelight on the people round the village fire.

  The forest campfire's own light sits in the flame and falls off before it
  reaches a face at the seats, and the camera looks at the fire's dark side
  of everyone in front of it. Two warm lights stand just on the audience's
  side of the fire, spread either way, so the faces turned to the fire (the
  seats and the ring beyond it) catch light from where the visitor looks.
  An additive glow on the ground carries the fire out past them. Both
  flicker on their own slow beat, like the Flow Fest jam's fire lights, whose
  ground glow this reuses (shared/3d/effects/fire-ground-glow.ts).
-->
<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import { onDestroy } from "svelte";
  import { Color, PointLight, type MeshBasicMaterial } from "three";
  import { buildFireGroundGlow } from "#lib/shared/3d/effects/fire-ground-glow.js";
  import { getVillageContext } from "../state/village-context";

  interface Props {
    // The floor the people stand on in this scene (village y = 0 plus any
    // museum lift); the glow lies just above it.
    groundY: number;
  }

  const { groundY }: Props = $props();

  const fire = getVillageContext().rules.campfire;

  // Tuned so a face on a far seat (about 4 m from each light) reads warm
  // over the campfire's own light. Height is about a seated face's.
  const LIGHT_INTENSITY = 20;
  const LIGHT_RANGE = 10;
  const LIGHT_DECAY = 2;
  const LIGHT_HEIGHT = 1.3;
  // How far toward the audience each light stands, and how far apart.
  const LIGHT_OUT = 1.2;
  const LIGHT_SPREAD = (40 * Math.PI) / 180;
  const GLOW_RADIUS = 5;

  const DEG = Math.PI / 180;
  const audienceAngle = fire.audienceAngleDegrees * DEG;
  const lights = [-1, 1].map((side) => {
    const light = new PointLight(new Color(1.0, 0.55, 0.22), LIGHT_INTENSITY, LIGHT_RANGE, LIGHT_DECAY);
    light.castShadow = false;
    const angle = audienceAngle + side * LIGHT_SPREAD;
    light.position.set(
      fire.x + Math.cos(angle) * LIGHT_OUT,
      0,
      fire.z + Math.sin(angle) * LIGHT_OUT
    );
    return light;
  });

  const glow = buildFireGroundGlow(1, "VillageFireGroundGlow");
  glow.mesh.count = 1;
  const glowMaterial = glow.mesh.material as MeshBasicMaterial;

  let clock = 0;
  useTask((delta) => {
    clock += delta;
    lights.forEach((light, i) => {
      const flicker = 0.82 + 0.12 * Math.sin(clock * 11 + i * 2.1) + 0.06 * Math.sin(clock * 27 + i * 5.3);
      light.position.y = groundY + LIGHT_HEIGHT;
      light.intensity = LIGHT_INTENSITY * flicker;
    });
    const flicker = 0.85 + 0.15 * Math.sin(clock * 9);
    const r = GLOW_RADIUS * (0.94 + 0.06 * flicker);
    glow.matrix.makeScale(r, 1, r).setPosition(fire.x, groundY + 0.03, fire.z);
    glow.mesh.setMatrixAt(0, glow.matrix);
    glow.mesh.instanceMatrix.needsUpdate = true;
    glowMaterial.color.setRGB(0.42 * flicker, 0.19 * flicker, 0.06 * flicker);
  });

  onDestroy(() => {
    glow.mesh.geometry.dispose();
    glowMaterial.dispose();
  });
</script>

{#each lights as light, i (i)}
  <T is={light} />
{/each}
<T is={glow.mesh} />
