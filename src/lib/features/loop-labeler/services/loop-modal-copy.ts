/**
 * LOOP Modal Copy Matrix
 *
 * Resolves the title + body copy for the LOOP explanation modal based on
 * the detected (period, components, domain) tuple. Replaces the previous
 * hardcoded-per-LOOPType copy system with period-aware, domain-aware text.
 *
 * ## Design
 *
 * The modal copy is a function of three things:
 *   1. `period` (2, 4, 8) - how many passes to close
 *   2. `components` (ROTATED, MIRRORED, etc., in any combination)
 *   3. `domain` (per component: "location" / "orientation" / "both")
 *
 * Rather than enumerate every possible combination (exponential), the
 * resolver picks copy based on the dominant component and the period,
 * with fallback text when no specific copy matches.
 */

import {
  LOOPComponent,
  type DetectedComponent,
  type LOOPDomain,
} from "#lib/shared/foundation/domain/models/generation/generate-models.js";

export interface LoopCopyArgs {
  period: number;
  components: DetectedComponent[];
}

export interface LoopCopy {
  title: string;
  body: string;
}

/**
 * Resolve modal title + body for a detected LOOP.
 *
 * Priority order (first match wins):
 *   1. Exact single-component match (most common case)
 *   2. Multi-component fallback with descriptive listing
 *   3. Period-only fallback for sequences where classification failed
 */
export function resolveLoopCopy(args: LoopCopyArgs): LoopCopy {
  const { period, components } = args;

  if (components.length === 0) {
    return {
      title: "Freeform LOOP",
      body:
        "This sequence cycles back to its start without matching a recognized " +
        "transformation pattern. It loops - just through a pattern we haven't " +
        "classified.",
    };
  }

  if (components.length === 1) {
    const { component, domain = "location" } = components[0]!;
    return singleComponentCopy(component, domain, period);
  }

  // Multi-component: list them, describe period
  const names = components.map((c) => componentNameWithDomain(c)).join(" + ");
  return {
    title: `${names} LOOP`,
    body: multiComponentBody(components, period),
  };
}

function singleComponentCopy(
  component: LOOPComponent,
  domain: LOOPDomain,
  period: number
): LoopCopy {
  switch (component) {
    case LOOPComponent.ROTATED:
      return rotatedCopy(domain, period);

    case LOOPComponent.MIRRORED:
      return period === 2
        ? {
            title: "Mirrored LOOP",
            body:
              "Two halves. The second is the left-right mirror of the first - " +
              "every position reflects across the vertical axis.",
          }
        : {
            title: "Mirrored LOOP (quartered)",
            body:
              "Four quarters. Positions mirror every two passes; orientations " +
              "take all four to complete their cycle.",
          };

    case LOOPComponent.FLIPPED:
      return {
        title: "Flipped LOOP",
        body:
          "Two halves. The second is the top-bottom flip of the first - every " +
          "position reflects across the horizontal axis.",
      };

    case LOOPComponent.SWAPPED:
      return period === 2
        ? {
            title: "Swapped LOOP",
            body:
              "Two halves. The second swaps blue and red - each hand performs " +
              "what the other one did in the first half.",
          }
        : {
            title: "Swapped LOOP (quartered)",
            body:
              "Four quarters. Left and right exchange roles every other pass; " +
              "orientations take all four to complete.",
          };

    case LOOPComponent.INVERTED:
      return {
        title: "Inverted LOOP",
        body:
          "Two halves. The second uses inverted motion types - pro becomes " +
          "anti, and anti becomes pro. Same positions, opposite rotation.",
      };
    case LOOPComponent.REWOUND:
      return {
        title: "Rewound LOOP",
        body:
          "The second half plays the first in reverse - a perfect loop back " +
          "to start through time reversal.",
      };

    default:
      // Reserved primitives never reach here (filtered by resolver) but the
      // TypeScript exhaustiveness check wants a fallback.
      return {
        title: "LOOP",
        body: `Period ${period} sequence that returns to start.`,
      };
  }
}

function rotatedCopy(domain: LOOPDomain, period: number): LoopCopy {
  if (period === 2) {
    return {
      title: "Rotated LOOP",
      body:
        "Two halves. The second is a 180° rotation of the first - every " +
        "position mirrors through the grid center.",
    };
  }
  if (period === 4) {
    if (domain === "orientation") {
      return {
        title: "Rotated LOOP (orientation)",
        body:
          "Four quarters. Grid positions stay pinned; orientations rotate " +
          "90° per quarter, completing the full cycle after four passes.",
      };
    }
    if (domain === "both") {
      return {
        title: "Rotated LOOP (quartered)",
        body:
          "Four quarters. Each quarter is a 90° rotation of the previous in " +
          "both position and orientation.",
      };
    }
    return {
      title: "Rotated LOOP (quartered)",
      body:
        "Four quarters. Each quarter is a 90° rotation of the previous - " +
        "the sequence traces a full circle around the grid.",
    };
  }
  return {
    title: "Rotated LOOP",
    body: `Period ${period} rotation returns to start after ${period} passes.`,
  };
}

function componentNameWithDomain(c: DetectedComponent): string {
  const base = componentName(c.component);
  return c.domain === "orientation" ? `${base} (orientation)` : base;
}

function componentName(c: LOOPComponent): string {
  switch (c) {
    case LOOPComponent.ROTATED:
      return "Rotated";
    case LOOPComponent.MIRRORED:
      return "Mirrored";
    case LOOPComponent.FLIPPED:
      return "Flipped";
    case LOOPComponent.SWAPPED:
      return "Swapped";
    case LOOPComponent.INVERTED:
      return "Inverted";
    case LOOPComponent.REWOUND:
      return "Rewound";
    default:
      return "LOOP";
  }
}

function multiComponentBody(
  components: DetectedComponent[],
  period: number
): string {
  const names = components
    .map((c) => componentName(c.component).toLowerCase())
    .join(", ");
  const passes = period === 2 ? "two halves" : `${period} passes`;
  return (
    `Combines ${names} across ${passes}. Each pass applies the listed ` +
    `transformations, cycling back to start after ${period}.`
  );
}
