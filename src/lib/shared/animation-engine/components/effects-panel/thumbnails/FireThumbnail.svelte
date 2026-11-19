<script lang="ts">
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import type { EffectPreset } from "../presets/types";
  import { type Rgb, blob, css, hexToRgb, lcg, mix, toRgb } from "./tile-paint";
  import { queueTilePaint } from "./tile-paint-queue";
  import {
    TILE_FORMAT_SIZE,
    type Box,
    type TileFormat,
    frame,
    unitsPerDisplayPx,
    smallTable,
    type SmallFormat,
  } from "./tile-format";

  interface Props {
    preset: EffectPreset<"fire">;
    active?: boolean;
    /** card (default), or the small tile / chip painting. */
    format?: TileFormat;
  }

  const { preset, active = false, format = "card" }: Props = $props();
  const size = $derived(TILE_FORMAT_SIZE[format]);
  let canvas = $state<HTMLCanvasElement>();

  const WIDTH = 720;
  const HEIGHT = 270;

  /**
   * Small formats: two flames filling about 85% of the frame's height, each
   * fatter than the card's so the column keeps a body at 74px wide, with the
   * warm wash on the floor. The chip pulls the pair closer together.
   */
  const SMALL: Record<
    "tile" | "chip",
    { view: Box; gap: number; fat: number; scale: number }
  > = {
    tile: {
      view: { x: 80, y: 42, w: 560, h: 210 },
      gap: 118,
      fat: 1.35,
      scale: 1.12,
    },
    chip: {
      view: { x: 202.5, y: 42, w: 315, h: 210 },
      gap: 72,
      fat: 1.5,
      scale: 1.12,
    },
  };

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

  type FirePalette = [Rgb, Rgb, Rgb, Rgb];

  /** The renderer's fallback when a preset leaves colorCurve null. */
  const DEFAULT_CURVE: FirePalette = [
    [0.05, 0.0, 0.0],
    [0.8, 0.1, 0.0],
    [1.0, 0.6, 0.0],
    [1.0, 0.95, 0.8],
  ];

  /**
   * Cold -> mid -> hot -> core, at the translator's own stop positions. Tinting
   * toward prop colours is what colorBlend does in the renderer, so the tile
   * does the same rather than always showing the natural palette.
   */
  function paletteOf(intent: typeof DEFAULT_EFFECTS_CONFIG.fire): FirePalette {
    const curve: FirePalette = intent.colorCurve
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
    return [
      mix(curve[0], tint, blend),
      mix(curve[1], tint, blend),
      mix(curve[2], tint, blend),
      mix(curve[3], tint, blend * 0.35),
    ];
  }

  /**
   * Sample the curve at a temperature in [0,1] using the translator's own stop
   * positions, so the tile interpolates colour the same way the shader does.
   */
  function sampleTemp(palette: FirePalette, u: number): Rgb {
    const t = Math.min(1, Math.max(0, u));
    const [cold, mid, hot, core] = palette;
    const [start, middle, warm, end] = CURVE_STOPS;
    if (t <= middle) return mix(cold, mid, (t - start) / (middle - start));
    if (t <= warm) return mix(mid, hot, (t - middle) / (warm - middle));
    if (t <= end) return mix(hot, core, (t - warm) / (end - warm));
    return core;
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
    palette: FirePalette,
    rand: () => number,
    strength: number,
    fat = 1
  ): void {
    const STEPS = 26;
    for (let i = 0; i < STEPS; i += 1) {
      const t = i / (STEPS - 1);
      // Sway increases with height, the way a flame licks off its own column.
      const sway = Math.sin(t * 2.4 + rand() * 0.35) * width * 0.42 * t;
      const y = baseY - t * height;
      const taper = Math.pow(1 - t, 0.72);
      const r = width * fat * (0.32 + 0.68 * taper) * (0.85 + rand() * 0.3);
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
    palette: FirePalette,
    liquid: boolean,
    seed: number,
    fat = 1
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
        const rise = 48 * scale * falloff * roll * (fat > 1 ? 1.9 : 1);
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
    drawColumn(
      ctx,
      cx,
      baseY,
      150 * scale,
      46 * scale,
      palette,
      rand,
      0.72,
      fat
    );
    drawColumn(
      ctx,
      cx + 8 * scale,
      baseY,
      212 * scale,
      24 * scale,
      palette,
      rand,
      0.5,
      fat
    );
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
    const small = format === "card" ? null : SMALL[smallTable(format)];
    if (small) frame(ctx, format, small.view, 0);

    const intent = { ...DEFAULT_EFFECTS_CONFIG.fire, ...(preset.patch ?? {}) };
    const palette = paletteOf(intent);
    const liquid = intent.renderingStyle === "liquid";

    const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    background.addColorStop(0, "#0a0709");
    background.addColorStop(0.6, "#070406");
    background.addColorStop(1, "#030102");
    ctx.fillStyle = background;
    ctx.fillRect(-WIDTH, -HEIGHT, WIDTH * 3, HEIGHT * 3);

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
    const scale =
      (0.86 + 0.28 * intent.intensity) * 0.86 * (small ? small.scale : 1);
    const fat = small ? small.fat : 1;
    const gap = small ? small.gap : 128;

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
    ctx.fillRect(-WIDTH, -HEIGHT, WIDTH * 3, HEIGHT * 3);

    if (liquid) {
      drawPlume(ctx, WIDTH / 2, baseY, scale, palette, true, 0x5eed, fat);
    } else {
      drawPlume(
        ctx,
        WIDTH / 2 - gap,
        baseY,
        scale * 0.9,
        palette,
        false,
        0x1a7f,
        fat
      );
      drawPlume(
        ctx,
        WIDTH / 2 + gap,
        baseY,
        scale,
        palette,
        false,
        0x93c1,
        fat
      );
    }

    ctx.restore();
  }
</script>

<div class="fire-thumbnail" class:active aria-hidden="true">
  <canvas bind:this={canvas} width={size.w} height={size.h}></canvas>
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
