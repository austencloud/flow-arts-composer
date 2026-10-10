/**
 * Guest gating for the LOOP selector.
 *
 * Guests (unauthenticated) get a deliberately limited slice of the LOOP system,
 * with signing up as the unlock channel. Two independent locks apply:
 *
 *  - CATEGORY: only rotated LOOP types (ROTATED_LOOP_TYPES) are free. Mirrored,
 *    flipped, swapped, inverted, and rewound LOOPs are a sign-up perk.
 *  - LENGTH: a config whose minimum buildable length exceeds the guest step cap
 *    can never generate for a guest (e.g. a quartered inversion combo needs 16
 *    steps; guests cap at 8). Lock it instead of surfacing a raw engine error.
 *
 * Pure + framework-free so it's testable and shared across every host.
 */
import type { LOOPSpecWire } from "@tka/sequence-engine/loop";
import { LOOPType, ROTATED_LOOP_TYPES } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { expanderMultiplier, specHasExpandInversion } from "./loop-type-utils";
import { AUTH_NUDGE_TEXTS } from "#lib/shared/auth/domain/auth-nudge-trigger.js";

export type GuestLoopLockKind = "category" | "length";

export type GuestLoopLock =
  | { locked: false }
  | { locked: true; kind: GuestLoopLockKind; reason: string };

const UNLOCKED: GuestLoopLock = Object.freeze({ locked: false });

/**
 * Smallest sequence length this spec can actually build. The engine expands a
 * seed by `expanderMultiplier`, and an expand-mode inversion needs a seed of at
 * least 2 steps (a one-step seed is dash-only, nothing to flip). So the floor
 * is one seed (×1), or two seeds (×2) when an expand inversion is present.
 */
export function minBuildableLength(wire: LOOPSpecWire): number {
  return expanderMultiplier(wire) * (specHasExpandInversion(wire) ? 2 : 1);
}

/**
 * Whether a LOOP config is locked for a guest. `maxLength` is the guest step cap
 * (getMaxSteps("guest")). Category is checked first so the copy points at the
 * cheaper unlock ("rotated is free") before the length ceiling.
 */
export function guestLoopGate(
  loopType: LOOPType | null,
  wire: LOOPSpecWire | null,
  maxLength: number,
): GuestLoopLock {
  if (loopType && !ROTATED_LOOP_TYPES.has(loopType)) {
    return {
      locked: true,
      kind: "category",
      // Pulled from the centralized nudge copy (auth-nudge-trigger.ts) rather
      // than a local duplicate. This is the ONLY reason string wired to
      // trigger="loop-locked-guest", so the value here IS what the guest sees,
      // not a fallback.
      reason: AUTH_NUDGE_TEXTS["loop-locked-guest"],
    };
  }

  if (wire) {
    const min = minBuildableLength(wire);
    if (min > maxLength) {
      return {
        locked: true,
        kind: "length",
        reason: `This LOOP needs at least ${min} steps. Guests cap at ${maxLength}. Create a free account for up to 64 steps.`,
      };
    }
  }

  return UNLOCKED;
}
