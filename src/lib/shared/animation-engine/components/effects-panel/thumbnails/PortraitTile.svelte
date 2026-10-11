<script module lang="ts">
  /**
   * Painted frames, keyed by effect, preset and prop, shared by every tile so
   * reopening the picker blits instead of repainting. Bounded: the catalog is
   * small, and a full clear on overflow is cheaper than bookkeeping.
   */
  const cache = new Map<string, HTMLCanvasElement>();
  const CACHE_LIMIT = 96;
</script>

<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import type { EffectPreset } from "../presets/types";
  import { TILE_H, TILE_W } from "./tile-paint";
  import { tilePainterFor, type TileExtras } from "./tile-registry";

  interface Props {
    effectType: keyof EffectConfigMap;
    preset: EffectPreset;
    /** The prop Ghost and Silk portray. Null falls back to the current prop. */
    propType?: string | null;
    active?: boolean;
  }

  const {
    effectType,
    preset,
    propType = null,
    active = false,
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  const resolvedPropType = $derived(
    propType ?? animationSettings.currentPropType
  );

  function paintInto(
    target: HTMLCanvasElement,
    key: string,
    extras: TileExtras
  ): void {
    const ctx = target.getContext("2d");
    if (!ctx) return;
    const cached = cache.get(key);
    if (cached) {
      ctx.clearRect(0, 0, TILE_W, TILE_H);
      ctx.drawImage(cached, 0, 0);
      return;
    }
    const painter = tilePainterFor(effectType);
    if (!painter) return;
    const intent = {
      ...DEFAULT_EFFECTS_CONFIG[effectType],
      ...(preset.patch ?? {}),
    };
    const result = painter(ctx, intent as never, extras);
    const remember = (): void => {
      if (cache.size >= CACHE_LIMIT) cache.clear();
      const copy = document.createElement("canvas");
      copy.width = TILE_W;
      copy.height = TILE_H;
      copy.getContext("2d")?.drawImage(target, 0, 0);
      cache.set(key, copy);
    };
    if (result instanceof Promise) void result.then(remember);
    else remember();
  }

  $effect(() => {
    const node = canvas;
    if (!node) return;
    const prop = resolvedPropType;
    paintInto(node, `${effectType}|${preset.id}|${prop ?? ""}`, {
      propType: prop,
    });
  });
</script>

<div class="portrait-tile" class:active aria-hidden="true">
  <canvas bind:this={canvas} width={TILE_W} height={TILE_H}></canvas>
</div>

<style>
  .portrait-tile {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: #050203;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .portrait-tile.active {
    border-color: color-mix(
      in srgb,
      var(--card-accent, #f97316) 50%,
      transparent
    );
  }
</style>
