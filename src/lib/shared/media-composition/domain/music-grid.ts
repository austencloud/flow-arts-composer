import type {
  PostMusic,
  PostMusicGrid,
} from "#lib/shared/media-composition/domain/post-music.js";

/**
 * Bars, beats and the post's clock. A grid lives in the music file's own
 * seconds; the music's placement turns those into post seconds:
 *
 *   postSeconds(bar, beat) = startSeconds + (downbeatSeconds - sourceInSeconds)
 *     + ((bar - 1) * beatsPerBar + (beat - 1)) * 60 / bpm
 */

/** What places the music on the post's clock. */
export type MusicPlacement = Pick<
  PostMusic,
  "startSeconds" | "sourceInSeconds" | "sourceOutSeconds"
> & { grid?: PostMusicGrid };
export type GriddedMusic = MusicPlacement & { grid: PostMusicGrid };

/** One grid line on the post's clock. A downbeat is a bar's first beat. */
export interface MusicGridLine {
  seconds: number;
  bar: number;
  beat: number;
  downbeat: boolean;
}

/** A time a command names: post seconds, or a bar and beat of the music. */
export type PostTimeRef = number | { bar: number; beat?: number };

/** Below this many pixels apart, beats stop being snap targets; bars stay. */
export const MUSIC_BEAT_SNAP_MIN_PX = 12;
/** Bar numbers closer than this on the ruler are thinned out. */
export const MUSIC_BAR_LABEL_MIN_PX = 28;
/** The most lines one window lists, whatever the grid holds. */
export const MUSIC_GRID_MAX_LINES = 100_000;
export const NO_GRID_MESSAGE =
  "This post has no beat grid. Set one with: music --bpm N --downbeat S.";

export function hasGrid<T extends MusicPlacement>(
  music: T
): music is T & { grid: PostMusicGrid } {
  return music.grid !== undefined;
}

/** Where the music sounds on the post's clock. */
export function musicSpan(music: MusicPlacement): {
  start: number;
  end: number;
} {
  return {
    start: music.startSeconds,
    end: music.startSeconds + (music.sourceOutSeconds - music.sourceInSeconds),
  };
}

/** The file's own second that sounds at this post second. */
export function trackSecondsAt(
  music: MusicPlacement,
  postSeconds: number
): number {
  return music.sourceInSeconds + (postSeconds - music.startSeconds);
}

/** The post second at which this second of the file sounds. */
export function postSecondsAtTrack(
  music: MusicPlacement,
  trackSeconds: number
): number {
  return music.startSeconds + (trackSeconds - music.sourceInSeconds);
}

export function beatSeconds(grid: PostMusicGrid): number {
  return 60 / grid.bpm;
}

/** Bar `bar`, beat `beat` (both counted from 1) in the file's own seconds. */
export function trackSecondsAtBar(
  grid: PostMusicGrid,
  bar: number,
  beat = 1
): number {
  return (
    grid.downbeatSeconds +
    ((bar - 1) * grid.beatsPerBar + (beat - 1)) * beatSeconds(grid)
  );
}

/** Bar `bar`, beat `beat` on the post's clock. */
export function postSecondsAtBar(
  music: GriddedMusic,
  bar: number,
  beat = 1
): number {
  return postSecondsAtTrack(music, trackSecondsAtBar(music.grid, bar, beat));
}

/** The bar and beat sounding at a post second. Bars before bar 1 count 0, -1 and on. */
export function barBeatAt(
  music: GriddedMusic,
  postSeconds: number
): { bar: number; beat: number } {
  const { grid } = music;
  const beats = Math.floor(
    (trackSecondsAt(music, postSeconds) - grid.downbeatSeconds) /
      beatSeconds(grid) +
      1e-9
  );
  const bar = Math.floor(beats / grid.beatsPerBar) + 1;
  return { bar, beat: beats - (bar - 1) * grid.beatsPerBar + 1 };
}

/** Every beat from `from` to `to` on the post's clock that the music sounds. */
export function musicGridLines(
  music: GriddedMusic,
  from: number,
  to: number
): MusicGridLine[] {
  const span = musicSpan(music);
  const low = Math.max(from, span.start);
  const high = Math.min(to, span.end);
  if (high < low) return [];
  const step = beatSeconds(music.grid);
  const zero = postSecondsAtTrack(music, music.grid.downbeatSeconds);
  const first = Math.ceil((low - zero) / step - 1e-9);
  const last = Math.floor((high - zero) / step + 1e-9);
  const lines: MusicGridLine[] = [];
  // Count from 0 and add to `first`: past 2^53 a beat number no longer
  // changes when 1 is added to it, so counting the beat numbers themselves
  // could never reach `last`.
  const count = last - first + 1;
  for (let i = 0; i < count && i < MUSIC_GRID_MAX_LINES; i += 1) {
    const n = first + i;
    const bar = Math.floor(n / music.grid.beatsPerBar) + 1;
    const beat = n - (bar - 1) * music.grid.beatsPerBar + 1;
    lines.push({ seconds: zero + n * step, bar, beat, downbeat: beat === 1 });
  }
  return lines;
}

/** The music's edges, every bar, and every beat once beats sit far enough apart. */
export function musicSnapTargets(
  music: MusicPlacement,
  pixelsPerSecond: number
): number[] {
  const span = musicSpan(music);
  const targets = [span.start, span.end];
  if (!hasGrid(music)) return targets;
  const beats =
    beatSeconds(music.grid) * pixelsPerSecond >= MUSIC_BEAT_SNAP_MIN_PX;
  for (const line of musicGridLines(music, span.start, span.end))
    if (beats || line.downbeat) targets.push(line.seconds);
  return targets;
}

/** How many bars apart the ruler numbers them: 1, 2, 4, 8 and on as they crowd. */
export function musicBarLabelEvery(
  music: GriddedMusic,
  pixelsPerSecond: number
): number {
  const barPx =
    beatSeconds(music.grid) * music.grid.beatsPerBar * pixelsPerSecond;
  let every = 1;
  while (barPx * every < MUSIC_BAR_LABEL_MIN_PX && every < 1024) every *= 2;
  return every;
}

/** A bar the ruler numbers when it numbers one bar in `every`. */
export function isNumberedBar(line: MusicGridLine, every: number): boolean {
  return line.downbeat && line.bar >= 1 && (line.bar - 1) % every === 0;
}

/** Bar numbers for the ruler: every bar, or every 2nd, 4th, 8th as they crowd. */
export function musicBarMarks(
  music: GriddedMusic,
  pixelsPerSecond: number
): { seconds: number; label: string }[] {
  const every = musicBarLabelEvery(music, pixelsPerSecond);
  const span = musicSpan(music);
  return musicGridLines(music, span.start, span.end)
    .filter((line) => isNumberedBar(line, every))
    .map((line) => ({ seconds: line.seconds, label: String(line.bar) }));
}

function checkedRef(ref: unknown, name: string): PostTimeRef {
  if (typeof ref === "number" && Number.isFinite(ref)) return ref;
  if (ref !== null && typeof ref === "object") {
    const { bar, beat } = ref as { bar?: unknown; beat?: unknown };
    if (
      typeof bar === "number" &&
      (beat === undefined || typeof beat === "number")
    )
      return { bar, ...(beat === undefined ? {} : { beat }) };
  }
  throw new Error(
    `${name} must be a number of seconds or a bar like @9 or @9.3.`
  );
}

function checkedBar(
  ref: { bar: number; beat?: number },
  grid: PostMusicGrid,
  name: string
): [number, number] {
  const beat = ref.beat ?? 1;
  if (!Number.isInteger(ref.bar))
    throw new Error(`${name}: a bar must be a whole number, like @9.`);
  if (!Number.isInteger(beat) || beat < 1 || beat > grid.beatsPerBar)
    throw new Error(
      `${name}: the beat must be a whole number from 1 to ${grid.beatsPerBar}.`
    );
  return [ref.bar, beat];
}

/** Post seconds for a time a command named. A bar needs the beat grid. */
export function resolvePostTime(
  ref: unknown,
  music: MusicPlacement | undefined,
  name: string
): number {
  const checked = checkedRef(ref, name);
  if (typeof checked === "number") return checked;
  if (!music || !hasGrid(music)) throw new Error(NO_GRID_MESSAGE);
  return postSecondsAtBar(music, ...checkedBar(checked, music.grid, name));
}

/** The file's own seconds for a time a command named. A bar needs the beat grid. */
export function resolveTrackTime(
  ref: unknown,
  grid: PostMusicGrid | undefined,
  name: string
): number {
  const checked = checkedRef(ref, name);
  if (typeof checked === "number") return checked;
  if (!grid) throw new Error(NO_GRID_MESSAGE);
  return trackSecondsAtBar(grid, ...checkedBar(checked, grid, name));
}

/**
 * The downbeat that best fits taps made along with the music, in the file's
 * own seconds: the taps' average place on the beat, moved to the beat nearest
 * `near`. Null with fewer than two taps, or taps that agree on nothing.
 */
export function downbeatFromTaps(
  taps: readonly number[],
  bpm: number,
  near: number
): number | null {
  if (taps.length < 2) return null;
  const period = 60 / bpm;
  let x = 0;
  let y = 0;
  for (const tap of taps) {
    const angle = (2 * Math.PI * tap) / period;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  if (Math.hypot(x, y) < 1e-6 * taps.length) return null;
  const turn = Math.atan2(y, x) / (2 * Math.PI);
  const phase = (((turn * period) % period) + period) % period;
  return phase + Math.round((near - phase) / period) * period;
}
