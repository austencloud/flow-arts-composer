<script lang="ts">
  import {
    DEFAULT_LED_INTENT,
    type LedSimulatorConfig,
  } from "#lib/shared/animation-engine/domain/types/led-types.js";
  import { renderLedThumbnail } from "#lib/shared/animation-engine/services/led/led-thumbnail-renderer.js";
  import type { EffectPreset } from "../presets/types";

  interface Props {
    preset: EffectPreset<"led">;
    active?: boolean;
  }

  const { preset, active = false }: Props = $props();
  let host = $state<HTMLDivElement>();

  /**
   * Same 720x270 as the Coal tile, so the LED row and the Coal row are the same
   * shape in the grid. The renderer draws at exactly this size and the CSS
   * scales it down, which is why a 4%-of-strip comet head has to be a bar
   * rather than a pixel to survive the tile.
   */
  const WIDTH = 720;
  const HEIGHT = 270;

  function resolveConfig(): LedSimulatorConfig {
    const patch = preset.patch ?? {};
    return {
      ...DEFAULT_LED_INTENT,
      ...patch,
      look: { ...DEFAULT_LED_INTENT.look, ...(patch.look ?? {}) },
    };
  }

  $effect(() => {
    const node = host;
    if (!node) return;
    const config = resolveConfig();

    let cancelled = false;
    void renderLedThumbnail(config, WIDTH, HEIGHT).then((canvas) => {
      // The renderer is shared and serialized, so a tile can resolve long after
      // its preset changed or the panel closed.
      if (cancelled || !canvas || !node.isConnected) return;
      canvas.classList.add("led-frame");
      node.replaceChildren(canvas);
    });

    return () => {
      cancelled = true;
    };
  });
</script>

<div class="led-thumbnail" class:active aria-hidden="true">
  <div class="surface" bind:this={host}></div>
</div>

<style>
  .led-thumbnail {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    /* Painted before the sweep lands, so the tile never changes size or flashes
       a light box on its way to a dark one. */
    background: #05070c;
  }

  .surface {
    width: 100%;
    height: 100%;
  }

  .surface :global(canvas.led-frame) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .led-thumbnail.active {
    border-color: color-mix(
      in srgb,
      var(--card-accent, #38bdf8) 50%,
      transparent
    );
  }
</style>
