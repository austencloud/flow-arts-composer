import type { GridLocation } from "@tka/tka-types";

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const TAU = Math.PI * 2;
const QUARTER_TURN = Math.PI / 2;
const EIGHTH_TURN = Math.PI / 4;

export type ContactHandId = "left" | "right";
export type ContactDigit = "thumb" | "index" | "middle" | "ring" | "pinky";
export type ContactRegion = ContactDigit | "palm";

export interface ContactPoint {
  hand: ContactHandId;
  region: ContactRegion;
  position: [number, number, number];
}

export interface ContactBallPose {
  id: "left-a" | "left-b" | "right-a" | "right-b";
  hand: ContactHandId;
  position: [number, number, number];
  rotation: [number, number, number];
  supportMode: "rolling";
  contact: ContactPoint;
}

export type ContactFingerOpenness = Record<ContactDigit, number>;

export interface ContactHandPose {
  id: ContactHandId;
  position: [number, number, number];
  rotation: [number, number, number];
  fingerOpenness: ContactFingerOpenness;
  activeGridIndex: number;
}

export interface ContactMotionFrame {
  phase: number;
  sourceStepNumber: number;
  sourceStepCount: number;
  sourceLetter: string | null;
  palmWaypoint: number;
  hands: readonly [ContactHandPose, ContactHandPose];
  balls: readonly [
    ContactBallPose,
    ContactBallPose,
    ContactBallPose,
    ContactBallPose,
  ];
}

interface ContactMotionSegment {
  stepIndex: number;
  duration: number;
  startTime: number;
  endTime: number;
  letter: string | null;
  left: ContactArc;
  right: ContactArc;
}

interface ContactArc {
  start: GridLocation;
  end: GridLocation;
  startAngle: number;
  sweep: number;
}

export interface ContactPalmspinProfile {
  sequenceId: string;
  sequenceWord: string;
  totalDuration: number;
  sourceStepCount: number;
  segments: readonly ContactMotionSegment[];
}

export interface ContactTranslationIssue {
  code:
    | "empty-sequence"
    | "unsupported-location"
    | "unsupported-arc"
    | "disconnected-path"
    | "direction-reversal"
    | "open-loop";
  detail: string;
}

export type ContactProfileResult =
  | { status: "resolved"; profile: ContactPalmspinProfile }
  | { status: "unresolved"; issues: readonly ContactTranslationIssue[] };

export const CONTACT_BALL_RADIUS = 0.185;
export const CONTACT_SUPPORT_HEIGHT = 0.225;
export const CONTACT_PALM_X_OFFSET = 0.26;
export const CONTACT_PALM_Z_OFFSET = -0.96;

export const CONTACT_GRID_POINTS = [
  [0, 0.32],
  [0.23, 0.23],
  [0.32, 0],
  [0.23, -0.23],
  [0, -0.32],
  [-0.23, -0.23],
  [-0.32, 0],
  [-0.23, 0.23],
  [0, 0],
] as const;

const OUTER_LOCATION_ANGLE: Partial<Record<GridLocation, number>> = {
  n: 0,
  ne: EIGHTH_TURN,
  e: QUARTER_TURN,
  se: EIGHTH_TURN * 3,
  s: Math.PI,
  sw: EIGHTH_TURN * 5,
  w: EIGHTH_TURN * 6,
  nw: EIGHTH_TURN * 7,
};

const OUTER_LOCATION_INDEX: Partial<Record<GridLocation, number>> = {
  n: 0,
  ne: 1,
  e: 2,
  se: 3,
  s: 4,
  sw: 5,
  w: 6,
  nw: 7,
};

const LEFT_REGION_RING: readonly ContactRegion[] = [
  "middle",
  "index",
  "thumb",
  "palm",
  "palm",
  "pinky",
  "pinky",
  "ring",
];

const RIGHT_REGION_RING: readonly ContactRegion[] = [
  "middle",
  "ring",
  "pinky",
  "palm",
  "palm",
  "thumb",
  "thumb",
  "index",
];

function normalizePhase(phase: number): number {
  const wrapped = phase % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function signedShortestSweep(start: number, end: number): number {
  let sweep = (end - start) % TAU;
  if (sweep > Math.PI) sweep -= TAU;
  if (sweep <= -Math.PI) sweep += TAU;
  return sweep;
}

function getOuterAngle(location: GridLocation): number | null {
  return OUTER_LOCATION_ANGLE[location] ?? null;
}

function buildArc(
  hand: ContactHandId,
  stepNumber: number,
  start: GridLocation,
  end: GridLocation,
  issues: ContactTranslationIssue[]
): ContactArc | null {
  const startAngle = getOuterAngle(start);
  const endAngle = getOuterAngle(end);
  if (startAngle === null || endAngle === null) {
    issues.push({
      code: "unsupported-location",
      detail: `${hand} step ${stepNumber} uses ${start} → ${end}; the palmspin proof accepts only the eight outer locations`,
    });
    return null;
  }

  const sweep = signedShortestSweep(startAngle, endAngle);
  const magnitude = Math.abs(sweep);
  if (
    Math.abs(magnitude - EIGHTH_TURN) > 0.0001 &&
    Math.abs(magnitude - QUARTER_TURN) > 0.0001
  ) {
    issues.push({
      code: "unsupported-arc",
      detail: `${hand} step ${stepNumber} requests a ${((magnitude * 180) / Math.PI).toFixed(0)}° palm arc`,
    });
    return null;
  }

  return { start, end, startAngle, sweep };
}

function getMotionLocations(
  sequence: SequenceData,
  stepIndex: number,
  hand: ContactHandId
) {
  const motion = sequence.steps[stepIndex]?.motions[hand];
  return motion
    ? { start: motion.startLocation, end: motion.endLocation }
    : null;
}

/**
 * Converts one real TKA hand-path LOOP into a constrained two-ball palmspin.
 * Unsupported paths stop at the translation boundary instead of becoming a
 * decorative orbit that merely happens to share the sequence name.
 */
export function buildContactPalmspinProfile(
  sequence: SequenceData
): ContactProfileResult {
  if (sequence.steps.length === 0) {
    return {
      status: "unresolved",
      issues: [
        { code: "empty-sequence", detail: "The source sequence has no steps" },
      ],
    };
  }

  const issues: ContactTranslationIssue[] = [];
  const segments: ContactMotionSegment[] = [];
  const directions: Partial<Record<ContactHandId, number>> = {};
  let elapsed = 0;

  for (let index = 0; index < sequence.steps.length; index += 1) {
    const step = sequence.steps[index];
    const leftLocations = getMotionLocations(sequence, index, "left");
    const rightLocations = getMotionLocations(sequence, index, "right");
    if (!step || !leftLocations || !rightLocations) continue;

    const left = buildArc(
      "left",
      index + 1,
      leftLocations.start,
      leftLocations.end,
      issues
    );
    const right = buildArc(
      "right",
      index + 1,
      rightLocations.start,
      rightLocations.end,
      issues
    );
    if (!left || !right) continue;

    for (const [hand, arc] of [
      ["left", left],
      ["right", right],
    ] as const) {
      const previous = getMotionLocations(sequence, index - 1, hand);
      if (index > 0 && previous?.end !== arc.start) {
        issues.push({
          code: "disconnected-path",
          detail: `${hand} path breaks before step ${index + 1}`,
        });
      }
      const direction = Math.sign(arc.sweep);
      if (directions[hand] !== undefined && directions[hand] !== direction) {
        issues.push({
          code: "direction-reversal",
          detail: `${hand} path reverses direction at step ${index + 1}`,
        });
      }
      directions[hand] = direction;
    }

    const duration = Math.max(1, Number(step.duration) || 1);
    segments.push({
      stepIndex: index,
      duration,
      startTime: elapsed,
      endTime: elapsed + duration,
      letter: step.letter,
      left,
      right,
    });
    elapsed += duration;
  }

  for (const hand of ["left", "right"] as const) {
    const first = getMotionLocations(sequence, 0, hand);
    const last = getMotionLocations(sequence, sequence.steps.length - 1, hand);
    if (first && last && last.end !== first.start) {
      issues.push({
        code: "open-loop",
        detail: `${hand} path ends at ${last.end} instead of ${first.start}`,
      });
    }
  }

  if (issues.length > 0 || segments.length !== sequence.steps.length) {
    return { status: "unresolved", issues };
  }

  return {
    status: "resolved",
    profile: {
      sequenceId: sequence.id,
      sequenceWord: sequence.word,
      totalDuration: elapsed,
      sourceStepCount: sequence.steps.length,
      segments,
    },
  };
}

function sampleFingerOpenness(
  activeRegions: readonly ContactRegion[]
): ContactFingerOpenness {
  const openness: ContactFingerOpenness = {
    thumb: 0.8,
    index: 0.84,
    middle: 0.86,
    ring: 0.84,
    pinky: 0.8,
  };
  for (const region of activeRegions) {
    if (region !== "palm") openness[region] = 0.68;
  }
  return openness;
}

function sampleHand(
  id: ContactHandId,
  activeGridIndex: number,
  regions: readonly ContactRegion[],
  angle: number
): ContactHandPose {
  const isLeft = id === "left";
  const direction = isLeft ? 1 : -1;
  return {
    id,
    position: [isLeft ? -0.82 : 0.82, 0, 0.42],
    rotation: [
      -0.04 + Math.cos(angle) * 0.015,
      direction * Math.sin(angle) * 0.025,
      direction * Math.sin(angle) * 0.035,
    ],
    fingerOpenness: sampleFingerOpenness(regions),
    activeGridIndex,
  };
}

function samplePair(
  side: ContactHandId,
  hand: ContactHandPose,
  angle: number,
  regions: readonly ContactRegion[]
): readonly [ContactBallPose, ContactBallPose] {
  const direction = side === "left" ? 1 : -1;
  const pairCenterX =
    hand.position[0] +
    (side === "left" ? -CONTACT_PALM_X_OFFSET : CONTACT_PALM_X_OFFSET);
  const pairCenterZ = hand.position[2] + CONTACT_PALM_Z_OFFSET;
  const offsetX = Math.sin(angle) * CONTACT_BALL_RADIUS;
  const offsetZ = Math.cos(angle) * CONTACT_BALL_RADIUS;

  const makePose = (suffix: "a" | "b", sign: -1 | 1): ContactBallPose => {
    const position = [
      pairCenterX + offsetX * sign,
      CONTACT_SUPPORT_HEIGHT + CONTACT_BALL_RADIUS,
      pairCenterZ + offsetZ * sign,
    ] as [number, number, number];
    return {
      id: `${side}-${suffix}`,
      hand: side,
      position,
      rotation: [direction * angle, angle * 0.7 + sign * Math.PI, angle * 0.45],
      supportMode: "rolling",
      contact: {
        hand: hand.id,
        region: regions[sign === -1 ? 0 : 1] ?? "palm",
        position: [position[0], CONTACT_SUPPORT_HEIGHT, position[2]],
      },
    };
  };

  return [makePose("a", -1), makePose("b", 1)];
}

function sampleArc(arc: ContactArc, localPhase: number): number {
  return arc.startAngle + arc.sweep * localPhase;
}

function sampleRegionPair(
  hand: ContactHandId,
  angle: number
): readonly [ContactRegion, ContactRegion] {
  const ring = hand === "left" ? LEFT_REGION_RING : RIGHT_REGION_RING;
  const rawIndex = Math.round(normalizePhase(angle / TAU) * 8) % 8;
  const adjacentIndex = (rawIndex + (hand === "left" ? 1 : 7)) % 8;
  return [ring[rawIndex] ?? "palm", ring[adjacentIndex] ?? "palm"];
}

function sampleGridIndex(angle: number): number {
  const rawIndex = Math.round(normalizePhase(angle / TAU) * 8) % 8;
  return rawIndex;
}

export function sampleTwoBallPalmspin(
  profile: ContactPalmspinProfile,
  phaseInput: number
): ContactMotionFrame {
  const phase = normalizePhase(phaseInput);
  const timeline = phase * profile.totalDuration;
  const segment =
    profile.segments.find((candidate) => timeline < candidate.endTime) ??
    profile.segments.at(-1);
  if (!segment) throw new Error("Contact palmspin profile has no segments");

  const localPhase = Math.min(
    1,
    Math.max(0, (timeline - segment.startTime) / segment.duration)
  );
  const leftAngle = sampleArc(segment.left, localPhase);
  const rightAngle = sampleArc(segment.right, localPhase);
  const leftRegions = sampleRegionPair("left", leftAngle);
  const rightRegions = sampleRegionPair("right", rightAngle);
  const leftGridIndex = sampleGridIndex(leftAngle);
  const rightGridIndex = sampleGridIndex(rightAngle);
  const leftHand = sampleHand(
    "left",
    leftGridIndex,
    leftRegions,
    leftAngle
  );
  const rightHand = sampleHand("right", rightGridIndex, rightRegions, rightAngle);
  const leftPair = samplePair("left", leftHand, leftAngle, leftRegions);
  const rightPair = samplePair("right", rightHand, rightAngle, rightRegions);

  return {
    phase,
    sourceStepNumber: segment.stepIndex + 1,
    sourceStepCount: profile.sourceStepCount,
    sourceLetter: segment.letter,
    palmWaypoint: leftGridIndex + 1,
    hands: [leftHand, rightHand],
    balls: [leftPair[0], leftPair[1], rightPair[0], rightPair[1]],
  };
}

export interface ContactFrameIssue {
  code:
    | "ball-count"
    | "pair-separation"
    | "missing-contact"
    | "support-gap"
    | "support-mode";
  detail: string;
}

export function inspectContactFrame(
  frame: ContactMotionFrame
): ContactFrameIssue[] {
  const issues: ContactFrameIssue[] = [];
  if (frame.balls.length !== 4) {
    issues.push({
      code: "ball-count",
      detail: `Expected four balls, received ${frame.balls.length}`,
    });
  }

  for (const hand of ["left", "right"] as const) {
    const pair = frame.balls.filter((ball) => ball.hand === hand);
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    if (!a || !b) continue;
    const distance = Math.hypot(
      a.position[0] - b.position[0],
      a.position[1] - b.position[1],
      a.position[2] - b.position[2]
    );
    const expected = CONTACT_BALL_RADIUS * 2;
    if (Math.abs(distance - expected) > 0.001) {
      issues.push({
        code: "pair-separation",
        detail: `${hand} pair separation ${distance.toFixed(3)} differs from ${expected.toFixed(3)}`,
      });
    }
  }

  for (const ball of frame.balls) {
    if (!ball.contact.region) {
      issues.push({
        code: "missing-contact",
        detail: `${ball.id} has no support region`,
      });
    }
    const bottom = ball.position[1] - CONTACT_BALL_RADIUS;
    if (Math.abs(bottom - ball.contact.position[1]) > 0.001) {
      issues.push({
        code: "support-gap",
        detail: `${ball.id} is not resting on its declared support point`,
      });
    }
    if (ball.supportMode !== "rolling") {
      issues.push({
        code: "support-mode",
        detail: `${ball.id} is not marked as rolling contact`,
      });
    }
  }

  return issues;
}

export function getGridIndex(location: GridLocation): number | null {
  return OUTER_LOCATION_INDEX[location] ?? null;
}
