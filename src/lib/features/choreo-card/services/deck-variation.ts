/**
 * Deck Variation Engine
 *
 * Applies draw-time variations to LOOP deck cards: book-family reversals
 * (prop-spin flips) and structured per-beat turn patterns. Both reuse proven
 * transform code — reversals via `transformSequence` (flip + letter re-derive +
 * reorient), turns via `applyPattern` (turn application + forward orientation
 * propagation).
 *
 * Turns are NOT random. A turn pattern is an explicit, symmetric per-beat
 * string in `blue|red` form, beats separated by `-`, tiled to the card:
 *   "1|1"                 → every beat: blue 1, red 1
 *   "1|1-0|0"             → 1|1, 0|0, 1|1, 0|0, ...
 *   "1|0-0|1"             → hands trade
 *   "0.5|0-0|1"           → half/whole trade
 *   "2|1-0|0-1|2-0|0"     → a 4-beat wave
 *
 * Loop-safety:
 *   - Reversals: only book patterns whose toggle count is even per hand keep the
 *     prop returning to its starting spin (resolvePattern.isCleanLoop). Gated.
 *   - Turns: whether a turn preserves or reverses orientation depends on motion
 *     type AND turn parity (orientation algebra), so closure varies per card. We
 *     apply the chosen pattern and FLAG closure (last endOrientation === first
 *     startOrientation per hand) rather than silently dropping it.
 */

import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  SIMPLE_PATTERNS,
  getCompatiblePatterns,
} from "../domain/reversal-patterns";
import { resolvePattern, type ResolvedReversalPattern } from "../domain/reversal-transform";
import { transformSequence } from "./reversal-transform-apply";
import type { CsvEdge } from "./pictograph-letter-lookup";
import { applyPattern } from "$lib/shared/create/services/turn-pattern-apply";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { updateSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type {
  TurnPattern,
  TurnPatternEntry,
  TurnValue,
} from "$lib/shared/create/domain/turn-pattern-data";
import type { CardVariation } from "../domain/models/DeckRelease";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { recalculateAllOrientations } from "$lib/shared/create/services/orientation-propagation";
import { rotateSequenceGeometry } from "$lib/shared/create/services/sequence-derived-fields";
import {
  resolveStartOrientation,
  placementFamilyOf,
  type StartOriMode,
} from "./start-ori-register";

// Re-exported for backward compatibility — consumers import these from here.
export { resolveStartOrientation } from "./start-ori-register";
export type { StartOriMode } from "./start-ori-register";

export type Rng = () => number;

export interface VariationConfig {
  /** 0..1 — probability a drawn card receives a book reversal. */
  reversalFrequency: number;
  /** Eligible book pattern ids (e.g. "book", "long-book", "alternating"). */
  enabledReversals: string[];
  /** 0..1 — probability a drawn card receives a turn pattern. */
  turnFrequency: number;
  /** Eligible turn pattern ids (from TURN_PATTERNS); a card draws one at random. */
  enabledTurnPatterns: string[];
}

export interface AppliedVariation {
  reversalPatternId: string | null;
  reversalLabel: string | null;
  reversalSequence: string | null;
  /** The turn pattern string actually applied, or null. */
  turnPattern: string | null;
  /** Label of the applied turn pattern, or null. */
  turnLabel: string | null;
  /** false when an applied turn pattern breaks loop closure. */
  turnLoopClosed: boolean;
  warnings: string[];
}

export interface VariantResult {
  /** Transformed sequence (identical to input when no variation applied). */
  sequence: SequenceData;
  variation: AppliedVariation;
}

export const DEFAULT_VARIATION_CONFIG: VariationConfig = {
  reversalFrequency: 0.4,
  enabledReversals: ["book", "long-book", "alternating"],
  turnFrequency: 0.5,
  enabledTurnPatterns: ["hold-1", "pulse-1", "trade-1", "half-trade", "wave-21"],
};

/** Book patterns offered to the UI (the `simple`, non-continuous family). */
export const BOOK_PATTERNS = SIMPLE_PATTERNS.filter((p) => p.id !== "continuous");

export interface TurnPatternPreset {
  id: string;
  label: string;
  /** Beat count of one period — pattern only tiles cards divisible by this. */
  period: number;
  pattern: string;
}

/** Curated symmetric turn patterns. Period = beats per unit. */
export const TURN_PATTERNS: TurnPatternPreset[] = [
  { id: "hold-1", label: "Hold 1", period: 1, pattern: "1|1" },
  { id: "pulse-1", label: "Pulse 1", period: 2, pattern: "1|1-0|0" },
  { id: "trade-1", label: "Trade 1", period: 2, pattern: "1|0-0|1" },
  { id: "half-trade", label: "½ / 1 Trade", period: 2, pattern: "0.5|0-0|1" },
  { id: "wave-21", label: "Wave 2·1", period: 4, pattern: "2|1-0|0-1|2-0|0" },
];

interface TurnBeat {
  left: TurnValue | null;
  right: TurnValue | null;
}

function parseTurnSide(s: string | undefined): TurnValue | null {
  if (s == null) return null;
  const t = s.trim();
  if (t === "") return null;
  if (t === "fl") return "fl";
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Parse "b|r-b|r-..." into one period of per-beat turn values. */
export function parseTurnUnit(pattern: string): TurnBeat[] {
  const beats: TurnBeat[] = [];
  for (const tok of splitTurnBeats(pattern)) {
    const t = tok.trim();
    if (t === "") continue;
    const [b, r] = t.split("|");
    beats.push({ left: parseTurnSide(b), right: parseTurnSide(r) });
  }
  return beats;
}

/**
 * Split beat-delimited turn notation without mistaking a numeric minus sign
 * for the delimiter. A minus starts a signed value at the beginning of a beat
 * or immediately after `|`; every other minus starts the next beat.
 */
function splitTurnBeats(pattern: string): string[] {
  const beats: string[] = [];
  let beat = "";

  for (const character of pattern) {
    if (
      character === "-" &&
      beat.trim() !== "" &&
      !beat.trimEnd().endsWith("|")
    ) {
      beats.push(beat);
      beat = "";
      continue;
    }
    beat += character;
  }

  beats.push(beat);
  return beats;
}

/** Convert a raw reversal pattern string ("RRRR") into per-beat flags, tiled to N. */
function tileFlags(sequence: string, stepCount: number): { left: boolean[]; right: boolean[] } {
  const left: boolean[] = [];
  const right: boolean[] = [];
  for (let i = 0; i < stepCount; i++) {
    const sym = sequence[i % sequence.length];
    left.push(sym === "P" || sym === "B");
    right.push(sym === "P" || sym === "R");
  }
  return { left, right };
}

/** Pick a random compatible + clean-loop book pattern from the enabled set. */
function pickReversal(
  stepCount: number,
  enabled: string[],
  rng: Rng,
): ResolvedReversalPattern | null {
  const candidates = getCompatiblePatterns(stepCount)
    .filter((p) => p.family === "simple" && p.id !== "continuous" && enabled.includes(p.id))
    .map((def) => {
      const { left, right } = tileFlags(def.sequence, stepCount);
      return resolvePattern(left, right);
    })
    .filter((r) => r.isCleanLoop);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)] ?? null;
}

/** Pick a random enabled turn pattern whose period tiles the step count. */
function pickTurnPattern(
  stepCount: number,
  enabled: string[],
  rng: Rng,
): TurnPatternPreset | null {
  const candidates = TURN_PATTERNS.filter(
    (tp) => enabled.includes(tp.id) && stepCount % tp.period === 0,
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)] ?? null;
}

/**
 * Roll a frozen variation recipe for one card. Pure given `rng`. Needs only
 * `stepCount` — sequences are not loaded at compose time. Preserves the rng call
 * order reversal-gate → pickReversal → turn-gate → pickTurnPattern.
 */
export function rollVariation(
  stepCount: number,
  config: VariationConfig,
  rng: Rng = Math.random,
): CardVariation | null {
  const v: CardVariation = {};

  if (config.enabledReversals.length > 0 && rng() < config.reversalFrequency) {
    const resolved = pickReversal(stepCount, config.enabledReversals, rng);
    if (resolved) {
      v.reversalPatternId = resolved.id;
      v.reversalSequence = resolved.sequence;
    }
  }

  if (config.enabledTurnPatterns.length > 0 && rng() < config.turnFrequency) {
    const preset = pickTurnPattern(stepCount, config.enabledTurnPatterns, rng);
    if (preset) {
      v.turnPattern = preset.pattern;
      v.turnLabel = preset.label;
    }
  }

  return v.reversalSequence != null || v.turnPattern != null ? v : null;
}

export interface AppliedDescriptorResult {
  sequence: SequenceData;
  /** false when an applied turn pattern breaks per-hand loop closure. */
  turnLoopClosed: boolean;
}

/**
 * Clone-safely re-seed a sequence's start-placement orientations to `mode`'s pair,
 * then propagate forward. The pair is FAMILY-AWARE (alpha/beta/gamma differ — see
 * start-ori-register.ts). Returns the input UNCHANGED when mode is radial/undefined,
 * the sequence has no start placement, or the family is unsupported (zeta/eta).
 * NEVER mutates `seq` (shared across cards).
 */
function applyStartOriMode(seq: SequenceData, mode: StartOriMode | undefined): SequenceData {
  if (!mode || mode === "radial") return seq;
  const sp = seq.startPlacement;
  if (!sp) return seq;
  const family = placementFamilyOf(sp);
  if (!family) return seq; // unsupported family — leave at the radial default
  const pair = resolveStartOrientation(mode, family);
  const reseed = (m: typeof sp.motions.left, o: Orientation) =>
    m ? createMotionData({ ...m, startOrientation: o, endOrientation: o }) : m;
  const newStart = {
    ...sp,
    motions: {
      ...sp.motions,
      [HandSide.LEFT]: reseed(sp.motions[HandSide.LEFT], pair.left),
      [HandSide.RIGHT]: reseed(sp.motions[HandSide.RIGHT], pair.right),
    },
  };
  const seeded = updateSequenceData(seq, { startPlacement: newStart });
  return recalculateAllOrientations(seeded);
}

/**
 * Re-seed explicit per-hand start orientations, then propagate. Unlike the
 * family-aware `startOriMode` register, this sets exactly the given orientation
 * on each hand (a hand left undefined is untouched) — used by the VTG lab to
 * explore how each hand's start orientation reshapes the mandala. NEVER mutates `seq`.
 */
function applyStartOrientationPair(
  seq: SequenceData,
  pair: { left?: Orientation; right?: Orientation } | undefined,
): SequenceData {
  if (!pair || (!pair.left && !pair.right)) return seq;
  const sp = seq.startPlacement;
  if (!sp) return seq;
  const reseed = (m: typeof sp.motions.left, o: Orientation | undefined) =>
    m && o ? createMotionData({ ...m, startOrientation: o, endOrientation: o }) : m;
  const newStart = {
    ...sp,
    motions: {
      ...sp.motions,
      [HandSide.LEFT]: reseed(sp.motions[HandSide.LEFT], pair.left),
      [HandSide.RIGHT]: reseed(sp.motions[HandSide.RIGHT], pair.right),
    },
  };
  const seeded = updateSequenceData(seq, { startPlacement: newStart });
  return recalculateAllOrientations(seeded);
}

/**
 * Re-render a diamond-authored sequence in box mode: rotate the hand path 45°,
 * direction per start-placement family (alpha/gamma CW = +1, beta CCW = −1).
 * No-op when gridMode isn't "box" or the family is unsupported (zeta/eta).
 * Placements + gridMode self-heal. The TnD element is NOT rotation-invariant —
 * it must be recomputed from the box-transformed geometry via the deriver
 * (see deck-composer TnD classification). NEVER mutates `seq`.
 */
export function applyBoxMode(
  seq: SequenceData,
  gridMode: CardVariation["gridMode"],
): SequenceData {
  if (gridMode !== "box") return seq;
  const sp = seq.startPlacement;
  const family = sp ? placementFamilyOf(sp) : null;
  if (!family) return seq; // unsupported family — leave diamond
  const steps = family === "beta" ? -1 : 1; // beta CCW, alpha/gamma CW
  return rotateSequenceGeometry(seq, steps);
}

/**
 * Deterministically apply a frozen descriptor to a base sequence. Pure. Box-mode
 * rotation (if any) first, then register orientation seed, then reversal via
 * `transformSequence`, then turns via `applyPattern`.
 * Turn-only (no reversal) is valid and is the TnD render path.
 */
export function applyVariationDescriptor(
  seq: SequenceData,
  variation: CardVariation,
  edges: CsvEdge[],
): AppliedDescriptorResult {
  let working = applyBoxMode(seq, variation.gridMode);
  working = applyStartOriMode(working, variation.startOriMode);
  working = applyStartOrientationPair(working, variation.startOriPair);

  if (variation.reversalSequence) {
    const resolved: ResolvedReversalPattern = {
      id: variation.reversalPatternId ?? variation.reversalSequence,
      label: variation.reversalPatternId ?? "Custom",
      sequence: variation.reversalSequence,
      isNamed: false,
      isCleanLoop: true,
    };
    working = transformSequence(working, resolved, edges);
  }

  let turnLoopClosed = true;
  if (variation.turnPattern) {
    const unit = parseTurnUnit(variation.turnPattern);
    if (unit.length > 0) {
      const stepCount = working.steps.length;
      const base = loopCloses(working);
      const entries: TurnPatternEntry[] = [];
      for (let i = 0; i < stepCount; i++) {
        const u = unit[i % unit.length]!;
        entries.push({ stepIndex: i, left: u.left, right: u.right });
      }
      const pattern: TurnPattern = {
        id: "variation",
        name: "variation",
        userId: "",
        createdAt: null as unknown as TurnPattern["createdAt"],
        stepCount,
        entries,
      };
      const res = applyPattern(pattern, working, "both");
      if (res.success && res.sequence) {
        working = res.sequence;
        const closed = loopCloses(working);
        turnLoopClosed = (closed.left || !base.left) && (closed.right || !base.right);
      }
    }
  }

  return { sequence: working, turnLoopClosed };
}

export interface ResolvedDeckSequence {
  sequence: SequenceData;
  turnLoopClosed: boolean;
}

/** Card fields the seam needs — a structural subset of DeckReleaseCard. */
interface ResolvableCard {
  sequenceId: string;
  sourceCatalogId: string;
  variation?: CardVariation;
}

/**
 * Resolve every card POSITIONALLY (by index) against a preloaded base map keyed
 * `${sourceCatalogId}::${sequenceId}`. Cards sharing a base id each get their own
 * variant — never collapsed. Cards whose base is missing are skipped.
 */
export function resolveDeckSequences(
  cards: ResolvableCard[],
  baseByKey: Map<string, SequenceData>,
  edges: CsvEdge[],
): ResolvedDeckSequence[] {
  const out: ResolvedDeckSequence[] = [];
  for (const card of cards) {
    const base = baseByKey.get(`${card.sourceCatalogId}::${card.sequenceId}`);
    if (!base) continue;
    if (!card.variation) {
      out.push({ sequence: base, turnLoopClosed: true });
      continue;
    }
    out.push(applyVariationDescriptor(base, card.variation, edges));
  }
  return out;
}

/** Does the loop close on each hand? (last endOrientation === first startOrientation) */
function loopCloses(seq: SequenceData): { left: boolean; right: boolean } {
  const steps = seq.steps;
  const first = steps[0];
  const last = steps[steps.length - 1];
  function handCloses(hand: HandSide): boolean {
    const fm = first?.motions?.[hand];
    const lm = last?.motions?.[hand];
    // Invisible placeholder = hand not really there: vacuously closed.
    if (!isVisibleMotion(fm) || !isVisibleMotion(lm)) return true;
    return lm.endOrientation === fm.startOrientation;
  }
  return {
    left: handCloses(HandSide.LEFT),
    right: handCloses(HandSide.RIGHT),
  };
}

/**
 * Roll + apply in one shot. Thin wrapper over rollVariation + applyVariationDescriptor.
 * Used by the test route; the releaser rolls and applies separately (compose vs seam).
 */
export function applyVariation(
  seq: SequenceData,
  config: VariationConfig,
  edges: CsvEdge[],
  rng: Rng = Math.random,
): VariantResult {
  const variation = rollVariation(seq.steps.length, config, rng);
  if (!variation) {
    return {
      sequence: seq,
      variation: {
        reversalPatternId: null,
        reversalLabel: null,
        reversalSequence: null,
        turnPattern: null,
        turnLabel: null,
        turnLoopClosed: true,
        warnings: [],
      },
    };
  }

  const { sequence, turnLoopClosed } = applyVariationDescriptor(seq, variation, edges);
  const reversalLabel = variation.reversalPatternId
    ? BOOK_PATTERNS.find((p) => p.id === variation.reversalPatternId)?.label ??
      variation.reversalPatternId
    : null;

  return {
    sequence,
    variation: {
      reversalPatternId: variation.reversalPatternId ?? null,
      reversalLabel,
      reversalSequence: variation.reversalSequence ?? null,
      turnPattern: variation.turnPattern ?? null,
      turnLabel: variation.turnLabel ?? null,
      turnLoopClosed,
      warnings: [],
    },
  };
}
