/**
 * Trace Paths — the round's reactive state.
 *
 * This is the ONLY stateful piece of the game. It wraps the pure
 * `createTraceEvaluator` and adds the three things a pure grader can't have:
 * a phase machine the UI can render, pointer bookkeeping, and player settings.
 *
 * It deliberately reimplements NONE of the geometry, gating, or scoring — every
 * judgement call goes to the evaluator and to `scoreTraceRound`. If you find
 * yourself measuring a distance in this file, the logic belongs one layer down.
 *
 * Three rules here are load-bearing and are commented again at their call sites:
 *
 * 1. HAND IDENTITY COMES FROM PLACE, NOT FROM POINTER ORDER. Which hand a finger
 *    controls is decided by the start zone (or the per-hand grid) it lands in.
 *    Never by `pointerId` ordering, never by `isPrimary`. Two players sharing a
 *    tablet, a left-hander, and a person who happens to touch red first all get
 *    the same behaviour.
 * 2. AN INTERRUPTION IS A PAUSE, NEVER A FAILURE. `pointercancel`, a lost
 *    capture, a notification pulling the app to the background — all of them
 *    park the round with the last completed beat intact and let the player pick
 *    up where they were.
 * 3. NO RAW POINTER TRACE LEAVES THIS MODULE. The render trail is a capped,
 *    ephemeral polyline for drawing only; the outcome handed to the arcade is
 *    aggregate metrics. Nothing sample-challenge is persisted or transmitted.
 */

import { getContext, setContext } from "svelte";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { reducedMotion } from "#lib/shared/transitions/motion.js";
import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
import type {
  NormalizedPoint,
  TraceConversionError,
  TraceConversionResult,
  TraceDivergence,
  TraceHand,
  TraceMetrics,
  TraceRound,
  TraceSample,
  TraceSegment,
} from "../domain/trace-types";
import { TRACE_HANDS } from "../domain/trace-types";
import { withPhysicalFloor } from "../domain/trace-config";
import {
  createTraceEvaluator,
  DEFAULT_TRACE_EVALUATOR_CONFIG,
  type TraceEvaluator,
  type TraceEvaluatorConfig,
} from "../services/trace-evaluator";
import {
  scoreTraceRound,
  type TraceRoundScore,
} from "../services/score-trace-round";
import { sampleSegmentPath } from "../services/trace-path-sampler";

// Phase machine

/**
 * loading → preview → arming → tracing → feedback → (next round's) preview,
 * with `paused` reachable from arming and tracing and returning to whichever it
 * came from. `error` is a terminal state for THIS round only — the game offers a
 * retry and the rest of Learn keeps working.
 */
export type TracePhase =
  | { name: "loading" }
  | { name: "error"; error: TraceConversionError }
  /** Route on screen, nothing armed yet. The player is reading it. */
  | { name: "preview"; round: TraceRound }
  /** Waiting for every required hand to land on its start point. */
  | { name: "arming"; round: TraceRound }
  /** Fingers down, beats being consumed. */
  | { name: "tracing"; round: TraceRound }
  | {
      name: "paused";
      round: TraceRound;
      /** Where resume() goes back to. Never "feedback" — a pause can't end a round. */
      resumeTo: "arming" | "tracing";
      reason: TracePauseReason;
    }
  | {
      name: "feedback";
      round: TraceRound;
      metrics: TraceMetrics;
      score: TraceRoundScore;
    };

export type TracePauseReason =
  /** The player pressed Pause. */
  | "player"
  /** pointercancel / lostpointercapture — the system took the pointer. */
  | "pointer-lost"
  /** The tab or app went to the background mid-round. */
  | "hidden";

// Settings

/**
 * Six independent switches. None of them gate content: Tap Route and the
 * step-through preview complete a challenge on their own terms, they simply don't
 * claim a traced score.
 */
export interface TraceSettings {
  /** No traveling preview, no draw-on, no pulsing. Static marks and opacity only. */
  reducedMotion: boolean;
  /** Drops path glow and any animated backdrop. */
  lowStimulus: boolean;
  haptics: boolean;
  sound: boolean;
  /** Arm one hand at a time even on a two-hand round. */
  oneHandMode: boolean;
  /** Select ordered waypoints by tapping. No dragging, no second pointer. */
  tapRouteMode: boolean;
}

export type TraceSettingKey = keyof TraceSettings;

// Options + outcome

export interface TraceRoundOutcome {
  readonly round: TraceRound;
  readonly metrics: TraceMetrics;
  readonly score: TraceRoundScore;
  /** True when the round was completed via Tap Route or step-through preview. */
  readonly assisted: boolean;
}

/** One stop in Tap Route mode: which hand, which beat, and where on the stage. */
export interface TapWaypoint {
  readonly hand: TraceHand;
  readonly beatIndex: number;
  readonly at: NormalizedPoint;
}

export interface TracePathsStateOptions {
  /**
   * Multiplier on every stage-relative tolerance. Comes from the challenge's
   * `toleranceScale`. Never a pixel value — the corridor stays a fraction of
   * the stage so a phone and a 4K monitor grade identically.
   */
  toleranceScale?: number;
  /** Called once per completed round, with aggregates only. */
  onRoundScored?: (outcome: TraceRoundOutcome) => void;
}

// Small helpers

/**
 * How a grid location reads out loud. Cardinal and intercardinal are LOCATION
 * words in TKA (orientations are radial/nonradial), so these are the right
 * nouns for a spoken instruction.
 */
const LOCATION_KEYS: Record<string, string> = {
  [GridLocation.NORTH]: "learn_trace_location_north",
  [GridLocation.EAST]: "learn_trace_location_east",
  [GridLocation.SOUTH]: "learn_trace_location_south",
  [GridLocation.WEST]: "learn_trace_location_west",
  [GridLocation.NORTHEAST]: "learn_trace_location_northeast",
  [GridLocation.SOUTHEAST]: "learn_trace_location_southeast",
  [GridLocation.SOUTHWEST]: "learn_trace_location_southwest",
  [GridLocation.NORTHWEST]: "learn_trace_location_northwest",
  [GridLocation.CENTER]: "learn_trace_location_center",
};

export function locationName(location: GridLocation): string {
  const key = LOCATION_KEYS[location];
  return key ? tDynamic(key) : String(location);
}

/** Performer-relative label for the hand whose canonical trace color is shown. */
export function handName(hand: TraceHand): string {
  return tDynamic(
    hand === HandSide.LEFT ? "learn_trace_hand_left" : "learn_trace_hand_right"
  );
}

/** Translate conversion failures at render time so a locale switch updates them. */
export function conversionErrorText(error: TraceConversionError): string {
  if (error.code === "missing-hand-motion" && error.hand !== undefined) {
    return tDynamic("learn_trace_error_missing_hand", {
      hand: handName(error.hand),
      beat: (error.beatIndex ?? 0) + 1,
    });
  }
  if (error.code === "discontinuous-beat" && error.hand !== undefined) {
    return tDynamic("learn_trace_error_jump", {
      hand: handName(error.hand),
      beat: (error.beatIndex ?? 0) + 1,
    });
  }
  if (error.code === "unequal-hand-path-lengths") {
    return tDynamic("learn_trace_error_unequal");
  }
  return tDynamic("learn_trace_error_empty");
}

/** Where a segment begins on the stage, whether it moves or holds. */
export function segmentStartPoint(segment: TraceSegment): NormalizedPoint {
  if (segment.kind === "hold") {
    return sampleSegmentPath(segment.location, segment.location, 1)[0]!;
  }
  return segment.expectedPath[0]!;
}

/** Where a segment ends. A hold ends where it started — that is the whole ask. */
export function segmentEndPoint(segment: TraceSegment): NormalizedPoint {
  if (segment.kind === "hold") {
    return sampleSegmentPath(segment.location, segment.location, 1)[0]!;
  }
  return segment.expectedPath[segment.expectedPath.length - 1]!;
}

/**
 * A CSS pixel is defined as 1/96 inch, so this converts a rendered stage width
 * into real millimetres — which is what the touch floor is expressed in. Pixels
 * are not a physical unit across device pixel ratios; millimetres are.
 */
const MM_PER_CSS_PX = 25.4 / 96;

/**
 * How many trail points to keep for drawing. The trail is decoration, not
 * evidence: the evaluator already consumed every sample, so the renderer only
 * needs enough points to look like the line the finger drew. Capping it keeps
 * a long round from growing an unbounded array behind the scenes.
 */
const TRAIL_CAP = 240;

/** Scale every tolerance radius by the challenge's forgiveness multiplier. */
function scaledConfig(
  scale: number,
  stageSideMm: number
): TraceEvaluatorConfig {
  const base = DEFAULT_TRACE_EVALUATOR_CONFIG;
  const grow = (value: number) => withPhysicalFloor(value * scale, stageSideMm);
  return {
    ...base,
    startZoneRadius: grow(base.startZoneRadius),
    endZoneRadius: grow(base.endZoneRadius),
    checkpointRadius: grow(base.checkpointRadius),
    holdRadius: grow(base.holdRadius),
    corridorRadius: grow(base.corridorRadius),
    // The floor itself, so the evaluator's per-segment checkpoint shrink knows
    // where it must stop. `withPhysicalFloor(0, mm)` IS the floor.
    touchFloorRadius: withPhysicalFloor(0, stageSideMm),
    accuracyFalloff: base.accuracyFalloff * scale,
  };
}

interface PointerAssignment {
  readonly hand: TraceHand;
  /**
   * Which round this pointer belongs to. Pointer ids are recycled by the
   * browser across gestures, so an id alone is not identity — a stale entry
   * from the previous round would otherwise claim a hand in this one.
   */
  readonly roundToken: number;
}

// Factory

export function createTracePathsState(options: TracePathsStateOptions = {}) {
  let phase = $state<TracePhase>({ name: "loading" });

  // Settings. Reduced motion INITIALIZES from the OS query using the shared
  // helper (never a fourth hand-rolled matchMedia), and the player can then
  // override it either way — the OS is the starting point, not a lock.
  let settings = $state<TraceSettings>({
    reducedMotion: reducedMotion(),
    lowStimulus: false,
    haptics: true,
    sound: false,
    oneHandMode: false,
    tapRouteMode: false,
  });

  // Non-reactive round machinery. The evaluator is a plain object; its state is
  // mirrored into runes below at the points where it can actually have changed.
  let evaluator: TraceEvaluator | null = null;
  let toleranceScale = options.toleranceScale ?? 1;
  let stageSideMm = 0;
  let roundToken = 0;
  let assistedCompletion = false;

  const pointers = new Map<number, PointerAssignment>();
  const trails = new Map<TraceHand, NormalizedPoint[]>();

  // Mirrored evaluator readings. Kept as runes so the stage and route layer
  // re-render, refreshed by `syncFromEvaluator()` after every ingest.
  let beatIndex = $state(0);
  let totalBeats = $state(0);
  let armed = $state<Partial<Record<TraceHand, boolean>>>({});
  let satisfied = $state<Partial<Record<TraceHand, boolean>>>({});
  let trailVersion = $state(0);

  // A quiet, non-blocking nudge (an ignored third finger, a tap on the wrong
  // target). Never an error state, never blocking — it appears and fades.
  let cue = $state<string | null>(null);
  let cueTimer: ReturnType<typeof setTimeout> | null = null;

  // Tap Route mode: how many ordered waypoints the player has claimed.
  let tapProgress = $state(0);
  // Step-through preview: which beat the keyboard/switch user is reading.
  let previewBeat = $state(0);

  let roundStartedAtMs = 0;

  const haptics = getHapticFeedback();

  // Computed views
  //
  // These are plain recomputing functions, NOT `$derived`. Same reason
  // arcade-session-state.svelte.ts uses a plain getter for `accuracy`:
  // `$derived`'s cache is only invalidated by writes observed from inside an
  // active reactive context, and half of this file's reads happen from DOM
  // pointer handlers, which are not one. A cached `$derived` read from
  // `pointerDown` would hand back the PREVIOUS round's hand list — and hand
  // assignment is the one thing in this feature that must never be stale.
  // Recomputing every read is cheap at this size and correct in every caller.

  /** The round currently loaded, whatever phase we're in. Null while loading or errored. */
  function computeRound(): TraceRound | null {
    const current = phase;
    if (current.name === "loading" || current.name === "error") return null;
    return current.round;
  }

  /**
   * Which hands this round arms right now.
   *
   * The round's own geometry decides who participates; One Hand mode narrows a
   * two-hand round to whichever hand still has work left, so a player who can
   * only use one pointer still walks the same route.
   */
  function computeActiveHands(): TraceHand[] {
    const current = computeRound();
    if (!current) return [];
    const present = TRACE_HANDS.filter((hand) => current.hands[hand]);
    // Tap Route uses no pointers at all, so there is nothing for One Hand mode
    // to relieve — and narrowing here would strand it: the rotation advances on
    // the evaluator's `satisfied` map, which taps never touch, so the second
    // hand's grid would never appear while the ordered waypoint list kept
    // demanding it. Two accessibility switches would deadlock each other.
    if (settings.tapRouteMode) return present;
    if (!settings.oneHandMode || present.length < 2) return present;
    const pending = present.find((hand) => !satisfied[hand]);
    return [pending ?? present[0]!];
  }

  /** Both hands' segments for the beat being traced right now. */
  function computeCurrentSegments(): Partial<Record<TraceHand, TraceSegment>> {
    const current = computeRound();
    if (!current) return {};
    return current.beats[beatIndex]?.segments ?? {};
  }

  function computeIsTraceable(): boolean {
    return phase.name === "arming" || phase.name === "tracing";
  }

  /**
   * The one sentence the live region reads. Deliberately semantic — it names
   * the hand, the place, and the beat rather than describing pixels.
   */
  function computeStatusText(): string {
    // Held in a const so the narrowing survives into the nested callbacks
    // below; a captured `let` loses it at every closure boundary.
    const current = phase;
    switch (current.name) {
      case "loading":
        return tDynamic("learn_trace_loading");
      case "error":
        return conversionErrorText(current.error);
      case "preview": {
        const starts = computeActiveHands()
          .map((hand) => {
            const trace = current.round.hands[hand];
            return trace
              ? tDynamic("learn_trace_starts_at", {
                  hand: handName(hand),
                  location: locationName(trace.start),
                })
              : "";
          })
          .filter(Boolean)
          .join(" ");
        return `${tDynamic("learn_trace_route_ready")} ${starts}`.trim();
      }
      case "arming": {
        const waiting = computeActiveHands().filter((hand) => !armed[hand]);
        if (waiting.length === 0) return tDynamic("learn_trace_hands_set");
        return waiting.length === 1
          ? tDynamic("learn_trace_place_hand", { hand: handName(waiting[0]!) })
          : tDynamic("learn_trace_place_both");
      }
      case "tracing":
        return tDynamic("learn_trace_beat_count", {
          current: Math.min(beatIndex + 1, totalBeats),
          total: totalBeats,
        });
      case "paused":
        return pauseSentence(current.reason);
      case "feedback":
        return feedbackSentence(current.metrics);
    }
  }

  /** The step-through preview's own sentence, independent of the traced status. */
  function computePreviewText(): string {
    const current = computeRound();
    if (!current) return "";
    const beat = current.beats[previewBeat];
    if (!beat) return "";
    const parts = TRACE_HANDS.filter((hand) => beat.segments[hand]).map(
      (hand) => {
        const segment = beat.segments[hand]!;
        if (segment.kind === "hold") {
          return tDynamic("learn_trace_holds_at", {
            hand: handName(hand),
            location: locationName(segment.location),
          });
        }
        return tDynamic("learn_trace_travels", {
          hand: handName(hand),
          start: locationName(segment.start),
          end: locationName(segment.end),
        });
      }
    );
    return `${tDynamic("learn_trace_beat_count", { current: previewBeat + 1, total: current.beats.length })} ${parts.join(". ")}.`;
  }

  /**
   * The ordered waypoints Tap Route asks for: every hand's beat endpoints, in
   * beat order, blue before red. Tapping them in this order walks the same
   * route the traced version draws.
   */
  function computeTapWaypoints(): TapWaypoint[] {
    const current = computeRound();
    if (!current) return [];
    const out: TapWaypoint[] = [];
    for (const beat of current.beats) {
      for (const hand of TRACE_HANDS) {
        const segment = beat.segments[hand];
        if (!segment) continue;
        out.push({ hand, beatIndex: beat.index, at: segmentEndPoint(segment) });
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Sentences
  // -------------------------------------------------------------------------

  function pauseSentence(reason: TracePauseReason): string {
    if (reason === "pointer-lost") {
      return tDynamic("learn_trace_pause_touch");
    }
    if (reason === "hidden") {
      return tDynamic("learn_trace_pause_hidden");
    }
    return tDynamic("learn_trace_pause_player");
  }

  /**
   * The one thing that went wrong, said in the player's terms: which hand,
   * which beat, what to change. Never a verdict word.
   */
  function divergenceSentence(divergence: TraceDivergence): string {
    const who = handName(divergence.hand);
    const beat = divergence.beatIndex + 1;
    switch (divergence.reason) {
      case "skipped-checkpoint":
        return tDynamic("learn_trace_miss_skipped", { hand: who, beat });
      case "out-of-corridor":
        return tDynamic("learn_trace_miss_corridor", { hand: who, beat });
      case "wrong-order":
        return tDynamic("learn_trace_miss_order", { hand: who, beat });
      case "lifted":
        return tDynamic("learn_trace_miss_lifted", { hand: who, beat });
      case "hold-broken":
        return tDynamic("learn_trace_miss_hold", { hand: who, beat });
    }
  }

  /**
   * Timing gets its own sentence, and only when the paths themselves were
   * clean. Telling someone their hands were apart while they also went off
   * route buries the thing they should fix first.
   */
  function synchronySentence(metrics: TraceMetrics): string | null {
    if (metrics.synchrony === null || metrics.synchrony >= 0.75) return null;
    return tDynamic("learn_trace_sync_feedback");
  }

  function feedbackSentence(metrics: TraceMetrics): string {
    if (metrics.divergence) return divergenceSentence(metrics.divergence);
    const timing = synchronySentence(metrics);
    if (timing) return timing;
    return tDynamic("learn_trace_complete");
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  function setCue(message: string): void {
    cue = message;
    if (cueTimer !== null) clearTimeout(cueTimer);
    cueTimer = setTimeout(() => {
      cue = null;
      cueTimer = null;
    }, 2200);
  }

  function clearCue(): void {
    if (cueTimer !== null) {
      clearTimeout(cueTimer);
      cueTimer = null;
    }
    cue = null;
  }

  function syncFromEvaluator(): void {
    if (!evaluator) return;
    const snapshot = evaluator.state;
    beatIndex = snapshot.beatIndex;
    armed = { ...snapshot.armed };
    satisfied = { ...snapshot.satisfied };
  }

  function pushTrail(hand: TraceHand, samples: readonly TraceSample[]): void {
    const trail = trails.get(hand) ?? [];
    for (const sample of samples) trail.push({ x: sample.x, y: sample.y });
    // Drop from the front rather than clearing: the tail of the stroke is the
    // part that reads as "where my finger is", and that's what must survive.
    if (trail.length > TRAIL_CAP) trail.splice(0, trail.length - TRAIL_CAP);
    trails.set(hand, trail);
    trailVersion++;
  }

  function buzz(kind: "selection" | "success" | "error"): void {
    if (!settings.haptics) return;
    haptics.trigger(kind);
  }

  /**
   * Which hand a fresh pointer controls.
   *
   * DELIBERATE: this reads PLACE, never pointer order and never `isPrimary`.
   * On a split stage the caller already knows the hand from the grid element
   * that was touched, and passes it as `stageHand`. On a shared stage we pick
   * the nearest unclaimed start zone. A finger that lands nowhere near a start
   * point gets no hand at all, which is how a stray palm is ignored.
   */
  function resolveHand(
    point: NormalizedPoint,
    stageHand: TraceHand | undefined
  ): TraceHand | null {
    const claimed = new Set(
      [...pointers.values()]
        .filter((entry) => entry.roundToken === roundToken)
        .map((entry) => entry.hand)
    );

    if (stageHand) {
      if (claimed.has(stageHand)) return null;
      return computeActiveHands().includes(stageHand) ? stageHand : null;
    }

    const config = evaluator ? scaledConfig(toleranceScale, stageSideMm) : null;
    const radius = config?.startZoneRadius ?? 0.1;

    let best: TraceHand | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const segments = computeCurrentSegments();
    for (const hand of computeActiveHands()) {
      if (claimed.has(hand)) continue;
      const segment = segments[hand];
      if (!segment) continue;
      const start = segmentStartPoint(segment);
      const distance = Math.hypot(point.x - start.x, point.y - start.y);
      // A generous multiplier here only decides WHO the finger belongs to.
      // Whether it actually armed is still the evaluator's call.
      if (distance < bestDistance && distance <= radius * 2.5) {
        best = hand;
        bestDistance = distance;
      }
    }
    return best;
  }

  function finishRound(): void {
    const current = computeRound();
    if (!evaluator || !current) return;
    const metrics = evaluator.finish();
    const score = scoreTraceRound(metrics);
    releaseAllPointers();
    phase = { name: "feedback", round: current, metrics, score };
    buzz(metrics.divergence ? "selection" : "success");
    options.onRoundScored?.({
      round: current,
      metrics,
      score,
      assisted: assistedCompletion,
    });
  }

  function maybeAdvancePhase(): void {
    if (!evaluator) return;
    const snapshot = evaluator.state;

    if (
      snapshot.completedBeats >= snapshot.totalBeats &&
      snapshot.totalBeats > 0
    ) {
      finishRound();
      return;
    }

    if (phase.name === "arming") {
      const ready = computeActiveHands().every((hand) => snapshot.armed[hand]);
      if (ready) {
        roundStartedAtMs = performance.now();
        phase = { name: "tracing", round: phase.round };
        buzz("selection");
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public actions
  // -------------------------------------------------------------------------

  /**
   * Hand the state a converted round (or the conversion's refusal). Everything
   * from the previous round is dropped here, including its pointer claims —
   * that's what makes a recycled pointer id from the last gesture harmless.
   */
  function loadRound(result: TraceConversionResult): void {
    roundToken++;
    pointers.clear();
    trails.clear();
    trailVersion++;
    tapProgress = 0;
    previewBeat = 0;
    assistedCompletion = false;
    clearCue();

    if (!result.ok) {
      evaluator = null;
      totalBeats = 0;
      beatIndex = 0;
      armed = {};
      satisfied = {};
      phase = { name: "error", error: result.error };
      return;
    }

    evaluator = createTraceEvaluator(
      result.round,
      scaledConfig(toleranceScale, stageSideMm)
    );
    totalBeats = result.round.beats.length;
    syncFromEvaluator();
    phase = { name: "preview", round: result.round };
  }

  /** Leave the preview and start listening for fingers. */
  function beginArming(): void {
    if (phase.name !== "preview") return;
    phase = { name: "arming", round: phase.round };
  }

  /**
   * The stage tells us how big it actually rendered, in CSS pixels. Tolerances
   * stay normalized; this only raises them when the physical stage is small
   * enough that the normalized corridor would be finer than a fingertip.
   */
  function setStageSidePx(sidePx: number): void {
    const mm = sidePx * MM_PER_CSS_PX;
    if (!Number.isFinite(mm) || Math.abs(mm - stageSideMm) < 1) return;
    stageSideMm = mm;

    // The stage can only report its real size once it has laid out, which is
    // after the FIRST round's evaluator was already built — with stageSideMm
    // still 0, i.e. with no physical floor at all. That is exactly the phone
    // case the floor exists for, so the first round would be the one round it
    // never protected. Rebuilding is safe while the round is still in preview:
    // nothing has been traced, no hand is armed, so there is no grading in
    // flight to disturb.
    //
    // From `arming` onward it is not safe, and the round keeps the tolerances
    // it started with. Mid-round resizing must never move the goalposts on a
    // trace already being graded, so the new floor waits for the next round.
    const current = computeRound();
    if (phase.name === "preview" && current) {
      evaluator = createTraceEvaluator(
        current,
        scaledConfig(toleranceScale, stageSideMm)
      );
      syncFromEvaluator();
    }
  }

  function setToleranceScale(scale: number): void {
    toleranceScale = scale > 0 ? scale : 1;
  }

  /**
   * A pointer landed. Returns the hand it claimed, or null when it was ignored.
   *
   * A THIRD pointer (or one landing nowhere useful) is ignored with a quiet
   * cue. It never steals a hand that is already armed — reassigning mid-round
   * would hand the round to whoever touched last, which is exactly the bug this
   * whole assignment scheme exists to prevent.
   */
  function pointerDown(
    pointerId: number,
    point: NormalizedPoint,
    stageHand?: TraceHand
  ): TraceHand | null {
    if (phase.name === "preview") beginArming();
    if (!computeIsTraceable() || !evaluator) return null;

    if (pointers.has(pointerId)) return pointers.get(pointerId)!.hand;

    const hand = resolveHand(point, stageHand);
    if (!hand) {
      setCue(
        computeActiveHands().length > 1
          ? tDynamic("learn_trace_two_fingers")
          : tDynamic("learn_trace_start_marked")
      );
      return null;
    }

    pointers.set(pointerId, { hand, roundToken });
    return hand;
  }

  /**
   * Feed every coalesced sample to the grader. The caller batches its RENDERING
   * to one frame; grading sees them all, because a fast finger's real path
   * lives in the points the frame would have thrown away.
   */
  function pointerMove(
    pointerId: number,
    samples: readonly TraceSample[]
  ): void {
    if (!computeIsTraceable() || !evaluator || samples.length === 0) return;
    const entry = pointers.get(pointerId);
    if (!entry || entry.roundToken !== roundToken) return;

    evaluator.ingest(entry.hand, samples);
    pushTrail(entry.hand, samples);
    syncFromEvaluator();
    maybeAdvancePhase();
  }

  /** The player lifted on purpose. That breaks continuity; the evaluator prices it. */
  function pointerUp(pointerId: number): void {
    const entry = pointers.get(pointerId);
    if (!entry) return;
    pointers.delete(pointerId);
    if (entry.roundToken !== roundToken || !evaluator) return;
    if (phase.name !== "tracing" && phase.name !== "arming") return;
    evaluator.notifyLift(entry.hand);
    syncFromEvaluator();
  }

  /**
   * The SYSTEM took the pointer (cancel, lost capture). Not the player's doing,
   * so it is never scored as a mistake and never ends the round — it parks it.
   */
  function pointerInterrupted(pointerId: number): void {
    const entry = pointers.get(pointerId);
    pointers.delete(pointerId);
    if (!entry || entry.roundToken !== roundToken || !evaluator) return;
    evaluator.notifyInterruption(entry.hand);
    pause("pointer-lost");
  }

  function releaseAllPointers(): void {
    pointers.clear();
  }

  /**
   * Park the round. The evaluator keeps every completed beat, so resuming is
   * genuinely where you were, not a restart with the score kept.
   */
  function pause(reason: TracePauseReason = "player"): void {
    if (phase.name !== "arming" && phase.name !== "tracing") return;
    if (evaluator) {
      for (const entry of pointers.values()) {
        if (entry.roundToken === roundToken)
          evaluator.notifyInterruption(entry.hand);
      }
    }
    const resumeTo = phase.name;
    releaseAllPointers();
    phase = { name: "paused", round: phase.round, resumeTo, reason };
  }

  function resume(): void {
    const current = phase;
    if (current.name !== "paused") return;
    // Always back to ARMING, even when the pause interrupted a trace in
    // progress. The fingers are off the glass now, so re-entering "tracing"
    // would claim hands are down that aren't. `resumeTo` stays on the phase for
    // the UI to word its prompt with; it deliberately does not pick the target.
    phase = { name: "arming", round: current.round };
    clearCue();
  }

  /** Called by the document visibility listener the stage owns. */
  function handleVisibilityHidden(): void {
    if (phase.name === "arming" || phase.name === "tracing") pause("hidden");
  }

  /** Re-run the same round from the top. */
  function retryRound(): void {
    const current = computeRound();
    if (!current) return;
    loadRound({ ok: true, round: current });
  }

  // --- Tap Route mode ------------------------------------------------------

  /**
   * Tap the waypoints in order. This completes the content — a player who can't
   * drag still walks the route and unlocks what comes next — and it deliberately
   * does NOT produce a trace score, because nothing about the line between the
   * taps was observed.
   */
  function tapWaypoint(index: number): boolean {
    if (!settings.tapRouteMode) return false;
    if (phase.name === "preview") beginArming();
    if (phase.name !== "arming" && phase.name !== "tracing") return false;

    if (index !== tapProgress) {
      setCue(tDynamic("learn_trace_tap_order"));
      return false;
    }

    tapProgress++;
    buzz("selection");

    if (tapProgress >= computeTapWaypoints().length) {
      assistedCompletion = true;
      completeAssisted();
    }
    return true;
  }

  /**
   * Finish an assisted run. Coverage reads 1 (the route WAS walked, in order)
   * and every quality dimension is null-shaped to zero so the round scores no
   * trace points. The arcade still gets a completed round; the leaderboard
   * doesn't get a number that wasn't earned by tracing.
   */
  function completeAssisted(): void {
    const current = computeRound();
    if (!current) return;
    const metrics: TraceMetrics = {
      coverage: 1,
      accuracy: 0,
      continuity: 0,
      synchrony: null,
      frechetNormalized: 0,
      corridorExcursions: [],
      checkpointsHit: 0,
      checkpointsTotal: 0,
      elapsedMs:
        roundStartedAtMs > 0 ? performance.now() - roundStartedAtMs : 0,
      divergence: null,
    };
    const score = scoreTraceRound(metrics);
    releaseAllPointers();
    phase = { name: "feedback", round: current, metrics, score };
    options.onRoundScored?.({ round: current, metrics, score, assisted: true });
  }

  // --- Step-through preview ------------------------------------------------

  /** Keyboard, switch, mouse, and screen-reader users read the round one beat at a time. */
  function stepPreview(delta: number): void {
    const current = computeRound();
    if (!current) return;
    const last = current.beats.length - 1;
    previewBeat = Math.min(last, Math.max(0, previewBeat + delta));
  }

  /** Mark the round done from the step-through path. Claims no trace score. */
  function completeStepThrough(): void {
    assistedCompletion = true;
    completeAssisted();
  }

  // --- Settings ------------------------------------------------------------

  function setSetting(key: TraceSettingKey, value: boolean): void {
    settings = { ...settings, [key]: value };
    // Turning Tap Route on mid-round drops any fingers currently claimed —
    // the two input models must never be half-active at the same time.
    if (key === "tapRouteMode") {
      releaseAllPointers();
      tapProgress = 0;
    }
  }

  function toggleSetting(key: TraceSettingKey): void {
    setSetting(key, !settings[key]);
  }

  function destroy(): void {
    clearCue();
    releaseAllPointers();
    evaluator = null;
  }

  return {
    get phase() {
      return phase;
    },
    get round() {
      return computeRound();
    },
    get settings() {
      return settings;
    },
    get activeHands() {
      return computeActiveHands();
    },
    get currentSegments() {
      return computeCurrentSegments();
    },
    get beatIndex() {
      return beatIndex;
    },
    get totalBeats() {
      return totalBeats;
    },
    get armed() {
      return armed;
    },
    get satisfied() {
      return satisfied;
    },
    get isTraceable() {
      return computeIsTraceable();
    },
    get statusText() {
      return computeStatusText();
    },
    get previewText() {
      return computePreviewText();
    },
    get previewBeat() {
      return previewBeat;
    },
    get cue() {
      return cue;
    },
    get tapWaypoints() {
      return computeTapWaypoints();
    },
    get tapProgress() {
      return tapProgress;
    },
    /**
     * Ephemeral render-only polyline of where a hand has been this round.
     * Capped, never persisted, never transmitted, and dropped the moment the
     * next round loads. `trailVersion` is read here so the getter re-runs when
     * points are appended to the (non-reactive) backing array.
     */
    trail(hand: TraceHand): readonly NormalizedPoint[] {
      void trailVersion;
      return trails.get(hand) ?? [];
    },
    loadRound,
    beginArming,
    setStageSidePx,
    setToleranceScale,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerInterrupted,
    releaseAllPointers,
    pause,
    resume,
    handleVisibilityHidden,
    retryRound,
    tapWaypoint,
    stepPreview,
    completeStepThrough,
    setSetting,
    toggleSetting,
    destroy,
  };
}

export type TracePathsState = ReturnType<typeof createTracePathsState>;

const KEY = Symbol("trace-paths-state");

export function setTracePathsContext(state: TracePathsState): void {
  setContext(KEY, state);
}

export function getTracePaths(): TracePathsState {
  const state = getContext<TracePathsState>(KEY);
  if (!state) {
    throw new Error(
      "Trace Paths state context missing — TracePathsGame must set it"
    );
  }
  return state;
}
