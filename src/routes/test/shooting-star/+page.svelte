<script lang="ts">
  import { Canvas, T } from "@threlte/core";

  import SkyGradient from "#lib/shared/3d/environments/primitives/SkyGradient.svelte";
  import Starfield from "#lib/shared/3d/environments/primitives/Starfield.svelte";
  import MeteorStreaks from "#lib/shared/3d/environments/scenes/cosmic/MeteorStreaks.svelte";
  import type {
    MeteorStreaksConfig,
    StarfieldConfig,
  } from "#lib/shared/3d/environments/domain/models/scene-configs.js";

  const stars: StarfieldConfig = {
    enabled: true,
    count: 260,
    radius: 90,
    sizeRange: [0.5, 1.8],
    twinkleSpeed: 0.45,
  };

  const shootingStar: MeteorStreaksConfig = {
    enabled: true,
    frequency: 3600,
    speed: 12,
    colors: ["#ffffff", "#c8dcff", "#f8faff"],
    trailLength: 12,
    brightness: 2.5,
    headSize: 8,
  };

  let trigger = $state(0);
</script>

<svelte:head>
  <title>Shooting Star Test</title>
</svelte:head>

<main class="page">
  <div class="sky" aria-label="Shooting star preview">
    <Canvas>
      <T.PerspectiveCamera
        makeDefault
        position={[0, 0, 0]}
        rotation={[0.35, 0, 0]}
        fov={50}
        far={500}
      />
      <SkyGradient
        topColor="#061a2d"
        midColor="#0b2c47"
        bottomColor="#12344c"
        radius={200}
      />
      <Starfield config={stars} />
      <MeteorStreaks config={shootingStar} {trigger} />
    </Canvas>
  </div>

  <button type="button" onclick={() => (trigger += 1)}>Make a star shoot</button
  >
</main>

<style>
  .page {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: end center;
    overflow: hidden;
    padding: clamp(24px, 5vh, 56px);
    background: #061a2d;
  }

  .sky {
    position: absolute;
    inset: 0;
  }

  button {
    position: relative;
    z-index: 1;
    min-height: 48px;
    padding: 0 24px;
    border: 1px solid rgb(255 255 255 / 45%);
    border-radius: 999px;
    background: rgb(8 24 42 / 88%);
    color: #fff;
    font:
      700 max(16px, var(--font-size-min, 14px)) / 1 system-ui,
      sans-serif;
    letter-spacing: 0.01em;
    cursor: pointer;
    box-shadow: 0 8px 28px rgb(0 0 0 / 35%);
  }

  button:hover {
    background: rgb(18 48 76 / 94%);
  }

  button:focus-visible {
    outline: 3px solid #b9dcff;
    outline-offset: 3px;
  }

  button:active {
    transform: translateY(1px);
  }
</style>
