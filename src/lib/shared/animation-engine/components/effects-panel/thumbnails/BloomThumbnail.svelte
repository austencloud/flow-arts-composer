<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectPreset } from "../presets/types";

  interface Props {
    preset: EffectPreset<"bloom">;
    active?: boolean;
  }

  const { preset, active = false }: Props = $props();
  let canvas: HTMLCanvasElement;

  const WIDTH = 720;
  const HEIGHT = 270;

  const BLUE = DEFAULT_EFFECTS_CONFIG.trails.leftColor;
  const RED = DEFAULT_EFFECTS_CONFIG.trails.rightColor;

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
  function lightColors(intent: typeof DEFAULT_EFFECTS_CONFIG.bloom): string[] {
    switch (intent.colorMode) {
      case "prop-matched":
        return [BLUE, RED];
      case "palette":
        return intent.palette.length ? intent.palette.slice(0, 3) : [intent.color];
      case "rainbow":
        return ["hsl(350, 85%, 62%)", "hsl(45, 90%, 60%)", "hsl(195, 85%, 60%)"];
      case "solid":
      default:
        return [intent.color];
    }
  }

  /** Lift the floor so a dim preset still reads, without flattening the range. */
  function exposure(intensity: number): number {
    return 0.55 + 0.45 * Math.min(1, Math.max(0, intensity));
  }

  /** Presets live roughly in 20-90; map that onto the tile generously. */
  function normRadius(radius: number): number {
    return Math.min(1, Math.max(0, (radius - 20) / 70));
  }

  function withAlpha(color: string, alpha: number): string {
    const a = Math.min(1, Math.max(0, alpha));
    if (color.startsWith("#")) {
      let h = color.slice(1);
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const n = parseInt(h, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    }
    if (color.startsWith("hsl(")) return `hsla${color.slice(3, -1)}, ${a})`;
    return color;
  }

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
    alpha: number
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
      ctx.lineWidth = i % 2 === 0 ? 2 : 1.3;
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
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const intent = { ...DEFAULT_EFFECTS_CONFIG.bloom, ...(preset.patch ?? {}) };
    const colors = lightColors(intent);
    const alpha = exposure(intent.intensity);
    const reach = Math.min(1, intent.streak * 0.6 + intent.afterglow * 0.6);

    const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    background.addColorStop(0, "#090b16");
    background.addColorStop(0.58, "#050712");
    background.addColorStop(1, "#020309");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Bigger halo when there are fewer lights, so a solid preset still fills.
    const spread = colors.length === 1 ? 0 : colors.length === 2 ? 118 : 152;
    const baseR = colors.length === 1 ? 98 : colors.length === 2 ? 84 : 70;
    const r = baseR * (0.72 + 0.56 * normRadius(intent.radius));
    const cy = HEIGHT / 2;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    colors.forEach((color, i) => {
      const offset = colors.length === 1 ? 0 : (i - (colors.length - 1) / 2) * spread;
      const x = WIDTH / 2 + offset;
      if (reach > 0.02) drawSmear(ctx, x, cy, r, color, alpha, reach);
      drawHalo(ctx, x, cy, r, color, alpha, intent.falloff);
      if (intent.coreStrength > 0) {
        drawCore(ctx, x, cy, r * (0.12 + 0.2 * intent.coreStrength), alpha * (0.4 + 0.6 * intent.coreStrength));
      }
      if (intent.spikes > 0) {
        const len = Math.min(HEIGHT * 0.46, r * (0.9 + 1.7 * intent.spikes));
        drawSpikes(ctx, x, cy, len, alpha * Math.min(1, 0.45 + intent.spikes * 0.55));
      }
    });

    ctx.restore();
  });
</script>

<div class="bloom-thumbnail" class:active aria-hidden="true">
  <canvas bind:this={canvas} width={WIDTH} height={HEIGHT}></canvas>
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
