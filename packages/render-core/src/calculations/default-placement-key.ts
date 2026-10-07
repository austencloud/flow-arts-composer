/**
 * Default arrow placement keys
 *
 * Builds the candidate keys the default placement tables are read with, in
 * the order the app tries them: letter-specific key, letterless key, then the
 * bare motion type. The first candidate the table holds wins.
 */

export type PlacementGroup = "alpha" | "beta" | "gamma";

const ALPHA_LETTERS = new Set([
  "A", "B", "C", "D", "E", "F", "W", "X", "W-", "X-", "Φ", "Φ-", "α",
]);
const BETA_LETTERS = new Set([
  "G", "H", "I", "J", "K", "L", "Y", "Z", "Y-", "Z-", "Ψ", "Ψ-", "β",
]);
const GAMMA_LETTERS = new Set([
  "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V",
  "Σ", "Δ", "Θ", "Ω", "Σ-", "Δ-", "Θ-", "Ω-",
  "Λ", "Λ-", "γ", "ζ", "η", "τ", "⊕", "μ", "ν",
]);

/** Dash letters whose placement keys drop the "-" for a "_dash" suffix. */
const DASH_LETTERS = new Set([
  "W-", "X-", "Y-", "Z-", "Σ-", "Δ-", "Θ-", "Ω-", "Φ-", "Ψ-", "Λ-",
]);

const RADIAL = new Set(["in", "out"]);
const NON_RADIAL = new Set([
  "clock",
  "counter",
  "clockIn",
  "clockOut",
  "counterIn",
  "counterOut",
]);

/** The alpha, beta or gamma group a letter's default placements use. */
export function letterPlacementGroup(
  letter: string | null | undefined
): PlacementGroup | null {
  if (!letter) return null;
  if (ALPHA_LETTERS.has(letter)) return "alpha";
  if (BETA_LETTERS.has(letter)) return "beta";
  if (GAMMA_LETTERS.has(letter)) return "gamma";
  return null;
}

export interface DefaultPlacementKeyInput {
  motionType: string;
  letter?: string | null;
  /** End orientation of the motion being placed. */
  endOrientation?: string | null;
  /** End orientations of the visible hands; leave one out for a lone hand. */
  leftEndOrientation?: string | null;
  rightEndOrientation?: string | null;
}

function layerMiddle(input: DefaultPlacementKeyInput): string {
  const left = input.leftEndOrientation ?? undefined;
  const right = input.rightEndOrientation ?? undefined;

  if (!left || !right) {
    // A lone hand reads its own layer with alpha placements.
    const only = left || right;
    if (!only) return "";
    if (RADIAL.has(only)) return "layer1_alpha";
    if (NON_RADIAL.has(only)) return "layer2_alpha";
    return "_alpha";
  }

  let middle = "";
  if (RADIAL.has(left) && RADIAL.has(right)) {
    middle = "layer1";
  } else if (NON_RADIAL.has(left) && NON_RADIAL.has(right)) {
    middle = "layer2";
  } else if (
    (RADIAL.has(left) && NON_RADIAL.has(right)) ||
    (NON_RADIAL.has(left) && RADIAL.has(right))
  ) {
    middle = RADIAL.has(input.endOrientation || "in")
      ? "radial_layer3"
      : "nonradial_layer3";
  }

  const group = letterPlacementGroup(input.letter);
  return group ? `${middle}_${group}` : middle;
}

/** Candidate default placement keys, most specific first. */
export function defaultPlacementCandidateKeys(
  input: DefaultPlacementKeyInput
): string[] {
  const motionType = input.motionType.toLowerCase();
  const middle = layerMiddle(input);
  const candidates: string[] = [];

  if (middle) {
    if (input.letter) {
      const suffix = DASH_LETTERS.has(input.letter)
        ? `_${input.letter.slice(0, -1)}_dash`
        : `_${input.letter}`;
      candidates.push(`${motionType}_to_${middle}${suffix}`);
    }
    candidates.push(`${motionType}_to_${middle}`);
  }
  candidates.push(motionType);
  return candidates;
}
