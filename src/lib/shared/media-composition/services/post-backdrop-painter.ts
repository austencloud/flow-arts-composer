import type { MediaCompositionPreset } from "#lib/shared/media-composition/domain/media-composition-preset-schema.js";
import type { ClipTransform } from "#lib/shared/media-composition/domain/media-layout-schema.js";
import type { EvaluatedFrameLayer } from "#lib/shared/media-composition/services/frame-evaluator.js";
import { turnedExtent } from "#lib/shared/media-composition/services/media-fit.js";

/**
 * The blurred background: the post's main clip on screen, filling the frame
 * and blurred, under everything else, so a clip in a shape of its own sits on
 * a soft copy of itself rather than on bars. The preview and the export both
 * paint it here, so they match.
 */

/** How far the picture is blurred, as a share of the frame's width. */
const BLUR_SHARE = 0.03;
/** The picture is blurred small, at this share of the frame, then drawn up. */
const SAMPLE_SHARE = 1 / 8;
/** Without canvas filters, a smaller sample drawn up stands in for the blur. */
const PLAIN_SAMPLE_SHARE = 1 / 32;
/** Dims the blur a little, so what sits on it stands out. */
const VEIL = "rgba(0, 0, 0, 0.25)";

export interface BackdropSize {
  width: number;
  height: number;
}

export interface BackdropPaint {
  source: CanvasImageSource;
  sourceSize: BackdropSize;
  /** The frame to fill, in the target's pixels, from its top left. */
  frame: BackdropSize;
  /** The clip's turn and mirror; the backdrop shows its picture the same way up. */
  transform: Pick<ClipTransform, "rotationDegrees" | "flipHorizontal">;
  opacity: number;
}

/** The layer the backdrop draws now: the first of its clips on screen. */
export function backdropLayer(
  preset: MediaCompositionPreset,
  layers: readonly EvaluatedFrameLayer[]
): EvaluatedFrameLayer | null {
  for (const clipId of preset.backdrop?.clipIds ?? []) {
    const layer = layers.find((candidate) => candidate.clipId === clipId);
    if (layer) return layer;
  }
  return null;
}

/**
 * Each target blurs in a canvas of its own, so the preview never shares one
 * with a file being made.
 */
const samples = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>();

function sampleFor(context: CanvasRenderingContext2D): HTMLCanvasElement {
  let sample = samples.get(context);
  if (!sample) {
    sample = document.createElement("canvas");
    samples.set(context, sample);
  }
  return sample;
}

function isSize(size: BackdropSize): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

/**
 * Paints the backdrop over the whole frame. The picture is blurred in a small
 * sample first, which is cheap at any output size, with a margin the blur can
 * fade into, then that sample's middle is drawn up to fill the frame.
 */
export function paintBlurredBackdrop(
  context: CanvasRenderingContext2D,
  paint: BackdropPaint
): void {
  const { source, sourceSize, frame, transform } = paint;
  if (!isSize(sourceSize) || !isSize(frame) || paint.opacity <= 0) return;
  const sample = sampleFor(context);
  const sampleContext = sample.getContext("2d");
  if (!sampleContext) return;

  const filtered = typeof sampleContext.filter === "string";
  const share = filtered ? SAMPLE_SHARE : PLAIN_SAMPLE_SHARE;
  const inner = {
    width: Math.max(1, Math.round(frame.width * share)),
    height: Math.max(1, Math.round(frame.height * share)),
  };
  const radius = filtered ? frame.width * share * BLUR_SHARE : 0;
  // The blur reaches about three radii, so the frame's edge blurs with
  // picture rather than with the empty canvas past it.
  const margin = Math.ceil(radius * 3);
  sample.width = inner.width + margin * 2;
  sample.height = inner.height + margin * 2;

  // The picture covers the whole sample, margin too, turned as the clip is.
  const extent = turnedExtent(
    sample.width,
    sample.height,
    transform.rotationDegrees
  );
  const scale = Math.max(
    extent.width / sourceSize.width,
    extent.height / sourceSize.height
  );
  const width = sourceSize.width * scale;
  const height = sourceSize.height * scale;
  sampleContext.save();
  if (radius > 0) sampleContext.filter = `blur(${radius}px)`;
  sampleContext.translate(sample.width / 2, sample.height / 2);
  sampleContext.rotate((transform.rotationDegrees * Math.PI) / 180);
  if (transform.flipHorizontal) sampleContext.scale(-1, 1);
  sampleContext.drawImage(source, -width / 2, -height / 2, width, height);
  sampleContext.restore();

  context.save();
  context.globalAlpha = paint.opacity;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    sample,
    margin,
    margin,
    inner.width,
    inner.height,
    0,
    0,
    frame.width,
    frame.height
  );
  context.fillStyle = VEIL;
  context.fillRect(0, 0, frame.width, frame.height);
  context.restore();
}
