/**
 * TKA Letter enum.
 *
 * Grounded in the MCP `list_available_letters` authoritative call (2026-04-20).
 * The alphabet partitions into six types by motion family:
 *
 *   Type 1 Dual-Shift: A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V
 *   Type 2 Shift:      W, X, Y, Z, Σ, Δ, Θ, Ω, μ, ν
 *   Type 3 Cross-Shift: W-, X-, Y-, Z-, Σ-, Δ-, Θ-, Ω-
 *   Type 4 Dash:       Φ, Ψ, Λ, τ-
 *   Type 5 Dual-Dash:  Φ-, Ψ-, Λ-
 *   Type 6 Static:     α, β, γ, ζ, η, τ, ⊕
 *
 * Per TKA convention, the trailing "-" suffix is a naming glyph (Cross-Shift vs Shift,
 * Dual-Dash vs Dash); it does not denote the "dash" motion type.
 */
export const Letter = {
  // Type 1 — Dual-Shift (both hands shift)
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  E: "E",
  F: "F",
  G: "G",
  H: "H",
  I: "I",
  J: "J",
  K: "K",
  L: "L",
  M: "M",
  N: "N",
  O: "O",
  P: "P",
  Q: "Q",
  R: "R",
  S: "S",
  T: "T",
  U: "U",
  V: "V",

  // Type 2 — Shift (one shift, one non-shift)
  W: "W",
  X: "X",
  Y: "Y",
  Z: "Z",
  Sigma: "Σ",
  Delta: "Δ",
  Theta: "Θ",
  Omega: "Ω",
  Mu: "μ",
  Nu: "ν",

  // Type 3 — Cross-Shift ("-" variant of Type 2)
  WDash: "W-",
  XDash: "X-",
  YDash: "Y-",
  ZDash: "Z-",
  SigmaDash: "Σ-",
  DeltaDash: "Δ-",
  ThetaDash: "Θ-",
  OmegaDash: "Ω-",

  // Type 4 — Dash
  Phi: "Φ",
  Psi: "Ψ",
  Lambda: "Λ",
  TauDash: "τ-",

  // Type 5 — Dual-Dash ("-" variant of Type 4)
  PhiDash: "Φ-",
  PsiDash: "Ψ-",
  LambdaDash: "Λ-",

  // Type 6 — Static (hold a placement)
  Alpha: "α",
  Beta: "β",
  Gamma: "γ",
  Zeta: "ζ",
  Eta: "η",
  Tau: "τ",
  Terra: "⊕",
} as const;

export type Letter = (typeof Letter)[keyof typeof Letter];

export const LETTERS: readonly Letter[] = Object.freeze(Object.values(Letter));

/**
 * Letter type number (1–6), mapped per MCP reference.
 */
export type LetterTypeNumber = 1 | 2 | 3 | 4 | 5 | 6;

export const LETTER_TYPE_NAME: Record<LetterTypeNumber, string> = Object.freeze({
  1: "Dual-Shift",
  2: "Shift",
  3: "Cross-Shift",
  4: "Dash",
  5: "Dual-Dash",
  6: "Static",
});
