<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectPreset } from "../presets/types";

  interface Props {
    preset: EffectPreset<"fire">;
    active?: boolean;
  }

  const { preset, active = false }: Props = $props();
  let canvas = $state<HTMLCanvasElement>();

  const WIDTH = 720;
  const HEIGHT = 270;

  /**
   * A stylised portrait of the look, same contract Bloom's tile keeps: every
   * mark is derived from the preset's own parameters, nothing is keyed off
   * preset.id. Fire presets are almost entirely a 4-stop temperature curve plus
   * a rendering style, so the tile is a flame built from that curve - which
   * means a preset cannot change colour without the tile changing with it.
   *
   * Replaying the WebGL fire sim at 304x114 was never on the table: it needs a
   * GL context per tile and, like Bloom's literal replay, resolves to mostly
   * empty frame at that size.
   */
  const CURVE_STOPS = [0, 0.3, 0.6, 1] as const;

  /** The renderer's fallback when a preset leaves colorCurve null. */
  const DEFAULT_CURVE: [number, number, number][] = [
    [0.05, 0.0, 0.0],
    [0.8, 0.1, 0.0],
    [1.0, 0.6, 0.0],
    [1.0, 0.95, 0.8],
  ];

  type Rgb = [number, number, number];

  function toRgb(c: readonly number[]): Rgb {
    return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
  }

  function css(c: Rgb, alpha = 1): string {
    const [r, g, b] = c;
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
  }

  function mix(a: Rgb, b: Rgb, t: number): Rgb {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  function hexToRgb(hex: string): Rgb {
    let h = hex.replace("#", "");
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /**
   * Cold -> mid -> hot -> core, at the translator's own stop positions. Tinting
   * toward prop colours is what colorBlend does in the renderer, so the tile
   * does the same rather than always showing the natural palette.
   */
  function paletteOf(intent: typeof DEFAULT_EFFECTS_CONFIG.fire): Rgb[] {
    const curve = intent.colorCurve
      ? [
          toRgb(intent.colorCurve.coldColor),
          toRgb(intent.colorCurve.midColor),
          toRgb(intent.colorCurve.hotColor),
          toRgb(intent.colorCurve.coreColor),
        ]
      : DEFAULT_CURVE;

    const blend = intent.colorBlend ?? 0;
    const props = intent.propColors;
    if (blend <= 0.001 || !props?.length) return curve;

    const tint = hexToRgb(typeof props[0] === "string" ? props[0] : "#ffffff");
    // The core stays near-white however hard the tint is pushed - that is what
    // the shader does, and it is why prop-coloured fire still reads as fire.
    return curve.map((c, i) => mix(c, tint, blend * (i === 3 ? 0.35 : 1)));
  }

  /**
   * Sample the curve at a temperature in [0,1] using the translator's own stop
   * positions, so the tile interpolates colour the same way the shader does.
   */
  function sampleTemp(palette: Rgb[], u: number): Rgb {
    const t = Math.min(1, Math.max(0, u));
    for (let i = 0; i < CURVE_STOPS.length - 1; i += 1) {
      const a = CURVE_STOPS[i];
      const b = CURVE_STOPS[i + 1];
      if (t <= b) return mix(palette[i], palette[i + 1], (t - a) / (b - a));
    }
    return palette[palette.length - 1];
  }

  /** Stable per-tile variation - a seeded LCG, never Math.random. */
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** One soft light blob. Everything in the tile is made of these. */
  function blob(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: Rgb,
    alpha: number
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, css(color, alpha));
    g.addColorStop(0.45, css(color, alpha * 0.42));
    g.addColorStop(1, css(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }

  /**
   * A column of soft blobs that narrows and cools as it rises - fire as light
   * rather than as a filled silhouette. Hard-edged bezier tongues were tried
   * first and read as a vector crown: crisp facets where the shapes overlapped,
   * nothing like the glow the renderer actually produces, and tonally at odds
   * with Bloom's tile.
   */
  function drawColumn(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    height: number,
    width: number,
    palette: Rgb[],
    rand: () => number,
    strength: number
  ): void {
    const STEPS = 26;
    for (let i = 0; i < STEPS; i += 1) {
      const t = i / (STEPS - 1);
      // Sway increases with height, the way a flame licks off its own column.
      const sway = Math.sin(t * 2.4 + rand() * 0.35) * width * 0.42 * t;
      const y = baseY - t * height;
      const taper = Math.pow(1 - t, 0.72);
      const r = width * (0.32 + 0.68 * taper) * (0.85 + rand() * 0.3);
      const color = sampleTemp(palette, 1 - t);
      // Cooler tips are dimmer as well as redder, so the plume fades out
      // instead of ending on a line.
      const alpha = strength * (0.16 + 0.5 * taper);
      blob(ctx, cx + sway, y, r, r * 1.5, color, alpha);
    }
  }

  /**
   * Natural: two tall licking columns, because two props are what is burning.
   * Liquid: one broad low mass with rolling shoulders - the renderer's liquid
   * style is wide and flowing rather than tongued, and the tile has to show
   * that difference or Liquid Fire and Classic look identical.
   */
  function drawPlume(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    scale: number,
    palette: Rgb[],
    liquid: boolean,
    seed: number
  ): void {
    const rand = lcg(seed);

    if (liquid) {
      // Liquid gets its own draw rather than the column stack. Stacked columns
      // were tried twice: spaced they read as separate lumps, overlapped they
      // saturated additively into a flat slab with square shoulders. A molten
      // body is a few wide, very low-alpha ellipses instead, so the additive
      // sum stays under clipping and the mass keeps a soft rolling top.
      const SPAN = 340 * scale;
      const BLOBS = 15;
      for (let i = 0; i < BLOBS; i += 1) {
        const t = i / (BLOBS - 1);
        const falloff = Math.cos((t - 0.5) * Math.PI);
        const roll = 0.62 + 0.38 * Math.sin(t * 8.2 + 0.6);
        const rise = 48 * scale * falloff * roll;
        const rx = 70 * scale;
        blob(
          ctx,
          cx + (t - 0.5) * SPAN,
          baseY - rise,
          rx,
          rx * 0.62,
          sampleTemp(palette, 0.55 + 0.3 * falloff),
          0.22 * falloff
        );
      }
      // A hotter, tighter band riding the surface - the bright seam a flowing
      // body shows where it is thickest.
      for (let i = 0; i < BLOBS; i += 1) {
        const t = i / (BLOBS - 1);
        const falloff = Math.cos((t - 0.5) * Math.PI);
        blob(
          ctx,
          cx + (t - 0.5) * SPAN * 0.78,
          baseY - 12 * scale,
          42 * scale,
          17 * scale,
          sampleTemp(palette, 1),
          0.2 * falloff
        );
      }
      return;
    }

    // A wide soft base plus a taller narrow lick - the two silhouettes a flame
    // reads as at a glance.
    drawColumn(ctx, cx, baseY, 150 * scale, 46 * scale, palette, rand, 0.72);
    drawColumn(
      ctx,
      cx + 8 * scale,
      baseY,
      212 * scale,
      24 * scale,
      palette,
      rand,
      0.5
    );
  }

  $effect(() => {
    const node = canvas;
    if (!node) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;

    const intent = { ...DEFAULT_EFFECTS_CONFIG.fire, ...(preset.patch ?? {}) };
    const palette = paletteOf(intent);
    const liquid = intent.renderingStyle === "liquid";

    const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    background.addColorStop(0, "#0a0709");
    background.addColorStop(0.6, "#070406");
    background.addColorStop(1, "#030102");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // The flame roots inside the frame, not on its edge. At HEIGHT - 6 the
    // bases were cropped by the tile boundary, so the fire read as something
    // growing up out of the bottom of the screen with its origin cut off -
    // wrong for TKA, where fire burns off a prop head and is a complete object
    // hanging in space. Rooting it 38px up gives the flame a visible bottom and
    // its own dark beneath.
    const baseY = HEIGHT - 30;
    // Intensity is a slider, not a preset field, so it reads from the default -
    // but honouring it keeps the tile correct if a preset ever patches it.
    // The 0.86 pays for the lifted root: the tallest lick is 212 * scale, which
    // at full height would now clip against the top edge instead of the bottom.
    // Sized so that tallest lick lands ~30px under the top edge, i.e. the flame
    // is bounded by the tile on both ends rather than running off either.
    const scale = (0.86 + 0.28 * intent.intensity) * 0.86;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // A wash at the base so the flames sit in their own light rather than
    // being pasted onto black.
    const wash = ctx.createRadialGradient(
      WIDTH / 2,
      baseY,
      0,
      WIDTH / 2,
      baseY,
      WIDTH * 0.5
    );
    wash.addColorStop(0, css(palette[2], 0.3));
    wash.addColorStop(0.55, css(palette[1], 0.12));
    wash.addColorStop(1, css(palette[0], 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (liquid) {
      drawPlume(ctx, WIDTH / 2, baseY, scale, palette, true, 0x5eed);
    } else {
      drawPlume(ctx, WIDTH / 2 - 128, baseY, scale * 0.9, palette, false, 0x1a7f);
      drawPlume(ctx, WIDTH / 2 + 128, baseY, scale, palette, false, 0x93c1);
    }

    ctx.restore();
  });
</script>

<div class="fire-thumbnail" class:active aria-hidden="true">
  <canvas bind:this={canvas} width={WIDTH} height={HEIGHT}></canvas>
</div>

<style>
  .fire-thumbnail {
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

  .fire-thumbnail.active {
    border-color: color-mix(
      in srgb,
      var(--card-accent, #f97316) 50%,
      transparent
    );
  }
</style>
