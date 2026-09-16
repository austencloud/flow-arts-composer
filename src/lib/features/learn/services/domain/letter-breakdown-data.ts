/**
 * Static Letter Breakdown Data
 *
 * Complete lookup table for all TKA letters. Every field is deterministic
 * and derived from the domain specification - no LLM inference needed.
 *
 * Data sources:
 * - Type mapping: Letter.ts getLetterType()
 * - Type 1 placements/rotations: type1-letter-data.ts
 * - Type 2-6: domain specification (user-verified)
 * - TnD modes: tnd-calculator.ts (Type 1 only)
 */

export interface LetterBreakdownEntry {
  typeNumber: number;
  typeName: string;
  startPlacement: string;
  endPlacement: string;
  motionDescription: string;
  tndMode?: string;
  tndElement?: string;
  motionGroup?: string;
  upgradeFrom?: string;
}

/**
 * Static lookup for every TKA letter.
 *
 * Type 1 (A-V): Both hands shift. Organized by placement transition + rotation pattern.
 * Type 2 (W-Ω, μ, ν): One hand shifts, other stays static.
 * Type 3 (W- through Ω-): One hand shifts, other dashes. Upgrade of Type 2.
 * Type 4 (Φ, Ψ, Λ, τ-): One hand dashes, other stays static.
 * Type 5 (Φ-, Ψ-, Λ-): Both hands dash. Upgrade of Type 4.
 * Type 6 (α, β, γ, ζ, η, τ, ⊕): Both hands static.
 */
export const LETTER_BREAKDOWN_TABLE: ReadonlyMap<string, LetterBreakdownEntry> =
  new Map([
    // ═══════════════════════════════════════════════════════════════
    // Type 1: Dual-Shift (A-V) - both hands shift
    // ═══════════════════════════════════════════════════════════════

    // Alpha-Beta Group: Prospin (A, D, G, J)
    [
      "A",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "alpha",
        endPlacement: "alpha",
        motionDescription: "both pro",
        tndMode: "split-same",
        tndElement: "Water",
        motionGroup: "prospin",
      },
    ],
    [
      "D",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "beta",
        endPlacement: "alpha",
        motionDescription: "both pro",
        motionGroup: "prospin",
      },
    ],
    [
      "G",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "beta",
        endPlacement: "beta",
        motionDescription: "both pro",
        tndMode: "tog-same",
        tndElement: "Earth",
        motionGroup: "prospin",
      },
    ],
    [
      "J",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "alpha",
        endPlacement: "beta",
        motionDescription: "both pro",
        motionGroup: "prospin",
      },
    ],

    // Alpha-Beta Group: Antispin (B, E, H, K)
    [
      "B",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "alpha",
        endPlacement: "alpha",
        motionDescription: "both anti",
        tndMode: "split-same",
        tndElement: "Sun",
        motionGroup: "antispin",
      },
    ],
    [
      "E",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "beta",
        endPlacement: "alpha",
        motionDescription: "both anti",
        motionGroup: "antispin",
      },
    ],
    [
      "H",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "beta",
        endPlacement: "beta",
        motionDescription: "both anti",
        tndMode: "tog-same",
        tndElement: "Moon",
        motionGroup: "antispin",
      },
    ],
    [
      "K",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "alpha",
        endPlacement: "beta",
        motionDescription: "both anti",
        motionGroup: "antispin",
      },
    ],

    // Alpha-Beta Group: Hybrid (C, F, I, L)
    [
      "C",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "alpha",
        endPlacement: "alpha",
        motionDescription: "hybrid (one pro, one anti)",
        tndMode: "split-same",
        tndElement: "Fire",
        motionGroup: "hybrid",
      },
    ],
    [
      "F",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "beta",
        endPlacement: "alpha",
        motionDescription: "hybrid (one pro, one anti)",
        motionGroup: "hybrid",
      },
    ],
    [
      "I",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "beta",
        endPlacement: "beta",
        motionDescription: "hybrid (one pro, one anti)",
        tndMode: "tog-same",
        tndElement: "Air",
        motionGroup: "hybrid",
      },
    ],
    [
      "L",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "alpha",
        endPlacement: "beta",
        motionDescription: "hybrid (one pro, one anti)",
        motionGroup: "hybrid",
      },
    ],

    // Gamma Group: Prospin (M, P, S)
    [
      "M",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "both pro",
        tndMode: "quarter-opp",
        motionGroup: "prospin",
      },
    ],
    [
      "P",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "both pro",
        tndMode: "quarter-opp",
        motionGroup: "prospin",
      },
    ],
    [
      "S",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "both pro",
        tndMode: "quarter-same",
        motionGroup: "prospin",
      },
    ],

    // Gamma Group: Antispin (N, Q, T)
    [
      "N",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "both anti",
        tndMode: "quarter-opp",
        motionGroup: "antispin",
      },
    ],
    [
      "Q",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "both anti",
        tndMode: "quarter-opp",
        motionGroup: "antispin",
      },
    ],
    [
      "T",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "both anti",
        tndMode: "quarter-same",
        motionGroup: "antispin",
      },
    ],

    // Gamma Group: Hybrid (O, R, U, V)
    [
      "O",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "hybrid (one pro, one anti)",
        tndMode: "quarter-opp",
        motionGroup: "hybrid",
      },
    ],
    [
      "R",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "hybrid (one pro, one anti)",
        tndMode: "quarter-opp",
        motionGroup: "hybrid",
      },
    ],
    [
      "U",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "hybrid (one pro, one anti)",
        tndMode: "quarter-same",
        motionGroup: "hybrid",
      },
    ],
    [
      "V",
      {
        typeNumber: 1,
        typeName: "Dual-Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "hybrid (one pro, one anti, reverse leading hand)",
        tndMode: "quarter-same",
        motionGroup: "hybrid",
      },
    ],

    // ═══════════════════════════════════════════════════════════════
    // Type 2: Shift - one hand shifts, other stays static
    // ═══════════════════════════════════════════════════════════════
    [
      "W",
      {
        typeNumber: 2,
        typeName: "Shift",
        startPlacement: "gamma",
        endPlacement: "alpha",
        motionDescription: "one pro shift, one static",
      },
    ],
    [
      "X",
      {
        typeNumber: 2,
        typeName: "Shift",
        startPlacement: "gamma",
        endPlacement: "alpha",
        motionDescription: "one anti shift, one static",
      },
    ],
    [
      "Y",
      {
        typeNumber: 2,
        typeName: "Shift",
        startPlacement: "gamma",
        endPlacement: "beta",
        motionDescription: "one pro shift, one static",
      },
    ],
    [
      "Z",
      {
        typeNumber: 2,
        typeName: "Shift",
        startPlacement: "gamma",
        endPlacement: "beta",
        motionDescription: "one anti shift, one static",
      },
    ],
    [
      "Σ",
      {
        typeNumber: 2,
        typeName: "Shift",
        startPlacement: "alpha",
        endPlacement: "gamma",
        motionDescription: "one pro shift, one static",
      },
    ],
    [
      "Δ",
      {
        typeNumber: 2,
        typeName: "Shift",
        startPlacement: "alpha",
        endPlacement: "gamma",
        motionDescription: "one anti shift, one static",
      },
    ],
    [
      "Θ",
      {
        typeNumber: 2,
        typeName: "Shift",
        startPlacement: "beta",
        endPlacement: "gamma",
        motionDescription: "one pro shift, one static",
      },
    ],
    [
      "Ω",
      {
        typeNumber: 2,
        typeName: "Shift",
        startPlacement: "beta",
        endPlacement: "gamma",
        motionDescription: "one anti shift, one static",
      },
    ],
    [
      "μ",
      {
        typeNumber: 2,
        typeName: "Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "one pro shift, one static",
      },
    ],
    [
      "ν",
      {
        typeNumber: 2,
        typeName: "Shift",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "one anti shift, one static",
      },
    ],

    // ═══════════════════════════════════════════════════════════════
    // Type 3: Cross-Shift - one hand shifts, other dashes
    // Upgrade of Type 2: the formerly-static hand now dashes
    // ═══════════════════════════════════════════════════════════════
    [
      "W-",
      {
        typeNumber: 3,
        typeName: "Cross-Shift",
        startPlacement: "gamma",
        endPlacement: "alpha",
        motionDescription: "one pro shift, one dash",
        upgradeFrom: "W",
      },
    ],
    [
      "X-",
      {
        typeNumber: 3,
        typeName: "Cross-Shift",
        startPlacement: "gamma",
        endPlacement: "alpha",
        motionDescription: "one anti shift, one dash",
        upgradeFrom: "X",
      },
    ],
    [
      "Y-",
      {
        typeNumber: 3,
        typeName: "Cross-Shift",
        startPlacement: "gamma",
        endPlacement: "beta",
        motionDescription: "one pro shift, one dash",
        upgradeFrom: "Y",
      },
    ],
    [
      "Z-",
      {
        typeNumber: 3,
        typeName: "Cross-Shift",
        startPlacement: "gamma",
        endPlacement: "beta",
        motionDescription: "one anti shift, one dash",
        upgradeFrom: "Z",
      },
    ],
    [
      "Σ-",
      {
        typeNumber: 3,
        typeName: "Cross-Shift",
        startPlacement: "alpha",
        endPlacement: "gamma",
        motionDescription: "one pro shift, one dash",
        upgradeFrom: "Σ",
      },
    ],
    [
      "Δ-",
      {
        typeNumber: 3,
        typeName: "Cross-Shift",
        startPlacement: "alpha",
        endPlacement: "gamma",
        motionDescription: "one anti shift, one dash",
        upgradeFrom: "Δ",
      },
    ],
    [
      "Θ-",
      {
        typeNumber: 3,
        typeName: "Cross-Shift",
        startPlacement: "beta",
        endPlacement: "gamma",
        motionDescription: "one pro shift, one dash",
        upgradeFrom: "Θ",
      },
    ],
    [
      "Ω-",
      {
        typeNumber: 3,
        typeName: "Cross-Shift",
        startPlacement: "beta",
        endPlacement: "gamma",
        motionDescription: "one anti shift, one dash",
        upgradeFrom: "Ω",
      },
    ],

    // ═══════════════════════════════════════════════════════════════
    // Type 4: Dash - one hand dashes, other stays static
    // ═══════════════════════════════════════════════════════════════
    [
      "Φ",
      {
        typeNumber: 4,
        typeName: "Dash",
        startPlacement: "gamma",
        endPlacement: "alpha",
        motionDescription: "one dash, one static (diverging)",
      },
    ],
    [
      "Ψ",
      {
        typeNumber: 4,
        typeName: "Dash",
        startPlacement: "gamma",
        endPlacement: "beta",
        motionDescription: "one dash, one static (converging)",
      },
    ],
    [
      "Λ",
      {
        typeNumber: 4,
        typeName: "Dash",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "one dash, one static (angle preserved)",
      },
    ],
    [
      "τ-",
      {
        typeNumber: 4,
        typeName: "Dash",
        startPlacement: "alpha",
        endPlacement: "beta",
        motionDescription: "one dash, one static",
      },
    ],

    // ═══════════════════════════════════════════════════════════════
    // Type 5: Dual-Dash - both hands dash
    // Upgrade of Type 4: the formerly-static hand now dashes
    // ═══════════════════════════════════════════════════════════════
    [
      "Φ-",
      {
        typeNumber: 5,
        typeName: "Dual-Dash",
        startPlacement: "gamma",
        endPlacement: "alpha",
        motionDescription: "both dash (diverging)",
        upgradeFrom: "Φ",
      },
    ],
    [
      "Ψ-",
      {
        typeNumber: 5,
        typeName: "Dual-Dash",
        startPlacement: "gamma",
        endPlacement: "beta",
        motionDescription: "both dash (converging)",
        upgradeFrom: "Ψ",
      },
    ],
    [
      "Λ-",
      {
        typeNumber: 5,
        typeName: "Dual-Dash",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "both dash (angle preserved)",
        upgradeFrom: "Λ",
      },
    ],

    // ═══════════════════════════════════════════════════════════════
    // Type 6: Static - both hands stay at their placement
    // ═══════════════════════════════════════════════════════════════
    [
      "α",
      {
        typeNumber: 6,
        typeName: "Static",
        startPlacement: "alpha",
        endPlacement: "alpha",
        motionDescription: "both static",
      },
    ],
    [
      "β",
      {
        typeNumber: 6,
        typeName: "Static",
        startPlacement: "beta",
        endPlacement: "beta",
        motionDescription: "both static",
      },
    ],
    [
      "γ",
      {
        typeNumber: 6,
        typeName: "Static",
        startPlacement: "gamma",
        endPlacement: "gamma",
        motionDescription: "both static",
      },
    ],
    [
      "ζ",
      {
        typeNumber: 6,
        typeName: "Static",
        startPlacement: "zeta",
        endPlacement: "zeta",
        motionDescription: "both static",
      },
    ],
    [
      "η",
      {
        typeNumber: 6,
        typeName: "Static",
        startPlacement: "eta",
        endPlacement: "eta",
        motionDescription: "both static",
      },
    ],
    [
      "τ",
      {
        typeNumber: 6,
        typeName: "Static",
        startPlacement: "tau",
        endPlacement: "tau",
        motionDescription: "both static",
      },
    ],
    [
      "⊕",
      {
        typeNumber: 6,
        typeName: "Static",
        startPlacement: "terra",
        endPlacement: "terra",
        motionDescription: "both static",
      },
    ],
  ]);
