import { getMaxSteps, type AccessTier } from "../domain/access-tier";

import type { GuestEncorePrompt } from "../domain/auth-nudge-trigger";
export const GUEST_ENCORE_STORAGE_KEY = "fac:guest-encore:v1";
const ENCORE_ATTEMPT = 5;
export const ENCORE_STEPS = 16;

type EncoreStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * One browser-local exception, attached to an editable sequence's stable ID.
 * Composed by the existing auth drawer owner; tier limits remain in access-tier.
 * Storage is injected so SSR and restricted webviews can use a session fallback.
 */
export function createGuestEncoreState(storage: () => EncoreStorage | null) {
  let awardedSequenceId = $state<string | null>(null);

  function restore() {
    try {
      const saved = storage()?.getItem(GUEST_ENCORE_STORAGE_KEY);
      if (!saved) return;
      const record = JSON.parse(saved);
      if (
        typeof record?.sequenceId === "string" &&
        record.sequenceId.length > 0
      ) {
        awardedSequenceId = record.sequenceId;
      }
    } catch {
      // Browser storage can be disabled. Keep this session's earned exception.
    }
  }

  function prompt(
    sequenceId: string | null,
    attempts: number
  ): GuestEncorePrompt {
    if (awardedSequenceId) {
      return sequenceId === awardedSequenceId ? "limit" : "spent";
    }
    return sequenceId && attempts >= ENCORE_ATTEMPT ? "offer" : null;
  }

  return {
    restore,
    prompt,
    maxSteps(tier: AccessTier, sequenceId: string | null | undefined) {
      restore();
      return tier === "guest" && sequenceId && sequenceId === awardedSequenceId
        ? ENCORE_STEPS
        : getMaxSteps(tier);
    },
    claim(sequenceId: string | null, attempts: number) {
      restore();
      if (prompt(sequenceId, attempts) !== "offer") return false;
      awardedSequenceId = sequenceId;
      try {
        storage()?.setItem(
          GUEST_ENCORE_STORAGE_KEY,
          JSON.stringify({ sequenceId })
        );
      } catch {
        // The sequence keeps its exception in memory when persistence is blocked.
      }
      return true;
    },
  };
}
