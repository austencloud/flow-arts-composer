/**
 * Which door handed a sequence to the Composer, carried with the hand-over.
 *
 * The standalone sequence page has several ways into Construct (the
 * "Made with Flow Arts Composer" line, the header button, Back on a cold
 * arrival). It writes the door here beside the pending sequence; Create
 * takes it when it actually loads that sequence and reports one
 * `composer_sequence_received`, so the doors can be compared by what reached
 * Construct, not only by what was pressed.
 */
import { captureWhenReady } from "#lib/shared/analytics/services/posthog.js";

const DOOR_KEY = "tka-pending-edit-door";
/** A door older than this belongs to a hand-over Create never loaded. */
const DOOR_MAX_AGE_MS = 10 * 60 * 1000;

export interface ComposerHandoffDoor {
  door: string;
  arrival?: string;
}

interface StoredDoor extends ComposerHandoffDoor {
  at: number;
}

export function markComposerHandoffDoor(
  door: ComposerHandoffDoor,
  now = Date.now()
): void {
  try {
    localStorage.setItem(DOOR_KEY, JSON.stringify({ ...door, at: now }));
  } catch {
    // Storage blocked: the hand-over still works, it is only not counted.
  }
}

/** Read and clear the door. Null when none is waiting or it went stale. */
export function takeComposerHandoffDoor(
  now = Date.now()
): ComposerHandoffDoor | null {
  let stored: StoredDoor | null = null;
  try {
    const text = localStorage.getItem(DOOR_KEY);
    if (text === null) return null;
    localStorage.removeItem(DOOR_KEY);
    stored = JSON.parse(text) as StoredDoor;
  } catch {
    return null;
  }
  if (
    !stored ||
    typeof stored.door !== "string" ||
    typeof stored.at !== "number" ||
    now - stored.at > DOOR_MAX_AGE_MS
  ) {
    return null;
  }
  return stored.arrival
    ? { door: stored.door, arrival: stored.arrival }
    : { door: stored.door };
}

/** Create loaded a handed-over sequence; report it if a door sent it. */
export function reportComposerHandoffReceived(
  handoff: string | undefined
): void {
  const door = takeComposerHandoffDoor();
  if (!door) return;
  captureWhenReady("composer_sequence_received", {
    door: door.door,
    ...(door.arrival ? { arrival: door.arrival } : {}),
    handoff: handoff ?? "unknown",
  });
}
