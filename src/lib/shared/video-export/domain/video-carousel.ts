/**
 * The beat carousel a downloaded video can carry: the spotlight rail the app
 * shows under its animations (the current beat large, its neighbors shrinking
 * and fading), attached to one side of the video card. The card is the word
 * header, the animation square and the progress bar, each when the video
 * shows it. The carousel's dots say which beat is playing; the bar says how
 * far through the whole video it is.
 *
 * Pure layout and timing. The export compositor draws the band with the beat
 * carousel painter (`media-composition/services/beat-carousel-painter.ts`).
 */

export type VideoCarouselPlacement =
  | "off"
  | "above"
  | "below"
  | "left"
  | "right";

export const VIDEO_CAROUSEL_PLACEMENTS: readonly VideoCarouselPlacement[] = [
  "off",
  "above",
  "below",
  "left",
  "right",
];

export const DEFAULT_VIDEO_CAROUSEL: VideoCarouselPlacement = "off";

export function isVideoCarouselPlacement(
  value: unknown
): value is VideoCarouselPlacement {
  return (
    typeof value === "string" &&
    (VIDEO_CAROUSEL_PLACEMENTS as readonly string[]).includes(value)
  );
}

/**
 * The band's thickness as a share of the animation square's edge. At this
 * share the focus beat is about a fifth of the square, large enough to read
 * at 720p, and a 1080p video below or above its animation comes out about
 * 812 by 1080.
 */
export const VIDEO_CAROUSEL_BAND_RATIO = 0.26;

export type VideoCarouselOrientation = "horizontal" | "vertical";

export function videoCarouselOrientation(
  placement: Exclude<VideoCarouselPlacement, "off">
): VideoCarouselOrientation {
  return placement === "left" || placement === "right"
    ? "vertical"
    : "horizontal";
}

/**
 * The whole frame's size at source scale: the card (header + square) with the
 * band attached. The export takes its output aspect ratio from this.
 */
export function videoCarouselSourceFrame(input: {
  placement: Exclude<VideoCarouselPlacement, "off">;
  /** The animation square's edge, which is also the card's width. */
  squareSize: number;
  headerHeight: number;
  /** The progress bar under the square; zero without one. */
  footerHeight?: number;
}): { width: number; height: number } {
  const band = input.squareSize * VIDEO_CAROUSEL_BAND_RATIO;
  const cardHeight =
    input.squareSize + input.headerHeight + (input.footerHeight ?? 0);
  return videoCarouselOrientation(input.placement) === "vertical"
    ? { width: input.squareSize + band, height: cardHeight }
    : { width: input.squareSize, height: cardHeight + band };
}

export interface VideoCarouselRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoCarouselFrame {
  orientation: VideoCarouselOrientation;
  /** Top-left of the card in the output frame. */
  cardX: number;
  cardY: number;
  /** The animation square's edge in output pixels. */
  canvasSize: number;
  headerHeight: number;
  /** The progress bar's height under the square; zero without one. */
  footerHeight: number;
  band: VideoCarouselRect;
}

/**
 * Places the card and the band in output pixels. The square keeps the full
 * width (above, below) or the full height under the header (left, right), and
 * the band takes every pixel left over, so rounding never leaves a seam.
 */
export function layoutVideoCarouselFrame(input: {
  placement: Exclude<VideoCarouselPlacement, "off">;
  outputWidth: number;
  outputHeight: number;
  /** The square's edge at source scale. */
  sourceSquareSize: number;
  /** The header's height at source scale; zero without a word header. */
  sourceHeaderHeight: number;
  /** The progress bar's height at source scale; zero without one. */
  sourceFooterHeight?: number;
}): VideoCarouselFrame {
  const { placement, outputWidth, outputHeight } = input;
  const sourceFooterHeight = input.sourceFooterHeight ?? 0;
  const orientation = videoCarouselOrientation(placement);
  if (orientation === "horizontal") {
    const canvasSize = outputWidth;
    const headerHeight = Math.round(
      (input.sourceHeaderHeight * canvasSize) / input.sourceSquareSize
    );
    const footerHeight = Math.round(
      (sourceFooterHeight * canvasSize) / input.sourceSquareSize
    );
    const cardHeight = headerHeight + canvasSize + footerHeight;
    const bandHeight = Math.max(0, outputHeight - cardHeight);
    const above = placement === "above";
    return {
      orientation,
      cardX: 0,
      cardY: above ? bandHeight : 0,
      canvasSize,
      headerHeight,
      footerHeight,
      band: {
        x: 0,
        y: above ? 0 : cardHeight,
        width: outputWidth,
        height: bandHeight,
      },
    };
  }

  const scale =
    outputHeight /
    (input.sourceSquareSize + input.sourceHeaderHeight + sourceFooterHeight);
  const headerHeight = Math.round(input.sourceHeaderHeight * scale);
  const footerHeight = Math.round(sourceFooterHeight * scale);
  const canvasSize = outputHeight - headerHeight - footerHeight;
  const bandWidth = Math.max(0, outputWidth - canvasSize);
  const left = placement === "left";
  return {
    orientation,
    cardX: left ? bandWidth : 0,
    cardY: 0,
    canvasSize,
    headerHeight,
    footerHeight,
    band: {
      x: left ? 0 : canvasSize,
      y: 0,
      width: bandWidth,
      height: outputHeight,
    },
  };
}

/**
 * The carousel's position for one export frame, in the engine's beat
 * convention: [0, 1) is the start pose, [k, k + 1) is beat k in flight. The
 * focus therefore matches the beat number drawn on the animation, and the row
 * slides onto each beat as it begins, the way the app's rail follows playback.
 *
 * Repeats count on (beat N + 1 reads as beat 1 of the next pass), so the row
 * keeps sliding forward instead of rewinding. A video that does not run
 * straight back into beat 1 (it ends on a hold, or replays from the start
 * pose) stops the last pass short of sliding toward a pass that never comes.
 */
export function videoCarouselPosition(input: {
  phase: "start" | "motion" | "end";
  /** 0..1 through the start placement. */
  startProgress?: number;
  /** Beats performed since the first motion began, counted across repeats. */
  motionBeats?: number;
  beatCount: number;
  loopCount: number;
  settlesOnLastBeat: boolean;
}): number {
  const lastBeatIndex = Math.max(1, input.beatCount * input.loopCount);
  // Any rest inside the last beat's interval short of its slide window.
  const resting = lastBeatIndex + 0.5;
  switch (input.phase) {
    case "start":
      return Math.min(Math.max(input.startProgress ?? 0, 0), 0.999);
    case "end":
      return resting;
    case "motion": {
      const position = 1 + Math.max(0, input.motionBeats ?? 0);
      return input.settlesOnLastBeat ? Math.min(position, resting) : position;
    }
  }
}
