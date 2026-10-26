/**
 * Guest gating for the LOOP selector.
 *
 * Guests (unauthenticated) get a deliberately limited slice of the LOOP system,
 * with signing up as the unlock channel. One lock applies: only rotated LOOP
 * types (ROTATED_LOOP_TYPES) are free. Mirrored, flipped, swapped, inverted,
 * and rewound LOOPs are a sign-up perk. Length is not gated: guests build to
 * the same 64-step ceiling as accounts (access-tier.ts).
 *
 * Pure + framework-free so it's testable and shared across every host.
 */
import { LOOPType, ROTATED_LOOP_TYPES } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { AUTH_NUDGE_TEXTS } from "#lib/shared/auth/domain/auth-nudge-trigger.js";

export type GuestLoopLock =
  | { locked: false }
  | { locked: true; reason: string };

const UNLOCKED: GuestLoopLock = Object.freeze({ locked: false });

/** Whether a LOOP type is locked for a guest. */
export function guestLoopGate(loopType: LOOPType | null): GuestLoopLock {
  if (loopType && !ROTATED_LOOP_TYPES.has(loopType)) {
    return {
      locked: true,
      // Pulled from the centralized nudge copy (auth-nudge-trigger.ts) rather
      // than a local duplicate. This is the ONLY reason string wired to
      // trigger="loop-locked-guest", so the value here IS what the guest sees,
      // not a fallback.
      reason: AUTH_NUDGE_TEXTS["loop-locked-guest"],
    };
  }

  return UNLOCKED;
}
