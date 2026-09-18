/**
 * Prop types for ExpandedCardStage.svelte, pulled out of the component's
 * <script lang="ts"> because svelte-check rejects `export interface` there.
 * Derived from the panels' own prop types (ComponentProps) instead of
 * hand-rolled duplicates, so a forwarded prop cannot drift out of sync.
 */
import type { ComponentProps } from "svelte";
import type { GenerateCardPanelId } from "$lib/shared/create/state/panel-coordination-state.svelte";
import LOOPExpandedOverlay from "./LOOPExpandedOverlay.svelte";
import SetupsPanel from "../presets/SetupsPanel.svelte";

export type LoopStageProps = Pick<
  ComponentProps<typeof LOOPExpandedOverlay>,
  | "rhythm"
  | "sequenceLength"
  | "onRhythmChange"
  | "onLoopDisable"
  | "guestMaxLength"
  | "onRequestSignup"
>;

export type SetupsStageProps = Omit<
  ComponentProps<typeof SetupsPanel>,
  "onClose" | "titleId"
>;

/** The dialog title id a grown card's chrome exposes, so the stage root's
 *  aria-labelledby and the panel's own heading agree without either side
 *  hardcoding the other's id format. */
export function expandedCardTitleId(card: GenerateCardPanelId): string {
  return `expanded-card-title-${card}`;
}
