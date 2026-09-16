export type PlacementName = "alpha" | "beta" | "gamma" | "zeta" | "eta" | "tau" | "terra";

export interface PlacementDefinition {
  name: string;
  symbol: string;
  angle: string;
  description: string;
  gridDescription: string;
  examples: string[];
  level: number;
  keyFact: string;
}
