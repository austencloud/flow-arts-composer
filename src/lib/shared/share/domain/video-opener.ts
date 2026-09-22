/**
 * The image a shared video opens with. Social players and file thumbnails
 * show the first frame, so the sheet lets the person choose it instead of
 * inheriting whatever pose the export happened to start on.
 *
 * - `first-beat`: the sequence's own start position. The export already
 *   begins with one beat of it, so nothing is prepended.
 * - `this-frame`: the pose on screen when the sheet opened, held for one beat
 *   before the animation.
 * - `mandala`: the sequence's mandala fingerprint, held for one beat.
 */
export type VideoOpener = "first-beat" | "this-frame" | "mandala";

export const DEFAULT_VIDEO_OPENER: VideoOpener = "first-beat";

export const VIDEO_OPENER_OPTIONS: readonly {
  value: VideoOpener;
  label: string;
}[] = [
  { value: "first-beat", label: "First beat" },
  { value: "this-frame", label: "Current frame" },
  { value: "mandala", label: "Mandala" },
];

export function isVideoOpener(value: unknown): value is VideoOpener {
  return VIDEO_OPENER_OPTIONS.some((option) => option.value === value);
}

/** Beats the opener image holds before the animation starts. */
export const VIDEO_OPENER_HOLD_BEATS = 1;

/** Only openers that are not already the export's first frame add a hold. */
export function openerAddsHold(opener: VideoOpener): boolean {
  return opener !== "first-beat";
}

/** What the sheet hands the viewer with a render request. */
export interface VideoOpenerRequest {
  kind: VideoOpener;
  /** A data URL of the chosen image; empty when the kind needs no hold. */
  imageUrl: string;
}

/** The sheet's render request; hosts without an opener ignore it. */
export interface VideoRenderRequest {
  opener?: VideoOpenerRequest;
}

/**
 * Frames a held image occupies. Zero whenever the hold would not fill a
 * frame; otherwise rounded up so the hold is never shorter than asked.
 */
export function holdFrameCount(value: {
  fps: number;
  secondsPerBeat: number;
  holdBeats?: number;
}): number {
  const seconds =
    (value.holdBeats ?? VIDEO_OPENER_HOLD_BEATS) * value.secondsPerBeat;
  if (!Number.isFinite(seconds) || seconds <= 0 || value.fps <= 0) return 0;
  return Math.ceil(seconds * value.fps);
}

/**
 * Frames of opener hold to prepend. Zero for the first beat, which the
 * export already opens on.
 */
export function openerFrameCount(value: {
  opener: VideoOpener;
  fps: number;
  secondsPerBeat: number;
  holdBeats?: number;
}): number {
  if (!openerAddsHold(value.opener)) return 0;
  return holdFrameCount(value);
}

/**
 * Where the opener image lands inside the output frame: centered and
 * contain-fit, so a square capture inside a portrait clip keeps its aspect.
 */
export function fitOpenerImage(value: {
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
}): { x: number; y: number; width: number; height: number } {
  const { imageWidth, imageHeight, frameWidth, frameHeight } = value;
  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    frameWidth <= 0 ||
    frameHeight <= 0
  ) {
    return { x: 0, y: 0, width: frameWidth, height: frameHeight };
  }
  const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
  const width = Math.round(imageWidth * scale);
  const height = Math.round(imageHeight * scale);
  return {
    x: Math.round((frameWidth - width) / 2),
    y: Math.round((frameHeight - height) / 2),
    width,
    height,
  };
}

/**
 * The clip's cover offset once the opener is baked in. Every opener sits at
 * time zero, including the first beat, so Instagram's cover points there.
 */
export function openerCoverOffsetMs(): number {
  return 0;
}
