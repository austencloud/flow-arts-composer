import type {
  MediaCompositionPreset,
  MotionKey,
  MotionRect,
  MotionTransformValue,
  PresetClip,
  PresetMarker,
  PresetTimeRef,
  PresetSourceGeometry,
  RegionKeyframe,
} from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import type { ClipTransform } from "$lib/shared/media-composition/domain/media-layout-schema";
import {
  clampBox,
  clampFraming,
} from "$lib/shared/media-composition/domain/post-project";
import { sampleEasing } from "$lib/shared/media-composition/domain/post-project-keyframes";
import {
  tunnelHookArrival,
  tunnelHookBackdropOpacity,
  type TunnelHook,
} from "$lib/shared/media-composition/domain/tunnel-hook";
import { pipHandoffSample } from "$lib/shared/media-composition/domain/pip-handoff";
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
import type {
  TakeSample,
  TakeSampleOptions,
} from "$lib/shared/media-composition/domain/take-timing";

/**
 * A take's timing, asked by media time. Each take has its own, so a post that
 * cuts between takes - or plays one slowed down - reads every frame's move
 * from the footage actually on screen rather than from the post's clock.
 */
export interface TakeClock {
  /** Where the take is at this media time, or null where nothing is mapped. */
  sampleAt(
    mediaSeconds: number,
    options?: TakeSampleOptions
  ): TakeSample | null;
}

export interface SequenceFrameAlignment {
  steps: readonly StepData[];
  startPlacementDuration: number;
  /** Passes needed for this LOOP to return to its opening pose. */
  sequencePeriod?: number;
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
  /** Source UV crop and its destination rectangle in output fractions. */
  sourceGeometry?: PresetSourceGeometry;
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
  /** Set on the opening hook: its tunnel and how far through it the post is. */
  tunnelHook?: { hook: TunnelHook; progress: number };
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

function lerpRect(
  from: MotionRect,
  to: MotionRect,
  progress: number
): MotionRect {
  const lerp = (a: number, b: number) => a + (b - a) * progress;
  const rect: MotionRect = {
    x: lerp(from.x, to.x),
    y: lerp(from.y, to.y),
    width: lerp(from.width, to.width),
    height: lerp(from.height, to.height),
  };
  if (from.turn !== undefined || to.turn !== undefined) {
    rect.turn = lerp(from.turn ?? 0, to.turn ?? 0);
  }
  return rect;
}

function lerpNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function lerpTransformValue(
  from: MotionTransformValue,
  to: MotionTransformValue,
  progress: number
): MotionTransformValue {
  return {
    scale: lerpNumber(from.scale, to.scale, progress),
    rotationDegrees: lerpNumber(
      from.rotationDegrees,
      to.rotationDegrees,
      progress
    ),
    translateX: lerpNumber(from.translateX, to.translateX, progress),
    translateY: lerpNumber(from.translateY, to.translateY, progress),
  };
}

function lerpSourceGeometry(
  from: PresetSourceGeometry,
  to: PresetSourceGeometry,
  progress: number
): PresetSourceGeometry {
  return {
    x: lerpNumber(from.x, to.x, progress),
    y: lerpNumber(from.y, to.y, progress),
    width: lerpNumber(from.width, to.width, progress),
    height: lerpNumber(from.height, to.height, progress),
    rotation: lerpNumber(from.rotation, to.rotation, progress),
    crop: {
      left: lerpNumber(from.crop.left, to.crop.left, progress),
      top: lerpNumber(from.crop.top, to.crop.top, progress),
      right: lerpNumber(from.crop.right, to.crop.right, progress),
      bottom: lerpNumber(from.crop.bottom, to.crop.bottom, progress),
    },
  };
}

/**
 * A `MotionKey` track's value at one project time: before the first key its
 * value, after the last its value, and between two a bezier- or hold-eased
 * blend. `atSeconds` is already schema-validated strictly increasing, so
 * unlike `rectAtTime` (whose marker-resolved times can reorder) this never
 * needs to sort. Bezier curves are cached by `sampleEasing` itself, so
 * sampling a track every frame allocates nothing new.
 */
function sampleMotionTrack<V>(
  keys: readonly MotionKey<V>[],
  timeSeconds: number,
  lerpValue: (from: V, to: V, progress: number) => V
): V {
  const first = keys[0]!;
  if (timeSeconds <= first.atSeconds) return first.value;
  const last = keys[keys.length - 1]!;
  if (timeSeconds >= last.atSeconds) return last.value;
  for (let index = 1; index < keys.length; index += 1) {
    const next = keys[index]!;
    if (timeSeconds >= next.atSeconds) continue;
    const previous = keys[index - 1]!;
    if (previous.easing === "hold") return previous.value;
    const progress =
      (timeSeconds - previous.atSeconds) /
      (next.atSeconds - previous.atSeconds);
    return lerpValue(
      previous.value,
      next.value,
      sampleEasing(previous.easing, progress)
    );
  }
  return last.value;
}

type PresetVisualClip = Extract<PresetClip, { kind: "visual" }>;

/** `clip.opacity`, or its `motion.opacity` track sampled at this time. */
function clipOpacityAt(clip: PresetVisualClip, timeSeconds: number): number {
  const keys = clip.motion?.opacity;
  if (!keys || keys.length === 0) return clip.opacity;
  return clamp01(sampleMotionTrack(keys, timeSeconds, lerpNumber));
}

/**
 * `clip.transform`, or that transform with its `motion.transform` track's
 * scale/rotation/translate sampled at this time merged on top.
 * `flipHorizontal` is never animated, so it always carries over unchanged.
 * An overshooting curve can carry a value past its range; it is clamped the
 * way the editor's own sampler clamps a framing, so the zoom the inspector
 * shows is the zoom that plays.
 */
function clipTransformAt(
  clip: PresetVisualClip,
  timeSeconds: number
): ClipTransform {
  const keys = clip.motion?.transform;
  if (!keys || keys.length === 0) return clip.transform;
  const sampled = sampleMotionTrack(keys, timeSeconds, lerpTransformValue);
  const framing = clampFraming({
    zoom: sampled.scale,
    panX: sampled.translateX,
    panY: sampled.translateY,
    rotation: sampled.rotationDegrees,
  });
  return {
    ...clip.transform,
    scale: framing.zoom,
    rotationDegrees: framing.rotation,
    translateX: framing.panX,
    translateY: framing.panY,
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
 * motion track has carried it, with its turn. A rect in motion takes its
 * turn from its keys alone, never from the static rect. The preview
 * positions regions from this and the export draws into it, so a slide
 * cannot land differently in the file.
 */
export function evaluateRegionRects(
  preset: MediaCompositionPreset,
  durationSeconds: number,
  timeSeconds: number
): Map<string, RegionRect> {
  const rects = new Map<string, RegionRect>(
    preset.regions.map((region) => [
      region.id,
      {
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        ...(region.turn ? { turn: region.turn } : {}),
      },
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
  // A region has at most one of `regionMotion` or `regionKeyframes` (schema
  // enforced), so this never overwrites what the loop above just set. The
  // sample stays inside the frame the way the editor's box does, so an
  // overshoot stops at the edge the selection box stops at.
  for (const track of preset.regionKeyframes ?? []) {
    if (!rects.has(track.regionId) || track.keyframes.length === 0) continue;
    rects.set(
      track.regionId,
      clampBox(sampleMotionTrack(track.keyframes, timeSeconds, lerpRect))
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
  return evaluatePresetLayers(
    preset,
    durationSeconds,
    timeSeconds,
    alignment,
    sourceTimeOffsets
  ).filter(isVisibleLayer);
}

/** A layer a fade or transition has not left fully clear. */
export function isVisibleLayer(layer: EvaluatedFrameLayer): boolean {
  return layer.opacity > 0.0001;
}

/** A full-frame black cover keeps the midpoint black even over a blurred backdrop. */
export function fadeBlackOpacityAt(
  preset: MediaCompositionPreset,
  durationSeconds: number,
  timeSeconds: number
): number {
  let opacity = 0;
  for (const transition of preset.transitions) {
    if (transition.kind !== "fade-black") continue;
    const start = resolvePresetTimePoint(transition.start, durationSeconds);
    const end = resolvePresetTimePoint(transition.end, durationSeconds);
    if (end <= start || timeSeconds <= start || timeSeconds >= end) continue;
    const rawProgress = clamp01((timeSeconds - start) / (end - start));
    const progress =
      transition.curve === "ease-in-out" ? easeInOut(rawProgress) : rawProgress;
    opacity = Math.max(opacity, 1 - Math.abs(2 * progress - 1));
  }
  return opacity;
}

/**
 * Every visual layer whose clip spans one project timestamp, including one a
 * fade leaves fully clear, as at the first instant of a fade-in. The crop
 * screen shows its clip through the fade; everything else draws only the
 * visible layers of `evaluatePresetFrame`.
 */
export function evaluatePresetLayers(
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
  const postSampleAt = (postSeconds: number): TakeSample | null => {
    if (!alignment?.timeMap || moveBeats.length === 0) return null;
    const map = alignment.timeMap;
    const raw = mediaTimeToSequencePosition(
      map,
      postSeconds + (alignment.mediaTimeOffsetSeconds ?? 0)
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
  };
  const postSample = postSampleAt(clampedTime);

  // A clip tied to a take reads that take's clock at the take's media time
  // under this clip, trim included, so a slowed act and a derived square
  // over the same footage land on the same move. A take with no clock yet
  // is unmapped: the post-wide map belongs to another take's footage.
  const takeSampleAt = (
    clip: Extract<PresetClip, { kind: "visual" }>,
    postSeconds: number,
    options?: TakeSampleOptions
  ): TakeSample | null => {
    if (!alignment || !clip.useResolvedTimeMap || moveBeats.length === 0) {
      return null;
    }
    const role = clip.timeMapRole;
    if (role === undefined) {
      return postSeconds === clampedTime
        ? postSample
        : postSampleAt(postSeconds);
    }
    const clock = alignment.clocks?.[role];
    if (!clock) return null;
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
    const progress =
      end > start ? clamp01((postSeconds - start) / (end - start)) : 0;
    const sourceIn = resolvePresetTimePoint(clip.sourceIn, durationSeconds);
    const sourceOut = resolvePresetTimePoint(clip.sourceOut, durationSeconds);
    return clock.sampleAt(
      (sourceTimeOffsets[role] ?? 0) +
        sourceIn +
        (sourceOut - sourceIn) * progress,
      options
    );
  };

  /**
   * A tunnel over beat-mapped footage keeps the performer's time: its arrival
   * is the footage's, counted back from beat one where the intro plays before
   * it, and moved whole passes later (the same pose) so it never reads below
   * the opening. Null when the intro has no mapped footage under it.
   */
  const footageHookSample = (
    clip: Extract<PresetClip, { kind: "visual" }>,
    start: number,
    end: number
  ): TakeSample | null => {
    if (!clip.useResolvedTimeMap || clip.timeMapRole === undefined) return null;
    const at = (seconds: number) =>
      takeSampleAt(clip, seconds, { leadIn: true })?.arrival;
    const first = at(start);
    const here = at(clampedTime);
    const last = at(end);
    if (first === undefined || here === undefined || last === undefined) {
      return null;
    }
    const passes = first < 0 ? Math.ceil(-first / moveBeats.length - 1e-9) : 0;
    const shift = passes * moveBeats.length;
    return { arrival: here + shift, endArrival: last + shift };
  };

  /**
   * Where the animation picks up when a tunnel intro ends: the clock of the
   * clip that continues in the same region from the intro's last instant.
   */
  const introLandingAt = (
    intro: Extract<PresetClip, { kind: "visual" }>,
    introEnd: number
  ): TakeSample | null => {
    const next = preset.clips.find(
      (clip): clip is Extract<PresetClip, { kind: "visual" }> =>
        clip.kind === "visual" &&
        clip !== intro &&
        !clip.tunnelHook &&
        clip.regionId === intro.regionId &&
        Math.abs(
          resolvePresetTimePoint(clip.start, durationSeconds, preset.markers) -
            introEnd
        ) < 1e-6
    );
    return next ? takeSampleAt(next, introEnd) : null;
  };

  /**
   * An animation shrinking into its square and the square draw one figure
   * from their overlap on. Each side's clock is read from whichever of its
   * pieces covers the moment asked.
   */
  const handoffSamples = new Map<string, TakeSample | null>();
  const handoffSample = (
    handoff: NonNullable<PresetVisualClip["clockHandoff"]>
  ): TakeSample | null => {
    const key = `${handoff.id}:${handoff.role}`;
    if (handoffSamples.has(key)) return handoffSamples.get(key)!;
    const side =
      (role: "from" | "to") =>
      (postSeconds: number): TakeSample | null => {
        const clip = preset.clips.find(
          (candidate): candidate is PresetVisualClip =>
            candidate.kind === "visual" &&
            candidate.clockHandoff?.id === handoff.id &&
            candidate.clockHandoff.role === role &&
            resolvePresetTimePoint(
              candidate.start,
              durationSeconds,
              preset.markers
            ) <=
              postSeconds + 1e-9 &&
            postSeconds <=
              resolvePresetTimePoint(
                candidate.end,
                durationSeconds,
                preset.markers
              ) +
                1e-9
        );
        return clip ? takeSampleAt(clip, postSeconds) : null;
      };
    const sample = pipHandoffSample(
      handoff,
      { from: side("from"), to: side("to"), passLength: moveBeats.length },
      clampedTime,
      handoff.role
    );
    handoffSamples.set(key, sample);
    return sample;
  };

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
    // The hook and its destination live in separate regions. At their shared
    // edge the destination owns the single mounted sequence surface.
    if (
      end <= start ||
      clampedTime < start ||
      clampedTime > end ||
      (clip.tunnelHook && clampedTime >= end && end < durationSeconds)
    )
      return [];

    const projectProgress = clamp01((clampedTime - start) / (end - start));
    const sourceIn = resolvePresetTimePoint(clip.sourceIn, durationSeconds);
    const sourceOut = resolvePresetTimePoint(clip.sourceOut, durationSeconds);
    // The span maps onto the clip; an act's speed is carried by how long it
    // is against its source, so the rate never enters here.
    const sourceSpanTime = sourceIn + (sourceOut - sourceIn) * projectProgress;
    const sourceTimeSeconds =
      (sourceTimeOffsets[clip.sourceRole] ?? 0) + sourceSpanTime;
    const regionRect = regionRects.get(clip.regionId);
    const framing =
      clip.framingFrom &&
      clampedTime >= clip.framingFrom.start &&
      clampedTime < clip.framingFrom.end
        ? (preset.clips.find(
            (other): other is PresetVisualClip =>
              other.kind === "visual" && other.id === clip.framingFrom!.clipId
          ) ?? clip)
        : clip;
    const sourceGeometry = framing.sourceGeometryKeyframes?.length
      ? sampleMotionTrack(
          framing.sourceGeometryKeyframes,
          clampedTime,
          lerpSourceGeometry
        )
      : framing.sourceGeometry;

    let sample: TakeSample | null = null;
    const footageHook =
      clip.tunnelHook && moveBeats.length > 0
        ? footageHookSample(clip, start, end)
        : null;
    if (footageHook) {
      sample = footageHook;
    } else if (clip.tunnelHook && moveBeats.length > 0) {
      // With no footage to follow the hook owns the clock, and lands on the
      // arrival the animation reads as it takes over, so the pair never steps
      // back at the hand-off.
      const landing = introLandingAt(clip, end)?.arrival;
      const hookArrival = (progress: number) =>
        tunnelHookArrival(
          progress,
          moveBeats.length,
          alignment?.sequencePeriod,
          clip.tunnelHook!.speed
            ? (p) => sampleEasing([...clip.tunnelHook!.speed!], p)
            : undefined,
          landing
        );
      sample = {
        arrival: hookArrival(projectProgress),
        endArrival: hookArrival(1),
      };
    } else if (
      clip.clockHandoff &&
      moveBeats.length > 0 &&
      clampedTime >= clip.clockHandoff.start
    ) {
      sample =
        handoffSample(clip.clockHandoff) ?? takeSampleAt(clip, clampedTime);
    } else {
      sample = takeSampleAt(clip, clampedTime);
    }

    return [
      {
        clipId: clip.id,
        regionId: clip.regionId,
        sourceRole: clip.sourceRole,
        opacity:
          clipOpacityAt(clip, clampedTime) *
          (clip.fadeInSeconds
            ? easeInOut(
                clamp01(
                  (clampedTime - (clip.fadeInStartSeconds ?? start)) /
                    clip.fadeInSeconds
                )
              )
            : 1) *
          (clip.fadeOutSeconds
            ? easeInOut(
                clamp01(
                  ((clip.fadeOutEndSeconds ?? end) - clampedTime) /
                    clip.fadeOutSeconds
                )
              )
            : 1),
        sourceTimeSeconds,
        projectProgress,
        transform: clipTransformAt(clip, clampedTime),
        ...(regionRect ? { regionRect } : {}),
        ...(sourceGeometry ? { sourceGeometry } : {}),
        ...(sample !== null && alignment
          ? sequenceFieldsFor(sample, alignment, moveBeats, holdLandings)
          : {}),
        ...(clip.tunnelHook
          ? { tunnelHook: { hook: clip.tunnelHook, progress: projectProgress } }
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
    const incoming = byId.get(transition.incomingClipId);
    if (transition.kind === "fade-black") {
      const outgoing = byId.get(transition.outgoingClipId);
      if (outgoing) outgoing.opacity *= progress < 0.5 ? 1 : 0;
      if (incoming) incoming.opacity *= progress > 0.5 ? 1 : 0;
      continue;
    }
    // Source-over compositing blends two opaque clips by keeping the older
    // picture whole and raising the new one over it. Fading both lets the
    // background show through at the midpoint.
    if (incoming) incoming.opacity *= progress;
  }

  // Footage playing behind a tunnel intro stays dim around it, and comes up
  // to full strength as the canvas settles into its box.
  const intro = layers.find((layer) => layer.tunnelHook?.hook.backdrop);
  if (intro?.tunnelHook) {
    const backdrop = tunnelHookBackdropOpacity(
      intro.tunnelHook.progress,
      sampleEasing
    );
    for (const layer of layers) {
      if (layer.regionId !== intro.regionId) layer.opacity *= backdrop;
    }
  }

  return layers;
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
