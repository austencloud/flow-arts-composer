<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectPreset } from "../presets/types";

  interface Props {
    preset: EffectPreset<"trails">;
    active?: boolean;
  }

  const { preset, active = false }: Props = $props();
  let canvas = $state<HTMLCanvasElement>();

  const WIDTH = 720;
  const HEIGHT = 270;

  /**
   * A stylised portrait of the look, same contract Bloom and Fire keep: every
   * mark comes from the preset's own parameters and nothing is keyed off
   * preset.id.
   *
   * A trail look is three things - the colour pair, the ribbon width, and the
   * fade envelope - so the tile is two ribbons swept through a crossing path,
   * drawn at the preset's thickness and faded across the preset's own opacity
   * range. The envelope is the same one the 2D renderer gets: brightness
   * arrives as maxOpacity with minOpacity at 30% of it
   * (foldTrailIntentIntoSettings in canvas2d-translator.ts), so a dimmer preset
   * produces a visibly shorter-reading tail here for the same reason it does on
   * the stage.
   *
   * rainbow is deliberately NOT drawn. It is a primary panel chip but only
   * trail-renderer-3d.ts implements it - the fold above drops the flag and
   * neither 2D trail renderer has a rainbow path - so a tile that showed a
   * spectrum ribbon would promise something the 2D viewer does not deliver.
   */
  const TRAIL_DEFAULTS = DEFAULT_EFFECTS_CONFIG.trails;

  /** Thickness is a 1-12 panel slider against a 720px tile. */
  const THICKNESS_SCALE = 3.6;

  type Point = { x: number; y: number };

  /**
   * One prop's path across the tile: a horizontal infinity.
   *
   * This is the lemniscate of Bernoulli, not a sine lobe. The figure-eight is
   * the shape a flow artist actually traces, so it is the shape that reads as
   * "trail" at a glance - the earlier crossing sweep was a curve nobody spins.
   * Bernoulli rather than Gerono because its lobes are round and its waist is
   * pinched, which is the ∞ glyph; Gerono's are teardrops.
   *
   *   x = cos t / (1 + sin²t)      y = sin t cos t / (1 + sin²t)
   *
   * y peaks at 1/3 (t = π/4), so the vertical term is tripled to reach the
   * requested half-height rather than filling a third of it.
   *
   * The second prop runs half a period out of phase, which for this curve is a
   * horizontal mirror: the two props sit on opposite lobes and meet at the
   * waist. Crossing is what makes a trail read as two props rather than one
   * doubled stroke.
   */
  function path(mirror: boolean): Point[] {
    const pts: Point[] = [];
    const STEPS = 260;
    const RX = WIDTH / 2 - 54;
    const AMP = (HEIGHT / 2 - 30) * 3;
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    for (let i = 0; i < STEPS; i += 1) {
      const a = (i / (STEPS - 1)) * Math.PI * 2 + (mirror ? Math.PI : 0);
      const s = Math.sin(a);
      const denom = 1 + s * s;
      pts.push({
        x: cx + (Math.cos(a) / denom) * RX,
        y: cy + ((s * Math.cos(a)) / denom) * AMP,
      });
    }
    return pts;
  }

  /**
   * Draw one prop's ribbon onto its own offscreen buffer, then hand the buffer
   * back for a single additive composite.
   *
   * The buffer is not an optimisation, it is the only way the alpha stays
   * honest. A ribbon has to be stroked as ~220 short segments because one
   * stroked path cannot carry a per-point alpha and the fade is the whole point
   * of a trail - but round-capped segments overlap their neighbours, so drawing
   * them straight onto an additive surface makes every ribbon accumulate to 255
   * no matter what alpha was asked for. Measured that way a brightness of 0.55
   * came out brighter than 0.9, because thickness (more overlap) dominated
   * brightness entirely. Compositing each prop separately means a prop's own
   * segments blend, and only the two props add where they actually cross.
   */
  function ribbonLayer(
    pts: Point[],
    color: string,
    width: number,
    minOpacity: number,
    maxOpacity: number,
    blur: number
  ): HTMLCanvasElement {
    const layer = document.createElement("canvas");
    layer.width = WIDTH;
    layer.height = HEIGHT;
    const ctx = layer.getContext("2d");
    if (!ctx) return layer;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    if (blur > 0) ctx.filter = `blur(${blur}px)`;

    for (let i = 1; i < pts.length; i += 1) {
      const t = i / (pts.length - 1);
      // Head-bright, tail-dim, on the renderer's own exponential curve: holds
      // brightness along most of the ribbon then drops away at the tail.
      ctx.globalAlpha =
        minOpacity + (maxOpacity - minOpacity) * Math.pow(t, 1.7);
      // The head is also fractionally wider, the way a live trail reads where
      // it is freshest.
      ctx.lineWidth = width * (0.62 + 0.38 * t);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1]!.x, pts[i - 1]!.y);
      ctx.lineTo(pts[i]!.x, pts[i]!.y);
      ctx.stroke();
    }
    return layer;
  }

  $effect(() => {
    const node = canvas;
    if (!node) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;

    const intent = { ...TRAIL_DEFAULTS, ...(preset.patch ?? {}) };
    const width = intent.thickness * THICKNESS_SCALE;
    // Mirrors the translator exactly rather than inventing a tile-local curve.
    const maxOpacity = intent.brightness;
    const minOpacity = intent.brightness * 0.3;

    const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    background.addColorStop(0, "#080a10");
    background.addColorStop(1, "#04050a");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const paths: [Point[], string][] = [
      [path(false), intent.leftColor],
      [path(true), intent.rightColor],
    ];

    for (const [pts, color] of paths) {
      // The glow pass reads as the 2D renderer's glowBlur - a soft halo rather
      // than a hard edge. Its blur is a fixed offset above the ribbon rather
      // than a multiple of it, so a wide preset gets a wide ribbon and not a
      // proportionally wider bloom on top of it.
      ctx.drawImage(
        ribbonLayer(
          pts,
          color,
          width + 9,
          minOpacity * 0.45,
          maxOpacity * 0.45,
          7
        ),
        0,
        0
      );
      ctx.drawImage(
        ribbonLayer(pts, color, width, minOpacity, maxOpacity, 0),
        0,
        0
      );
    }

    ctx.restore();
  });
</script>

<div class="trail-thumbnail" class:active aria-hidden="true">
  <canvas bind:this={canvas} width={WIDTH} height={HEIGHT}></canvas>
</div>

<style>
  .trail-thumbnail {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: #05060b;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .trail-thumbnail.active {
    border-color: color-mix(
      in srgb,
      var(--card-accent, #38bdf8) 50%,
      transparent
    );
  }
</style>
