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
import { STAGGER } from "$lib/shared/transitions/transitions";
import { countViewTransitionNameClaims } from "$lib/shared/transitions/view-transition-name-registry";
import type { GenerateCardPanelId } from "$lib/shared/create/state/panel-coordination-state.svelte";

/** The cards that grow. Order is irrelevant; membership is the contract. */
export const GENERATE_CARD_MORPH_HOSTS = [
  "customize",
  "loop",
  "preset",
  "tnd",
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

interface GenerateCardMorphOptions {
  /**
   * Runs once the card is visually at its destination. Plain/reduced-motion
   * paths settle on one tight state-stabilization beat; a real View Transition
   * waits for `finished`. This is the seam for handing the shared workspace to
   * the next surface without letting two major entrances compete for it.
   */
  onSettled?: () => void;
}

function schedulePlainSettlement(onSettled: () => void): void {
  // Leave one tight choreography beat for selection-derived effects to settle.
  // This is not visible motion; it prevents the destination drawer from being
  // opened and then closed again inside the same reactive turn.
  setTimeout(onSettled, STAGGER.micro);
}

function runWhenSettled(
  transition: ViewTransition | null,
  onSettled: (() => void) | undefined
): void {
  if (!onSettled) return;
  if (!transition) {
    // Even an instant/reduced-motion handoff waits until the initiating click
    // has finished propagating. Opening the destination synchronously here
    // lets later selection effects from that same click close it again before
    // it ever paints.
    schedulePlainSettlement(onSettled);
    return;
  }

  // A skipped transition still completed the state mutation. Continue the
  // handoff on either outcome so the destination panel can never get stuck.
  void transition.finished.then(onSettled, onSettled);
}

/**
 * Open or close `host` by running `mutate` inside the card morph when one can
 * run. Returns true when a transition is carrying the change, false when the
 * mutation applied plainly. ExpandedCardStage reads the same answer through
 * `lastGenerateCardMorphRan` to pick its entrance.
 */
export function morphGenerateCard(
  host: GenerateCardMorphHost,
  mutate: () => void,
  options: GenerateCardMorphOptions = {}
): boolean {
  if (countViewTransitionNameClaims(generateCardMorphName(host)) === 0) {
    lastRan = false;
    mutate();
    if (options.onSettled) schedulePlainSettlement(options.onSettled);
    return false;
  }
  lastRan = false;
  const transition = startMorph(mutate);
  lastRan = transition !== null;
  runWhenSettled(transition, options.onSettled);
  return lastRan;
}

/** Whether the most recent morphGenerateCard call ran as a transition. */
export function lastGenerateCardMorphRan(): boolean {
  return lastRan;
}
