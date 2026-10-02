import {
  POST_TIME_EPSILON,
  itemEnd,
  type PostAnimationItem,
  type PostBox,
  type PostMovesItem,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import type { TakeSample } from "$lib/shared/media-composition/domain/take-timing";
import { MOVE_EASING } from "$lib/shared/media-composition/domain/tunnel-hook";

/**
 * An animation that ends over a picture-in-picture square shrinks into it
 * instead of fading out under it. Across their overlap both layers ride one
 * box, from the animation's into the square's, on the opening move's curve,
 * and the upper one dissolves into the lower. Both read one clock, so one
 * figure is drawn while its look changes: the animation finishes its pass
 * and lands on the opening pose, and the square carries on from there at the
 * slower take's pace.
 */
export interface PipHandoff {
  animation: PostAnimationItem;
  moves: PostMovesItem;
  /** True when the square's track draws above the animation's. */
  movesOnTop: boolean;
  /** The overlap, in post seconds. */
  start: number;
  end: number;
}

/** The first animation whose end a picture-in-picture square overlaps. */
export function pipHandoffOf(project: PostProject): PipHandoff | null {
  const visible = project.tracks.flatMap((track, trackIndex) =>
    track.hidden ? [] : track.items.map((item) => ({ item, trackIndex }))
  );
  for (const { item: animation, trackIndex: animationTrack } of visible) {
    if (animation.kind !== "animation") continue;
    const end = itemEnd(animation);
    for (const { item: moves, trackIndex: movesTrack } of visible) {
      if (
        moves.kind === "moves" &&
        moves.animationAppearance &&
        moves.start > animation.start + POST_TIME_EPSILON &&
        moves.start < end - POST_TIME_EPSILON &&
        itemEnd(moves) > end + POST_TIME_EPSILON
      ) {
        return {
          animation,
          moves,
          movesOnTop: movesTrack >= animationTrack,
          start: moves.start,
          end,
        };
      }
    }
  }
  return null;
}

/** The box both layers ride across the overlap: eased into the square. */
export function pipHandoffBoxKeys(
  handoff: Pick<PipHandoff, "start" | "end">,
  from: PostBox,
  to: PostBox
): {
  atSeconds: number;
  value: PostBox;
  easing: "hold" | [number, number, number, number];
}[] {
  return [
    { atSeconds: handoff.start, value: { ...from }, easing: MOVE_EASING },
    { atSeconds: handoff.end, value: { ...to }, easing: "hold" },
  ];
}

/**
 * Where a layer's box keys leave it at a moment: the last key at or before
 * it, or the first key ahead of it, or its own box.
 */
export function pipHandoffBoxAt(
  keys: readonly { atSeconds: number; value: PostBox }[],
  atSeconds: number,
  box: PostBox
): PostBox {
  const before = keys.filter(
    (key) => key.atSeconds <= atSeconds + POST_TIME_EPSILON
  );
  return {
    ...(before[before.length - 1]?.value ?? keys[0]?.value ?? box),
  };
}

/**
 * A layer's box keys with the hand-off's in place of whatever it had across
 * the overlap.
 */
export function withPipHandoffBoxKeys<
  Key extends { atSeconds: number; value: PostBox },
>(
  keys: readonly Key[],
  handoff: Pick<PipHandoff, "start" | "end">,
  from: PostBox,
  to: PostBox
): (Key | ReturnType<typeof pipHandoffBoxKeys>[number])[] {
  return [
    ...keys.filter((key) => key.atSeconds < handoff.start - POST_TIME_EPSILON),
    ...pipHandoffBoxKeys(handoff, from, to),
    ...keys.filter((key) => key.atSeconds > handoff.end + POST_TIME_EPSILON),
  ];
}

/** Longest the shared clock may take to rejoin the square's own. */
export const PIP_HANDOFF_MAX_CLOCK_SECONDS = 4;
/** Shortest slowdown, so the speed never drops in a single frame. */
const MIN_SLOWDOWN_SECONDS = 0.25;
/** How long it takes to catch up when the square is ahead and faster. */
const CATCH_UP_SECONDS = 1;
/** Post seconds over which a clock's rate is read. */
const RATE_STEP = 0.05;

export interface PipHandoffClocks {
  /** The animation's take at a post second. */
  from: (postSeconds: number) => TakeSample | null;
  /** The square's take at a post second. */
  to: (postSeconds: number) => TakeSample | null;
  /** Moves in one pass of the sequence. */
  passLength: number;
}

/**
 * When the animation lands on the opening pose inside the overlap, as it
 * finishes its last pass: that time, the arrival, and the pace it lands at.
 * Null when it makes no such landing there.
 */
export function pipHandoffLanding(
  handoff: Pick<PipHandoff, "start" | "end">,
  clocks: PipHandoffClocks
): { at: number; arrival: number; rate: number } | null {
  const passLength = clocks.passLength;
  const first = clocks.from(handoff.start)?.arrival;
  const last = clocks.from(handoff.end)?.arrival;
  if (first === undefined || last === undefined || passLength <= 0) {
    return null;
  }
  const landing = Math.floor(last / passLength + 1e-9) * passLength;
  if (landing <= 0 || landing < first - 1e-9) return null;
  let early = handoff.start;
  let late = handoff.end;
  if ((clocks.from(early)?.arrival ?? -Infinity) >= landing - 1e-9) {
    late = early;
  }
  for (let step = 0; step < 40 && late - early > 1e-4; step += 1) {
    const middle = (early + late) / 2;
    if ((clocks.from(middle)?.arrival ?? -Infinity) >= landing - 1e-9) {
      late = middle;
    } else {
      early = middle;
    }
  }
  const before = clocks.from(late - RATE_STEP)?.arrival;
  return {
    at: late,
    arrival: landing,
    rate:
      before === undefined ? 0 : Math.max(0, (landing - before) / RATE_STEP),
  };
}

/**
 * What one side draws at `postSeconds` from the overlap's start, or null
 * where neither clock is readable.
 *
 * Until the animation lands on the opening pose it keeps its own clock, and
 * the square shows the same moves. From the landing:
 * - the square's take has not started its pass yet: the pose holds until it
 *   does, then the square's clock runs;
 * - it has already started: the figure eases from the animation's pace down
 *   to the square's and meets it, evenly where it can (a constant slowdown
 *   that covers exactly the gap), so it lands, then settles in.
 * With no landing in the overlap the same meeting starts at the overlap.
 * Once the clocks meet it is the square's own.
 *
 * The square counts passes on its own take, which picks its look on an
 * alternating square, so it draws the animation's moves whole passes away
 * (the same pose). The animation keeps its own count until it lands.
 */
export function pipHandoffSample(
  handoff: Pick<PipHandoff, "start" | "end">,
  clocks: PipHandoffClocks,
  postSeconds: number,
  side: "from" | "to"
): TakeSample | null {
  const passLength = clocks.passLength;
  if (postSeconds < handoff.start || passLength <= 0) return null;
  const own = clocks.to(postSeconds);
  if (postSeconds > handoff.end + PIP_HANDOFF_MAX_CLOCK_SECONDS) return own;

  const landing = pipHandoffLanding(handoff, clocks);
  const before = landing !== null && postSeconds < landing.at;
  if (before && side === "from") return clocks.from(postSeconds);
  let pivot = handoff.start;
  let pose: number;
  let rate: number;
  if (landing) {
    pivot = landing.at;
    pose = landing.arrival;
    rate = landing.rate;
  } else {
    const now = clocks.from(handoff.start)?.arrival;
    const next = clocks.from(handoff.start + RATE_STEP)?.arrival;
    if (now === undefined || next === undefined) return own;
    pose = now;
    rate = Math.max(0, (next - now) / RATE_STEP);
  }
  const meet = clocks.to(pivot);
  const meetNext = clocks.to(pivot + RATE_STEP);
  if (!meet || !meetNext || !own) return own;
  const endArrival = own.endArrival;

  // The pass of the square's take nearest the pose, so the figure never
  // runs a whole pass to reach it.
  const passes = Math.round((pose - meet.arrival) / passLength) * passLength;
  const start = pose - passes;
  const drawn = (arrival: number): TakeSample => ({
    arrival:
      arrival < 0
        ? arrival + Math.ceil(-arrival / passLength - 1e-9) * passLength
        : arrival,
    endArrival,
  });
  if (before) {
    const animation = clocks.from(postSeconds);
    return animation ? drawn(animation.arrival - passes) : own;
  }
  const gap = meet.arrival - start;
  if (gap <= 1e-9) {
    // The square is not past the pose: hold it until the square's clock
    // comes up to it.
    return own.arrival >= start ? own : drawn(start);
  }

  const targetRate = Math.max(0, (meetNext.arrival - meet.arrival) / RATE_STEP);
  const seconds =
    rate - targetRate > 1e-3
      ? Math.min(
          PIP_HANDOFF_MAX_CLOCK_SECONDS,
          Math.max(MIN_SLOWDOWN_SECONDS, (2 * gap) / (rate - targetRate))
        )
      : CATCH_UP_SECONDS;
  const elapsed = postSeconds - pivot;
  if (elapsed >= seconds) return own;
  const end = clocks.to(pivot + seconds);
  const endBefore = clocks.to(pivot + seconds - RATE_STEP);
  if (!end || !endBefore) return own;
  const travel = end.arrival - start;
  if (travel <= 0) return drawn(start);

  // A cubic through both poses and paces; paces that would carry it past the
  // square and back are scaled down (Fritsch-Carlson).
  let startSlope = rate * seconds;
  let endSlope =
    Math.max(0, (end.arrival - endBefore.arrival) / RATE_STEP) * seconds;
  const reach = Math.hypot(startSlope, endSlope) / travel;
  if (reach > 3) {
    startSlope *= 3 / reach;
    endSlope *= 3 / reach;
  }
  const s = elapsed / seconds;
  return drawn(
    (2 * s ** 3 - 3 * s ** 2 + 1) * start +
      (s ** 3 - 2 * s ** 2 + s) * startSlope +
      (-2 * s ** 3 + 3 * s ** 2) * end.arrival +
      (s ** 3 - s ** 2) * endSlope
  );
}
