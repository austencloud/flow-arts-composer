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
  sequencePositionToAnimationTime,
  wrapSequencePosition,
} from "$lib/shared/animation-engine/services/step-calculator";
import {
  sequenceFrameAt,
  type SequenceFrame,
} from "$lib/shared/media-composition/domain/sequence-frame";
import type { TakeSample } from "$lib/shared/media-composition/domain/take-timing";

/**
 * A take's timing, asked by media time. Each take has its own, so a post that
 * cuts between takes - or plays one slowed down - reads every frame's move
 * from the footage actually on screen rather than from the post's clock.
 */
export interface TakeClock {
  /** Where the take is at this media time, or null where nothing is mapped. */
  sampleAt(mediaSeconds: number): TakeSample | null;
}

export interface SequenceFrameAlignment {
  steps: readonly StepData[];
  startPlacementDuration: number;
  /**
   * Clocks by take role. A clip whose `timeMapRole` names one reads its move
   * from that take's media time at the clip's own source time.
   */
  clocks?: Readonly<Record<string, TakeClock>>;
  /**
   * One map for the whole post, read at post time: the older single-take
   * path, used by clips that name no clock.
   */
  timeMap?: SequenceTimeMap;
  /**
   * Where project time zero sits in `timeMap`'s media. A step map is recorded
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
  /** Which move is showing. Every other sequence field derives from it. */
  sequenceFrame?: SequenceFrame;
  /**
   * Engine convention: [1, 2) is move 1 in flight and N + 1 the last landing;
   * the opening pose is 1. Folded into one pass.
   */
  sequencePosition?: number;
  /** Zero-based repetition the showing move belongs to. */
  sequencePassIndex?: number;
  /** Arrival-counted position for the beat carousel: 0 is the start pose. */
  carouselPosition?: number;
  animationTimeSeconds?: number;
  /** The move showing, 1..N; 0 for the opening pose. */
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
 * The sequence fields a mapped layer carries, all from one frame record so
 * the square, the strip, the carousel and the beat number show one move.
 */
function sequenceFieldsFor(
  sample: TakeSample,
  alignment: SequenceFrameAlignment,
  moveBeats: readonly number[],
  holdLandings: boolean
): Pick<
  EvaluatedFrameLayer,
  | "sequenceFrame"
  | "sequencePosition"
  | "sequencePassIndex"
  | "carouselPosition"
  | "animationTimeSeconds"
  | "displayedBeatNumber"
> {
  const frame = sequenceFrameAt(sample.arrival, moveBeats, {
    holdLandings,
    endArrival: sample.endArrival,
  });
  return {
    sequenceFrame: frame,
    sequencePosition: frame.enginePosition,
    sequencePassIndex: frame.pass,
    carouselPosition: wrapSequencePosition(frame.arrival, moveBeats.length),
    animationTimeSeconds: sequencePositionToAnimationTime(
      frame.enginePosition,
      alignment.steps,
      alignment.startPlacementDuration
    ),
    displayedBeatNumber: frame.move,
  };
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
  const moveBeats = alignment?.steps.map((step) => step.duration ?? 1) ?? [];
  const holdLandings = preset.animationPlaybackMode === "step";
  // The single-map path reads the post clock once for every clip. A map
  // saved in the engine's count (move k in flight is [k, k + 1)) is moved
  // onto arrivals first, so both kinds of map meet the frame record alike.
  const postSample = ((): TakeSample | null => {
    if (!alignment?.timeMap || moveBeats.length === 0) return null;
    const map = alignment.timeMap;
    const raw = mediaTimeToSequencePosition(
      map,
      clampedTime + (alignment.mediaTimeOffsetSeconds ?? 0)
    );
    if (!Number.isFinite(raw)) return null;
    const toArrival = (position: number) =>
      sequenceTimeMapConvention(map) === "arrival"
        ? position
        : Math.max(0, position - 1);
    const last = map.anchors[map.anchors.length - 1];
    return {
      arrival: toArrival(raw),
      endArrival: last ? toArrival(last.sequencePosition) : null,
    };
  })();

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
    // The span maps onto the clip; an act's speed is carried by how long it
    // is against its source, so the rate never enters here.
    const sourceSpanTime = sourceIn + (sourceOut - sourceIn) * projectProgress;
    const sourceTimeSeconds =
      (sourceTimeOffsets[clip.sourceRole] ?? 0) + sourceSpanTime;
    const regionRect = regionRects.get(clip.regionId);

    // A clip tied to a take reads that take's clock at the take's media time
    // under this clip, trim included, so a slowed act and a derived square
    // over the same footage land on the same move. A take with no clock yet
    // is unmapped: the post-wide map belongs to another take's footage.
    let sample: TakeSample | null = null;
    if (alignment && clip.useResolvedTimeMap && moveBeats.length > 0) {
      const role = clip.timeMapRole;
      if (role === undefined) {
        sample = postSample;
      } else {
        const clock = alignment.clocks?.[role];
        sample = clock
          ? clock.sampleAt((sourceTimeOffsets[role] ?? 0) + sourceSpanTime)
          : null;
      }
    }

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
        ...(sample !== null && alignment
          ? sequenceFieldsFor(sample, alignment, moveBeats, holdLandings)
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
