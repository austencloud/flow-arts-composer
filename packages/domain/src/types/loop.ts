export type LoopComponent =
  | "rotated"
  | "mirrored"
  | "flipped"
  | "swapped"
  | "inverted"
  | "rewound";

export interface LoopBaseComponent {
  description: string;
  keyInsight?: string;
  distinctionFromRotated?: string;
  axis?: string;
  effect?: string;
  note?: string;
  variants?: Record<string, {
    period: string;
    pattern: string;
    mentalModel: string;
  }>;
}

export interface CompoundLoopType {
  components: LoopComponent[];
}

/** Spatial transform used in compositional LOOP algebra. */
export type LoopTransform =
  | "mirror"
  | "flip"
  | "swap"
  | "rotate"
  | "inverted";

/** Fixed-point data for a single transform or compound. */
export interface LoopFixedPointEntry {
  transform: string;
  fixedPlacements: string[];
  note?: string;
}

/** A single row in a composability matrix. */
export interface LoopComposabilityEntry {
  composition: string;
  innerValid: string;
  outerValid: string;
  overall: "valid" | "blocked" | "degenerate";
}
