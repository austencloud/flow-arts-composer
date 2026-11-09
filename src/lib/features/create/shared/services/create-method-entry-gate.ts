/**
 * When the Create front door hands over to a method's workspace.
 *
 * Tapping a method card keeps the front door on screen until the method's
 * workspace is ready, then hands over once. Without the hold, the first entry
 * of a visit faded onto a loading bar that then popped through a spinner into
 * the panel.
 *
 * Ready means one of two things. A choreographed entry (the board's cards
 * filing away, the card splitting into the workspace's pieces) opens as soon
 * as the pieces are laid out: they fly from the card at once, and a picture
 * still drawing shows up where its piece lands. A plain crossfade waits for
 * the pictures too, since it shows the whole workspace in one fade.
 */
import { DURATION } from "#lib/shared/transitions/transitions.js";

/**
 * The longest a tap may wait before the workspace shows anyway, loading or
 * not. This is a product choice, not a measurement: past about half a second a
 * held card stops reading as "on its way" and starts reading as a tap that
 * did nothing. Running out is recorded (`cappedOut`) so the entry audit fails
 * instead of hiding a slow mount.
 */
export const CREATE_ENTRY_HOLD_CAP_MS = 2 * DURATION.emphasis;

export type CreateEntrySource = "door" | "workspace";

export interface CreateEntryGateInput {
  doorOpen: boolean;
  /** A tap's entry is waiting for its workspace. */
  entering: boolean;
  panelReady: boolean;
  /** The workspace's pieces are laid out, with no loading state left. */
  piecesReady?: boolean;
  picturesReady: boolean;
  /** The entry is choreographed, so it opens on the pieces alone. */
  openOnPieces?: boolean;
  elapsedMs: number;
  capMs?: number;
}

export interface CreateEntryGateDecision {
  source: CreateEntrySource;
  cappedOut: boolean;
}

export function decideCreateEntrySource({
  doorOpen,
  entering,
  panelReady,
  piecesReady = false,
  picturesReady,
  openOnPieces = false,
  elapsedMs,
  capMs = CREATE_ENTRY_HOLD_CAP_MS,
}: CreateEntryGateInput): CreateEntryGateDecision {
  if (doorOpen) return { source: "door", cappedOut: false };
  // A workspace reached without a tap (a direct link, a restored visit) has
  // nothing to hold for.
  if (!entering) return { source: "workspace", cappedOut: false };
  if (panelReady && (picturesReady || (openOnPieces && piecesReady))) {
    return { source: "workspace", cappedOut: false };
  }
  if (elapsedMs >= capMs) return { source: "workspace", cappedOut: true };
  return { source: "door", cappedOut: false };
}
