export type GridModeName = "diamond" | "box" | "skewed" | "centric";

export interface GridModeDefinition {
  name: string;
  description: string;
  points: string[];
  placements: string[];
  keyFact: string;
  level?: number;
}
