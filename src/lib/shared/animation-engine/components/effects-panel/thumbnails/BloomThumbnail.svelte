<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectPreset } from "../presets/types";
  import { withAlpha } from "./tile-paint";
  import { queueTilePaint } from "./tile-paint-queue";
  import { TILE_FORMAT_SIZE, type TileFormat } from "./tile-format";
  import {
    bloomExposure as exposure,
    bloomLightColors,
    bloomNormRadius as normRadius,
    paintBloomSmall,
  } from "./bloom-small";

  interface Props {
    preset: EffectPreset<"bloom">;
    active?: boolean;
    /** card (default), or the small tile / chip painting. */
    format?: TileFormat;
  }

  const { preset, active = false, format = "card" }: Props = $props();
  const size = $derived(TILE_FORMAT_SIZE[format]);
  let canvas: HTMLCanvasElement;

  const WIDTH = 720;
  const HEIGHT = 270;

  /**
   * A stylised portrait of the look rather than a replay of it. The tile is
   * ~304x114 in the panel, which is too small to judge a real bloom render -
   * Halo's actual output is barely above the background at that size. So this
   * composes the preset's optics as a poster: hero lights, exposed for
   * legibility, arranged for the tile's shape.
   *
   * The one rule it keeps from the literal version: every mark is derived from
   * the preset's own parameters. Colour comes from colorMode, spike length from
   * spikes, smear from streak and afterglow. Nothing is keyed off preset.id, so
   * the tile cannot drift away from what the preset actually does.
   */
  function drawHalo(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
    alpha: number,
    falloff: string
  ): void {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (falloff === "sharp") {
      g.addColorStop(0, withAlpha(color, alpha));
      g.addColorStop(0.16, withAlpha(color, alpha * 0.66));
      g.addColorStop(0.58, withAlpha(color, alpha * 0.12));
    } else {
      g.addColorStop(0, withAlpha(color, alpha));
      g.addColorStop(0.42, withAlpha(color, alpha * 0.48));
    }
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawSmear(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
    alpha: number,
    reach: number
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 + reach * 3.2, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, withAlpha(color, alpha * 0.5));
    g.addColorStop(0.5, withAlpha(color, alpha * 0.2));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  function drawSpikes(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    len: number,
    alpha: number,
    weight = 1
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = "round";
    for (let i = 0; i < 8; i += 1) {
      const ang = (i * Math.PI) / 4;
      const l = i % 2 === 0 ? len : len * 0.42;
      const ex = Math.cos(ang) * l;
      const ey = Math.sin(ang) * l;
      const g = ctx.createLinearGradient(0, 0, ex, ey);
      g.addColorStop(0, `rgba(255,255,255,${alpha})`);
      g.addColorStop(0.22, `rgba(255,255,255,${alpha * 0.45})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = (i % 2 === 0 ? 2 : 1.3) * weight;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCore(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    alpha: number
  ): void {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.45})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  $effect(() => {
    const node = canvas;
    if (!node) return;
    void preset;
    void format;
    return queueTilePaint(() => paint(node));
  });

  function paint(node: HTMLCanvasElement): void {
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (format !== "card") {
      paintBloomSmall(ctx, preset.patch ?? {}, format);
      return;
    }

    const intent = { ...DEFAULT_EFFECTS_CONFIG.bloom, ...(preset.patch ?? {}) };
    const colors = bloomLightColors(intent);
    const alpha = exposure(intent.intensity);
    const reach = Math.min(1, intent.streak * 0.6 + intent.afterglow * 0.6);

    const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    background.addColorStop(0, "#090b16");
    background.addColorStop(0.58, "#050712");
    background.addColorStop(1, "#020309");
    ctx.fillStyle = background;
    ctx.fillRect(-WIDTH, -HEIGHT, WIDTH * 3, HEIGHT * 3);

    // Bigger halo when there are fewer lights, so a solid preset still fills.
    const lit = colors;
    const spread =
      colors.length === 1 ? 0 : colors.length === 2 ? 118 : 152;
    const baseR = colors.length === 1 ? 98 : colors.length === 2 ? 84 : 70;
    const r = baseR * (0.72 + 0.56 * normRadius(intent.radius));
    const cy = HEIGHT / 2;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    lit.forEach((color, i) => {
      const offset = lit.length === 1 ? 0 : (i - (lit.length - 1) / 2) * spread;
      const x = WIDTH / 2 + offset;
      if (reach > 0.02) drawSmear(ctx, x, cy, r, color, alpha, reach);
      drawHalo(ctx, x, cy, r, color, alpha, intent.falloff);
      if (intent.coreStrength > 0) {
        drawCore(
          ctx,
          x,
          cy,
          r * (0.12 + 0.2 * intent.coreStrength),
          alpha * (0.4 + 0.6 * intent.coreStrength)
        );
      }
      if (intent.spikes > 0) {
        const len = Math.min(HEIGHT * 0.46, r * (0.9 + 1.7 * intent.spikes));
        drawSpikes(
          ctx,
          x,
          cy,
          len,
          alpha * Math.min(1, 0.45 + intent.spikes * 0.55)
        );
      }
    });

    ctx.restore();
  }
</script>

<div class="bloom-thumbnail" class:active aria-hidden="true">
  <canvas bind:this={canvas} width={size.w} height={size.h}></canvas>
</div>

<style>
  .bloom-thumbnail {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: #050712;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .bloom-thumbnail.active {
    border-color: color-mix(
      in srgb,
      var(--card-accent, #f472b6) 50%,
      transparent
    );
  }
</style>
