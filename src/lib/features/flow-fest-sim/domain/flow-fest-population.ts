/**
 * The living population of Flow Fest.
 *
 * A schedule-driven skeleton with utility-scored interrupts. Each person holds
 * a persistent identity, a home camp, and a plan for the day; the plan keeps
 * running whether or not the player is watching. Interrupts let someone stop to
 * watch a spinner or fall into a conversation without abandoning where they
 * were headed.
 *
 * Everything here is a pure function of the sim clock plus a seed. No
 * `Date.now()`, no wall-clock sampling: replaying the same tick sequence
 * reproduces the same festival.
 *
 * Movement is delegated to `flow-fest-corridor-graph`, which only ever routes
 * along registered person legs and registered zone envelopes. This module never
 * authors a coordinate of its own: the spots people settle on and stroll to are
 * seeded draws inside a registered envelope, checked against the same coverage
 * the routes are.
 */

import type { FlowFestMoment } from "../state/flow-fest-progress";
import { makeRng, childSeed } from "#lib/shared/foundation/utils/seeded-rng.js";
import {
  clampInsideFlowFestClearing,
  flowFestCorridorAnchorNode,
  isFlowFestCorridorCovered,
  isFlowFestHopCovered,
  routeFlowFestCorridor,
  type FlowFestCorridorGraph,
  type FlowFestCorridorRouteStep,
} from "./flow-fest-corridor-graph";
import type {
  FlowFestFestivalAvatarId,
  FlowFestFestivalCommunityLayout,
  FlowFestFestivalPersonPlacement,
} from "./flow-fest-living-fire-jam";

export type FlowFestDayPhase =
  | "thursday-afternoon"
  | "dusk-migration"
  | "night-festival"
  | "late-drift-home";

export interface FlowFestDayPhaseWindow {
  startMinute: number;
  endMinute: number;
}

/**
 * Minutes past midnight. The late phase runs past 24:00 so the ordering stays
 * monotonic across the night rather than wrapping mid-festival.
 */
export const FLOW_FEST_DAY_PHASE_WINDOWS: Record<
  FlowFestDayPhase,
  FlowFestDayPhaseWindow
> = {
  "thursday-afternoon": { startMinute: 780, endMinute: 1140 },
  "dusk-migration": { startMinute: 1140, endMinute: 1260 },
  "night-festival": { startMinute: 1260, endMinute: 1560 },
  "late-drift-home": { startMinute: 1560, endMinute: 1800 },
};

export const FLOW_FEST_DAY_PHASE_ORDER: FlowFestDayPhase[] = [
  "thursday-afternoon",
  "dusk-migration",
  "night-festival",
  "late-drift-home",
];

/** Sim minutes advanced per real second while a moment is on screen. */
export const FLOW_FEST_SIM_MINUTES_PER_SECOND = 0.5;

/**
 * Seconds of unrendered simulation to run when a phase begins, so the player
 * joining at that moment finds the festival where the evening would have put
 * it. Afternoon runs from zero because the player arrives with everyone else.
 */
export const FLOW_FEST_PHASE_WARM_START_SECONDS: Record<
  FlowFestDayPhase,
  number
> = {
  "thursday-afternoon": 0,
  "dusk-migration": 60,
  "night-festival": 300,
  "late-drift-home": 150,
};

export function flowFestDayPhaseForMoment(
  moment: FlowFestMoment
): FlowFestDayPhase {
  switch (moment) {
    case "afternoon":
      return "thursday-afternoon";
    case "golden-hour":
      return "dusk-migration";
    case "night":
      return "night-festival";
    case "dawn":
      return "late-drift-home";
  }
}

export interface FlowFestSimClock {
  minuteOfDay: number;
  dayPhase: FlowFestDayPhase;
  /** 0 at the start of the phase window, 1 at its end. */
  phaseProgress: number;
}

/**
 * The population clock is anchored to the visual moment so the sky and the
 * schedule can never disagree. Elapsed seconds move time forward inside that
 * moment's window; the phase itself changes when the story does.
 */
export function flowFestSimClock(
  moment: FlowFestMoment,
  elapsedSeconds: number
): FlowFestSimClock {
  const dayPhase = flowFestDayPhaseForMoment(moment);
  const window = FLOW_FEST_DAY_PHASE_WINDOWS[dayPhase];
  const span = window.endMinute - window.startMinute;
  const advanced =
    window.startMinute +
    Math.max(0, elapsedSeconds) * FLOW_FEST_SIM_MINUTES_PER_SECOND;
  const minuteOfDay = Math.min(advanced, window.endMinute - 0.0001);
  return {
    minuteOfDay,
    dayPhase,
    phaseProgress: Math.max(
      0,
      Math.min(1, (minuteOfDay - window.startMinute) / span)
    ),
  };
}

export function flowFestClockLabel(minuteOfDay: number): string {
  const wrapped = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export type FlowFestNpcRole =
  | "gate-greeter"
  | "camp-host"
  | "traveler"
  | "fire-dancer"
  | "wanderer";

export type FlowFestActivity =
  | "gate-greet"
  | "camp-settle"
  | "camp-social"
  | "gear-up"
  | "travel"
  | "gather"
  | "practice"
  | "watch-fire"
  | "join-fire"
  | "rest";

/** Activities whose people belong to the fire circle, not the walking layer. */
export const FLOW_FEST_FIRE_JAM_ACTIVITIES: ReadonlySet<FlowFestActivity> =
  new Set<FlowFestActivity>(["watch-fire", "join-fire"]);

export type FlowFestAnchorKind =
  | "gate"
  | "camp"
  | "parking"
  | "gathering"
  | "practice"
  | "fire";

export interface FlowFestPopulationAnchor {
  id: string;
  label: string;
  kind: FlowFestAnchorKind;
  x: number;
  z: number;
  /** Index into the corridor graph's clearing list, or -1. */
  clearingIndex: number;
  /**
   * False when no registered person leg reaches this anchor. The lower gate is
   * the real case: its zone sits 1.4 m outside the lower-tent circle and no leg
   * touches it, so its people stand and greet rather than pretending to walk a
   * corridor that does not exist.
   */
  routable: boolean;
}

export interface FlowFestPopulationSite {
  seed: string;
  graph: FlowFestCorridorGraph;
  anchors: FlowFestPopulationAnchor[];
  /** Anchor the fire circle occupies, used for fire-jam handoff. */
  fireAnchorId: string;
  groundY: (x: number, z: number) => number;
}

export interface FlowFestScheduleBlock {
  startMinute: number;
  anchorId: string;
  activity: FlowFestActivity;
}

export interface FlowFestNpc {
  id: string;
  displayName: string;
  avatarId: FlowFestFestivalAvatarId;
  role: FlowFestNpcRole;
  homeAnchorId: string;
  /** 0 keeps to themself, 1 stops for every conversation. */
  sociability: number;
  walkSpeedMetersPerSecond: number;
  schedule: FlowFestScheduleBlock[];
  seed: string;
}

const AVATAR_ROSTER: FlowFestFestivalAvatarId[] = [
  "ch01",
  "ch07",
  "ch12",
  "ch18",
  "ch21",
  "ch22",
  "ch24",
  "ch41",
  "ch42",
];

const NPC_NAMES = [
  "Wren",
  "Bo",
  "Sage",
  "Cass",
  "Juniper",
  "Rook",
  "Mira",
  "Dez",
  "Ash",
  "Poppy",
  "Kit",
  "Lark",
  "Nico",
  "Sol",
  "Wilder",
  "Fen",
  "Marlow",
  "Tam",
  "Rue",
  "Ozzy",
  "Sparrow",
  "Indigo",
  "Cleo",
  "Bram",
  "Delta",
  "Onyx",
  "Vale",
  "Hollis",
  "Wynn",
  "Zephyr",
  "Callum",
  "Nova",
  "Piper",
  "Ridge",
  "Sunny",
  "Thea",
  "Blaze",
  "Coriander",
  "Echo",
  "Fable",
];

function pick<T>(items: readonly T[], roll: number): T {
  return items[Math.min(items.length - 1, Math.floor(roll * items.length))]!;
}

function anchorsOfKind(
  site: FlowFestPopulationSite,
  kind: FlowFestAnchorKind
): FlowFestPopulationAnchor[] {
  return site.anchors.filter((anchor) => anchor.kind === kind);
}

function requireAnchor(
  site: FlowFestPopulationSite,
  id: string
): FlowFestPopulationAnchor {
  const anchor = site.anchors.find((candidate) => candidate.id === id);
  if (!anchor) {
    throw new Error(`Flow Fest population anchor is not registered: ${id}`);
  }
  return anchor;
}

/**
 * Place a block inside its phase with per-person jitter so migrations stagger
 * instead of everyone standing up on the same minute.
 */
function blockStart(
  phase: FlowFestDayPhase,
  fraction: number,
  jitter: number
): number {
  const window = FLOW_FEST_DAY_PHASE_WINDOWS[phase];
  const span = window.endMinute - window.startMinute;
  return (
    window.startMinute + span * Math.max(0, Math.min(0.96, fraction + jitter))
  );
}

function buildSchedule(
  role: FlowFestNpcRole,
  homeAnchorId: string,
  site: FlowFestPopulationSite,
  rng: () => number
): FlowFestScheduleBlock[] {
  const gathering = anchorsOfKind(site, "gathering");
  const practice = anchorsOfKind(site, "practice");
  const parking = anchorsOfKind(site, "parking");
  const gatheringId =
    gathering.length > 0 ? pick(gathering, rng()).id : homeAnchorId;
  const practiceId =
    practice.length > 0 ? pick(practice, rng()).id : gatheringId;
  const parkingId = parking.length > 0 ? pick(parking, rng()).id : homeAnchorId;
  const fireId = site.fireAnchorId;
  const jitter = () => (rng() - 0.5) * 0.22;
  const blocks: FlowFestScheduleBlock[] = [];
  const push = (
    phase: FlowFestDayPhase,
    fraction: number,
    anchorId: string,
    activity: FlowFestActivity
  ) => {
    blocks.push({
      startMinute: blockStart(phase, fraction, jitter()),
      anchorId,
      activity,
    });
  };

  if (role === "gate-greeter") {
    push("thursday-afternoon", 0, homeAnchorId, "gate-greet");
    push("dusk-migration", 0.05, homeAnchorId, "gate-greet");
    push("night-festival", 0.05, homeAnchorId, "gate-greet");
    push("late-drift-home", 0.1, homeAnchorId, "rest");
    return sortSchedule(blocks);
  }

  if (role === "camp-host") {
    push("thursday-afternoon", 0.05, homeAnchorId, "camp-settle");
    push("thursday-afternoon", 0.55, homeAnchorId, "camp-social");
    push("dusk-migration", 0.15, homeAnchorId, "gear-up");
    push("dusk-migration", 0.6, gatheringId, "gather");
    push("night-festival", 0.2, fireId, "watch-fire");
    push("late-drift-home", 0.25, homeAnchorId, "rest");
    return sortSchedule(blocks);
  }

  if (role === "traveler") {
    push("thursday-afternoon", 0.05, parkingId, "travel");
    push("thursday-afternoon", 0.35, homeAnchorId, "camp-settle");
    push("thursday-afternoon", 0.75, gatheringId, "gather");
    push("dusk-migration", 0.35, gatheringId, "gather");
    push("night-festival", 0.15, fireId, "watch-fire");
    push("late-drift-home", 0.2, homeAnchorId, "rest");
    return sortSchedule(blocks);
  }

  if (role === "fire-dancer") {
    push("thursday-afternoon", 0.2, homeAnchorId, "camp-settle");
    push("thursday-afternoon", 0.7, practiceId, "practice");
    push("dusk-migration", 0.25, practiceId, "practice");
    push("dusk-migration", 0.7, fireId, "join-fire");
    push("night-festival", 0.05, fireId, "join-fire");
    push("late-drift-home", 0.35, homeAnchorId, "rest");
    return sortSchedule(blocks);
  }

  push("thursday-afternoon", 0.15, gatheringId, "gather");
  push("thursday-afternoon", 0.6, practiceId, "practice");
  push("dusk-migration", 0.2, gatheringId, "gather");
  push("night-festival", 0.1, fireId, "watch-fire");
  push("night-festival", 0.7, gatheringId, "gather");
  push("late-drift-home", 0.3, homeAnchorId, "rest");
  return sortSchedule(blocks);
}

function sortSchedule(
  blocks: FlowFestScheduleBlock[]
): FlowFestScheduleBlock[] {
  return [...blocks].sort((a, b) => a.startMinute - b.startMinute);
}

/**
 * The block in force at a given minute. Before the first block the day has not
 * started for this person, so their first plan stands.
 */
export function resolveFlowFestScheduleBlock(
  schedule: ReadonlyArray<FlowFestScheduleBlock>,
  minuteOfDay: number
): FlowFestScheduleBlock {
  let current = schedule[0]!;
  for (const block of schedule) {
    if (block.startMinute <= minuteOfDay) current = block;
    else break;
  }
  return current;
}

export interface FlowFestPopulationOptions {
  /** Total identities in the world. */
  count?: number;
  /** Camp anchors people may call home, in preference order. */
  homeAnchorIds?: string[];
}

export function createFlowFestPopulation(
  site: FlowFestPopulationSite,
  options: FlowFestPopulationOptions = {}
): FlowFestNpc[] {
  const count = options.count ?? 38;
  const camps = anchorsOfKind(site, "camp");
  const gates = anchorsOfKind(site, "gate");
  const homes =
    options.homeAnchorIds?.map((id) => requireAnchor(site, id)) ?? camps;
  if (homes.length === 0) {
    throw new Error("Flow Fest population needs at least one camp anchor.");
  }

  const roleCycle: FlowFestNpcRole[] = [
    "traveler",
    "camp-host",
    "wanderer",
    "traveler",
    "fire-dancer",
    "camp-host",
    "wanderer",
    "traveler",
  ];

  const npcs: FlowFestNpc[] = [];
  for (let index = 0; index < count; index += 1) {
    const seed = childSeed(site.seed, `npc-${index}`);
    const rng = makeRng(seed);
    const isGateGreeter = gates.length > 0 && index < 3;
    const role: FlowFestNpcRole = isGateGreeter
      ? "gate-greeter"
      : roleCycle[index % roleCycle.length]!;
    const home = isGateGreeter
      ? gates[index % gates.length]!
      : homes[index % homes.length]!;
    const npc: FlowFestNpc = {
      id: `flow-fest-npc-${String(index).padStart(2, "0")}`,
      displayName: NPC_NAMES[index % NPC_NAMES.length]!,
      avatarId: AVATAR_ROSTER[index % AVATAR_ROSTER.length]!,
      role,
      homeAnchorId: home.id,
      sociability: 0.2 + rng() * 0.75,
      walkSpeedMetersPerSecond: 1.05 + rng() * 0.42,
      schedule: [],
      seed,
    };
    npc.schedule = buildSchedule(role, home.id, site, rng);
    npcs.push(npc);
  }
  return npcs;
}

export interface FlowFestPopulationAgentFrame {
  id: string;
  displayName: string;
  avatarId: FlowFestFestivalAvatarId;
  role: FlowFestNpcRole;
  x: number;
  y: number;
  z: number;
  facingAngle: number;
  isMoving: boolean;
  speedMetersPerSecond: number;
  activity: FlowFestActivity;
  /** The scheduled destination, even while an interrupt holds them. */
  anchorId: string;
  /** True while a utility interrupt has taken over from the schedule. */
  interrupted: boolean;
  /** True when the fire circle owns this person for the current phase. */
  atFireJam: boolean;
  /** False when no registered corridor reaches their destination. */
  routed: boolean;
}

export interface FlowFestPopulationFrame {
  minuteOfDay: number;
  dayPhase: FlowFestDayPhase;
  agents: FlowFestPopulationAgentFrame[];
  fireJamAttendeeCount: number;
  fireJamPerformerCount: number;
  travellingCount: number;
  interruptedCount: number;
  unroutableCount: number;
}

interface AgentState {
  npc: FlowFestNpc;
  x: number;
  z: number;
  facingAngle: number;
  speed: number;
  activity: FlowFestActivity;
  anchorId: string;
  routeAnchorId: string;
  path: FlowFestCorridorRouteStep[] | null;
  pathIndex: number;
  /** Metres per second the live path is walked at. */
  pathSpeed: number;
  routed: boolean;
  interruptUntilMinute: number;
  interruptFacing: number;
  nextInterruptCheckSeconds: number;
  /** Elapsed seconds after which a settled person may stroll to a new spot. */
  dwellUntilSeconds: number;
  /** Where they turn to once they have arrived; NaN once they are facing it. */
  settleFacing: number;
  /** Unit direction that breaks the tie when two people share one point. */
  biasX: number;
  biasZ: number;
  rng: () => number;
}

/**
 * Room a standing person keeps around them. Inside it people lean apart until
 * they have it; it is the difference between a crowd and a stack.
 */
const STANDING_SPACE_METERS = 1.1;
/**
 * Room a walker claims from someone standing. Narrower than standing space
 * because the registered person legs are 0.8 m wide and a walker has to get
 * past whoever is on one.
 */
const WALKING_SPACE_METERS = 0.7;
/**
 * Two walkers start leaning apart this far out. They close at a combined
 * walking pace, and the lean is capped at a few millimetres a frame, so they
 * need the head start to be at the corridor edges by the time they meet.
 */
const PASSING_SPACE_METERS = 1.2;
/** A walker falls in behind someone this close ahead in their lane. */
const FOLLOW_RANGE_METERS = 1.4;
/**
 * The lane widens from half a walking space at the walker to this, so someone
 * right in front counts and someone beside them does not.
 */
const FOLLOW_LANE_HALF_WIDTH_METERS = 0.6;
/** The gap a follower keeps: they slow inside it and speed up beyond it. */
const FOLLOW_GAP_METERS = 0.9;
/** How quickly a follower closes or opens the gap, per metre of error. */
const FOLLOW_GAP_SECONDS = 0.5;
/**
 * The slowest a walker goes while following or arriving. Nobody stops dead
 * for someone ahead of them; they creep, and the geometry resolves itself.
 */
const CREEP_FRACTION = 0.25;
/** Separation is a lean, never a step: the most it may move anyone. */
const SEPARATION_SPEED_METERS_PER_SECOND = 0.45;
/**
 * A walker steps sideways out of the way at this rate. Two people meeting on
 * a trail close at a combined walking pace, so they need the quicker step to
 * be at the trail edges by the time they pass.
 */
const SIDESTEP_SPEED_METERS_PER_SECOND = 0.9;
/** Someone this far behind a walker is not in their way. */
const BEHIND_METERS = 0.1;
/** Someone this close to dead ahead is treated as being on one fixed side. */
const DEAD_AHEAD_METERS = 0.05;
/**
 * A lean never takes anyone closer than this to the edge of registered
 * ground: the same 5 cm the coverage audit allows.
 */
const LEAN_COVERAGE_MARGIN_METERS = 0.05;
/** Closer than this two people count as one point and the tie-break applies. */
const COINCIDENT_METERS = 0.05;
const ARRIVAL_EASE_METERS = 2.2;
/**
 * How far from an anchor's registered point people settle. Everyone routes to
 * the point; nobody stands on it. Gatherings spread wide because Middle Earth
 * measured 35 by 28 m open; camps stay close because their dressing owns the
 * rest of the envelope.
 */
const SETTLE_RADIUS_METERS: Record<FlowFestAnchorKind, number> = {
  gate: 2.5,
  camp: 4,
  parking: 4,
  gathering: 8,
  practice: 3,
  fire: 3,
};
/** Real seconds a settled person stands before strolling to a new spot. */
const DWELL_MIN_SECONDS = 20;
const DWELL_SPAN_SECONDS = 50;
/** A stroll is a few steps to a new spot, not a lap of the field. */
const STROLL_MIN_METERS = 2;
const STROLL_MAX_METERS = 6;
/**
 * Slowest speed the gait still reads as walking. Below it the animator scales
 * the stride down until the person creeps.
 */
const STROLL_SPEED_FLOOR_METERS_PER_SECOND = 0.85;
const STROLL_SPEED_FRACTION = 0.75;
/** Radians per second a standing person pivots. */
const SETTLE_TURN_RATE = 1.2;
const INTERRUPT_TURN_RATE = 1.5;
/** Walking turns ease toward the path direction at this rate per second. */
const WALK_TURN_RATE = 5.5;
/** A conversation needs someone within earshot, not across a field. */
const CHAT_RANGE_METERS = 3.5;
const SOCIAL_FACING_RANGE_METERS = 3;
const SPOT_ATTEMPTS = 10;

function shortestAngleTo(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

interface LateralAllowance {
  fromX: number;
  fromZ: number;
  normalX: number;
  normalZ: number;
  allowanceMeters: number;
}

function pivotToward(state: AgentState, facing: number, maxStep: number): void {
  const gap = shortestAngleTo(state.facingAngle, facing);
  state.facingAngle += Math.max(-maxStep, Math.min(maxStep, gap));
}

export class FlowFestPopulationSimulation {
  readonly site: FlowFestPopulationSite;
  readonly npcs: FlowFestNpc[];

  private readonly states: AgentState[] = [];
  private readonly frameAgents: FlowFestPopulationAgentFrame[] = [];
  private readonly frameValue: FlowFestPopulationFrame;
  private readonly leanX: Float64Array;
  private readonly leanZ: Float64Array;
  private elapsedSeconds = 0;
  private readonly scratch = { x: 0, z: 0 };
  private readonly lateralScratch: LateralAllowance = {
    fromX: 0,
    fromZ: 0,
    normalX: 0,
    normalZ: 0,
    allowanceMeters: 0,
  };

  constructor(site: FlowFestPopulationSite, npcs: FlowFestNpc[]) {
    this.site = site;
    this.npcs = npcs;

    for (const npc of npcs) {
      const anchor = requireAnchor(site, npc.schedule[0]!.anchorId);
      const rng = makeRng(childSeed(npc.seed, "motion"));
      const biasAngle = rng() * Math.PI * 2;
      const state: AgentState = {
        npc,
        x: anchor.x,
        z: anchor.z,
        facingAngle: rng() * Math.PI * 2,
        speed: 0,
        activity: npc.schedule[0]!.activity,
        anchorId: anchor.id,
        routeAnchorId: anchor.id,
        path: null,
        pathIndex: 0,
        pathSpeed: npc.walkSpeedMetersPerSecond,
        routed: true,
        interruptUntilMinute: -1,
        interruptFacing: 0,
        nextInterruptCheckSeconds: rng() * 3,
        dwellUntilSeconds: rng() * DWELL_SPAN_SECONDS,
        settleFacing: Number.NaN,
        biasX: Math.cos(biasAngle),
        biasZ: Math.sin(biasAngle),
        rng,
      };
      const spot = this.pickSpot(state, anchor, anchor.x, anchor.z, 0);
      if (spot) {
        state.x = spot.x;
        state.z = spot.z;
      }
      this.states.push(state);
      this.frameAgents.push({
        id: npc.id,
        displayName: npc.displayName,
        avatarId: npc.avatarId,
        role: npc.role,
        x: state.x,
        y: site.groundY(state.x, state.z),
        z: state.z,
        facingAngle: state.facingAngle,
        isMoving: false,
        speedMetersPerSecond: 0,
        activity: state.activity,
        anchorId: state.anchorId,
        interrupted: false,
        atFireJam: FLOW_FEST_FIRE_JAM_ACTIVITIES.has(state.activity),
        routed: true,
      });
    }
    this.leanX = new Float64Array(npcs.length);
    this.leanZ = new Float64Array(npcs.length);

    this.frameValue = {
      minuteOfDay:
        FLOW_FEST_DAY_PHASE_WINDOWS["thursday-afternoon"].startMinute,
      dayPhase: "thursday-afternoon",
      agents: this.frameAgents,
      fireJamAttendeeCount: 0,
      fireJamPerformerCount: 0,
      travellingCount: 0,
      interruptedCount: 0,
      unroutableCount: 0,
    };
  }

  get frame(): FlowFestPopulationFrame {
    return this.frameValue;
  }

  /**
   * Run the world forward without rendering, so a phase the player joins
   * mid-stream starts where it would honestly be. This is simulated time, not a
   * pose: everyone walks the same corridors, just faster than the frame rate.
   * Interrupts are skipped — they are cosmetic and they draw on the seeded
   * stream. Separation runs, because it is a pure function of where people
   * stand and it is what keeps them out of each other on arrival.
   */
  warmStart(
    moment: FlowFestMoment,
    fromElapsedSeconds: number,
    toElapsedSeconds: number,
    stepSeconds = 0.25
  ): void {
    const span = Math.max(0, toElapsedSeconds - fromElapsedSeconds);
    const steps = Math.min(4000, Math.ceil(span / stepSeconds));
    const start = this.elapsedSeconds;
    for (let step = 0; step < steps; step += 1) {
      const clock = flowFestSimClock(
        moment,
        fromElapsedSeconds + step * stepSeconds
      );
      this.elapsedSeconds = start + Math.min(span, (step + 1) * stepSeconds);
      for (const state of this.states) {
        this.applySchedule(state, clock);
        this.integrate(state, stepSeconds, clock);
      }
      this.applySeparation(stepSeconds);
    }
    this.elapsedSeconds = start + span;
  }

  /**
   * Advance the world. `deltaSeconds` is real time; the clock carries sim time.
   * Deterministic: the same clock and delta sequence always reproduces the same
   * frame, whatever the wall clock says.
   */
  advance(
    clock: FlowFestSimClock,
    deltaSeconds: number
  ): FlowFestPopulationFrame {
    const delta = Math.max(0, Math.min(0.25, deltaSeconds));
    this.elapsedSeconds += delta;

    for (const state of this.states) {
      this.applySchedule(state, clock);
      this.considerInterrupt(state, clock);
      this.integrate(state, delta, clock);
    }
    this.applySeparation(delta);

    let fireJamAttendeeCount = 0;
    let fireJamPerformerCount = 0;
    let travellingCount = 0;
    let interruptedCount = 0;
    let unroutableCount = 0;

    for (let index = 0; index < this.states.length; index += 1) {
      const state = this.states[index]!;
      const agent = this.frameAgents[index]!;
      agent.x = state.x;
      agent.z = state.z;
      agent.y = this.site.groundY(state.x, state.z);
      agent.facingAngle = state.facingAngle;
      agent.isMoving = state.speed > 0.08;
      agent.speedMetersPerSecond = state.speed;
      // While a route is live the person is visibly walking there, whatever the
      // plan calls the destination.
      agent.activity = state.path ? "travel" : state.activity;
      agent.anchorId = state.anchorId;
      agent.interrupted = state.interruptUntilMinute > clock.minuteOfDay;
      // The fire circle only takes over once they have actually arrived, so the
      // walk to the fire stays visible instead of vanishing at the schedule
      // boundary.
      agent.atFireJam = this.isHandedToFire(state);
      agent.routed = state.routed;

      if (agent.atFireJam) {
        fireJamAttendeeCount += 1;
        if (state.activity === "join-fire") fireJamPerformerCount += 1;
      }
      if (agent.isMoving) travellingCount += 1;
      if (agent.interrupted) interruptedCount += 1;
      if (!state.routed) unroutableCount += 1;
    }

    this.frameValue.minuteOfDay = clock.minuteOfDay;
    this.frameValue.dayPhase = clock.dayPhase;
    this.frameValue.fireJamAttendeeCount = fireJamAttendeeCount;
    this.frameValue.fireJamPerformerCount = fireJamPerformerCount;
    this.frameValue.travellingCount = travellingCount;
    this.frameValue.interruptedCount = interruptedCount;
    this.frameValue.unroutableCount = unroutableCount;
    return this.frameValue;
  }

  private isHandedToFire(state: AgentState): boolean {
    return (
      state.path === null && FLOW_FEST_FIRE_JAM_ACTIVITIES.has(state.activity)
    );
  }

  private applySchedule(state: AgentState, clock: FlowFestSimClock): void {
    const block = resolveFlowFestScheduleBlock(
      state.npc.schedule,
      clock.minuteOfDay
    );
    state.activity = block.activity;
    if (state.anchorId === block.anchorId) return;
    state.anchorId = block.anchorId;
    this.routeTo(state, block.anchorId);
  }

  private routeTo(state: AgentState, anchorId: string): void {
    const anchor = requireAnchor(this.site, anchorId);
    state.routeAnchorId = anchorId;
    state.settleFacing = Number.NaN;
    if (!anchor.routable) {
      // No registered corridor reaches it. Stand where the plan last put them
      // rather than walking through canopy to keep a promise the site cannot
      // make.
      state.path = null;
      state.pathIndex = 0;
      state.routed = false;
      return;
    }
    const node = flowFestCorridorAnchorNode(this.site.graph, anchorId);
    const path = routeFlowFestCorridor(this.site.graph, state.x, state.z, node);
    if (path) {
      // Everyone routes to the registered point; nobody stands on it. The last
      // hop goes to a spot of their own inside the same envelope.
      const end = path[path.length - 1]!;
      const spot = this.pickSpot(state, anchor, end.x, end.z, 0);
      if (spot) {
        path.push({
          x: spot.x,
          z: spot.z,
          allowanceMeters: end.allowanceMeters,
          clearingIndex: end.clearingIndex,
        });
      }
    }
    state.path = path;
    state.pathIndex = 1;
    state.pathSpeed = state.npc.walkSpeedMetersPerSecond;
    state.routed = path !== null;
  }

  /**
   * A place of their own near an anchor: inside its envelope, inside
   * registered coverage, and reachable from `originX/Z` by a straight covered
   * hop. Candidates are seeded draws over the settle disc, so the same person
   * takes the same spot every run. Null when ten draws find nothing, in which
   * case the caller keeps the point it already had. `minimumHopMeters` turns a
   * settle into a stroll: a spot at least that far from where they stand.
   */
  private pickSpot(
    state: AgentState,
    anchor: FlowFestPopulationAnchor,
    originX: number,
    originZ: number,
    minimumHopMeters: number,
    maximumHopMeters = Number.POSITIVE_INFINITY
  ): { x: number; z: number } | null {
    const radius = SETTLE_RADIUS_METERS[anchor.kind];
    const clearing =
      anchor.clearingIndex >= 0
        ? this.site.graph.clearings[anchor.clearingIndex]
        : undefined;
    for (let attempt = 0; attempt < SPOT_ATTEMPTS; attempt += 1) {
      const angle = state.rng() * Math.PI * 2;
      const reach = radius * Math.sqrt(state.rng());
      let x = anchor.x + Math.cos(angle) * reach;
      let z = anchor.z + Math.sin(angle) * reach;
      if (clearing) {
        clampInsideFlowFestClearing(clearing, x, z, this.scratch, 1);
        x = this.scratch.x;
        z = this.scratch.z;
      }
      const hop = Math.hypot(x - originX, z - originZ);
      if (hop < minimumHopMeters || hop > maximumHopMeters) continue;
      if (!isFlowFestCorridorCovered(this.site.graph, x, z)) continue;
      if (!isFlowFestHopCovered(this.site.graph, originX, originZ, x, z)) {
        continue;
      }
      return { x, z };
    }
    return null;
  }

  private considerInterrupt(state: AgentState, clock: FlowFestSimClock): void {
    if (state.interruptUntilMinute > clock.minuteOfDay) return;
    if (this.elapsedSeconds < state.nextInterruptCheckSeconds) return;
    state.nextInterruptCheckSeconds = this.elapsedSeconds + 1 + state.rng() * 2;
    // People finish their walk before they stop for anything. Stopping
    // mid-corridor for every passer-by is what made the crowd stutter.
    if (state.path) return;
    // The circle owns whoever has reached the fire.
    if (FLOW_FEST_FIRE_JAM_ACTIVITIES.has(state.activity)) return;

    // Utility scoring over a handful of candidates. Continuing the plan is the
    // baseline; the alternatives have to beat it.
    const continueScore = 0.55;

    let watchScore = 0;
    let watchFacing = state.facingAngle;
    const fire = requireAnchor(this.site, this.site.fireAnchorId);
    const fireDistance = Math.hypot(state.x - fire.x, state.z - fire.z);
    if (fireDistance < 34 && clock.dayPhase !== "thursday-afternoon") {
      watchScore =
        0.35 +
        state.npc.sociability * 0.5 +
        Math.max(0, 1 - fireDistance / 34) * 0.4;
      watchFacing = Math.atan2(fire.x - state.x, fire.z - state.z);
    }

    let chatScore = 0;
    let chatFacing = state.facingAngle;
    let nearest = Number.POSITIVE_INFINITY;
    for (const other of this.states) {
      if (other === state) continue;
      const distance = Math.hypot(other.x - state.x, other.z - state.z);
      if (
        distance >= nearest ||
        distance > CHAT_RANGE_METERS ||
        distance < COINCIDENT_METERS
      ) {
        continue;
      }
      nearest = distance;
      chatFacing = Math.atan2(other.x - state.x, other.z - state.z);
    }
    if (Number.isFinite(nearest)) {
      chatScore = 0.3 + state.npc.sociability * 0.65 - nearest * 0.06;
    }

    const roll = state.rng();
    const best = Math.max(continueScore, watchScore * roll, chatScore * roll);
    if (best === continueScore) return;

    const holdMinutes = 0.4 + state.rng() * 1.6;
    state.interruptUntilMinute = clock.minuteOfDay + holdMinutes;
    state.interruptFacing =
      best === watchScore * roll ? watchFacing : chatFacing;
  }

  private integrate(
    state: AgentState,
    delta: number,
    clock: FlowFestSimClock
  ): void {
    if (state.interruptUntilMinute > clock.minuteOfDay) {
      state.speed = 0;
      pivotToward(state, state.interruptFacing, INTERRUPT_TURN_RATE * delta);
      return;
    }

    const path = state.path;
    if (!path || state.pathIndex >= path.length) {
      state.speed = 0;
      this.settle(state, delta);
      return;
    }

    const target = path[state.pathIndex]!;
    let remaining =
      Math.min(state.pathSpeed, this.leaderSpeed(state, target)) * delta;
    const finalStep = path[path.length - 1]!;
    const distanceToEnd = Math.hypot(
      finalStep.x - state.x,
      finalStep.z - state.z
    );
    if (distanceToEnd < ARRIVAL_EASE_METERS) {
      remaining *= Math.max(
        CREEP_FRACTION,
        distanceToEnd / ARRIVAL_EASE_METERS
      );
    }
    state.speed = delta > 0 ? remaining / delta : state.pathSpeed;

    while (remaining > 0 && state.pathIndex < path.length) {
      const target = path[state.pathIndex]!;
      const dx = target.x - state.x;
      const dz = target.z - state.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= Math.max(remaining, 0.02)) {
        state.x = target.x;
        state.z = target.z;
        remaining -= distance;
        state.pathIndex += 1;
        continue;
      }
      const step = remaining / distance;
      state.x += dx * step;
      state.z += dz * step;
      state.facingAngle +=
        shortestAngleTo(state.facingAngle, Math.atan2(dx, dz)) *
        Math.min(1, delta * WALK_TURN_RATE);
      remaining = 0;
    }

    if (state.pathIndex >= path.length) this.arrive(state);
  }

  /**
   * The speed that keeps a comfortable gap behind whoever is directly ahead
   * in this person's lane and heading the same way, or Infinity when nobody
   * is. Overtaking through someone is what a route-following crowd does by
   * default; falling in behind them is what people do.
   */
  private leaderSpeed(
    state: AgentState,
    target: FlowFestCorridorRouteStep
  ): number {
    let headingX = target.x - state.x;
    let headingZ = target.z - state.z;
    const headingLength = Math.hypot(headingX, headingZ);
    if (headingLength < 1e-6) return Number.POSITIVE_INFINITY;
    headingX /= headingLength;
    headingZ /= headingLength;
    let slowest = Number.POSITIVE_INFINITY;
    for (const peer of this.states) {
      if (peer === state || !peer.path || peer.pathIndex >= peer.path.length)
        continue;
      // Someone standing still is an obstacle for the separation pass, not a
      // leader: matching a stopped speed would stop this walker as well, and
      // two walkers meeting at a corner could then hold each other in place.
      if (peer.speed <= 0) continue;
      const relX = peer.x - state.x;
      const relZ = peer.z - state.z;
      const along = relX * headingX + relZ * headingZ;
      if (along <= 0 || along > FOLLOW_RANGE_METERS) continue;
      const lateral = Math.abs(relX * headingZ - relZ * headingX);
      const lane = Math.min(
        FOLLOW_LANE_HALF_WIDTH_METERS,
        WALKING_SPACE_METERS / 2 + along
      );
      if (lateral > lane) continue;
      const peerTarget = peer.path[peer.pathIndex]!;
      const peerHeadingX = peerTarget.x - peer.x;
      const peerHeadingZ = peerTarget.z - peer.z;
      const peerHeadingLength = Math.hypot(peerHeadingX, peerHeadingZ);
      if (peerHeadingLength < 1e-6) continue;
      const sameWay =
        (peerHeadingX * headingX + peerHeadingZ * headingZ) / peerHeadingLength;
      if (sameWay < 0.5) continue;
      const gapSpeed =
        peer.speed + (along - FOLLOW_GAP_METERS) / FOLLOW_GAP_SECONDS;
      if (gapSpeed < slowest) slowest = gapSpeed;
    }
    return Math.max(slowest, state.pathSpeed * CREEP_FRACTION);
  }

  private arrive(state: AgentState): void {
    state.path = null;
    state.pathIndex = 0;
    state.speed = 0;
    state.dwellUntilSeconds =
      this.elapsedSeconds +
      DWELL_MIN_SECONDS +
      state.rng() * DWELL_SPAN_SECONDS;
    state.settleFacing = this.socialFacing(state);
  }

  /** Whoever is nearest within earshot, or NaN when nobody is. */
  private socialFacing(state: AgentState): number {
    let nearest = SOCIAL_FACING_RANGE_METERS;
    let facing = Number.NaN;
    for (const other of this.states) {
      if (other === state) continue;
      const distance = Math.hypot(other.x - state.x, other.z - state.z);
      if (distance >= nearest || distance < COINCIDENT_METERS) continue;
      nearest = distance;
      facing = Math.atan2(other.x - state.x, other.z - state.z);
    }
    return facing;
  }

  /**
   * Standing still is the default. On arrival a person turns to whoever is
   * near, then stands. Inside an envelope the survey measured as open they
   * stroll to a new spot every so often; everywhere else they stay put, which
   * is honest about what is under the canopy there.
   */
  private settle(state: AgentState, delta: number): void {
    if (!Number.isNaN(state.settleFacing)) {
      if (
        Math.abs(shortestAngleTo(state.facingAngle, state.settleFacing)) < 0.02
      ) {
        state.settleFacing = Number.NaN;
      } else {
        pivotToward(state, state.settleFacing, SETTLE_TURN_RATE * delta);
      }
    }
    if (this.elapsedSeconds < state.dwellUntilSeconds) return;

    const anchor = this.site.anchors.find(
      (candidate) => candidate.id === state.routeAnchorId
    );
    const clearing =
      anchor && anchor.clearingIndex >= 0
        ? this.site.graph.clearings[anchor.clearingIndex]
        : undefined;
    if (
      !anchor ||
      clearing?.wanderPolicy !== "measured-open" ||
      FLOW_FEST_FIRE_JAM_ACTIVITIES.has(state.activity)
    ) {
      state.dwellUntilSeconds = Number.POSITIVE_INFINITY;
      return;
    }

    const spot = this.pickSpot(
      state,
      anchor,
      state.x,
      state.z,
      STROLL_MIN_METERS,
      STROLL_MAX_METERS
    );
    if (!spot) {
      state.dwellUntilSeconds =
        this.elapsedSeconds +
        DWELL_MIN_SECONDS +
        state.rng() * DWELL_SPAN_SECONDS;
      return;
    }
    state.path = [
      {
        x: state.x,
        z: state.z,
        allowanceMeters: 0,
        clearingIndex: anchor.clearingIndex,
      },
      {
        x: spot.x,
        z: spot.z,
        allowanceMeters: 0.9,
        clearingIndex: anchor.clearingIndex,
      },
    ];
    state.pathIndex = 1;
    state.pathSpeed = Math.max(
      STROLL_SPEED_FLOOR_METERS_PER_SECOND,
      state.npc.walkSpeedMetersPerSecond * STROLL_SPEED_FRACTION
    );
    state.settleFacing = Number.NaN;
  }

  /**
   * People lean away from anyone inside their space, a few millimetres a
   * frame, until they have it. Integrated into position rather than kept as an
   * offset, so the rendered person only ever moves continuously. Coverage is
   * exact: a lean that would leave the registered corridor is halved, then
   * dropped, never trimmed to a guess. At this speed dropping it is invisible.
   */
  private applySeparation(delta: number): void {
    const states = this.states;
    const count = states.length;
    const leanX = this.leanX;
    const leanZ = this.leanZ;
    for (let index = 0; index < count; index += 1) {
      leanX[index] = 0;
      leanZ[index] = 0;
      const state = states[index]!;
      if (this.isHandedToFire(state)) continue;
      const walking = state.path !== null;
      // A walker steps sideways out of the way rather than leaning straight
      // back from whoever is close: two people meeting head-on on a trail lean
      // along the trail otherwise, and walk through each other.
      let headingX = 0;
      let headingZ = 0;
      if (state.path && state.pathIndex < state.path.length) {
        const target = state.path[state.pathIndex]!;
        headingX = target.x - state.x;
        headingZ = target.z - state.z;
        const length = Math.hypot(headingX, headingZ);
        if (length > 1e-6) {
          headingX /= length;
          headingZ /= length;
        } else {
          headingX = 0;
          headingZ = 0;
        }
      }
      const sidestep = headingX !== 0 || headingZ !== 0;
      const normalX = -headingZ;
      const normalZ = headingX;
      let pushX = 0;
      let pushZ = 0;
      for (let other = 0; other < count; other += 1) {
        if (other === index) continue;
        const peer = states[other]!;
        if (this.isHandedToFire(peer)) continue;
        const peerWalking = peer.path !== null;
        const radius =
          walking && peerWalking
            ? PASSING_SPACE_METERS
            : walking || peerWalking
              ? (WALKING_SPACE_METERS + STANDING_SPACE_METERS) / 2
              : STANDING_SPACE_METERS;
        const dx = state.x - peer.x;
        const dz = state.z - peer.z;
        const squared = dx * dx + dz * dz;
        if (squared >= radius * radius) continue;
        const distance = Math.sqrt(squared);
        const overlap = 1 - distance / radius;
        if (distance < COINCIDENT_METERS) {
          pushX += state.biasX * overlap;
          pushZ += state.biasZ * overlap;
        } else if (sidestep) {
          // dx/dz point from the peer to this walker.
          const ahead = -(dx * headingX + dz * headingZ);
          if (ahead < -BEHIND_METERS) continue;
          let lateral = -(dx * normalX + dz * normalZ);
          // Everyone treats dead ahead as the same side, so two people
          // meeting head-on step to opposite edges instead of the same one.
          if (Math.abs(lateral) < DEAD_AHEAD_METERS)
            lateral = DEAD_AHEAD_METERS;
          const side = lateral > 0 ? -1 : 1;
          pushX += normalX * side * overlap;
          pushZ += normalZ * side * overlap;
        } else {
          pushX += (dx / distance) * overlap;
          pushZ += (dz / distance) * overlap;
        }
      }
      const magnitude = Math.hypot(pushX, pushZ);
      if (magnitude === 0) continue;
      const move =
        Math.min(1, magnitude) *
        (sidestep
          ? SIDESTEP_SPEED_METERS_PER_SECOND
          : SEPARATION_SPEED_METERS_PER_SECOND) *
        delta;
      leanX[index] = (pushX / magnitude) * move;
      leanZ[index] = (pushZ / magnitude) * move;
    }

    for (let index = 0; index < count; index += 1) {
      let moveX = leanX[index]!;
      let moveZ = leanZ[index]!;
      if (moveX === 0 && moveZ === 0) continue;
      const state = states[index]!;
      const lateral = this.lateralAllowance(state, this.lateralScratch);
      if (lateral) {
        // A walker leans only as far off the line of the current route step
        // as that step allows. Inside a clearing every point is covered, so
        // without this a crowd could lean a walker well off the trail line
        // and the trail out of the clearing would then pass beside them.
        const normalX = lateral.normalX;
        const normalZ = lateral.normalZ;
        const offsetNow =
          (state.x - lateral.fromX) * normalX +
          (state.z - lateral.fromZ) * normalZ;
        const offsetNext = offsetNow + moveX * normalX + moveZ * normalZ;
        const limit = lateral.allowanceMeters;
        const clamped = Math.max(-limit, Math.min(limit, offsetNext));
        if (clamped !== offsetNext) {
          const excess = offsetNext - clamped;
          moveX -= excess * normalX;
          moveZ -= excess * normalZ;
          if (Math.abs(moveX) < 1e-9 && Math.abs(moveZ) < 1e-9) continue;
        }
      }
      if (
        !isFlowFestCorridorCovered(
          this.site.graph,
          state.x + moveX,
          state.z + moveZ,
          LEAN_COVERAGE_MARGIN_METERS
        )
      ) {
        moveX *= 0.5;
        moveZ *= 0.5;
        if (
          !isFlowFestCorridorCovered(
            this.site.graph,
            state.x + moveX,
            state.z + moveZ,
            LEAN_COVERAGE_MARGIN_METERS
          )
        ) {
          continue;
        }
      }
      state.x += moveX;
      state.z += moveZ;
    }
  }

  /**
   * The line of the route step a walker is on and how far to either side of
   * it that step allows, or null when they are not walking a line.
   */
  private lateralAllowance(
    state: AgentState,
    out: LateralAllowance
  ): LateralAllowance | null {
    const path = state.path;
    if (!path || state.pathIndex < 1 || state.pathIndex >= path.length)
      return null;
    const from = path[state.pathIndex - 1]!;
    const target = path[state.pathIndex]!;
    const segmentX = target.x - from.x;
    const segmentZ = target.z - from.z;
    const length = Math.hypot(segmentX, segmentZ);
    if (length < 1e-6) return null;
    out.fromX = from.x;
    out.fromZ = from.z;
    out.normalX = -segmentZ / length;
    out.normalZ = segmentX / length;
    out.allowanceMeters = target.allowanceMeters;
    return out;
  }
}

/**
 * How many people the population layer is handing to the fire circle. The
 * existing sampler stays the owner of what happens inside the circle; this is
 * only the door count.
 */
export function flowFestFireJamAttendance(frame: FlowFestPopulationFrame): {
  spectators: number;
  performers: number;
} {
  return {
    spectators: Math.max(
      0,
      frame.fireJamAttendeeCount - frame.fireJamPerformerCount
    ),
    performers: frame.fireJamPerformerCount,
  };
}

/**
 * Compose the authored fire-circle layout down to the attendance the
 * population layer actually delivered. Pure: the base layout is never mutated,
 * and the fire rotation is re-indexed so its own audit still holds.
 */
export function composeFlowFestFireJamLayout(
  base: FlowFestFestivalCommunityLayout,
  attendance: { spectators: number; performers: number }
): FlowFestFestivalCommunityLayout {
  const spectators = base.people.filter(
    (person) => person.role === "spectator"
  );
  const fireRotation = base.people.filter(
    (person) => person.behavior === "fire-rotation"
  );
  const continuous = base.people.filter(
    (person) =>
      person.role !== "spectator" && person.behavior !== "fire-rotation"
  );

  const keptSpectators = spectators.slice(
    0,
    Math.max(0, Math.min(spectators.length, Math.round(attendance.spectators)))
  );
  // The circle needs enough dancers for a rotation to mean anything; below two
  // it reads as one person standing in a field, so the circle closes instead.
  const performerTarget = Math.min(
    fireRotation.length,
    Math.max(0, Math.round(attendance.performers))
  );
  const keptFire: FlowFestFestivalPersonPlacement[] =
    performerTarget >= 2
      ? fireRotation.slice(0, performerTarget).map((person, index) => ({
          ...person,
          rotationOrdinal: index,
        }))
      : [];
  const keptContinuous = keptFire.length > 0 ? continuous : [];

  const activeFire =
    keptFire.length === 0
      ? 0
      : Math.max(
          1,
          Math.min(keptFire.length - 1, base.activeFirePerformerCount)
        );

  const people = [...keptSpectators, ...keptFire, ...keptContinuous];
  return {
    ...base,
    people,
    spectatorCount: keptSpectators.length,
    performerCount: keptFire.length + keptContinuous.length,
    firePerformerCount: keptFire.length,
    activeFirePerformerCount: activeFire,
  };
}

export interface FlowFestPopulationRenderBudget {
  /** Full-rate animated avatars mounted at once, outside the fire circle. */
  maxVisible: number;
  /** Inside this radius an avatar keeps foot planting. */
  nearMeters: number;
  /** Beyond this radius an avatar is not mounted at all. */
  cullMeters: number;
}

/**
 * The fire circle already mounts up to 24 avatars at night, so the walking
 * layer gives ground back once the festival is lit.
 */
export function flowFestPopulationRenderBudget(
  dayPhase: FlowFestDayPhase
): FlowFestPopulationRenderBudget {
  switch (dayPhase) {
    case "thursday-afternoon":
      return { maxVisible: 16, nearMeters: 25, cullMeters: 110 };
    case "dusk-migration":
      return { maxVisible: 14, nearMeters: 25, cullMeters: 110 };
    case "night-festival":
      return { maxVisible: 8, nearMeters: 22, cullMeters: 70 };
    case "late-drift-home":
      return { maxVisible: 10, nearMeters: 22, cullMeters: 90 };
  }
}
