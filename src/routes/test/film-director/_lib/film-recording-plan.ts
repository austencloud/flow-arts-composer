/**
 * The frame schedule for recording a film to video.
 *
 * A recording is not a screen capture. The page plays about 32 frames a second
 * live with eight performers, so every output frame is rendered on its own:
 * the film is seeked to exactly `start + index / fps` seconds, drawn, and
 * handed to the encoder. This module decides which times those are, which
 * frames open a new scene (the recorder stops there until that scene's world
 * and cast are really in place), and which sizes the browser's H.264 encoder
 * will take. It is pure so the arithmetic can be tested without a browser.
 */

export const FILM_RECORDING_FRAME_RATES = [30, 60] as const;
export type FilmRecordingFrameRate =
  (typeof FILM_RECORDING_FRAME_RATES)[number];

export const FILM_RECORDING_DEFAULTS = {
  fps: 60,
  width: 1920,
  height: 1080,
} as const;

/** What the dev endpoint accepts as a file name. */
export const FILM_RECORDING_NAME = /^[a-z0-9-]{1,64}$/;

/**
 * The largest frame the encoder path is trusted with, in 16 by 16 pixel
 * macroblocks: H.264 level 4.0's limit. 1920 by 1080 needs 8160 and fits. A
 * 2044 by 1080 take needs 8704, moves the codec string up a level, and the
 * Windows hardware encoder failed it with "Encoding error" (see the take
 * recorder's notes), so anything above this is refused before rendering
 * starts rather than after.
 */
export const FILM_RECORDING_MAX_MACROBLOCKS = 8192;
const MIN_SIDE = 64;
const MAX_SIDE = 4096;

export interface FilmRecordingOptions {
  fps?: number;
  width?: number;
  height?: number;
  /** Film time the first frame shows. Defaults to the start of the film. */
  fromSeconds?: number | null;
  /** Film time the recording stops before. Defaults to the end of the film. */
  toSeconds?: number | null;
  /** File name for the dev endpoint, without `.mp4`. */
  name?: string | null;
}

/** The fields of a resolved film the schedule reads. */
export interface FilmRecordingSource {
  id: string;
  durationSeconds: number;
  scenes: readonly {
    id: string;
    startSeconds: number;
    durationSeconds: number;
  }[];
}

/** A frame the recorder must not draw until its scene has settled. */
export interface FilmRecordingSceneWait {
  frameIndex: number;
  sceneIndex: number;
  sceneId: string;
}

export interface FilmRecordingPlan {
  fps: FilmRecordingFrameRate;
  width: number;
  height: number;
  name: string;
  startSeconds: number;
  endSeconds: number;
  frameCount: number;
  /** The first frame, then every frame whose scene differs from the one before. */
  sceneWaits: FilmRecordingSceneWait[];
}

export class FilmRecordingError extends Error {
  override name = "FilmRecordingError";
}

/**
 * Why the encoder would refuse this size, or null when it fits.
 */
export function explainEncoderSize(
  width: number,
  height: number
): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return `Width and height must be whole pixels (got ${width} by ${height}).`;
  }
  if (width % 2 !== 0 || height % 2 !== 0) {
    return `H.264 needs an even width and height; ${width} by ${height} has an odd side.`;
  }
  if (
    width < MIN_SIDE ||
    height < MIN_SIDE ||
    width > MAX_SIDE ||
    height > MAX_SIDE
  ) {
    return `Each side must be between ${MIN_SIDE} and ${MAX_SIDE} pixels (got ${width} by ${height}).`;
  }
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  if (macroblocks > FILM_RECORDING_MAX_MACROBLOCKS) {
    return `${width} by ${height} is too large for the browser's H.264 encoder: it needs ${macroblocks} blocks of 16 by 16 pixels and the limit is ${FILM_RECORDING_MAX_MACROBLOCKS}. 1920 by 1080 and 1080 by 1920 fit.`;
  }
  return null;
}

/**
 * The scene a film time falls in, matching `sampleFilmDirector`: a scene owns
 * its start and not its end, and a time past every scene belongs to the last.
 */
export function sceneIndexAt(
  scenes: FilmRecordingSource["scenes"],
  seconds: number
): number {
  const index = scenes.findIndex(
    (scene) =>
      seconds >= scene.startSeconds &&
      seconds < scene.startSeconds + scene.durationSeconds
  );
  return index < 0 ? scenes.length - 1 : index;
}

/** Film time of one output frame. Computed from the index, never summed. */
export function frameTimeSeconds(
  plan: Pick<FilmRecordingPlan, "startSeconds" | "fps">,
  frameIndex: number
): number {
  return plan.startSeconds + frameIndex / plan.fps;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function finiteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) {
    throw new FilmRecordingError(`Start and end must be numbers of seconds.`);
  }
  return value;
}

export function planFilmRecording(
  film: FilmRecordingSource,
  options: FilmRecordingOptions = {}
): FilmRecordingPlan {
  const fps = options.fps ?? FILM_RECORDING_DEFAULTS.fps;
  if (!FILM_RECORDING_FRAME_RATES.includes(fps as FilmRecordingFrameRate)) {
    throw new FilmRecordingError(
      `Frame rate must be 30 or 60 frames a second (got ${fps}).`
    );
  }

  const width = options.width ?? FILM_RECORDING_DEFAULTS.width;
  const height = options.height ?? FILM_RECORDING_DEFAULTS.height;
  const sizeProblem = explainEncoderSize(width, height);
  if (sizeProblem) throw new FilmRecordingError(sizeProblem);

  const name = options.name ?? (slug(`film-${film.id}`) || "film");
  if (!FILM_RECORDING_NAME.test(name)) {
    throw new FilmRecordingError(
      `The file name may use only lowercase letters, digits and dashes, up to 64 (got "${name}").`
    );
  }

  if (film.scenes.length === 0 || !(film.durationSeconds > 0)) {
    throw new FilmRecordingError("This film has nothing to record.");
  }

  const startSeconds = finiteOrNull(options.fromSeconds) ?? 0;
  const endSeconds = finiteOrNull(options.toSeconds) ?? film.durationSeconds;
  if (startSeconds < 0 || startSeconds >= film.durationSeconds) {
    throw new FilmRecordingError(
      `Start must be at least 0 and before the film ends at ${film.durationSeconds} seconds (got ${startSeconds}).`
    );
  }
  if (endSeconds > film.durationSeconds + 1e-9) {
    throw new FilmRecordingError(
      `End must not be past the film's end at ${film.durationSeconds} seconds (got ${endSeconds}).`
    );
  }
  // Rounded, so 12.3 seconds at 60 is 738 frames rather than 739 from float
  // error. The last frame then sits one frame before the end, never on it.
  const frameCount = Math.round((endSeconds - startSeconds) * fps);
  if (frameCount < 1) {
    throw new FilmRecordingError(
      `End must come at least one frame after start (got ${startSeconds} to ${endSeconds}).`
    );
  }

  const plan: FilmRecordingPlan = {
    fps: fps as FilmRecordingFrameRate,
    width,
    height,
    name,
    startSeconds,
    endSeconds,
    frameCount,
    sceneWaits: [],
  };

  let previousScene = -1;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const sceneIndex = sceneIndexAt(
      film.scenes,
      frameTimeSeconds(plan, frameIndex)
    );
    if (sceneIndex === previousScene) continue;
    plan.sceneWaits.push({
      frameIndex,
      sceneIndex,
      sceneId: film.scenes[sceneIndex]!.id,
    });
    previousScene = sceneIndex;
  }

  return plan;
}
