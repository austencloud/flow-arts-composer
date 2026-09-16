/**
 * Shared data derivation for card back variants.
 * Extracts LOOP detection, level info, sequence anatomy, and labels
 * so each visual variant doesn't duplicate this logic.
 */

import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { explainLOOP } from "../../services/loop-explainer";
import type { LOOPExplanation } from "../../services/types";
import type { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { DIFFICULTY_LEVELS } from "$lib/shared/config/difficulty-styles";
import type {
  Period} from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  LOOP_TYPE_LABELS,
  ROTATED_LOOP_TYPES
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { TND_TURNS_RATIO_MAP } from "../../domain/tnd-element";
import { getReversalPattern } from "../../domain/reversal-patterns";
import { matchReversalPatternId } from "../../domain/reversal-matcher";
import { calculateDifficultyLevel } from "$lib/shared/browse/services/sequence-difficulty-calculator";

// The anatomy grid shows which elements appear in the sequence.
// Each field is a set of string values; the card renders present
// values as lit pills and absent values as grayed-out pills.
export interface SequenceAnatomy {
  placements: Set<string>;      // "alpha" | "beta" | "gamma"
  motions: Set<string>;         // "shift" | "dash" | "static"
  rotations: Set<string>;       // "cw" | "ccw" | "none"
  orientations: Set<string>;    // "in" | "out" | "clock" | "counter"
  turns: Set<string>;           // "0" | "0.5" | "1" | "1.5" | "2" | "2.5" | "3"
}

export interface StartPlacementInfo {
  group: string | null;
  leftLocation: string | null;
  rightLocation: string | null;
  gridMode: "box" | "diamond" | "mixed";
}

export interface LevelBadgeData {
  number: number;
  name: string;
  detail: string;
  reason: string;
  gradient: string;
  textColor: string;
}

export interface TurnGlyphEntry {
  readonly left: number;
  readonly right: number;
  readonly leftFloat?: boolean;
  readonly rightFloat?: boolean;
}

export interface CardBackData {
  word: string;
  stepCount: number;
  level: LevelBadgeData;
  anatomy: SequenceAnatomy;
  hasLoop: boolean;
  loopComponents: Set<LOOPComponent>;
  /** Period for the rotated component, when ROTATED is active.
   *  Lets the front card pick fa-rotate (halved) vs fa-arrows-spin (quartered). */
  rotationPeriod: Period | undefined;
  loopLabel: string | null;
  loopExplanation: LOOPExplanation | null;
  sliceName: string | null;
  sliceDetail: string | null;
  isRotated: boolean;
  /** Starting placement info: group, hand locations, and grid mode */
  startPlacement: StartPlacementInfo | null;
  /** TnD turn ratio derived from sequence motions, e.g. "3:1" */
  tndRatio: string | null;
  /** Period-compressed turn pattern entries for the barter glyph */
  turnGlyphEntries: TurnGlyphEntry[];
  /** Compact turn label, e.g. "0T", "1T", "½T", "FL", or "0-1T" for mixed */
  turnLabel: string;
  /** Start placement descriptor, e.g. "DIAMOND · γ" or "BOX · α" */
  startPlacementLabel: string | null;
  /** Reversal pattern sequence string for the barter glyph */
  reversalSequence: string;
  /** Reversal pattern period (columns to display) */
  reversalPeriod: number;
  /** Human label for the reversal pattern, e.g. "continuous", "alternating" */
  reversalLabel: string;
  /** Raw hand-path family string ("+"-separated), e.g. "Shift+Static+Dash+Static" */
  handPathFamily: string | null;
  /** TKA deck designation, e.g. "Halved Rotated 0T Continuous Diamond" */
  tkaDesignation: string | null;
  /** TnD deck designation, e.g. "TnD Split-Same 1:1" */
  tndDesignation: string | null;
}

// Level badge definitions sourced from the canonical difficulty-styles.ts
const LEVEL_NAMES: Record<number, { name: string; detail: string }> = {
  1: { name: "Base Motions", detail: "" },
  2: { name: "Whole Turns", detail: "" },
  3: { name: "Half Turns, Floats", detail: "" },
};

const LEVEL_BADGES: Record<number, Omit<LevelBadgeData, "reason">> = Object.fromEntries(
  [1, 2, 3].map((num) => {
    const style = DIFFICULTY_LEVELS[num]!;
    const meta = LEVEL_NAMES[num]!;
    return [num, {
      number: num,
      name: meta.name,
      detail: meta.detail,
      gradient: style.cssBg,
      textColor: style.text,
    }];
  })
);

// Derive the "why this level" reason from the anatomy
function deriveLevelReason(level: number, anatomy: SequenceAnatomy): string {
  if (level >= 3) {
    const hasHalfTurns = ["0.5", "1.5", "2.5"].some((t) => anatomy.turns.has(t));
    const hasFloat = anatomy.motions.has("float");
    const hasClockCounter = anatomy.orientations.has("clock") || anatomy.orientations.has("counter");
    const reasons: string[] = [];
    if (hasHalfTurns) reasons.push("half-turn values");
    if (hasFloat) reasons.push("float");
    if (hasClockCounter) reasons.push("clock/counter orientations");
    return reasons.length > 0
      ? `Contains ${reasons.join(", ")}`
      : "Level 3 sequence";
  }
  if (level >= 2) {
    const wholeTurns = ["1", "2", "3"].filter((t) => anatomy.turns.has(t));
    return wholeTurns.length > 0
      ? `Contains ${wholeTurns.map((t) => t + "-turn").join(", ")} motions`
      : "Level 2 sequence";
  }
  return "All motions at 0 turns";
}

// Extract the anatomy by scanning every step's motion data
function deriveAnatomy(sequence: SequenceData): SequenceAnatomy {
  const placements = new Set<string>();
  const motions = new Set<string>();
  const rotations = new Set<string>();
  const orientations = new Set<string>();
  const turns = new Set<string>();

  // Helper to classify placement strings like "alpha1", "beta5", "gamma13"
  function addPlacement(placement: string | null | undefined) {
    if (!placement) return;
    if (placement.startsWith("alpha")) placements.add("alpha");
    else if (placement.startsWith("beta")) placements.add("beta");
    else if (placement.startsWith("gamma")) placements.add("gamma");
  }

  // Include start placement
  if (sequence.startPlacement) {
    const sp = sequence.startPlacement;
    addPlacement(sp.gridPlacement as string | undefined);

    // Orientations from start placement motions (invisible placeholder = hand
    // not really there under the both-required Step shape)
    for (const motion of Object.values(sp.motions ?? {})) {
      if (!isVisibleMotion(motion)) continue;
      addOrientation(motion.startOrientation, orientations);
    }
  }

  for (const step of sequence.steps ?? []) {
    addPlacement(step.startPlacement as string | undefined);
    addPlacement(step.endPlacement as string | undefined);

    for (const motion of Object.values(step.motions ?? {})) {
      if (!isVisibleMotion(motion)) continue;

      // Motion type: pro and anti are both "shift"
      const mt = motion.motionType;
      if (mt === "pro" || mt === "anti") motions.add("shift");
      else if (mt === "dash") motions.add("dash");
      else if (mt === "static") motions.add("static");
      else if (mt === "float") motions.add("float");

      // Rotation direction
      const rd = motion.rotationDirection;
      if (rd === "cw") rotations.add("cw");
      else if (rd === "ccw") rotations.add("ccw");
      else if (rd === "noRotation") rotations.add("none");

      // Orientations
      addOrientation(motion.startOrientation, orientations);
      addOrientation(motion.endOrientation, orientations);

      // Turns
      const t = motion.turns;
      if (t === "fl") {
        motions.add("float");
      } else if (typeof t === "number") {
        turns.add(String(t));
      }
    }
  }

  return { placements, motions, rotations, orientations, turns };
}

function addOrientation(o: string | null | undefined, set: Set<string>) {
  if (!o) return;
  if (o === "in") set.add("in");
  else if (o === "out") set.add("out");
  else if (o === "clock" || o.startsWith("clock")) set.add("clock");
  else if (o === "counter" || o.startsWith("counter")) set.add("counter");
}

/**
 * Derive the starting placement group from any available source:
 * explicit field, start placement's grid placement, or first step.
 */
const PLACEMENT_GROUPS = ["alpha", "beta", "gamma", "zeta", "eta", "tau", "terra"];

function extractGroup(placementString: string | null | undefined): string | null {
  if (!placementString) return null;
  const placement = String(placementString);
  for (const group of PLACEMENT_GROUPS) {
    if (placement.startsWith(group)) return group;
  }
  return null;
}

/**
 * Derive the starting placement group from any available source:
 * explicit field, start placement data, or first step.
 */
function _deriveStartPlacementGroup(sequence: SequenceData): string | null {

  // Explicit field (most reliable when present)
  if (sequence.startingPlacementGroup) return sequence.startingPlacementGroup;

  // From StartPlacementData - try gridPlacement, endPlacement, startPlacement
  const sp = sequence.startPlacement ?? sequence.startingPlacement;
  if (sp) {
    const fromGrid = extractGroup(sp.gridPlacement as string | undefined);
    if (fromGrid) return fromGrid;
    const fromEnd = extractGroup(sp.endPlacement as string | undefined);
    if (fromEnd) return fromEnd;
    const fromStart = extractGroup(sp.startPlacement as string | undefined);
    if (fromStart) return fromStart;
  }

  // From first step's startPlacement or endPlacement
  const first = sequence.steps?.[0];
  if (first) {
    const fromStepStart = extractGroup(first.startPlacement as string | undefined);
    if (fromStepStart) return fromStepStart;
    const fromStepEnd = extractGroup(first.endPlacement as string | undefined);
    if (fromStepEnd) return fromStepEnd;
  }

  // Derive from first step's motion start locations.
  // The start locations of step 1's motions = the end locations of the start placement.
  // From two hand locations we can determine the placement group:
  //   Alpha: hands opposite (S-N, E-W, NE-SW, etc.)
  //   Beta:  hands same location (S-S, N-N, etc.)
  //   Gamma: hands at right angles (S-E, S-W, N-E, N-W, etc.)
  const step1 = sequence.steps?.[0];
  const leftLoc = step1?.motions?.left?.startLocation;
  const rightLoc = step1?.motions?.right?.startLocation;
  if (leftLoc && rightLoc) {
    return deriveGroupFromLocations(leftLoc, rightLoc);
  }

  return null;
}

/** Determine placement group from two hand compass locations */
function deriveGroupFromLocations(left: string, right: string): string {
  if (left === right) return "beta";

  // Opposite pairs → alpha
  const OPPOSITES: Record<string, string> = {
    n: "s", s: "n", e: "w", w: "e",
    ne: "sw", sw: "ne", nw: "se", se: "nw",
  };
  if (OPPOSITES[left] === right) return "alpha";

  // Everything else is gamma (hands at non-opposite, non-same positions)
  return "gamma";
}

const CARDINAL = new Set(["n", "s", "e", "w"]);
const INTERCARDINAL = new Set(["ne", "se", "sw", "nw"]);

function deriveGridMode(left: string | null, right: string | null): "box" | "diamond" | "mixed" {
  if (!left || !right) return "diamond";
  const leftIsCardinal = CARDINAL.has(left);
  const rightIsCardinal = CARDINAL.has(right);
  const leftIsIntercardinal = INTERCARDINAL.has(left);
  const rightIsIntercardinal = INTERCARDINAL.has(right);

  if (leftIsCardinal && rightIsCardinal) return "diamond";
  if (leftIsIntercardinal && rightIsIntercardinal) return "box";
  return "mixed";
}

export function deriveStartPlacementInfo(locations: {
  leftLocation: string | null;
  rightLocation: string | null;
}): StartPlacementInfo {
  const { leftLocation, rightLocation } = locations;

  const group =
    leftLocation && rightLocation
      ? deriveGroupFromLocations(leftLocation, rightLocation)
      : null;

  return {
    group,
    leftLocation,
    rightLocation,
    gridMode: deriveGridMode(leftLocation, rightLocation),
  };
}

/**
 * Derive full starting placement info from a sequence, including
 * hand locations and grid mode for the mini-grid display.
 */
function deriveStartPlacement(sequence: SequenceData): StartPlacementInfo | null {
  const explicitGroup = sequence.startingPlacementGroup ?? null;

  let leftLocation: string | null = null;
  let rightLocation: string | null = null;

  const sp = sequence.startPlacement ?? sequence.startingPlacement;
  if (sp?.motions) {
    leftLocation = sp.motions.left?.endLocation ?? null;
    rightLocation = sp.motions.right?.endLocation ?? null;
  }

  if (!leftLocation || !rightLocation) {
    const step1 = sequence.steps?.[0];
    leftLocation = leftLocation ?? step1?.motions?.left?.startLocation ?? null;
    rightLocation = rightLocation ?? step1?.motions?.right?.startLocation ?? null;
  }

  if (!leftLocation && !rightLocation && !explicitGroup) return null;

  const info = deriveStartPlacementInfo({ leftLocation, rightLocation });

  if (explicitGroup) {
    return { ...info, group: explicitGroup };
  }

  return info;
}

/**
 * Derive the TnD ratio string from a sequence's motion turn values.
 * Only returns a ratio if ALL numeric turn values are uniform (same value).
 * Returns null for mixed turns (common in LOOP sequences where each beat
 * has different turn values, making a single ratio label misleading).
 */
export function deriveTnDRatio(sequence: SequenceData): string | null {
  let uniformValue: number | null = null;
  let hasTurns = false;

  for (const step of sequence.steps ?? []) {
    for (const motion of Object.values(step.motions ?? {})) {
      if (!isVisibleMotion(motion)) continue;
      const t = motion.turns;
      if (t === "fl" || typeof t !== "number") continue;
      hasTurns = true;

      if (uniformValue === null) {
        uniformValue = t;
      } else if (t !== uniformValue) {
        return null; // Mixed turns - ratio is meaningless
      }
    }
  }

  if (!hasTurns) return "1:1";

  const ratio = TND_TURNS_RATIO_MAP[uniformValue!];
  return ratio ?? null;
}

/**
 * Build the TKA deck designation string from sequence properties.
 *
 * When a hand-path family is available (deck-enumerated sequences),
 * the designation shows the type-combo (e.g., "Shift → Static → Dash → Shift")
 * since grid mode, turns, and reversal pattern are already communicated
 * by other card elements (pictograph, turn glyph, reversal glyph).
 *
 * Falls back to "{Halved|Quartered} {LoopType}" for non-deck sequences.
 */
function deriveTkaDesignation(
  sliceName: string | null,
  loopLabel: string | null,
  handPathFamily: string | null,
): string | null {
  if (handPathFamily) {
    return handPathFamily.replace(/\+/g, " → ");
  }

  if (!loopLabel) return null;
  const parts: string[] = [];
  if (sliceName) parts.push(sliceName);
  parts.push(loopLabel);
  return parts.join(" ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function deriveCardBackData(
  sequence: SequenceData,
  // Kept for call-site compatibility - the shared loop-display resolver
  // owns the SequenceData→SequenceEntry conversion internally now.
  _converter: unknown = null,
  _explainerUnused: unknown = null
): CardBackData {
  const steps = sequence.steps ?? [];
  const levelNum = steps.length > 0 ? calculateDifficultyLevel([...steps]) : (sequence.level ?? 1);
  const badge = LEVEL_BADGES[levelNum] ?? LEVEL_BADGES[1]!;
  const anatomy = deriveAnatomy(sequence);
  const reason = deriveLevelReason(levelNum, anatomy);

  // LOOP components come from the shared resolver so the back matches the
  // front card (and every other consumer). The resolver prefers live
  // detection from steps and falls back to the stored loopType when
  // detection can't run (short sequences, etc).
  const loopDisplay = resolveLoopDisplay(sequence);
  const loopComponents = loopDisplay.components;
  const rotationPeriod = loopDisplay.rotationPeriod;

  // Generate rich LOOP explanation
  let loopExplanation: LOOPExplanation | null = null;
  if (loopComponents.size > 0) {
    loopExplanation = explainLOOP(sequence, loopComponents);
  }

  const cycle = sequence.orientationCycleCount;

  // Derive turn glyph entries from actual motion data
  const turnGlyphEntries = deriveTurnGlyphEntries(sequence);

  // Derive reversal pattern glyph data
  const reversalPatternId = matchReversalPatternId(sequence.steps) ?? "continuous";
  const revPattern = getReversalPattern(reversalPatternId);
  const reversalSequence = revPattern?.sequence ?? "----";
  const reversalPeriod = revPattern?.period ?? 1;
  const reversalLabel = abbreviateReversalLabel(revPattern?.label ?? "Continuous");

  const loopLabel = sequence.loopType
    ? LOOP_TYPE_LABELS[sequence.loopType] ?? null
    : null;
  const sliceName = cycle === 4 ? "Quartered" : cycle === 2 ? "Halved" : null;
  const tndRatio = deriveTnDRatio(sequence);

  // Build deck designation strings for the card back content area
  const handPathFamily = (sequence.metadata?.handPathFamily as string) ?? null;
  const tkaDesignation = deriveTkaDesignation(
    sliceName, loopLabel, handPathFamily,
  );
  const tndDesignation = !handPathFamily && tndRatio ? `TnD ${tndRatio}` : null;

  const startPlacementInfo = deriveStartPlacement(sequence);
  const turnLabel = deriveTurnLabel(turnGlyphEntries);
  const startPlacementLabel = deriveStartPlacementLabel(startPlacementInfo);

  return {
    word: simplifyRepeatedWord(sequence.word ?? sequence.name ?? ""),
    stepCount: sequence.sequenceLength ?? sequence.steps?.length ?? 0,
    level: { ...badge, reason },
    anatomy,
    hasLoop: loopComponents.size > 0,
    loopComponents,
    rotationPeriod,
    loopLabel,
    loopExplanation,
    sliceName,
    sliceDetail:
      cycle === 4
        ? "4 reps, 90° each"
        : cycle === 2
          ? "2 reps, 180° each"
          : null,
    isRotated: sequence.loopType
      ? ROTATED_LOOP_TYPES.has(sequence.loopType)
      : false,
    startPlacement: startPlacementInfo,
    tndRatio,
    turnGlyphEntries,
    turnLabel,
    startPlacementLabel,
    reversalSequence,
    reversalPeriod,
    reversalLabel,
    handPathFamily,
    tkaDesignation,
    tndDesignation,
  };
}

const GREEK_SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ",
  zeta: "ζ", eta: "η", tau: "τ", terra: "⊕",
};

const REVERSAL_SHORT_LABELS: Record<string, string> = {
  "Continuous": "Cont.",
  "Book": "Book",
  "Red Book": "R Book",
  "Blue Book": "B Book",
  "Long Book": "L Book",
  "Alternating": "Alt.",
  "Solo 1": "Solo 1",
  "Solo 2": "Solo 2",
  "Solo 3": "Solo 3",
  "Dense Weave 1": "DW 1",
  "Dense Weave 2": "DW 2",
  "Dense Weave 3": "DW 3",
  "Sparse Weave 1": "SW 1",
  "Sparse Weave 2": "SW 2",
  "Sparse Weave 3": "SW 3",
};

function abbreviateReversalLabel(label: string): string {
  return REVERSAL_SHORT_LABELS[label] ?? label;
}

function deriveStartPlacementLabel(info: StartPlacementInfo | null): string | null {
  if (!info) return null;
  if (info.gridMode === "diamond") return "diamond";
  if (info.gridMode === "box") return "box";
  return null;
}

function formatTurnValue(v: number): string {
  if (v === 0.5) return "½";
  if (v === 1.5) return "1½";
  if (v === 2.5) return "2½";
  return String(v);
}

function deriveTurnLabel(entries: TurnGlyphEntry[]): string {
  const hasFloat = entries.some(e => e.leftFloat || e.rightFloat);
  const allFloat = entries.every(e => e.leftFloat && e.rightFloat);
  if (allFloat) return "FL";

  const values = new Set<number>();
  for (const e of entries) {
    if (!e.leftFloat) values.add(e.left);
    if (!e.rightFloat) values.add(e.right);
  }

  if (values.size === 0) return "0";
  if (values.size === 1) {
    const v = [...values][0]!;
    const label = formatTurnValue(v);
    return hasFloat ? `${label}+FL` : label;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const label = sorted.map(formatTurnValue).join("-");
  return hasFloat ? `${label}+FL` : label;
}

/**
 * Derive turn glyph entries from a sequence's motion data.
 * Each entry = one step with blue and red turn values.
 * Detects the repeating period and returns only one period.
 */
function deriveTurnGlyphEntries(sequence: SequenceData): TurnGlyphEntry[] {
  const steps = sequence.steps ?? [];
  if (steps.length === 0) return [{ left: 0, right: 0 }];

  const all: TurnGlyphEntry[] = steps.map((step) => {
    const leftT = step.motions?.left?.turns;
    const rightT = step.motions?.right?.turns;
    return {
      left: typeof leftT === "number" ? leftT : 0,
      right: typeof rightT === "number" ? rightT : 0,
      leftFloat: leftT === "fl",
      rightFloat: rightT === "fl",
    };
  });

  // Detect period: find the smallest repeating unit
  const period = detectPeriod(all);
  return all.slice(0, period);
}

function detectPeriod(entries: TurnGlyphEntry[]): number {
  const n = entries.length;
  if (n <= 1) return n;

  outer:
  for (let p = 1; p <= n; p++) {
    if (n % p !== 0) continue;
    for (let i = p; i < n; i++) {
      const ref = entries[i % p]!;
      const cur = entries[i]!;
      if (ref.left !== cur.left || ref.right !== cur.right ||
          ref.leftFloat !== cur.leftFloat || ref.rightFloat !== cur.rightFloat) continue outer;
    }
    return p;
  }
  return n;
}
