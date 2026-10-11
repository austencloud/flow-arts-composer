import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { renderMandalaToCanvas } from "#lib/shared/mandala/services/mandala-renderer.js";
import { engineAlignScale } from "#lib/shared/mandala/services/engine-align.js";
import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import type { MandalaPathOptions } from "#lib/shared/mandala/services/types.js";
import type { MandalaPalette } from "#lib/shared/mandala/domain/mandala-types.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaPathShape } from "./prepare-mandala-club-sequence";
import {
  DARK_MOTION_BLUE_STROKE,
  DARK_MOTION_BLUE_FILL,
  DARK_MOTION_RED_STROKE,
  DARK_MOTION_RED_FILL,
  DARK_MOTION_PURPLE_STROKE,
  DARK_MOTION_PURPLE_FILL,
} from "#lib/shared/mandala/domain/mandala-constants.js";

const DARK_PALETTE: MandalaPalette = {
  leftStroke: DARK_MOTION_BLUE_STROKE,
  leftFill: DARK_MOTION_BLUE_FILL,
  rightStroke: DARK_MOTION_RED_STROKE,
  rightFill: DARK_MOTION_RED_FILL,
  purpleStroke: DARK_MOTION_PURPLE_STROKE,
  purpleFill: DARK_MOTION_PURPLE_FILL,
};

function pathOptionsFor(shape: MandalaPathShape): MandalaPathOptions {
  const base: MandalaPathOptions = { tipEnds: 1 };
  if (shape !== "arc") base.pathShape = shape;
  return base;
}

/**
 * Build a `frameOverlayDraw(ctx, sizePx)` that paints the static glowing mandala
 * for `sequence` (shown hand) into the export square. `opacity`/`scale` mirror
 * the live overlay (0.55 / 1.0). Rasterizes the mandala once per sizePx.
 */
export function buildMandalaOverlayDraw(
  sequence: SequenceData,
  opts: { show: "left" | "right"; pathShape: MandalaPathShape; opacity?: number; scale?: number },
): (ctx: CanvasRenderingContext2D, sizePx: number) => void {
  const { show, pathShape, opacity = 0.55, scale = 1 } = opts;
  const clubTipDx = getTipPoints("club").points[0]?.dx ?? 130;
  const tip = { dx: clubTipDx, dy: 0 };
  const paths = calculateMandalaGeometry(
    sequence.steps,
    undefined,
    undefined,
    pathOptionsFor(pathShape),
    tip,
  );
  const totalAlign = engineAlignScale(clubTipDx) * scale;

  let cache: { sizePx: number; canvas: HTMLCanvasElement } | null = null;

  return (ctx: CanvasRenderingContext2D, sizePx: number) => {
    if (!cache || cache.sizePx !== sizePx) {
      const oc = document.createElement("canvas");
      oc.width = sizePx;
      oc.height = sizePx;
      const octx = oc.getContext("2d");
      if (octx) {
        // renderMandalaToCanvas centers at (offset + size/2) and fits maxExtent·1.05
        // to the box. Pre-scale the context about the box center by totalAlign so the
        // mandala's hand circle matches the engine hand orbit at this resolution.
        octx.save();
        octx.translate(sizePx / 2, sizePx / 2);
        octx.scale(totalAlign, totalAlign);
        octx.translate(-sizePx / 2, -sizePx / 2);
        renderMandalaToCanvas(octx, paths, {
          size: sizePx,
          style: "stroke",
          show,
          tipDx: clubTipDx,
          palette: DARK_PALETTE,
          offsetX: 0,
          offsetY: 0,
          glow: { blur: Math.max(2, sizePx * 0.012) },
        });
        octx.restore();
      }
      cache = { sizePx, canvas: oc };
    }
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(cache.canvas, 0, 0);
    ctx.restore();
  };
}
