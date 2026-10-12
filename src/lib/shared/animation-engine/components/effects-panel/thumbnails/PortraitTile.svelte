<script module lang="ts">
  /**
   * Painted frames, keyed by effect and preset (plus the prop for Ghost, the
   * one tile that draws it), shared by every tile so reopening the picker
   * blits instead of repainting. Bounded by evicting the oldest entry: each
   * frame holds a 720x270 backing store, and iOS caps total canvas memory.
   */
  const cache = new Map<string, HTMLCanvasElement>();
  const CACHE_LIMIT = 32;
</script>

<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import type { EffectPreset } from "../presets/types";
  import { TILE_H, TILE_W } from "./tile-paint";
  import {
    PROP_AWARE_TILES,
    tilePainterFor,
    type TileExtras,
  } from "./tile-registry";

  interface Props {
    effectType: keyof EffectConfigMap;
    preset: EffectPreset;
    /** The prop Ghost portrays. Null falls back to the current prop. */
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
  /** Bumped per paint so a slow async painter cannot draw over a newer frame. */
  let paintRun = 0;

  const resolvedPropType = $derived(
    propType ?? animationSettings.currentPropType
  );

  function mergeIntent<E extends keyof EffectConfigMap>(
    type: E,
    patch: Partial<EffectConfigMap[E]> | undefined
  ): EffectConfigMap[E] {
    return { ...DEFAULT_EFFECTS_CONFIG[type], ...(patch ?? {}) };
  }

  function remember(key: string, target: HTMLCanvasElement): void {
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    const copy = document.createElement("canvas");
    copy.width = TILE_W;
    copy.height = TILE_H;
    copy.getContext("2d")?.drawImage(target, 0, 0);
    cache.set(key, copy);
  }

  function paintInto(
    target: HTMLCanvasElement,
    key: string,
    propType: string | null
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
    const run = ++paintRun;
    const extras: TileExtras = {
      propType,
      isStale: () => run !== paintRun,
    };
    const result = painter(ctx, mergeIntent(effectType, preset.patch), extras);
    if (result instanceof Promise) {
      result
        .then((complete) => {
          if (complete !== false && !extras.isStale()) remember(key, target);
        })
        .catch(() => {});
    } else if (result !== false) {
      remember(key, target);
    }
  }

  $effect(() => {
    const node = canvas;
    if (!node) return;
    const prop = resolvedPropType;
    const keyed = PROP_AWARE_TILES.has(effectType) ? (prop ?? "") : "";
    paintInto(node, `${effectType}|${preset.id}|${keyed}`, prop);
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
