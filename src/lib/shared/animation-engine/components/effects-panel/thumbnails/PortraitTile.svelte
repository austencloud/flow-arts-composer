<script module lang="ts">
  /**
   * Painted frames, keyed by effect and preset (plus the prop for Ghost, the
   * one tile that draws it), shared by every tile so reopening the picker
   * blits instead of repainting. Bounded by evicting the oldest entry: each
   * frame holds a backing store, and iOS caps total canvas memory. Card frames
   * (720x270) are kept few; the small formats (240x90, 96x64) cost a tenth as
   * much, so they get a larger count but the same order of eviction. The key
   * carries the format, so one look can hold a card, a tile and a chip.
   */
  const cache = new Map<string, HTMLCanvasElement>();
  const CACHE_LIMIT = 32;
  const SMALL_CACHE_LIMIT = 96;
</script>

<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import type { EffectPreset } from "../presets/types";
  import { TILE_FORMAT_SIZE, type TileFormat } from "./tile-format";
  import { queueTilePaint } from "./tile-paint-queue";
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
    /** card (default), or the small tile / chip painting. */
    format?: TileFormat;
  }

  const {
    effectType,
    preset,
    propType = null,
    active = false,
    format = "card",
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

  const size = $derived(TILE_FORMAT_SIZE[format]);

  function evictOldest(small: boolean): void {
    // Each tier is bounded on its own count, oldest first.
    let count = 0;
    for (const entry of cache.values()) {
      if ((entry.width < 720) === small) count++;
    }
    if (count < (small ? SMALL_CACHE_LIMIT : CACHE_LIMIT)) return;
    for (const [key, entry] of cache) {
      if ((entry.width < 720) === small) {
        cache.delete(key);
        return;
      }
    }
  }

  function remember(key: string, target: HTMLCanvasElement): void {
    evictOldest(format !== "card");
    const copy = document.createElement("canvas");
    copy.width = target.width;
    copy.height = target.height;
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
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(cached, 0, 0);
      return;
    }
    const painter = tilePainterFor(effectType);
    if (!painter) return;
    const run = ++paintRun;
    const extras: TileExtras = {
      propType,
      format,
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
    const key = `${format}|${effectType}|${preset.id}|${keyed}`;
    // A remembered frame is a blit, so reopening the picker shows it at once.
    if (cache.has(key)) {
      paintInto(node, key, prop);
      return;
    }
    return queueTilePaint(() => paintInto(node, key, prop));
  });
</script>

<div
  class="portrait-tile"
  class:active
  class:small={format !== "card"}
  aria-hidden="true"
>
  <canvas bind:this={canvas} width={size.w} height={size.h}></canvas>
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

  /* A small picture is painted to its own box edge to edge: the card's frame
     would spend two of its 27 pixels on a border. */
  .portrait-tile.small {
    border: 0;
    border-radius: 5px;
  }

  .portrait-tile.active {
    border-color: color-mix(
      in srgb,
      var(--card-accent, #f97316) 50%,
      transparent
    );
  }
</style>
