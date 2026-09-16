import type { CompoundLetter, CompoundCategoryInfo } from "../types/compound.js";

export const COMPOUND_LETTERS: Record<string, CompoundLetter> = {
  DJ: {
    components: ["D", "J"],
    mnemonic: "Disco Jam",
    category: "type1-beta-alpha",
    description: "D (beta to alpha) + J (alpha to beta) creates a complete cycle",
    rotationStyle: "Pro/Pro (isolation)",
    transitionPattern: "beta -> alpha -> beta",
    vtgNote: "Vantage-relative: split-opp from the alpha-phase start (e.g. east), tog-opp from the beta-phase start (e.g. south). Same loop either way; the label is the canonical alpha1 vantage.",
  },
  EK: {
    components: ["E", "K"],
    mnemonic: "Exploding Kitten",
    category: "type1-beta-alpha",
    description: "E (beta to alpha) + K (alpha to beta) creates a complete cycle",
    rotationStyle: "Anti/Anti",
    transitionPattern: "beta -> alpha -> beta",
    vtgNote: "Vantage-relative: split-opp from the alpha-phase start, tog-opp from the beta-phase start. Same loop either way; the label is the canonical alpha1 vantage.",
  },
  FL: {
    components: ["F", "L"],
    mnemonic: "Fruity Loops",
    category: "type1-beta-alpha",
    description: "F (beta to alpha) + L (alpha to beta) creates a complete cycle",
    rotationStyle: "Hybrid (anti/pro)",
    transitionPattern: "beta -> alpha -> beta",
    vtgNote: "Vantage-relative: split-opp from the alpha-phase start, tog-opp from the beta-phase start. Same loop either way; the label is the canonical alpha1 vantage.",
  },
  MP: {
    components: ["M", "P"],
    mnemonic: "Magic Potion",
    category: "gamma-internal",
    description: "M + P creates a gamma to gamma cycle",
    rotationStyle: "Mixed",
    transitionPattern: "gamma -> gamma",
  },
  NQ: {
    components: ["N", "Q"],
    mnemonic: "Never Quit",
    category: "gamma-internal",
    description: "N + Q creates a gamma to gamma cycle",
    rotationStyle: "Mixed",
    transitionPattern: "gamma -> gamma",
  },
  OR: {
    components: ["O", "R"],
    mnemonic: "Open Road",
    category: "gamma-internal",
    description: "O + R creates a gamma to gamma cycle",
    rotationStyle: "Mixed",
    transitionPattern: "gamma -> gamma",
  },
  "ΦΨ": {
    components: ["Φ", "Ψ"],
    mnemonic: null,
    category: "type4-dash",
    description: "Phi (beta to alpha) + Psi (alpha to beta) dash compound",
    rotationStyle: "Dash motions",
    transitionPattern: "beta -> alpha -> beta",
  },
} as const satisfies Record<string, CompoundLetter>;

export const COMPOUND_CATEGORIES: Record<string, CompoundCategoryInfo> = {
  "type1-beta-alpha": {
    name: "Type 1 Beta-Alpha Compounds",
    description: "Dual-shift compounds that cycle between beta and alpha placements",
    compounds: ["DJ", "EK", "FL"],
  },
  "gamma-internal": {
    name: "Gamma Internal Compounds",
    description: "Compounds that stay within gamma placement (gamma to gamma)",
    compounds: ["MP", "NQ", "OR"],
  },
  "type4-dash": {
    name: "Type 4 Dash Compounds",
    description: "Compounds using dash motion letters",
    compounds: ["ΦΨ"],
  },
} as const satisfies Record<string, CompoundCategoryInfo>;

export const WHY_COMPOUNDS_MATTER: readonly string[] = [
  "Individual letters like D or J are half-cycles (incomplete motion)",
  "D alone is beta to alpha - only half the journey",
  "J alone is alpha to beta - the other half",
  "DJ together = beta -> alpha -> beta (complete cycle)",
  "In continuous spinning, you're always doing compound units",
  "Split/tog timing is vantage-relative: the same loop reads as split-opp or tog-opp depending on where you start it. DJ/EK/FL are not intrinsically 'split' — that label is the canonical alpha1 vantage",
  "The 'beta to alpha' descriptions are the canonical alpha1 reading; the same loop started elsewhere is the same compound, just described from a different vantage",
] as const;
