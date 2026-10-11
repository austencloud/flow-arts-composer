import type { FirstFireBlenderContract } from "#lib/features/museum/data/first-fire-blender-contract.js";
import type { FirstFireShrineId } from "#lib/features/museum/data/first-fire-procession-plan.js";
import {
  completeFirstFireGrowth,
  completedFirstFireShrines,
  createFirstFireProcessionState,
  enterFirstFireShrine,
  reachFirstFireOrbitZone,
  type FirstFireProcessionPhase,
  type FirstFireProcessionState,
} from "#lib/features/museum/data/first-fire-procession-state.js";

export const FIRST_FIRE_NEUTRAL_BLACKOUT_MS = 2200;
const ENTRY_PROXIMITY_METRES = 1.65;
/**
 * Zone gates as a fraction of a full lap, scaled to each court's authored
 * viewing sweep (240 degrees for the horseshoe). Scaling rather than fixing
 * the gates keeps a shorter arc completable.
 */
const ORBIT_ZONE_LAP_FRACTIONS = [25 / 360, 110 / 360, 195 / 360, 280 / 360] as const;

/**
 * How far the visitor must get from a finished court before its fire goes out.
 *
 * Not an arbitrary comfort number: the court key in FirstFireEmberDressing is a
 * PointLight with `distance={14}` and `decay={2}`, so at 14m it contributes
 * exactly nothing. That is the literal edge of "their light has reached you".
 * Inside it the performer is still lighting the visitor, so the fire stays up.
 *
 * The court outline is radius ~7 and the corridors run several metres past each
 * mouth, so crossing this threshold means the visitor has left the chamber and
 * walked away down the tunnel - not merely rounded the performer.
 */
export const FIRST_FIRE_COURT_LIGHT_REACH_METRES = 14;

export function firstFireOrbitZoneThresholds(
  orbitSweepDegrees: number
): number[] {
  const sweep = Math.min(360, Math.abs(orbitSweepDegrees));
  return ORBIT_ZONE_LAP_FRACTIONS.map((fraction) => fraction * sweep);
}

export interface FirstFireRuntimePosition {
  x: number;
  z: number;
}

export interface FirstFireGrayboxReviewState {
  procession: FirstFireProcessionState;
  orbitTravelDegrees: Record<FirstFireShrineId, number>;
  lastOrbitAngle: Record<FirstFireShrineId, number | null>;
  blackoutElapsedMs: number;
  /**
   * Latched per court once the visitor has walked out of that court's light.
   * A latch, not a live distance test: a finished performer burns down and
   * stays down. Walking back into the chamber must not relight them.
   */
  extinguished: Record<FirstFireShrineId, boolean>;
}

export type FirstFireFlameGroup = "field" | FirstFireShrineId;

export function createFirstFireGrayboxReviewState(): FirstFireGrayboxReviewState {
  return {
    procession: createFirstFireProcessionState(),
    orbitTravelDegrees: { dj: 0, ek: 0, fl: 0 },
    lastOrbitAngle: { dj: null, ek: null, fl: null },
    blackoutElapsedMs: 0,
    extinguished: { dj: false, ek: false, fl: false },
  };
}

export function activeFirstFireShrine(
  phase: FirstFireProcessionPhase
): FirstFireShrineId | null {
  if (phase === "dj-active") return "dj";
  if (phase === "ek-active") return "ek";
  if (phase === "fl-active") return "fl";
  return null;
}

export function displayedFirstFireShrine(
  phase: FirstFireProcessionPhase
): FirstFireShrineId | null {
  const active = activeFirstFireShrine(phase);
  if (active) return active;
  if (phase === "dj-complete") return "dj";
  if (phase === "ek-complete") return "ek";
  if (phase === "fire-extinguished") return "fl";
  return null;
}

/**
 * The court whose performer is still burning: the one being walked, or - once
 * that walk is done - the court the visitor has not yet left. Drives the hero
 * light and whether the performer keeps dancing, so a finished court does not
 * freeze and black out while the visitor is still standing in it.
 */
export function litFirstFireShrine(
  state: FirstFireGrayboxReviewState
): FirstFireShrineId | null {
  const phase = state.procession.phase;
  const active = activeFirstFireShrine(phase);
  if (active) return active;
  if (phase === "fire-extinguished" || phase === "growth-complete") return null;
  const completed = completedFirstFireShrines(state.procession);
  for (let index = completed.length - 1; index >= 0; index -= 1) {
    const shrineId = completed[index]!;
    if (!state.extinguished[shrineId]) return shrineId;
  }
  return null;
}

export function visibleFirstFireFlameGroups(
  state: FirstFireGrayboxReviewState
): ReadonlySet<FirstFireFlameGroup> {
  const phase = state.procession.phase;
  // The blackout before the Earth reveal is the authored beat: everything goes
  // out at once, distance included. That one is meant to be abrupt.
  if (phase === "fire-extinguished" || phase === "growth-complete") {
    return new Set();
  }
  const groups = new Set<FirstFireFlameGroup>(["field"]);
  if (phase === "approach" || phase === "dj-active") groups.add("dj");
  else if (phase === "dj-complete" || phase === "ek-active") groups.add("ek");
  else groups.add("fl");
  // A finished court keeps burning until the visitor has walked out of its
  // light. Two courts alight at once is the intended read on the way out.
  for (const shrineId of completedFirstFireShrines(state.procession)) {
    if (!state.extinguished[shrineId]) groups.add(shrineId);
  }
  return groups;
}

export function firstFirePhaseLabel(
  state: FirstFireGrayboxReviewState
): string {
  const phase = state.procession.phase;
  if (phase === "approach") return "Ember bridge crossed";
  if (phase === "dj-active")
    return `DJ orbit ${state.procession.orbitProgress.dj}/4`;
  if (phase === "dj-complete") return "DJ lane cooling to coals";
  if (phase === "ek-active")
    return `EK orbit ${state.procession.orbitProgress.ek}/4`;
  if (phase === "ek-complete") return "EK lane cooling to coals";
  if (phase === "fl-active")
    return `FL orbit ${state.procession.orbitProgress.fl}/4`;
  if (phase === "fire-extinguished") {
    const remaining = Math.max(
      0,
      FIRST_FIRE_NEUTRAL_BLACKOUT_MS - state.blackoutElapsedMs
    );
    return `Neutral blackout ${(remaining / 1000).toFixed(1)}s`;
  }
  return "Earth growth revealed";
}

function distanceToRuntimePoint(
  position: FirstFireRuntimePosition,
  point: { x: number; y: number }
): number {
  return Math.hypot(position.x - point.x, position.z + point.y);
}

function signedSmallestDegrees(from: number, to: number): number {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function updateActiveOrbit(
  state: FirstFireGrayboxReviewState,
  contract: FirstFireBlenderContract,
  position: FirstFireRuntimePosition,
  shrineId: FirstFireShrineId
): FirstFireGrayboxReviewState {
  const shrine = contract.shrines.find(
    (candidate) => candidate.id === shrineId
  );
  if (!shrine) return state;

  // Reaching the far mouth completes the court, whatever the accumulated
  // sweep says. The exit is on the other side of the performer, so a visitor
  // standing in it has been round. Without this the court could be left
  // unfinished, and every later court then stayed dark forever: no performer,
  // no fire, no way to recover short of a reload.
  const court = contract.courts.find(
    (candidate) => candidate.shrineId === shrineId
  );
  const mouthRadius = Math.max(
    ENTRY_PROXIMITY_METRES,
    (court?.throatWidth ?? 0) / 2
  );
  if (distanceToRuntimePoint(position, shrine.blenderExit) <= mouthRadius) {
    let procession = state.procession;
    for (let zoneIndex = 0; zoneIndex < 4; zoneIndex += 1) {
      procession = reachFirstFireOrbitZone(procession, shrineId, zoneIndex);
    }
    return procession === state.procession
      ? state
      : {
          ...state,
          procession,
          orbitTravelDegrees: {
            ...state.orbitTravelDegrees,
            [shrineId]: Math.abs(shrine.orbitSweepDegrees),
          },
        };
  }

  const centre = {
    x: shrine.blenderCentre.x,
    z: -shrine.blenderCentre.y,
  };
  const dx = position.x - centre.x;
  const dz = position.z - centre.z;
  const radius = Math.hypot(dx, dz);
  // Credit the walk anywhere in the court, not only on the painted ribbon.
  // A visitor who rounds the performer a metre wide is still looking at the
  // performer, and gating on the ribbon froze the court at incomplete, which
  // stranded every later court dark.
  const halfWidth = shrine.orbitWidth / 2 + 0.35;
  const onRibbon = Math.abs(radius - shrine.orbitRadius) <= halfWidth;
  const inCourt = radius > 0.75 && isInsideCourt(contract, position, shrineId);
  if (!onRibbon && !inCourt) return state;

  const angle = (Math.atan2(dz, dx) * 180) / Math.PI;
  const previousAngle = state.lastOrbitAngle[shrineId];
  if (previousAngle === null) {
    return {
      ...state,
      lastOrbitAngle: { ...state.lastOrbitAngle, [shrineId]: angle },
    };
  }

  const direction = Math.sign(shrine.orbitSweepDegrees);
  const thresholds = firstFireOrbitZoneThresholds(shrine.orbitSweepDegrees);
  const travelled = Math.max(
    0,
    Math.min(
      Math.min(360, Math.abs(shrine.orbitSweepDegrees)),
      state.orbitTravelDegrees[shrineId] +
        signedSmallestDegrees(previousAngle, angle) * direction
    )
  );
  let procession = state.procession;
  for (let zoneIndex = 0; zoneIndex < thresholds.length; zoneIndex += 1) {
    if (travelled >= thresholds[zoneIndex]!) {
      procession = reachFirstFireOrbitZone(procession, shrineId, zoneIndex);
    }
  }
  return {
    ...state,
    procession,
    orbitTravelDegrees: {
      ...state.orbitTravelDegrees,
      [shrineId]: travelled,
    },
    lastOrbitAngle: { ...state.lastOrbitAngle, [shrineId]: angle },
  };
}

/**
 * A court is entered by walking into it, not by clipping a point. Ray-cast
 * containment against the authored court outline is the honest test: a ball
 * around the entry locator is missed by any ordinary walk that takes the mouth
 * a metre off centre, which left EK and FL dark with no performer and no fire.
 */
function isInsideCourt(
  contract: FirstFireBlenderContract,
  position: FirstFireRuntimePosition,
  shrineId: FirstFireShrineId
): boolean {
  const court = contract.courts.find(
    (candidate) => candidate.shrineId === shrineId
  );
  if (!court || court.blenderOutline.length < 3) return false;
  let inside = false;
  const outline = court.blenderOutline;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    // Both indices stay inside the outline: i by the loop bound, j because it
    // trails i (starting at the closing vertex).
    const vertexA = outline[i]!;
    const vertexB = outline[j]!;
    const ax = vertexA.x;
    const az = -vertexA.y;
    const bx = vertexB.x;
    const bz = -vertexB.y;
    const straddles = az > position.z !== bz > position.z;
    if (!straddles) continue;
    const crossingX = ax + ((position.z - az) / (bz - az)) * (bx - ax);
    if (position.x < crossingX) inside = !inside;
  }
  return inside;
}

function enterNearbyShrine(
  state: FirstFireGrayboxReviewState,
  contract: FirstFireBlenderContract,
  position: FirstFireRuntimePosition,
  shrineId: FirstFireShrineId
): FirstFireGrayboxReviewState {
  const shrine = contract.shrines.find(
    (candidate) => candidate.id === shrineId
  );
  if (!shrine) return state;
  const court = contract.courts.find(
    (candidate) => candidate.shrineId === shrineId
  );
  // Half the authored throat, so crossing anywhere in the mouth counts.
  const mouthRadius = Math.max(
    ENTRY_PROXIMITY_METRES,
    (court?.throatWidth ?? 0) / 2
  );
  const atMouth =
    distanceToRuntimePoint(position, shrine.blenderEntry) <= mouthRadius;
  if (!atMouth && !isInsideCourt(contract, position, shrineId)) {
    return state;
  }
  const procession = enterFirstFireShrine(state.procession, shrineId);
  return procession === state.procession ? state : { ...state, procession };
}

/**
 * Puts out a finished court once the visitor is past the reach of its light.
 * Runs after the phase advance so the court the visitor has just completed is
 * measured against where they actually are, not where they were.
 */
function updateExtinguishLatch(
  state: FirstFireGrayboxReviewState,
  contract: FirstFireBlenderContract,
  position: FirstFireRuntimePosition
): FirstFireGrayboxReviewState {
  let extinguished = state.extinguished;
  for (const shrineId of completedFirstFireShrines(state.procession)) {
    if (extinguished[shrineId]) continue;
    const shrine = contract.shrines.find(
      (candidate) => candidate.id === shrineId
    );
    if (!shrine) continue;
    const distance = distanceToRuntimePoint(position, shrine.blenderCentre);
    if (distance <= FIRST_FIRE_COURT_LIGHT_REACH_METRES) continue;
    extinguished = { ...extinguished, [shrineId]: true };
  }
  return extinguished === state.extinguished ? state : { ...state, extinguished };
}

/**
 * Advances the canonical procession from first-person position. Local review
 * state only supplies the physical facts the canonical owner does not track:
 * accumulated orbit travel, blackout time, and which finished courts the
 * visitor has now walked away from.
 */
export function updateFirstFireGrayboxReview(
  state: FirstFireGrayboxReviewState,
  contract: FirstFireBlenderContract,
  position: FirstFireRuntimePosition,
  deltaMs: number
): FirstFireGrayboxReviewState {
  const phase = state.procession.phase;
  if (phase === "fire-extinguished") {
    const blackoutElapsedMs = Math.min(
      FIRST_FIRE_NEUTRAL_BLACKOUT_MS,
      state.blackoutElapsedMs + Math.max(0, deltaMs)
    );
    return {
      ...state,
      blackoutElapsedMs,
      procession:
        blackoutElapsedMs >= FIRST_FIRE_NEUTRAL_BLACKOUT_MS
          ? completeFirstFireGrowth(state.procession)
          : state.procession,
    };
  }
  if (phase === "growth-complete") return state;

  const active = activeFirstFireShrine(phase);
  let advanced = state;
  if (active) {
    advanced = updateActiveOrbit(state, contract, position, active);
  } else if (phase === "approach") {
    advanced = enterNearbyShrine(state, contract, position, "dj");
  } else if (phase === "dj-complete") {
    // No hub gate is needed: the carved S makes the next court physically
    // unreachable without walking out of the completed one, and the canonical
    // procession owner rejects out-of-order entry.
    advanced = enterNearbyShrine(state, contract, position, "ek");
  } else if (phase === "ek-complete") {
    advanced = enterNearbyShrine(state, contract, position, "fl");
  }

  return updateExtinguishLatch(advanced, contract, position);
}

function completeActiveShrineForProof(
  state: FirstFireGrayboxReviewState,
  shrineId: FirstFireShrineId
): FirstFireGrayboxReviewState {
  let procession = state.procession;
  for (let zoneIndex = 0; zoneIndex < 4; zoneIndex += 1) {
    procession = reachFirstFireOrbitZone(procession, shrineId, zoneIndex);
  }
  return {
    ...state,
    procession,
    orbitTravelDegrees: { ...state.orbitTravelDegrees, [shrineId]: 240 },
  };
}

/** A deterministic review shortcut; every transition still calls the canonical owner. */
export function advanceFirstFireGrayboxProof(
  state: FirstFireGrayboxReviewState
): FirstFireGrayboxReviewState {
  const phase = state.procession.phase;
  if (phase === "approach") {
    return {
      ...state,
      procession: enterFirstFireShrine(state.procession, "dj"),
    };
  }
  if (phase === "dj-active") return completeActiveShrineForProof(state, "dj");
  if (phase === "dj-complete") {
    return { ...state, procession: enterFirstFireShrine(state.procession, "ek") };
  }
  if (phase === "ek-active") return completeActiveShrineForProof(state, "ek");
  if (phase === "ek-complete") {
    return { ...state, procession: enterFirstFireShrine(state.procession, "fl") };
  }
  if (phase === "fl-active") return completeActiveShrineForProof(state, "fl");
  if (phase === "fire-extinguished") {
    return {
      ...state,
      blackoutElapsedMs: FIRST_FIRE_NEUTRAL_BLACKOUT_MS,
      procession: completeFirstFireGrowth(state.procession),
    };
  }
  return createFirstFireGrayboxReviewState();
}
