/**
 * Which generate card a morph is carrying open right now, if any.
 *
 * A card that is still in flight shows a light stand-in instead of its full
 * contents. The browser lays out and snapshots the destination before the
 * motion can start, and on a phone a panel full of pictographs held the tap
 * back for well over a second. The stand-in is the panel's own frame and
 * title, so the box that grows is the same box that lands; the contents move
 * in once it has.
 *
 * Owner: generate-card-morph.ts sets it; ExpandedCardStage reads it.
 */
import type { GenerateCardPanelId } from "#lib/shared/create/state/panel-coordination-state.svelte.js";

export const generateCardFlight = $state<{ opening: GenerateCardPanelId | null }>(
  { opening: null }
);
