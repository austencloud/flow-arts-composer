import { Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import type { LOOPDesignation, SectionDesignation } from "./types";

/**
 * Base LOOP components for reference
 */
const BASE_COMPONENTS = [
  { id: "rotated", label: "Rotated" },
  { id: "swapped", label: "Swapped" },
  { id: "mirrored", label: "Mirrored" },
  { id: "flipped", label: "Flipped" },
  { id: "inverted", label: "Inverted" },
  { id: "rewound", label: "Rewound" },
] as const;

export function formatDesignation(d: LOOPDesignation | SectionDesignation): string {
  if (d.components.length === 0) return "Freeform";

  let label = d.components
    .map((c) => BASE_COMPONENTS.find((b) => b.id === c)?.label ?? c)
    .join(" + ");

  // Add slice size if rotated and has a slice size
  if (d.components.includes("rotated") && d.period) {
    const sliceLabel = d.period === Period.HALVED ? "180°" : "90°";
    label += ` (${sliceLabel})`;
  }

  return label;
}

export function formatSectionSteps(steps: number[]): string {
  if (steps.length === 0) return "";
  if (steps.length === 1) return `Beat ${steps[0]}`;

  // Check if consecutive
  const sorted = [...steps].sort((a, b) => a - b);
  let isConsecutive = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! !== sorted[i - 1]! + 1) {
      isConsecutive = false;
      break;
    }
  }

  if (isConsecutive) {
    return `Steps ${sorted[0]}-${sorted[sorted.length - 1]}`;
  } else {
    return `Steps ${sorted.join(", ")}`;
  }
}

export function isDuplicateDesignation(
  designation: LOOPDesignation,
  existing: LOOPDesignation[]
): boolean {
  return existing.some(
    (d) =>
      d.components.sort().join(",") ===
      designation.components.sort().join(",")
  );
}
