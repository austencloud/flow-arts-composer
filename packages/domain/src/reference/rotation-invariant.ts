/** VTG timing+direction group for a Type 1 letter. */
export type VtgGroup = "ss" | "so" | "ts" | "to" | "qo" | "qs";

/** Prop-rotation pattern of the two hands. */
export type RotationPattern = "pro" | "anti" | "hybrid";

export interface Type1RotationEntry {
  vtgGroup: VtgGroup;
  rotationPattern: RotationPattern;
  /**
   * Rotation of the LEADING hand. Present ONLY for quarter-same (qs),
   * the only group with a leader/follower distinction. Absent for every
   * other group — quarter-opposite (M-R) and the symmetric groups have
   * no leader/follower. Do NOT add this field outside qs.
   */
  leaderRotation?: "pro" | "anti";
}

/** Canonical Type 1 rotation data, keyed by letter (A-V). Single source. */
export const TYPE1_ROTATION: Record<string, Type1RotationEntry> = {
  // Split-Same
  A: { vtgGroup: "ss", rotationPattern: "pro" },
  B: { vtgGroup: "ss", rotationPattern: "anti" },
  C: { vtgGroup: "ss", rotationPattern: "hybrid" },
  // Together-Opposite
  D: { vtgGroup: "to", rotationPattern: "pro" },
  E: { vtgGroup: "to", rotationPattern: "anti" },
  F: { vtgGroup: "to", rotationPattern: "hybrid" },
  // Together-Same
  G: { vtgGroup: "ts", rotationPattern: "pro" },
  H: { vtgGroup: "ts", rotationPattern: "anti" },
  I: { vtgGroup: "ts", rotationPattern: "hybrid" },
  // Split-Opposite
  J: { vtgGroup: "so", rotationPattern: "pro" },
  K: { vtgGroup: "so", rotationPattern: "anti" },
  L: { vtgGroup: "so", rotationPattern: "hybrid" },
  // Quarter-Opposite (two triples, M-R) — NO leaderRotation
  M: { vtgGroup: "qo", rotationPattern: "pro" },
  N: { vtgGroup: "qo", rotationPattern: "anti" },
  O: { vtgGroup: "qo", rotationPattern: "hybrid" },
  P: { vtgGroup: "qo", rotationPattern: "pro" },
  Q: { vtgGroup: "qo", rotationPattern: "anti" },
  R: { vtgGroup: "qo", rotationPattern: "hybrid" },
  // Quarter-Same (S, T, U, V) — leaderRotation REQUIRED
  S: { vtgGroup: "qs", rotationPattern: "pro", leaderRotation: "pro" },
  T: { vtgGroup: "qs", rotationPattern: "anti", leaderRotation: "anti" },
  U: { vtgGroup: "qs", rotationPattern: "hybrid", leaderRotation: "pro" },
  V: { vtgGroup: "qs", rotationPattern: "hybrid", leaderRotation: "anti" },
};

export function getType1Rotation(letter: string): Type1RotationEntry | undefined {
  return TYPE1_ROTATION[letter];
}

/**
 * PRECISE register. Authoritative, fact-checked against the Flow Arts
 * Knowledge MCP. Every other precise explanation in the codebase must
 * re-export this string, never restate it.
 */
export const PRECISE_QUARTER_SAME_EXPLANATION = `Type 1 (dual-shift, 22 letters) is organized by VTG timing + direction into groups:

- Split-Same: A, B, C
- Together-Opposite: D, E, F
- Together-Same: G, H, I
- Split-Opposite: J, K, L
- Quarter-Opposite: M, N, O and P, Q, R
- Quarter-Same: S, T, U, V

Every group is two pure members (pro|pro, anti|anti) plus one hybrid (pro|anti) = 3 letters — except Quarter-Same, which has 4.

A letter is invariant under rotation, reflection, and color-swap: those transformations never produce a new letter. That invariance holds for symmetric placements (alpha, beta) and for opposite-direction motion anywhere. It breaks only for same-direction motion in an asymmetric placement — Quarter-Same — where one hand leads and one follows.

- S (pro|pro) and T (anti|anti): swapping colors only swaps who leads, so the move is identical — one letter each. (Leader/follower still places turns: leader on top of the glyph, follower below.)
- The hybrid case: swapping colors changes which motion type leads, producing a genuinely different move. So it splits into two letters — U (leader pro, follower anti) and V (leader anti, follower pro).

Quarter-Same therefore has four; every other group has three. This is the only place the invariance rule forces an extra letter.

Leader/follower applies only to same-direction shifts (Quarter-Same). Quarter-Opposite (M-R) hands diverge/converge symmetrically — no leader, no follower.

A letter is a half-cycle, not the atomic performed unit: in continuous spinning the unit is the compound (DJ, EK, FL; MP, NQ, OR; Phi-Psi). VTG timing applies to the compound.`;

/**
 * PLAIN register. Ships to humans. Must contain none of the precise-only
 * jargon (enforced by tests/unit/domain/letter-types-json-parity.test.ts).
 * A faithful shrink of the precise version, never a different claim.
 */
export const PLAIN_QUARTER_SAME_EXPLANATION = `Three here, four there — looks like a screw-up. It isn't. Takes ten seconds.

Hold both hands out in an L — one to the side, one in front. Spin them. One hand is in front, one's behind. Front hand, back hand.

If both hands do the same spin, it doesn't matter which one's in front. Switch them and the move looks exactly the same. One move, one letter.

But if the two hands do different spins, now it matters who's in front. Front hand doing the first spin is a different move than front hand doing the second. You can't turn one into the other by spinning or flipping the card. Two real moves, so two letters: U and V.

That's it. Every other group has three because switching hands changes nothing. This one has four because — just this once — switching hands changes everything.`;
