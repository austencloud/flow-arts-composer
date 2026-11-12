<!--
  MandalaStill: one mandala drawn once, as a string.

  Browse's mandala screen shows hundreds of distinct mandalas in small boxes
  and the front door fans three of them. Each is `renderMandalaSVG` of the
  mandala's geometry at the standard reach, both hands, blue and red strokes,
  on the theme's dark or light look. The SVG string is kept per key, size and
  look, so a grid of hundreds renders strings, not geometry, and a box that
  reappears pays nothing. Lines are raised for small boxes so they read at the
  card's weight, not thinner (the strip's rule in mandala-shift-render).
  `tone="ink"` draws every stroke in the surrounding text colour instead.
-->
<script lang="ts" module>
  import {
    MANDALA_SVG_STROKE_WIDTH,
    renderMandalaSVG,
  } from "../services/mandala-renderer";
  import type { MandalaPalette, MandalaPaths } from "../domain/mandala-types";
  import {
    DARK_MOTION_BLUE_FILL,
    DARK_MOTION_BLUE_STROKE,
    DARK_MOTION_PURPLE_FILL,
    DARK_MOTION_PURPLE_STROKE,
    DARK_MOTION_RED_FILL,
    DARK_MOTION_RED_STROKE,
    LIGHT_MOTION_BLUE_FILL,
    LIGHT_MOTION_BLUE_STROKE,
    LIGHT_MOTION_PURPLE_FILL,
    LIGHT_MOTION_PURPLE_STROKE,
    LIGHT_MOTION_RED_FILL,
    LIGHT_MOTION_RED_STROKE,
  } from "../domain/mandala-constants";

  const DARK_PALETTE: MandalaPalette = {
    leftStroke: DARK_MOTION_BLUE_STROKE,
    leftFill: DARK_MOTION_BLUE_FILL,
    rightStroke: DARK_MOTION_RED_STROKE,
    rightFill: DARK_MOTION_RED_FILL,
    purpleStroke: DARK_MOTION_PURPLE_STROKE,
    purpleFill: DARK_MOTION_PURPLE_FILL,
  };
  const LIGHT_PALETTE: MandalaPalette = {
    leftStroke: LIGHT_MOTION_BLUE_STROKE,
    leftFill: LIGHT_MOTION_BLUE_FILL,
    rightStroke: LIGHT_MOTION_RED_STROKE,
    rightFill: LIGHT_MOTION_RED_FILL,
    purpleStroke: LIGHT_MOTION_PURPLE_STROKE,
    purpleFill: LIGHT_MOTION_PURPLE_FILL,
  };

  /** Every stroke in the text colour of whatever holds the still. */
  const INK_PALETTE: MandalaPalette = {
    leftStroke: "currentColor",
    leftFill: "currentColor",
    rightStroke: "currentColor",
    rightFill: "currentColor",
    purpleStroke: "currentColor",
    purpleFill: "currentColor",
  };

  export type MandalaStillTone = "hands" | "ink";

  /** The sequence card's mandala is about this wide; smaller boxes raise their lines. */
  const CARD_PX = 320;
  const MAX_CACHED = 900;
  const svgCache = new Map<string, string>();

  /** The stroke, in mandala units, for a box `size` pixels wide. */
  export function stillStrokeWidth(size: number): number {
    return MANDALA_SVG_STROKE_WIDTH * Math.max(1, CARD_PX / Math.max(1, size) / 2);
  }

  export function mandalaStillSVG(
    key: string,
    paths: MandalaPaths,
    size: number,
    darkMode: boolean,
    tone: MandalaStillTone = "hands"
  ): string {
    const look = tone === "ink" ? "ink" : darkMode ? "dark" : "light";
    const cacheKey = `${key}|${size}|${look}`;
    const cached = svgCache.get(cacheKey);
    if (cached) return cached;
    const svg = renderMandalaSVG(paths, {
      size,
      style: "stroke",
      show: "both",
      strokeWidth: stillStrokeWidth(size),
      palette: tone === "ink" ? INK_PALETTE : darkMode ? DARK_PALETTE : LIGHT_PALETTE,
    });
    if (svgCache.size >= MAX_CACHED) {
      const oldest = svgCache.keys().next().value;
      if (oldest !== undefined) svgCache.delete(oldest);
    }
    svgCache.set(cacheKey, svg);
    return svg;
  }
</script>

<script lang="ts">
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";

  interface Props {
    /** The mandala key; the cache's handle for this geometry. */
    key: string;
    paths: MandalaPaths;
    /** The box's width in pixels; the still fills it. */
    size: number;
    darkMode?: boolean;
    /** Hand colours, or one colour taken from the surrounding text. */
    tone?: MandalaStillTone;
  }

  let { key, paths, size, darkMode, tone = "hands" }: Props = $props();

  const dark = $derived(darkMode ?? settingsService.settings.darkMode ?? true);
  const svg = $derived(mandalaStillSVG(key, paths, size, dark, tone));
</script>

<span class="mandala-still" aria-hidden="true">{@html svg}</span>

<style>
  .mandala-still {
    display: block;
    width: 100%;
    height: 100%;
    line-height: 0;
  }
  .mandala-still :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
