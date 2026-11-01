/**
 * When the Create front door hands over to a method's workspace.
 *
 * Tapping a method card keeps the front door on screen until the method's
 * panel has mounted and its pictures have drawn, then crossfades once onto the
 * finished workspace. Without the hold, the first entry of a visit faded onto
 * a loading bar that then popped through a spinner into the panel.
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
  picturesReady: boolean;
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
  picturesReady,
  elapsedMs,
  capMs = CREATE_ENTRY_HOLD_CAP_MS,
}: CreateEntryGateInput): CreateEntryGateDecision {
  if (doorOpen) return { source: "door", cappedOut: false };
  // A workspace reached without a tap (a direct link, a restored visit) has
  // nothing to hold for.
  if (!entering) return { source: "workspace", cappedOut: false };
  if (panelReady && picturesReady) {
    return { source: "workspace", cappedOut: false };
  }
  if (elapsedMs >= capMs) return { source: "workspace", cappedOut: true };
  return { source: "door", cappedOut: false };
}
