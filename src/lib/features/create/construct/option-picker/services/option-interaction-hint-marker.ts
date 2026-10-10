import {
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "#lib/shared/foundation/services/storage-manager.js";

const OPTION_INTERACTION_HINT_SEEN_KEY =
  "tka-construct-option-interaction-hint-v1";

export function hasSeenOptionInteractionHint(): boolean {
  if (typeof window === "undefined") return true;
  return (
    safeLocalStorageGet<boolean>(OPTION_INTERACTION_HINT_SEEN_KEY, false) ===
    true
  );
}

export function markOptionInteractionHintSeen(): void {
  if (typeof window === "undefined") return;
  safeLocalStorageSet(OPTION_INTERACTION_HINT_SEEN_KEY, true);
}
