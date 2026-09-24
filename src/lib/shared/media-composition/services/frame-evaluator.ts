import type {
  MediaCompositionPreset,
  MotionRect,
  PresetMarker,
  PresetTimeRef,
  RegionKeyframe,
} from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import type { ClipTransform } from "$lib/shared/media-composition/domain/media-layout-schema";
import type { SequenceTimeMap } from "$lib/shared/media-composition/domain/sequence-time-map";
import {
  mediaTimeToSequencePosition,
  sequenceTimeMapConvention,
} from "$lib/shared/media-composition/domain/sequence-time-map";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  clampDisplayedBeatNumber,
  displayedBeatNumber,
  sequencePositionToAnimationTime,
  wrapSequencePosition,
} from "$lib/shared/animation-engine/services/step-calculator";

export interface SequenceFrameAlignment {
  timeMap: SequenceTimeMap;
  steps: readonly StepData[];
  startPlacementDuration: number;
  dwellOnCompletedBeat?: boolean;
  /**
   * Where project time zero sits in the mapped media. A step map is recorded
   * against the footage as shot, so trimming the head off a take moves the post
   * clock away from the map's clock by exactly the amount trimmed. Adding it
   * back here keeps the card on the step the performer is actually landing.
   */
  mediaTimeOffsetSeconds?: number;
}

/**
 * Seconds to add to a role's resolved source time. A trim is deliberately not
 * written into the clip's `sourceIn`/`sourceOut`: those are the montage's own
 * in and out inside the post, which the timeline's clip handles own. The trim
 * is a property of the source, so it rides alongside and composes with them.
 */
export type SourceTimeOffsets = Readonly<Record<string, number>>;

/** A region's rect at one moment, in output fractions. May leave the frame. */
export type RegionRect = MotionRect;

export interface EvaluatedFrameLayer {
  clipId: string;
  regionId: string;
  sourceRole: string;
  opacity: number;
  sourceTimeSeconds: number;
  projectProgress: number;
  transform: ClipTransform;
  /**
   * Where the layer's region sits at this moment. Absent only on layers built
   * by hand; consumers fall back to the region's static rect.
   */
  regionRect?: RegionRect;
  /**
   * Engine convention: [0, 1) is the start placement and [k, k + 1) is move k
   * in flight, whatever convention the time map counted in.
   */
  sequencePosition?: number;
  /** Arrival-counted position for the beat carousel: 0 is the start pose. */
  carouselPosition?: number;
  animationTimeSeconds?: number;
  /** The beat the card highlights. See `evaluatePresetFrame`. */
  displayedBeatNumber?: number;
}

export function resolvePresetTimePoint(
  point: PresetTimeRef,
  durationSeconds: number,
  markers: readonly PresetMarker[] = []
): number {
  if (point.unit === "seconds") return point.value;
  if (point.unit === "duration-fraction") return point.value * durationSeconds;
  const marker = markers.find((candidate) => candidate.id === point.markerId);
  const markerSeconds = marker
    ? Math.min(
        durationSeconds,
        Math.max(0, resolvePresetTimePoint(marker.time, durationSeconds))
      )
    : 0;
  return markerSeconds + point.offsetSeconds;
}

/**
 * Resolves a time that may follow a marker. A marker resolves inside the post,
 * so one saved in seconds against a longer take cannot push a keyframe past
 * the end. A reference to a marker that does not exist resolves against zero
 * rather than throwing, which keeps a half-edited preset drawable; the schema
 * rejects one on save.
 */
export function resolvePresetTimeRef(
  ref: PresetTimeRef,
  durationSeconds: number,
  markers: readonly PresetMarker[] = []
): number {
  return resolvePresetTimePoint(ref, durationSeconds, markers);
}

// Exported so other painted-frame consumers (the beat carousel layout) share
// this exact curve instead of defining their own — same easing everywhere a
// project timestamp needs to ease between two states.
export function easeInOut(progress: number): number {
  return progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerpRect(from: MotionRect, to: MotionRect, progress: number) {
  const lerp = (a: number, b: number) => a + (b - a) * progress;
  return {
    x: lerp(from.x, to.x),
    y: lerp(from.y, to.y),
    width: lerp(from.width, to.width),
    height: lerp(from.height, to.height),
  };
}

/**
 * Keyframes are ordered by the time they resolve to, not by where they sit in
 * the array, because a dragged marker can carry one past another. Ties keep
 * array order, and at a tied moment the later keyframe holds.
 */
function rectAtTime(
  keyframes: readonly RegionKeyframe[],
  durationSeconds: number,
  markers: readonly PresetMarker[],
  timeSeconds: number
): RegionRect {
  const timed = keyframes
    .map((keyframe, index) => ({
      keyframe,
      index,
      at: resolvePresetTimeRef(keyframe.at, durationSeconds, markers),
    }))
    .sort((left, right) => left.at - right.at || left.index - right.index);

  const first = timed[0]!;
  if (timeSeconds < first.at) return { ...first.keyframe.rect };

  for (let index = 1; index < timed.length; index += 1) {
    const next = timed[index]!;
    if (timeSeconds >= next.at) continue;
    const previous = timed[index - 1]!;
    const raw = clamp01((timeSeconds - previous.at) / (next.at - previous.at));
    const progress =
      next.keyframe.curve === "ease-in-out" ? easeInOut(raw) : raw;
    return lerpRect(previous.keyframe.rect, next.keyframe.rect, progress);
  }

  return { ...timed[timed.length - 1]!.keyframe.rect };
}

/**
 * Every region's rect at one project time: the static rect, or where its
 * motion track has carried it. The preview positions regions from this and
 * the export draws into it, so a slide cannot land differently in the file.
 */
export function evaluateRegionRects(
  preset: MediaCompositionPreset,
  durationSeconds: number,
  timeSeconds: number
): Map<string, RegionRect> {
  const rects = new Map<string, RegionRect>(
    preset.regions.map((region) => [
      region.id,
      { x: region.x, y: region.y, width: region.width, height: region.height },
    ])
  );
  const markers = preset.markers ?? [];
  for (const motion of preset.regionMotion ?? []) {
    if (!rects.has(motion.regionId) || motion.keyframes.length === 0) continue;
    rects.set(
      motion.regionId,
      rectAtTime(motion.keyframes, durationSeconds, markers, timeSeconds)
    );
  }
  return rects;
}

/**
 * Converts an arrival-counted position to the engine's count. The arrival
 * position is folded into one pass first, which leaves it in (0, N + 1):
 * (0, N] is the pass itself and becomes (1, N + 1], and (N, N + 1) is the
 * next pass's first move, which becomes (1, 2). Position 0, the opening pose
 * before anything has moved, is move 1 about to begin.
 */
export function arrivalToEnginePosition(
  arrivalPosition: number,
  beatsPerPass: number
): number {
  if (beatsPerPass <= 0 || !Number.isFinite(arrivalPosition)) {
    return arrivalPosition;
  }
  const folded = wrapSequencePosition(arrivalPosition, beatsPerPass);
  return folded <= beatsPerPass ? folded + 1 : folded - beatsPerPass + 1;
}

/**
 * Evaluates every visible visual layer from one project timestamp. Preview and
 * export consume this same result so transition opacity cannot drift later.
 */
export function evaluatePresetFrame(
  preset: MediaCompositionPreset,
  durationSeconds: number,
  timeSeconds: number,
  alignment?: SequenceFrameAlignment | null,
  sourceTimeOffsets: SourceTimeOffsets = {}
): EvaluatedFrameLayer[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError("durationSeconds must be a positive finite number");
  }

  const clampedTime = Math.min(durationSeconds, Math.max(0, timeSeconds));
  const mappedTime = clampedTime + (alignment?.mediaTimeOffsetSeconds ?? 0);
  const beatsPerPass = alignment?.steps.length ?? 0;
  const convention = alignment
    ? sequenceTimeMapConvention(alignment.timeMap)
    : "engine";
  // A take that runs the sequence several times through arrives with positions
  // counting past the sequence's length, so it is folded back into one pass
  // here - before anything derives from it, so the card, the animation clock,
  // and the animation layer all cycle together.
  const mappedPosition = alignment
    ? wrapSequencePosition(
        mediaTimeToSequencePosition(alignment.timeMap, mappedTime),
        beatsPerPass
      )
    : undefined;
  // The animation engine counts moves in flight, so a map that counts
  // arrivals is converted before the engine sees it. Skipping this ran the
  // animation exactly one move behind the performer.
  const continuousPosition =
    mappedPosition !== undefined && convention === "arrival"
      ? arrivalToEnginePosition(mappedPosition, beatsPerPass)
      : mappedPosition;
  // Step mode holds the completed pose for the beat instead of interpolating
  // toward the next one. Flooring the position is what "hold" means to every
  // downstream consumer at once — the animation layer, the animation clock,
  // and the card's beat number all read from this one value.
  const holdsBeats = preset.animationPlaybackMode === "step";
  const sequencePosition =
    continuousPosition !== undefined && holdsBeats
      ? Math.floor(continuousPosition)
      : continuousPosition;
  const animationTimeSeconds =
    alignment && sequencePosition !== undefined
      ? sequencePositionToAnimationTime(
          sequencePosition,
          alignment.steps,
          alignment.startPlacementDuration
        )
      : undefined;
  // The card keeps counting in the map's own terms. Against footage it
  // highlights the pose the performer most recently landed - the shape they
  // tapped - rather than the move they are travelling through.
  const beatPosition =
    convention === "arrival" && mappedPosition !== undefined
      ? holdsBeats
        ? Math.floor(mappedPosition)
        : mappedPosition
      : sequencePosition;
  const cardBeatNumber =
    alignment && beatPosition !== undefined
      ? clampDisplayedBeatNumber(
          displayedBeatNumber(
            beatPosition,
            alignment.dwellOnCompletedBeat ?? false
          ),
          beatsPerPass
        )
      : undefined;
  const regionRects = evaluateRegionRects(preset, durationSeconds, clampedTime);
  const layers = preset.clips.flatMap((clip): EvaluatedFrameLayer[] => {
    if (clip.kind !== "visual") return [];

    const start = resolvePresetTimePoint(
      clip.start,
      durationSeconds,
      preset.markers
    );
    const end = resolvePresetTimePoint(
      clip.end,
      durationSeconds,
      preset.markers
    );
    if (end <= start || clampedTime < start || clampedTime > end) return [];

    const projectProgress = clamp01((clampedTime - start) / (end - start));
    const sourceIn = resolvePresetTimePoint(clip.sourceIn, durationSeconds);
    const sourceOut = resolvePresetTimePoint(clip.sourceOut, durationSeconds);
    const sourceTimeSeconds =
      (sourceTimeOffsets[clip.sourceRole] ?? 0) +
      sourceIn +
      (sourceOut - sourceIn) * projectProgress * clip.playbackRate;
    const regionRect = regionRects.get(clip.regionId);

    return [
      {
        clipId: clip.id,
        regionId: clip.regionId,
        sourceRole: clip.sourceRole,
        opacity:
          clip.opacity *
          (clip.fadeInSeconds
            ? easeInOut(clamp01((clampedTime - start) / clip.fadeInSeconds))
            : 1) *
          (clip.fadeOutSeconds
            ? easeInOut(clamp01((end - clampedTime) / clip.fadeOutSeconds))
            : 1),
        sourceTimeSeconds,
        projectProgress,
        transform: clip.transform,
        ...(regionRect ? { regionRect } : {}),
        ...(clip.useResolvedTimeMap && sequencePosition !== undefined
          ? {
              sequencePosition,
              carouselPosition: mappedPosition,
              animationTimeSeconds,
              displayedBeatNumber: cardBeatNumber,
            }
          : {}),
      },
    ];
  });

  const byId = new Map(layers.map((layer) => [layer.clipId, layer]));
  for (const transition of preset.transitions) {
    const start = resolvePresetTimePoint(transition.start, durationSeconds);
    const end = resolvePresetTimePoint(transition.end, durationSeconds);
    if (end <= start || clampedTime < start || clampedTime > end) continue;

    const rawProgress = clamp01((clampedTime - start) / (end - start));
    const progress =
      transition.curve === "ease-in-out" ? easeInOut(rawProgress) : rawProgress;
    const outgoing = byId.get(transition.outgoingClipId);
    const incoming = byId.get(transition.incomingClipId);
    if (outgoing) outgoing.opacity *= 1 - progress;
    if (incoming) incoming.opacity *= progress;
  }

  return layers.filter((layer) => layer.opacity > 0.0001);
}

/** True when any part of the rect lands inside the output frame. */
export function regionRectIsOnFrame(rect: RegionRect): boolean {
  return (
    rect.x < 1 &&
    rect.y < 1 &&
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0
  );
}
