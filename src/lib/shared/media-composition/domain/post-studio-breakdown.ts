/**
 * Verbs for the breakdown layout: where its section starts and ends, and how
 * the performance sits beside the strip. Pure, like the slot verbs: each takes
 * a preset and returns a new one, and the state layer decides when to call.
 */
import type {
  MediaCompositionPreset,
  PresetTimePoint,
} from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import {
  BREAKDOWN_MARKER,
  BREAKDOWN_PERFORMANCE_INSIDE,
  BREAKDOWN_REGION,
  FULL_FRAME,
  breakdownKeyframes,
} from "$lib/shared/media-composition/domain/post-studio-presets";

/**
 * How the performance shares the frame with the strip.
 * - fit: the whole picture, letterboxed above the strip. Nothing is cropped,
 *   so prop ends that were kept in frame stay in frame.
 * - fill: fills the space above the strip, cropping top and bottom.
 * - behind: stays full frame and the strip covers its lower edge.
 */
export type BreakdownFraming = "fit" | "fill" | "behind";

/** Shorter than this, the slide in and the slide out would overlap. */
export const MINIMUM_BREAKDOWN_SECONDS = 3;

export interface BreakdownSection {
  startSeconds: number;
  endSeconds: number;
}

function resolvePoint(point: PresetTimePoint, durationSeconds: number): number {
  return point.unit === "seconds" ? point.value : point.value * durationSeconds;
}

function markerSeconds(
  preset: MediaCompositionPreset,
  markerId: string,
  durationSeconds: number
): number | null {
  const marker = preset.markers?.find((candidate) => candidate.id === markerId);
  if (!marker) return null;
  return Math.min(
    durationSeconds,
    Math.max(0, resolvePoint(marker.time, durationSeconds))
  );
}

export function isBreakdownPreset(preset: MediaCompositionPreset): boolean {
  return (
    preset.layoutModel === "free" &&
    markerSeconds(preset, BREAKDOWN_MARKER.start, 1) !== null &&
    markerSeconds(preset, BREAKDOWN_MARKER.end, 1) !== null
  );
}

/**
 * The section in project seconds, or null when the preset has none or its
 * markers have collapsed onto each other (a shorter take can clamp both).
 */
export function breakdownSection(
  preset: MediaCompositionPreset,
  durationSeconds: number
): BreakdownSection | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const startSeconds = markerSeconds(
    preset,
    BREAKDOWN_MARKER.start,
    durationSeconds
  );
  const endSeconds = markerSeconds(
    preset,
    BREAKDOWN_MARKER.end,
    durationSeconds
  );
  if (startSeconds === null || endSeconds === null) return null;
  if (endSeconds <= startSeconds) return null;
  return { startSeconds, endSeconds };
}

/**
 * Moves one end of the section. The other end holds, and the section never
 * gets shorter than `MINIMUM_BREAKDOWN_SECONDS` (or the whole post, when the
 * post is shorter than that).
 */
export function withBreakdownMarker(
  preset: MediaCompositionPreset,
  which: "start" | "end",
  seconds: number,
  durationSeconds: number
): MediaCompositionPreset {
  if (!Number.isFinite(seconds)) return preset;
  const section = breakdownSection(preset, durationSeconds);
  if (!section) return preset;

  const minimum = Math.min(MINIMUM_BREAKDOWN_SECONDS, durationSeconds);
  const within = Math.min(durationSeconds, Math.max(0, seconds));
  const value =
    which === "start"
      ? Math.max(0, Math.min(within, section.endSeconds - minimum))
      : Math.min(
          durationSeconds,
          Math.max(within, section.startSeconds + minimum)
        );
  const markerId = BREAKDOWN_MARKER[which];

  return {
    ...preset,
    markers: (preset.markers ?? []).map((marker) =>
      marker.id === markerId
        ? { ...marker, time: { unit: "seconds" as const, value } }
        : marker
    ),
    updatedAt: Date.now(),
  };
}

export function breakdownFraming(
  preset: MediaCompositionPreset
): BreakdownFraming {
  const moves = (preset.regionMotion ?? []).some(
    (motion) => motion.regionId === BREAKDOWN_REGION.performance
  );
  if (!moves) return "behind";
  const fit = preset.regions.find(
    (region) => region.id === BREAKDOWN_REGION.performance
  )?.fit;
  return fit === "contain" ? "fit" : "fill";
}

export function withBreakdownFraming(
  preset: MediaCompositionPreset,
  framing: BreakdownFraming
): MediaCompositionPreset {
  if (
    !preset.regions.some((region) => region.id === BREAKDOWN_REGION.performance)
  ) {
    return preset;
  }
  const resting =
    framing === "behind" ? FULL_FRAME : BREAKDOWN_PERFORMANCE_INSIDE;
  const otherMotion = (preset.regionMotion ?? []).filter(
    (motion) => motion.regionId !== BREAKDOWN_REGION.performance
  );

  return {
    ...preset,
    regions: preset.regions.map((region) =>
      region.id === BREAKDOWN_REGION.performance
        ? {
            ...region,
            ...resting,
            // A 9:16 take in a 9:16 frame is the same picture either way, so
            // behind can cover; only the lifted frame has a choice to make.
            fit: framing === "fit" ? ("contain" as const) : ("cover" as const),
          }
        : region
    ),
    regionMotion:
      framing === "behind"
        ? otherMotion
        : [
            {
              regionId: BREAKDOWN_REGION.performance,
              keyframes: breakdownKeyframes(
                FULL_FRAME,
                BREAKDOWN_PERFORMANCE_INSIDE
              ),
            },
            ...otherMotion,
          ],
    updatedAt: Date.now(),
  };
}
