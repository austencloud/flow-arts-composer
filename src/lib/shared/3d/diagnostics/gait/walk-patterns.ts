/**
 * Walk patterns
 *
 * Ways of moving a character around, written as pure functions of time so the
 * lab that drives them holds no schedule of its own and the schedule can be
 * tested without a renderer.
 *
 * Each one exists to break a different seam. A character walking one direction
 * at one speed forever is the case every part of the pipeline was tuned for;
 * the interesting frames are the ones where a clip hands over to another clip,
 * where the blend between two of them is halfway, where the body starts and
 * stops, and where the planter has to let a foot go early because the ground
 * under it turned. Those are the frames a pattern here is aiming at.
 *
 * Every pattern returns to where it started, so the character stays in the
 * arena and the measurement never has to be interrupted to reposition it.
 *
 * A pattern never sets a position. It sets a facing and a travel direction in
 * the character's own frame, and the lab integrates the path from those at the
 * commanded speed. That way the distance covered on screen is the distance the
 * animator was told about, which is the whole basis of the stride it plays.
 */

import type { TurnRequest } from "@austencloud/scene-3d";
import type { PatternTerminalIntent } from "#lib/shared/3d/locomotion/pattern-terminal-step-plan.js";

/** What the character is being asked to do this frame. */
export interface WalkTick {
  /** Absolute facing in radians. 0 faces +Z. */
  facing: number;
  isMoving: boolean;
  /** Multiplier on the lab's commanded speed. 0 stands still. */
  rate: number;
  /**
   * Travel direction in the character's own frame: +z ahead, +x their right.
   * Not normalised by the pattern - the lab does that, so a pattern can write
   * a diagonal as (1, 1) and mean it.
   */
  direction: { x: number; z: number };
  /** What this moment is, named for the readout. */
  phase: string;
  /** Authored in-place turn pose and root motion, when this tick is a pivot. */
  turnRequest?: TurnRequest;
  /** Remaining stage distance offered to the shared two-step stop planner. */
  terminalIntent?: PatternTerminalIntent;
  /** Do not advance this pause until the captured stop reaches its rest pose. */
  waitForTerminalSettle?: boolean;
}

export interface WalkPattern {
  id: string;
  label: string;
  /** The seam this one is built to break, in one line. */
  hunts: string;
  /**
   * How long one lap takes at the given speed. Distance-based patterns get
   * longer as the speed drops, which is what keeps their laps the same size.
   */
  period(speed: number): number;
  tick(t: number, speed: number): WalkTick;
}

const TAU = Math.PI * 2;
const AHEAD = { x: 0, z: 1 };
const BEHIND = { x: 0, z: -1 };
const RIGHT = { x: 1, z: 0 };
const LEFT = { x: -1, z: 0 };
const STILL = { x: 0, z: 0 };

/** Metres out and back on the straight-line patterns. */
const RUN = 4;
/** Authored clip time before the outgoing pose releases to locomotion. */
const QUARTER_TURN_SECONDS = 1;
const ABOUT_FACE_SECONDS = 50 / 30;
const TURN_ENTRY_SECONDS = 0.3;
const TURN_RELEASE_SECONDS = 0.3;
/** A pause between legs, so each seam is approached from a settled stand. */
const PAUSE = 0.8;

const stand = (facing: number, phase: string): WalkTick => ({
  facing,
  isMoving: false,
  rate: 0,
  direction: STILL,
  phase,
});

const go = (
  facing: number,
  direction: { x: number; z: number },
  phase: string,
  rate = 1
): WalkTick => ({ facing, isMoving: true, rate, direction, phase });

/** Meet an authored pose with zero velocity and acceleration at both seams. */
function smooth(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

/**
 * Run a script of legs, each with its own duration.
 *
 * The legs are rebuilt on every call rather than cached per speed: a lap is a
 * handful of entries, and caching them would need the cache invalidated on the
 * speed slider, which is more machinery than the arithmetic it saves.
 */
interface Leg {
  seconds: number;
  at(local: number): WalkTick;
}

function runLegs(legs: readonly Leg[], t: number): WalkTick {
  let remaining = t;
  for (const leg of legs) {
    if (remaining < leg.seconds) return leg.at(remaining);
    remaining -= leg.seconds;
  }
  const last = legs[legs.length - 1]!;
  return last.at(last.seconds);
}

function totalSeconds(legs: readonly Leg[]): number {
  return legs.reduce((sum, leg) => sum + leg.seconds, 0);
}

/**
 * Ask the shared turn owner for visible foot placements and authored root yaw.
 *
 * Facing still follows the request for path math and diagnostics, but the rig
 * promotes the clip's yaw curve to the performer root. `requireAuthored`
 * prevents a missing asset from quietly becoming the old footless spin.
 */
function turnLeg(from: number, to: number, phase: string, planId: string): Leg {
  const turnAngle = to - from;
  const clipSeconds =
    Math.abs(turnAngle) > Math.PI * 0.75
      ? ABOUT_FACE_SECONDS
      : QUARTER_TURN_SECONDS;
  return {
    seconds: clipSeconds + TURN_RELEASE_SECONDS,
    at: (u) => {
      const turnPhase = Math.min(1, u / clipSeconds);
      const poseWeight =
        u <= clipSeconds
          ? smooth(u / TURN_ENTRY_SECONDS)
          : 1 - smooth((u - clipSeconds) / TURN_RELEASE_SECONDS);
      return {
        ...stand(from + turnAngle * turnPhase, phase),
        turnRequest: {
          planId,
          fromHeading: from,
          toHeading: to,
          phase: turnPhase,
          poseWeight,
          requireAuthored: true,
        },
      };
    },
  };
}

function pauseLeg(
  facing: number,
  phase = "settling",
  waitForTerminalSettle = false
): Leg {
  return {
    seconds: PAUSE,
    at: () => ({ ...stand(facing, phase), waitForTerminalSettle }),
  };
}

function travelLeg(
  speed: number,
  metres: number,
  facing: number,
  direction: { x: number; z: number },
  phase: string,
  terminalPlanId?: string
): Leg {
  return {
    seconds: metres / Math.max(0.05, speed),
    at: (local) => ({
      ...go(facing, direction, phase),
      ...(terminalPlanId && {
        terminalIntent: {
          id: terminalPlanId,
          remainingDistance: Math.max(0, metres - speed * local),
          targetFacing: facing,
        },
      }),
    }),
  };
}

/** How far a tick carries the character, in world metres. */
export interface WalkStep {
  dx: number;
  dz: number;
  /** Ground distance covered, which is what the animator strides against. */
  distance: number;
}

/**
 * Turn one tick into a world-space step.
 *
 * The character's forward is (sin f, cos f) and their right is (-cos f, sin f),
 * which is the convention the 3D package and the gait analysis already use.
 * Rotating the other way silently mirrors every strafe, and a mirrored strafe
 * looks like a rig fault rather than a bug here, so this lives in one place.
 */
export function stepOf(tick: WalkTick, speed: number, dt: number): WalkStep {
  const length = Math.hypot(tick.direction.x, tick.direction.z);
  if (!tick.isMoving || length < 1e-6 || speed <= 0 || dt <= 0) {
    return { dx: 0, dz: 0, distance: 0 };
  }
  const ux = tick.direction.x / length;
  const uz = tick.direction.z / length;
  const sin = Math.sin(tick.facing);
  const cos = Math.cos(tick.facing);
  const distance = speed * tick.rate * dt;
  return {
    dx: (ux * -cos + uz * sin) * distance,
    dz: (ux * sin + uz * cos) * distance,
    distance,
  };
}

/** Out, about-face, back. The plainest walk there is, plus its two ends. */
const shuttle: WalkPattern = {
  id: "shuttle",
  label: "Out and back",
  hunts: "standing into walking, and the about-face between the two runs",
  period: (speed) => totalSeconds(shuttleLegs(speed)),
  tick: (t, speed) => runLegs(shuttleLegs(speed), t),
};

function shuttleLegs(speed: number): Leg[] {
  return [
    pauseLeg(0, "standing"),
    travelLeg(speed, RUN, 0, AHEAD, "walking out", "shuttle:outbound-stop"),
    pauseLeg(0, "arriving", true),
    turnLeg(0, Math.PI, "about-face left", "shuttle:outbound-turn"),
    pauseLeg(Math.PI, "settling"),
    travelLeg(
      speed,
      RUN,
      Math.PI,
      AHEAD,
      "walking back",
      "shuttle:return-stop"
    ),
    pauseLeg(Math.PI, "arriving", true),
    turnLeg(Math.PI, 0, "about-face right", "shuttle:return-turn"),
  ];
}

/** Out forwards, back backwards, never turning. */
const reverse: WalkPattern = {
  id: "reverse",
  label: "Forward, then backward",
  hunts: "the handover between the forward clip and the backward one",
  period: (speed) => totalSeconds(reverseLegs(speed)),
  tick: (t, speed) => runLegs(reverseLegs(speed), t),
};

function reverseLegs(speed: number): Leg[] {
  return [
    pauseLeg(0, "standing"),
    travelLeg(speed, RUN, 0, AHEAD, "forward"),
    pauseLeg(0, "arriving"),
    travelLeg(speed, RUN, 0, BEHIND, "backward"),
  ];
}

/** Sidestep one way and the other, facing held. */
const sidestep: WalkPattern = {
  id: "sidestep",
  label: "Sidestep both ways",
  hunts: "the seam between the two strafe clips, through a standstill",
  period: (speed) => totalSeconds(sidestepLegs(speed)),
  tick: (t, speed) => runLegs(sidestepLegs(speed), t),
};

function sidestepLegs(speed: number): Leg[] {
  return [
    pauseLeg(0, "standing"),
    travelLeg(speed, RUN * 0.75, 0, RIGHT, "stepping right"),
    pauseLeg(0, "arriving"),
    travelLeg(speed, RUN * 0.75, 0, LEFT, "stepping left"),
  ];
}

/** Grapevine one way and the other, facing held downstage. */
const grapevine: WalkPattern = {
  id: "grapevine",
  label: "Grapevine both ways",
  hunts: "front/back crossover order, swing clearance, and the reversal seam",
  period: (speed) => totalSeconds(grapevineLegs(speed)),
  tick: (t, speed) => runLegs(grapevineLegs(speed), t),
};

function grapevineLegs(speed: number): Leg[] {
  return [
    pauseLeg(0, "standing"),
    travelLeg(speed, RUN * 0.75, 0, RIGHT, "grapevine right"),
    pauseLeg(0, "settling after right grapevine"),
    travelLeg(speed, RUN * 0.75, 0, LEFT, "grapevine left"),
  ];
}

/**
 * A circle, facing the way it is going.
 *
 * The yaw rate is set from the commanded speed so the radius is the same lap
 * at every speed, which keeps the curvature the planter has to cope with
 * constant while the stride under it changes.
 */
const CIRCLE_R = 2.6;

const circle: WalkPattern = {
  id: "circle",
  label: "Circle",
  hunts: "sustained turning: the ground under a planted foot keeps rotating",
  period: (speed) => (TAU * CIRCLE_R) / Math.max(0.05, speed),
  tick: (t, speed) => {
    const omega = Math.max(0.05, speed) / CIRCLE_R;
    return go(omega * t, AHEAD, "circling");
  },
};

/** Two circles the other way round from each other. */
const figureEight: WalkPattern = {
  id: "figure8",
  label: "Figure eight",
  hunts: "the curvature reversing at the crossing, mid-stride",
  period: (speed) => (2 * TAU * CIRCLE_R) / Math.max(0.05, speed),
  tick: (t, speed) => {
    const omega = Math.max(0.05, speed) / CIRCLE_R;
    const lap = TAU / omega;
    const second = t >= lap;
    const local = second ? t - lap : t;
    const facing = second ? -omega * local : omega * local;
    return go(facing, AHEAD, second ? "left-hand loop" : "right-hand loop");
  },
};

/**
 * Facing held downstage while the travel cuts across it four ways.
 *
 * The blend never rests on a single clip: every leg sits halfway between the
 * forward or backward clip and one of the strafes, and the switch between legs
 * throws it across to a different pair. The four diagonals cancel, so the lap
 * is a diamond and the character ends where it started.
 */
const ZIG_SECONDS = 1.6;

const ZIG_LEGS: { direction: { x: number; z: number }; phase: string }[] = [
  { direction: { x: 1, z: 1 }, phase: "cutting ahead-right" },
  { direction: { x: -1, z: 1 }, phase: "cutting ahead-left" },
  { direction: { x: -1, z: -1 }, phase: "cutting back-left" },
  { direction: { x: 1, z: -1 }, phase: "cutting back-right" },
];

const zigzag: WalkPattern = {
  id: "zigzag",
  label: "Zigzag",
  hunts: "a blend parked between two clips, thrown to a different pair",
  period: () => ZIG_SECONDS * ZIG_LEGS.length,
  tick: (t) => {
    const leg = ZIG_LEGS[Math.floor(t / ZIG_SECONDS) % ZIG_LEGS.length]!;
    return go(0, leg.direction, leg.phase);
  },
};

/**
 * Facing held, travel direction walked all the way round.
 *
 * Every blend the animator can produce, in order, in one lap: ahead, ahead-and
 * right, right, back-and-right, back, and round again. If a seam pops, this is
 * the pattern that finds it, and the phase readout says which one it was.
 */
const COMPASS_SECONDS = 10;

const compass: WalkPattern = {
  id: "compass",
  label: "Compass",
  hunts: "every direction blend in one lap, without the facing ever moving",
  period: () => COMPASS_SECONDS,
  tick: (t) => {
    const angle = (t / COMPASS_SECONDS) * TAU;
    const octant = Math.round(angle / (TAU / 8)) % 8;
    const names = [
      "ahead",
      "ahead-right",
      "right",
      "back-right",
      "back",
      "back-left",
      "left",
      "ahead-left",
    ];
    return go(
      0,
      { x: Math.sin(angle), z: Math.cos(angle) },
      `travelling ${names[octant]}`
    );
  },
};

/** Walk, stop, walk, stop, turning a corner each time so it stays put. */
const startStop: WalkPattern = {
  id: "start-stop",
  label: "Start and stop",
  hunts: "the idle blend, entered and left four times a lap",
  period: (speed) => totalSeconds(startStopLegs(speed)),
  tick: (t, speed) => runLegs(startStopLegs(speed), t),
};

function startStopLegs(speed: number): Leg[] {
  const legs: Leg[] = [];
  for (let corner = 0; corner < 4; corner++) {
    const facing = (corner * Math.PI) / 2;
    legs.push(pauseLeg(facing, "stopped"));
    legs.push(travelLeg(speed, 2, facing, AHEAD, "walking"));
    legs.push(pauseLeg(facing, "stopping"));
    legs.push(
      turnLeg(
        facing,
        facing + Math.PI / 2,
        "turning the corner",
        `start-stop:corner-${corner + 1}`
      )
    );
  }
  return legs;
}

/**
 * A circle with the speed swept from a crawl to a stride and back.
 *
 * The clip is played at a rate set by the commanded speed, so the low end of
 * this sweep is the walk in slow motion - the same frames, with time to look
 * at them. It is also the range where the stride scaling has the most work to
 * do, which is its own reason to watch.
 */
const RAMP_SECONDS = 16;

const RAMP_FLOOR = 0.12;
const RAMP_SWING = 1 - RAMP_FLOOR;

/**
 * How fast this pattern is walking, as a share of the commanded speed.
 *
 * Never all the way to zero: a commanded stop is the start-stop pattern's
 * question, and mixing the two would leave this one unable to say which of
 * them produced a pop.
 */
function rampRate(t: number): number {
  return (
    RAMP_FLOOR + RAMP_SWING * (0.5 - 0.5 * Math.cos((t / RAMP_SECONDS) * TAU))
  );
}

const ramp: WalkPattern = {
  id: "ramp",
  label: "Speed ramp",
  hunts: "stride scaling across the whole speed range, ending in slow motion",
  period: () => RAMP_SECONDS,
  tick: (t, speed) => {
    const rate = rampRate(t);
    // Facing is the integral of the yaw rate, not the yaw rate times the
    // clock. Multiplying instead would bend the path into a spiral the moment
    // the speed started changing, and the drift would read as the planter
    // losing the floor rather than as the pattern lying about where it is.
    const swept =
      (RAMP_FLOOR + RAMP_SWING * 0.5) * t -
      ((RAMP_SWING * 0.5 * RAMP_SECONDS) / TAU) *
        Math.sin((t / RAMP_SECONDS) * TAU);
    return go(
      (Math.max(0.05, speed) * swept) / CIRCLE_R,
      AHEAD,
      `${(speed * rate).toFixed(2)} m/s`,
      rate
    );
  },
};

const PIVOT_SEGMENT_SECONDS = 3;
const PIVOT_SETTLE_SECONDS = 0.8;
const PIVOT_CLIP_SECONDS = 1;
const PIVOT_RELEASE_SECONDS = 0.3;
const PIVOT_ENTRY_SECONDS = 0.3;
const PIVOT_HEADINGS = [0, Math.PI / 2, 0, -Math.PI / 2, 0] as const;

/** Standing, turning on the spot with the authored quarter-turn clips. */
const pivot: WalkPattern = {
  id: "pivot",
  label: "Turn on the spot",
  hunts: "authored left and right foot placements during quarter turns",
  period: () => PIVOT_SEGMENT_SECONDS * (PIVOT_HEADINGS.length - 1),
  tick: (t) => {
    const period = PIVOT_SEGMENT_SECONDS * (PIVOT_HEADINGS.length - 1);
    const wrapped = ((t % period) + period) % period;
    const segment = Math.min(
      PIVOT_HEADINGS.length - 2,
      Math.floor(wrapped / PIVOT_SEGMENT_SECONDS)
    );
    const local = wrapped - segment * PIVOT_SEGMENT_SECONDS;
    const fromHeading = PIVOT_HEADINGS[segment]!;
    const toHeading = PIVOT_HEADINGS[segment + 1]!;

    if (local < PIVOT_SETTLE_SECONDS) {
      return stand(fromHeading, "settled before turn");
    }

    const turnElapsed = local - PIVOT_SETTLE_SECONDS;
    const phase = Math.min(1, turnElapsed / PIVOT_CLIP_SECONDS);
    if (turnElapsed < PIVOT_CLIP_SECONDS + PIVOT_RELEASE_SECONDS - 1e-9) {
      const direction = toHeading > fromHeading ? "left" : "right";
      const poseWeight =
        turnElapsed <= PIVOT_CLIP_SECONDS
          ? smooth(turnElapsed / PIVOT_ENTRY_SECONDS)
          : 1 -
            smooth((turnElapsed - PIVOT_CLIP_SECONDS) / PIVOT_RELEASE_SECONDS);
      return {
        ...stand(
          fromHeading + (toHeading - fromHeading) * phase,
          `turning ${direction}`
        ),
        turnRequest: { fromHeading, toHeading, phase, poseWeight },
      };
    }

    return stand(toHeading, "settled after turn");
  },
};

export const WALK_PATTERNS: readonly WalkPattern[] = [
  shuttle,
  reverse,
  sidestep,
  grapevine,
  circle,
  figureEight,
  zigzag,
  compass,
  startStop,
  ramp,
  pivot,
];

export function walkPattern(id: string): WalkPattern {
  return WALK_PATTERNS.find((pattern) => pattern.id === id) ?? shuttle;
}
