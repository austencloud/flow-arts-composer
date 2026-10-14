/**
 * Decides when a gallery card should start or stop its animated preview
 * because of where the mouse is, as opposed to the ▶ chip the reader taps.
 *
 * A mouse resting on a card plays it; leaving stops it. Touch never arms this
 * (a finger "hovers" nothing, and the chip is the touch control), and a
 * reduced-motion visitor keeps the chip-only behavior so nothing moves until
 * they ask. Kept as plain functions so the one subtle case, the pointer
 * leaving while a chip morph is still mid-flight, is testable without a DOM.
 */

/** How long the mouse rests on a card before the preview starts. Shorter
 * than this and sweeping across a row would start and stop a player per
 * card; the sequence cache warms at 150ms, so by now the data is ready. */
export const HOVER_PLAY_DWELL_MS = 300;

export interface HoverArmInput {
  pointerType: string;
  reducedMotion: boolean;
  selectionMode: boolean;
}

/** True when a pointer entering the card should start the dwell timer. */
export function shouldArmHoverPlay({
  pointerType,
  reducedMotion,
  selectionMode,
}: HoverArmInput): boolean {
  return pointerType === "mouse" && !reducedMotion && !selectionMode;
}

export type HoverPlayAction = "play" | "stop" | null;

export interface HoverReconcileInput {
  /** What the hover gesture wants: true after the dwell fires, false after
   * the pointer leaves, null when the reader took over with the chip. */
  wants: boolean | null;
  /** Whether this card is currently the one animating. */
  active: boolean;
  /** A chip-driven view-transition morph is still running; wait for it. */
  inFlight: boolean;
}

/**
 * The action that brings the player in line with the hover intent. Returns
 * null when nothing needs doing or a morph must finish first; the host calls
 * again once the morph settles, so a pointer that left mid-morph still stops
 * the player instead of leaving one engine running under a card nobody is on.
 */
export function hoverPlayAction({
  wants,
  active,
  inFlight,
}: HoverReconcileInput): HoverPlayAction {
  if (wants === null || inFlight) return null;
  if (wants && !active) return "play";
  if (!wants && active) return "stop";
  return null;
}
