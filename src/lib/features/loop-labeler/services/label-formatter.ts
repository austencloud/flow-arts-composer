import { Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import type { SectionDesignation } from "../domain/models/section-models";
import type { TransformationIntervals } from "../domain/models/label-models";
import { BASE_COMPONENTS, type ComponentId } from "../domain/constants/loop-components";
import type { LOOPDesignationInput } from "./types";

export function formatDesignation(d: LOOPDesignationInput | SectionDesignation): string {
  const hasBaseWord = "baseWord" in d && d.baseWord;

  if (d.components.length === 0 && !hasBaseWord) return "Freeform";

  const intervals =
    "transformationIntervals" in d ? d.transformationIntervals : undefined;
  const componentParts: string[] = [];

  for (const c of d.components) {
    const componentDef = BASE_COMPONENTS.find((b) => b.id === c);
    let componentLabel = componentDef?.label ?? c;

    if (intervals) {
      const intervalKey = componentToIntervalKey(c);
      if (intervalKey && intervals[intervalKey]) {
        const intervalStr = formatInterval(intervals[intervalKey]);
        if (intervalStr) {
          componentLabel += `(${intervalStr})`;
        }
      }
    } else if (c === "rotated" && d.period) {
      const sliceLabel = d.period === Period.HALVED ? "½" : "¼";
      componentLabel += `(${sliceLabel})`;
    }

    componentParts.push(componentLabel);
  }

  let label = componentParts.join(" + ");

  if (hasBaseWord) {
    const baseWordLabel = `[${(d as SectionDesignation).baseWord!.toUpperCase()}]`;
    label = label ? `${label} ${baseWordLabel}` : baseWordLabel;
  }

  return label;
}

export function formatSectionSteps(steps: number[]): string {
  if (steps.length === 0) return "";
  if (steps.length === 1) return `Beat ${steps[0]}`;

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

function formatInterval(interval: number | undefined): string {
  if (!interval) return "";
  if (interval === 2) return "½";
  if (interval === 4) return "¼";
  return String(interval);
}

function componentToIntervalKey(
  component: ComponentId
): keyof TransformationIntervals | null {
  const map: Record<ComponentId, keyof TransformationIntervals | null> = {
    rotated: "rotation",
    swapped: "swap",
    mirrored: "mirror",
    flipped: "flip",
    inverted: "invert",
    rewound: null,
    repeated: null,
    modular: null,
  };
  return map[component] ?? null;
}
