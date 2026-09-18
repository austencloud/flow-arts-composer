/**
 * The seam for "a generate bento card grows into its workspace".
 *
 * Customize, LOOP and Setups open through here. The card wrapper in
 * CardBasedSettingsContainer claims `generate-card-<id>` while the panel is
 * closed and ExpandedCardStage claims it while open, so wrapping the state
 * change in a same-document view transition makes the browser carry the card
 * from its grid slot to the stage (or the viewport) and back. See
 * docs/superpowers/specs/2026-09-17-generate-card-morph-design.md.
 *
 * `startMorph` already answers "can a transition run": no View Transitions
 * support, reduced motion, or one already in flight all fall back to a plain
 * mutation. This module adds one more: no wrapper has claimed the name, which
 * is the public Composer demo (its own grid, no claims), where a transition
 * would snapshot the page for nothing.
 *
 * `lastRan` is set before `mutate()` runs, not after, so a panel that mounts
 * synchronously inside the mutation and reads `lastGenerateCardMorphRan` sees
 * this call's answer instead of the previous call's. On the transition path
 * that holds because `document.startViewTransition` runs its update callback
 * (where `mutate` lands) asynchronously, after `startMorph` has returned and
 * `lastRan` is assigned below.
 */
import { startMorph } from "$lib/shared/transitions/results-morph";
import { countViewTransitionNameClaims } from "$lib/shared/transitions/view-transition-name-registry";
import type { GenerateCardPanelId } from "$lib/shared/create/state/panel-coordination-state.svelte";

/** The cards that grow. Order is irrelevant; membership is the contract. */
export const GENERATE_CARD_MORPH_HOSTS = [
  "customize",
  "loop",
  "preset",
] as const satisfies readonly GenerateCardPanelId[];
export type GenerateCardMorphHost = GenerateCardPanelId;

/**
 * The view-transition name a card id claims, or "" for cards that do not
 * grow. `claimedViewTransitionName` treats "" as "no claim", so callers can
 * pass this straight through for every card.
 */
export function generateCardMorphName(cardId: string): string {
  return (GENERATE_CARD_MORPH_HOSTS as readonly string[]).includes(cardId)
    ? `generate-card-${cardId}`
    : "";
}

let lastRan = false;

/**
 * Open or close `host` by running `mutate` inside the card morph when one can
 * run. Returns true when a transition is carrying the change, false when the
 * mutation applied plainly. ExpandedCardStage reads the same answer through
 * `lastGenerateCardMorphRan` to pick its entrance.
 */
export function morphGenerateCard(
  host: GenerateCardMorphHost,
  mutate: () => void
): boolean {
  if (countViewTransitionNameClaims(generateCardMorphName(host)) === 0) {
    lastRan = false;
    mutate();
    return false;
  }
  lastRan = false;
  const transition = startMorph(mutate);
  lastRan = transition !== null;
  return lastRan;
}

/** Whether the most recent morphGenerateCard call ran as a transition. */
export function lastGenerateCardMorphRan(): boolean {
  return lastRan;
}
