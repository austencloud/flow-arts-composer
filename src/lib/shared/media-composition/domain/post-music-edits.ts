import {
  POST_MIN_ITEM_SECONDS,
  type PostProject,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  finish,
  type EditContext,
} from "$lib/shared/media-composition/domain/post-project-edits";
import {
  TAKE_MAX_BPM,
  TAKE_MIN_BPM,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  POST_MUSIC_MAX_BEATS_PER_BAR,
  POST_MUSIC_MAX_GAIN,
  POST_MUSIC_MAX_LICENSE,
  POST_MUSIC_MAX_TEXT,
  type PostMusic,
  type PostMusicGrid,
} from "$lib/shared/media-composition/domain/post-music";

/**
 * Edits to the post's music. Like the timeline's edits, each is pure, runs
 * the result through `finish`, and returns the project it was given when
 * nothing changes, so no empty undo step is made.
 */

export const POST_MUSIC_ID = "music-1";
/** The shortest stretch of music the timeline keeps. */
export const POST_MUSIC_MIN_SECONDS = POST_MIN_ITEM_SECONDS;

export interface NewMusic {
  url: string;
  durationSeconds: number;
  label: string;
  artist?: string;
  license?: string;
}

export interface MusicPatch {
  startSeconds?: number;
  sourceInSeconds?: number;
  sourceOutSeconds?: number;
  gain?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  label?: string;
  /** null removes it. */
  artist?: string | null;
  /** null removes it. */
  license?: string | null;
  /** null removes the beat grid; a number makes one when there is none. */
  bpm?: number | null;
  downbeatSeconds?: number;
  beatsPerBar?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Trimmed and cut to length; undefined when nothing is left. */
function cleanText(value: string | undefined, max: number): string | undefined {
  const text = value?.trim().slice(0, max).trim();
  return text ? text : undefined;
}

/** The same music, whatever order its keys were written in. */
function sameMusic(a: PostMusic, b: PostMusic): boolean {
  const flat = (music: PostMusic) =>
    JSON.stringify(
      Object.entries({
        ...music,
        grid: music.grid && [
          music.grid.bpm,
          music.grid.downbeatSeconds,
          music.grid.beatsPerBar,
        ],
      }).sort(([x], [y]) => x.localeCompare(y))
    );
  return flat(a) === flat(b);
}

/**
 * Puts a music file under the post. The same file again keeps its place,
 * trims, level, fades and grid, fitted to the length it has now; a different
 * file starts whole at 0 at full level.
 */
export function setMusic(
  project: PostProject,
  next: NewMusic,
  ctx: EditContext
): PostProject {
  const previous = project.music;
  const kept = previous?.url === next.url ? previous : undefined;
  const length = next.durationSeconds;
  const sourceInSeconds = kept
    ? Math.min(
        kept.sourceInSeconds,
        Math.max(0, length - POST_MUSIC_MIN_SECONDS)
      )
    : 0;
  const sourceOutSeconds = kept
    ? Math.min(
        length,
        Math.max(
          kept.sourceOutSeconds,
          sourceInSeconds + POST_MUSIC_MIN_SECONDS
        )
      )
    : length;
  const playing = sourceOutSeconds - sourceInSeconds;
  const artist = cleanText(next.artist ?? kept?.artist, POST_MUSIC_MAX_TEXT);
  const license = cleanText(
    next.license ?? kept?.license,
    POST_MUSIC_MAX_LICENSE
  );
  const music: PostMusic = {
    id: previous?.id ?? POST_MUSIC_ID,
    url: next.url,
    label: cleanText(next.label, POST_MUSIC_MAX_TEXT) ?? "Music",
    ...(artist ? { artist } : {}),
    ...(license ? { license } : {}),
    startSeconds: kept?.startSeconds ?? 0,
    sourceInSeconds,
    sourceOutSeconds,
    durationSeconds: length,
    gain: kept?.gain ?? 1,
    fadeInSeconds: Math.min(kept?.fadeInSeconds ?? 0, playing),
    fadeOutSeconds: Math.min(kept?.fadeOutSeconds ?? 0, playing),
    ...(kept?.grid ? { grid: kept.grid } : {}),
  };
  if (previous && sameMusic(previous, music)) return project;
  return finish({ ...project, music }, ctx);
}

/** Changes the music, fitting each value into range. Without music, nothing changes. */
export function updateMusic(
  project: PostProject,
  patch: MusicPatch,
  ctx: EditContext
): PostProject {
  const music = project.music;
  if (!music) return project;
  let { sourceInSeconds, sourceOutSeconds } = music;
  if (finite(patch.sourceInSeconds)) {
    const ceiling = finite(patch.sourceOutSeconds)
      ? music.durationSeconds
      : sourceOutSeconds;
    sourceInSeconds = clamp(
      patch.sourceInSeconds,
      0,
      Math.max(0, ceiling - POST_MUSIC_MIN_SECONDS)
    );
  }
  if (finite(patch.sourceOutSeconds))
    sourceOutSeconds = clamp(
      patch.sourceOutSeconds,
      sourceInSeconds + POST_MUSIC_MIN_SECONDS,
      Math.max(sourceInSeconds + POST_MUSIC_MIN_SECONDS, music.durationSeconds)
    );
  const playing = sourceOutSeconds - sourceInSeconds;

  let grid: PostMusicGrid | undefined = music.grid;
  if (patch.bpm === null) grid = undefined;
  else {
    const bpm = finite(patch.bpm)
      ? clamp(patch.bpm, TAKE_MIN_BPM, TAKE_MAX_BPM)
      : grid?.bpm;
    if (bpm !== undefined)
      grid = {
        bpm,
        downbeatSeconds: finite(patch.downbeatSeconds)
          ? patch.downbeatSeconds
          : (grid?.downbeatSeconds ?? sourceInSeconds),
        beatsPerBar: finite(patch.beatsPerBar)
          ? clamp(
              Math.round(patch.beatsPerBar),
              1,
              POST_MUSIC_MAX_BEATS_PER_BAR
            )
          : (grid?.beatsPerBar ?? 4),
      };
  }

  const label = cleanText(patch.label, POST_MUSIC_MAX_TEXT) ?? music.label;
  const artist =
    patch.artist === undefined
      ? music.artist
      : cleanText(patch.artist ?? undefined, POST_MUSIC_MAX_TEXT);
  const license =
    patch.license === undefined
      ? music.license
      : cleanText(patch.license ?? undefined, POST_MUSIC_MAX_LICENSE);
  const { artist: _artist, license: _license, grid: _grid, ...plain } = music;
  const next: PostMusic = {
    ...plain,
    label,
    ...(artist ? { artist } : {}),
    ...(license ? { license } : {}),
    startSeconds: finite(patch.startSeconds)
      ? Math.max(0, patch.startSeconds)
      : music.startSeconds,
    sourceInSeconds,
    sourceOutSeconds,
    gain: finite(patch.gain)
      ? clamp(patch.gain, 0, POST_MUSIC_MAX_GAIN)
      : music.gain,
    fadeInSeconds: clamp(
      finite(patch.fadeInSeconds) ? patch.fadeInSeconds : music.fadeInSeconds,
      0,
      playing
    ),
    fadeOutSeconds: clamp(
      finite(patch.fadeOutSeconds)
        ? patch.fadeOutSeconds
        : music.fadeOutSeconds,
      0,
      playing
    ),
    ...(grid ? { grid } : {}),
  };
  if (sameMusic(music, next)) return project;
  return finish({ ...project, music: next }, ctx);
}

/**
 * Drags one edge of the music to a post second. The start edge trims the
 * file's opening and the end edge its close; the other edge stays where it
 * sounds.
 */
export function trimMusic(
  project: PostProject,
  edge: "start" | "end",
  postSeconds: number,
  ctx: EditContext
): PostProject {
  const music = project.music;
  if (!music || !Number.isFinite(postSeconds)) return project;
  if (edge === "end")
    return updateMusic(
      project,
      {
        sourceOutSeconds:
          music.sourceInSeconds + (postSeconds - music.startSeconds),
      },
      ctx
    );
  const earliest = Math.max(0, music.startSeconds - music.sourceInSeconds);
  const latest =
    music.startSeconds +
    (music.sourceOutSeconds - POST_MUSIC_MIN_SECONDS - music.sourceInSeconds);
  const startSeconds = clamp(postSeconds, earliest, Math.max(earliest, latest));
  return updateMusic(
    project,
    {
      startSeconds,
      sourceInSeconds:
        music.sourceInSeconds + (startSeconds - music.startSeconds),
    },
    ctx
  );
}

export function removeMusic(
  project: PostProject,
  ctx: EditContext
): PostProject {
  if (!project.music) return project;
  const { music: _music, ...rest } = project;
  return finish(rest, ctx);
}

/**
 * The take second a clip must start from so the take plays in time with the
 * music where the clip sits now. `offsetSeconds` is the music's own time
 * minus the take's own time at the same moment: positive when the camera
 * started after the music did.
 */
export function syncedSourceIn(
  music: Pick<PostMusic, "startSeconds" | "sourceInSeconds">,
  clip: Pick<PostVideoItem, "start">,
  offsetSeconds: number
): number {
  return (
    clip.start + (music.sourceInSeconds - music.startSeconds) - offsetSeconds
  );
}
