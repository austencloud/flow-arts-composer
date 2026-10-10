/**
 * LOOP component definitions and mapping utilities
 */

import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";

// Base LOOP components that can be combined
// Icons and colors match the Generate tab's LOOP component buttons
export const BASE_COMPONENTS = [
  {
    id: "rotated",
    label: "Rotated",
    description: "Positions rotate 180° (or 90°)",
    icon: "rotate",
    color: "#36c3ff",
  },
  {
    id: "swapped",
    label: "Swapped",
    description: "Left/right hands swap roles",
    icon: "shuffle",
    color: "#2ecc71",
  },
  {
    id: "mirrored",
    label: "Mirrored",
    description: "Positions mirror vertically (left↔right)",
    icon: "left-right",
    color: "#6F2DA8",
  },
  {
    id: "flipped",
    label: "Flipped",
    description: "Positions mirror horizontally (top↔bottom)",
    icon: "up-down",
    color: "#6F2DA8",
  },
  {
    id: "inverted",
    label: "Inverted",
    description: "Pro ↔ Anti motion types flip",
    icon: "yin-yang",
    color: "#eb7d00",
  },
  {
    id: "rewound",
    label: "Rewound",
    description: "Second half plays in reverse",
    icon: "backward",
    color: "#ec4899",
  },
  {
    id: "repeated",
    label: "Repeated",
    description:
      "Sequence repeats 2-4x for true circularity (orientations match)",
    icon: "repeat",
    color: "#f59e0b",
  },
  {
    id: "modular",
    label: "Modular",
    description:
      "Multiple motifs transform independently at different intervals",
    icon: "layer-group",
    color: "#8b5cf6",
  },
] as const;

export type ComponentId = (typeof BASE_COMPONENTS)[number]["id"];

// Map component combinations to LOOPType
export function componentsToLOOPType(
  components: Set<ComponentId>
): string | null {
  if (components.size === 0) return null;

  const sorted = Array.from(components).sort().join("_");

  // Map combinations to LOOPType enum values
  const mapping: Record<string, LOOPType | string> = {
    rotated: LOOPType.ROTATED,
    mirrored: LOOPType.MIRRORED,
    flipped: "flipped",
    swapped: LOOPType.SWAPPED,
    inverted: LOOPType.INVERTED,
    inverted_swapped: LOOPType.SWAPPED_INVERTED,
    inverted_rotated: LOOPType.ROTATED_INVERTED,
    mirrored_swapped: LOOPType.MIRRORED_SWAPPED,
    flipped_swapped: "flipped_swapped",
    inverted_mirrored: LOOPType.MIRRORED_INVERTED,
    flipped_inverted: "flipped_inverted",
    rotated_swapped: LOOPType.ROTATED_SWAPPED,
    mirrored_rotated: LOOPType.MIRRORED_ROTATED,
    flipped_rotated: "flipped_rotated",
    inverted_mirrored_rotated: LOOPType.MIRRORED_INVERTED_ROTATED,
    mirrored_rotated_swapped: LOOPType.MIRRORED_ROTATED_SWAPPED,
    inverted_rotated_swapped: LOOPType.ROTATED_SWAPPED_INVERTED,
    inverted_mirrored_rotated_swapped:
      LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
    rewound: "rewound",
    inverted_rewound: "rewound_inverted",
    repeated: "repeated",
    repeated_rotated: "repeated_rotated",
    repeated_mirrored: "repeated_mirrored",
    repeated_swapped: "repeated_swapped",
    modular: "modular",
    // Add more combinations as needed
  };

  return mapping[sorted] ?? `custom_${sorted}`;
}
