import type {
  VideoFps,
  VideoQuality,
  VideoResolution,
} from "#lib/shared/animation-panel/state/export-options-state.svelte.js";

export type FilmRenderPresetId = "draft" | "final" | "cinema";

export interface FilmRenderPreset {
  id: FilmRenderPresetId;
  label: string;
  fps: VideoFps;
  resolution: VideoResolution;
  quality: VideoQuality;
}

/** The three renders worth offering by name. Draft first, because looking at a
 *  quick pass before committing to a long one is the intended loop. */
export const FILM_RENDER_PRESETS: readonly FilmRenderPreset[] = [
  { id: "draft", label: "Draft", fps: 30, resolution: 720, quality: "standard" },
  { id: "final", label: "Final", fps: 60, resolution: 1080, quality: "standard" },
  { id: "cinema", label: "Cinema", fps: 60, resolution: 2160, quality: "cinema" },
];

export interface FilmRenderOptionsLike {
  fps: number;
  resolution: number;
  quality: VideoQuality;
}

/** Which named preset the current settings are, or "custom" when someone has
 *  tuned the options by hand in the export settings. */
export function matchFilmRenderPreset(
  options: FilmRenderOptionsLike
): FilmRenderPresetId | "custom" {
  const match = FILM_RENDER_PRESETS.find(
    (preset) =>
      preset.fps === options.fps &&
      preset.resolution === options.resolution &&
      preset.quality === options.quality
  );
  return match?.id ?? "custom";
}

// Seconds of work per output frame, measured loosely on a mid-range laptop.
// These are honest heuristics, not a measurement of this machine: the point is
// to tell someone whether they are waiting seconds or minutes before they
// commit to the render, not to be accurate to the second.
const SECONDS_PER_FRAME_BY_RESOLUTION: Record<number, number> = {
  720: 0.03,
  1080: 0.05,
  2160: 0.16,
  4320: 0.6,
};

const CINEMA_COST_MULTIPLIER = 6;

export function estimateFilmRenderSeconds(
  durationSeconds: number,
  options: FilmRenderOptionsLike
): number {
  if (durationSeconds <= 0) return 0;
  const perFrame = SECONDS_PER_FRAME_BY_RESOLUTION[options.resolution] ?? 0.05;
  const qualityCost = options.quality === "cinema" ? CINEMA_COST_MULTIPLIER : 1;
  return durationSeconds * options.fps * perFrame * qualityCost;
}

/** "about 40 s" / "about 3 min" — a rough wait, said roughly. */
export function formatFilmRenderEstimate(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds < 90) return `about ${Math.max(1, Math.round(seconds))} s`;
  return `about ${Math.max(1, Math.round(seconds / 60))} min`;
}
