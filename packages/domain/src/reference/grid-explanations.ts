import type { GridModeDefinition } from "../types/grid.js";

export const GRID_MODE_DEFINITIONS: Record<string, GridModeDefinition> = {
  diamond: {
    name: "Diamond Grid",
    description: "Uses the four cardinal points: North, East, South, West.",
    points: ["N (north)", "E (east)", "S (south)", "W (west)"],
    placements: ["Alpha (N/S or E/W)", "Beta (same point)", "Gamma (adjacent like N/E)"],
    keyFact: "Diamond is the primary grid mode. Most Level 1-3 work uses diamond grid.",
  },
  box: {
    name: "Box Grid",
    description: "Uses the four intercardinal points: NE, SE, SW, NW.",
    points: ["NE (northeast)", "SE (southeast)", "SW (southwest)", "NW (northwest)"],
    placements: ["Alpha (NE/SW or NW/SE)", "Beta (same point)", "Gamma (adjacent like NE/SE)"],
    keyFact: "Box grid is rotated 45° from diamond. Same placements, different orientation.",
  },
  skewed: {
    name: "Skewed Grid",
    description: "Mixes cardinal (diamond) and intercardinal (box) points.",
    points: ["One hand on cardinal (N/E/S/W)", "One hand on intercardinal (NE/SE/SW/NW)"],
    placements: ["Zeta (~135° angle)", "Eta (~45° angle)"],
    keyFact: "Skewed placements are Level 5. They bridge the two grid systems.",
    level: 5,
  },
  centric: {
    name: "Centric Grid",
    description: "Uses the center point of the grid. At least one hand at the center.",
    points: ["Center point", "Any of the 8 outer points (cardinal or intercardinal)"],
    placements: ["Tau (one hand at center, one elsewhere)", "Terra (both hands at center)"],
    keyFact: "Centric is Level 6. Introduces the 9th grid point and the hash hand path.",
    level: 4,
  },
};

export function getGridModeExplanation(mode: string): string {
  const key = mode.toLowerCase().trim();
  const g = GRID_MODE_DEFINITIONS[key];
  if (!g) {
    const validModes = Object.keys(GRID_MODE_DEFINITIONS).join(", ");
    return `Grid mode "${mode}" not recognized. Valid modes: ${validModes}`;
  }
  let result = `## ${g.name}\n\n**Definition:** ${g.description}\n\n**Grid points:**\n${g.points.map(p => `- ${p}`).join("\n")}\n\n**Placements available:**\n${g.placements.map(p => `- ${p}`).join("\n")}\n\n**Key fact:** ${g.keyFact}`;
  if (g.level) result += `\n\n**Introduced at:** Level ${g.level}`;
  return result;
}
