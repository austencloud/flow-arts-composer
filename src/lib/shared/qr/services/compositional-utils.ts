/**
 * Shared utilities for compositional sequence encoding/decoding.
 *
 * Both CompositionalEncoder and CompositionalDecoder need to resolve
 * LOOP executors by tag and compute hashes. Extracting these here
 * avoids duplicating the logic in both files.
 *
 * Domain: QR - Compositional Encoding
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";

/** The executor interface both encoder and decoder need */
export interface LOOPExecutorLike {
  executeLOOP(steps: StepData[], period: Period): StepData[];
}

/**
 * Resolve the pre-wired singleton executor for a given LOOP type tag.
 * Uses dynamic import so we don't load all executors upfront.
 * Each case uses a string literal so Vite can resolve the $lib alias.
 */
export async function getLoopExecutor(
  tag: string
): Promise<LOOPExecutorLike | null> {
  switch (tag) {
    case "sr": {
      const mod =
        await import("$lib/features/create/generate/circular/services/strict-rotated-loop-executor");
      return mod.strictRotatedLOOPExecutor;
    }
    case "sm": {
      const mod =
        await import("$lib/features/create/generate/circular/services/strict-mirrored-loop-executor");
      return mod.strictMirroredLOOPExecutor;
    }
    case "sf": {
      const mod =
        await import("$lib/features/create/generate/circular/services/strict-flipped-loop-executor");
      return mod.strictFlippedLOOPExecutor;
    }
    case "ss": {
      const mod =
        await import("$lib/features/create/generate/circular/services/strict-swapped-loop-executor");
      return mod.strictSwappedLOOPExecutor;
    }
    case "si": {
      const mod =
        await import("$lib/features/create/generate/circular/services/strict-inverted-loop-executor");
      return mod.strictInvertedLOOPExecutor;
    }
    case "rw": {
      const mod =
        await import("$lib/features/create/generate/circular/services/rewound-loop-executor");
      return mod.rewoundLOOPExecutor;
    }
    default:
      return null;
  }
}

/**
 * Get the period for a given LOOP type tag.
 * Only rotated uses QUARTERED; all others use HALVED.
 */
export function getPeriodForTag(tag: string): Period {
  return tag === "sr" ? Period.QUARTERED : Period.HALVED;
}

/**
 * Enrich decoded steps with derived GridPlacement values.
 *
 * The flat encoder only preserves motion locations (N, E, S, W, etc.),
 * not the GridPlacement fields (alpha1, beta5, etc.) on each step.
 * But the LOOP executors need startPlacement/endPlacement for validation
 * and chaining. This function derives them from the motion locations
 * using the same logic the rest of the app uses.
 */
export function enrichStepsWithGridPlacements(steps: StepData[]): void {
  for (const step of steps) {
    // Only really-there hands may donate positions. Decode synthesizes
    // invisible placeholders for empty segments; deriving GridPlacements from
    // placeholder locations would hand LOOP executors fabricated positions
    // for blank beats (Wave 0 straggler fix, presence register site C).
    const leftRaw = step.motions?.[HandSide.LEFT];
    const rightRaw = step.motions?.[HandSide.RIGHT];
    const left = isVisibleMotion(leftRaw) ? leftRaw : undefined;
    const right = isVisibleMotion(rightRaw) ? rightRaw : undefined;

    // StepData fields are readonly, but we need to set them here because
    // the flat encoder strips GridPlacement and the executor needs it.
    const mutable = step as { startPlacement: unknown; endPlacement: unknown };

    if (left?.startLocation && right?.startLocation) {
      try {
        mutable.startPlacement = getGridPlacementFromLocations(
          left.startLocation as GridLocation,
          right.startLocation as GridLocation
        );
      } catch {
        // Unknown location combo - leave null
      }
    }

    if (left?.endLocation && right?.endLocation) {
      try {
        mutable.endPlacement = getGridPlacementFromLocations(
          left.endLocation as GridLocation,
          right.endLocation as GridLocation
        );
      } catch {
        // Unknown location combo - leave null
      }
    }
  }
}

/**
 * Compute an 8-character truncated SHA-256 hash of the input string.
 * Used for round-trip verification on recipe-encoded QR codes.
 */
export async function computeRecipeHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(buffer));
  const hexHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hexHash.slice(0, 8);
}
