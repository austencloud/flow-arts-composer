import type { PerformerHubTab } from "./performer-hub-types";

/**
 * What the Performers hub tells the user when the selection is None.
 *
 * Scoped writes are a no-op with no performers selected, so a tab whose every
 * control is scoped locks and says why. Planes and Effects keep working:
 * plane visibility and the effects default belong to the scene, so those tabs
 * only explain which part still needs a performer.
 */
export interface PerformerHubEmptyScope {
  message: string;
  /** True when every control on the tab writes to selected performers. */
  locksTab: boolean;
}

const EMPTY_SCOPE: Record<PerformerHubTab, PerformerHubEmptyScope> = {
  character: {
    message: "Pick a performer to change characters.",
    locksTab: true,
  },
  sequence: {
    message: "Pick a performer to load a sequence.",
    locksTab: true,
  },
  prop: { message: "Pick a performer to change props.", locksTab: true },
  effort: { message: "Pick a performer to change effort.", locksTab: true },
  planes: {
    message:
      "Pick a performer to move hand planes. Showing or hiding a plane still works.",
    locksTab: false,
  },
  effects: {
    message: "No performer picked, so effects change the scene default.",
    locksTab: false,
  },
};

export function resolvePerformerHubEmptyScope(
  tab: PerformerHubTab,
  selectedCount: number
): PerformerHubEmptyScope | null {
  return selectedCount > 0 ? null : EMPTY_SCOPE[tab];
}
