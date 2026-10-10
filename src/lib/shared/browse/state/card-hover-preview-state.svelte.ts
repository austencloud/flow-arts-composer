/**
 * Card hover preview state.
 *
 * Exactly one gallery card animates at a time. Cards register their own hover
 * (or a long-press on touch) here and read back whether they're the active one;
 * the animation renders inside that card, so this module owns nothing but the
 * "who's playing" question.
 *
 * A single shared owner rather than a per-card boolean, for two reasons: one
 * AnimationEngine can exist at a time no matter how large the grid is, and a
 * card whose pointerleave never fires (recycled by the virtualizer, pointer
 * yanked off-window) can't strand a second animation running behind the scenes.
 *
 * Cards talk to this module directly rather than through props, so the feature
 * lands on every grid that renders ChoreoCardThumbnail without threading a
 * callback through BrowseGrid, the virtualizer, pickers, and modals.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

class CardHoverPreviewState {
  active = $state<SequenceData | null>(null);

  request(sequence: SequenceData): void {
    this.active = sequence;
  }

  /**
   * Dismiss. Pass a sequence id to make it a no-op when a different card has
   * already taken over — pointerleave on the outgoing card can land after
   * pointerenter on the incoming one.
   */
  dismiss(sequenceId?: string): void {
    if (!this.active) return;
    if (sequenceId && this.active.id !== sequenceId) return;
    this.active = null;
  }

  isActive(sequenceId: string): boolean {
    return this.active?.id === sequenceId;
  }
}

export const cardHoverPreview = new CardHoverPreviewState();
