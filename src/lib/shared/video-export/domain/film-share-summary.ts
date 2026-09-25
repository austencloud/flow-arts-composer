/**
 * What the share panel says about a finished 3D film.
 *
 * A 3D take is filmed on the stage, so by the time Share is open the film
 * either exists or it does not. These helpers pick the film to hand over and
 * describe it in the line under Download, e.g. "0:24 • 1080×1080 • 30 fps".
 */
import { computeExportSummary } from "$lib/shared/animation-panel/pill-nav/pill-summaries";
import type { RenderedFilmSummary } from "../services/rendered-film-store";

/** The newest retained film of one sequence, or null when none is kept. */
export function latestFilmForSequence(
  summaries: readonly RenderedFilmSummary[],
  sequenceId: string | null | undefined
): RenderedFilmSummary | null {
  if (!sequenceId) return null;
  let latest: RenderedFilmSummary | null = null;
  for (const summary of summaries) {
    if (summary.sequenceId !== sequenceId) continue;
    if (!latest || summary.createdAt > latest.createdAt) latest = summary;
  }
  return latest;
}

export function formatFilmDuration(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function describeFilm(
  film: Pick<RenderedFilmSummary, "durationSeconds" | "render">
): string {
  const settings = computeExportSummary({
    resolution: film.render.resolution,
    fps: film.render.fps,
    loopCount: 1,
    renderMode: "3d",
  });
  return `${formatFilmDuration(film.durationSeconds)} • ${settings}`;
}
