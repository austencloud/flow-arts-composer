import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { MandalaPalette } from "$lib/shared/mandala/domain/mandala-types";
import type { MandalaPathOptions } from "$lib/shared/mandala/services/types";
import {
  DARK_MOTION_BLUE_FILL,
  DARK_MOTION_BLUE_STROKE,
  DARK_MOTION_PURPLE_FILL,
  DARK_MOTION_PURPLE_STROKE,
  DARK_MOTION_RED_FILL,
  DARK_MOTION_RED_STROKE,
  MANDALA_STANDARD_TIP_DX,
} from "$lib/shared/mandala/domain/mandala-constants";
import { calculate } from "$lib/shared/mandala/services/mandala-geometry-calculator";
import { renderMandalaToCanvas } from "$lib/shared/mandala/services/mandala-renderer";
import { pairTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";

/** The card back's dark palette: the clip is flattened over black. */
const OPENER_PALETTE: MandalaPalette = {
  leftStroke: DARK_MOTION_BLUE_STROKE,
  leftFill: DARK_MOTION_BLUE_FILL,
  rightStroke: DARK_MOTION_RED_STROKE,
  rightFill: DARK_MOTION_RED_FILL,
  purpleStroke: DARK_MOTION_PURPLE_STROKE,
  purpleFill: DARK_MOTION_PURPLE_FILL,
};

const MANDALA_REF_SIZE = 380;
const GLOW_STDDEV = 3;
const BLOOM_STDDEV = 7;
/** Square opener side in px; the export contain-fits it into the clip. */
const OPENER_SIZE = 960;
/** Breathing room so the outer petals never touch the clip edge. */
const OPENER_INSET = 0.08;

/**
 * The sequence's mandala fingerprint as a square data URL, drawn the way the
 * card back draws it (stroke, both hands, standard tip) over opaque black so
 * it matches the flattened animation frames that follow it.
 */
export function renderMandalaOpener(
  sequence: Pick<SequenceData, "steps">,
  props: { leftPropType?: string; rightPropType?: string },
  size = OPENER_SIZE
): string {
  if (typeof document === "undefined") return "";
  const steps = sequence.steps ?? [];
  if (steps.length === 0) return "";
  const tipEnds = pairTipEnds(props.leftPropType, props.rightPropType);
  const pathOptions: MandalaPathOptions | undefined =
    tipEnds === 1 ? { tipEnds: 1 } : undefined;
  const paths = calculate(
    steps,
    props.leftPropType,
    props.rightPropType,
    pathOptions,
    { dx: MANDALA_STANDARD_TIP_DX, dy: 0 }
  );

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);

  const drawSize = Math.round(size * (1 - OPENER_INSET * 2));
  const offset = Math.round((size - drawSize) / 2);
  const sizeScale = drawSize / MANDALA_REF_SIZE;
  renderMandalaToCanvas(ctx, paths, {
    size: drawSize,
    style: "stroke",
    show: "both",
    palette: OPENER_PALETTE,
    strokeWidth: 2.5,
    tipDx: MANDALA_STANDARD_TIP_DX,
    offsetX: offset,
    offsetY: offset,
    glow: {
      blur: GLOW_STDDEV * sizeScale,
      bloomBlur: BLOOM_STDDEV * sizeScale,
    },
  });
  return canvas.toDataURL("image/png");
}
