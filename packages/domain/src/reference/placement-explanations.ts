import { PLACEMENT_DEFINITIONS } from "../constants/placement-groups.js";
import type { PlacementName } from "../types/placement.js";

export function getPlacementExplanation(placement: string): string {
  const key = placement.toLowerCase().trim() as PlacementName;
  const p = PLACEMENT_DEFINITIONS[key];
  if (!p) {
    const validPlacements = Object.keys(PLACEMENT_DEFINITIONS).join(", ");
    return `Placement "${placement}" not recognized. Valid placements: ${validPlacements}`;
  }
  return `## ${p.name}\n\n**Angle between hands:** ${p.angle}\n\n**Definition:** ${p.description}\n\n**On the grid:** ${p.gridDescription}\n\n**Examples:**\n${p.examples.map(e => `- ${e}`).join("\n")}\n\n**Level:** ${p.level}\n\n**Key fact:** ${p.keyFact}`;
}

export function getPlacementComparison(pos1: string, pos2: string): string {
  const p1 = PLACEMENT_DEFINITIONS[pos1.toLowerCase() as PlacementName];
  const p2 = PLACEMENT_DEFINITIONS[pos2.toLowerCase() as PlacementName];
  if (!p1) return `Placement "${pos1}" not recognized.`;
  if (!p2) return `Placement "${pos2}" not recognized.`;
  return `## ${p1.name} vs ${p2.name}\n\n| Property | ${p1.name} (${p1.symbol}) | ${p2.name} (${p2.symbol}) |\n|----------|------------|------------|\n| Angle | ${p1.angle} | ${p2.angle} |\n| Level | ${p1.level} | ${p2.level} |\n\n**${p1.name}:** ${p1.description}\n\n**${p2.name}:** ${p2.description}\n\n**Key difference:** ${p1.name} has hands ${p1.angle} apart; ${p2.name} has hands ${p2.angle} apart.`;
}
