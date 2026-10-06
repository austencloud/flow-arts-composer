/**
 * Card Grid Layout Context
 *
 * The grid layout the viewer's 2D animation draws, handed to the cards inside
 * the viewer so they, and the pictures made from them, join their grids while
 * its Conjoined switch is on. Cards anywhere else (gallery, Learn, store) find
 * nothing here and draw only the joins saved with the sequence.
 */

import { getContext, setContext } from "svelte";
import type { GridLayout } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";

const KEY = Symbol("card-grid-layout");

/** `getLayout` must read reactive state so cards redraw when it changes. */
export function setCardGridLayoutContext(getLayout: () => GridLayout): void {
  setContext(KEY, getLayout);
}

/** The viewer's layout source, or null outside a viewer. */
export function tryGetCardGridLayoutContext(): (() => GridLayout) | null {
  try {
    return getContext<(() => GridLayout) | undefined>(KEY) ?? null;
  } catch {
    return null;
  }
}
