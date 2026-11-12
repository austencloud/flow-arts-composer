import { SvelteMap } from "svelte/reactivity";

/**
 * Where each 3D clip's stage is shown right now.
 *
 * A 3D stage takes seconds to build, and the editor unmounts a clip's layer
 * whenever the clip is off the playhead or faded out. So the stage lives in
 * the canvas overlay `PostStage3DKeeper` for as long as the post is open, and
 * a mounted 3D layer only lends it a slot: the layer publishes its element
 * and what the post's clock gives the performers, and the keeper moves the
 * stage into that element. When the layer goes, the stage goes back to the
 * keeper's hidden home and rests instead of being thrown away.
 */
export interface Stage3DLive {
  /** The layer's element the stage moves into. */
  slot: HTMLElement;
  /** Front performer first, then each follower, in engine positions. */
  performerSteps: readonly number[];
  exporting: boolean;
  exportSize: { width: number; height: number } | null;
}

class Stage3DSlots {
  readonly #live = new SvelteMap<string, Stage3DLive>();

  /** The clip's mounted layer, if one is showing it. */
  get(itemId: string): Stage3DLive | null {
    return this.#live.get(itemId) ?? null;
  }

  publish(itemId: string, live: Stage3DLive): void {
    this.#live.set(itemId, live);
  }

  /** The layer that owns this slot is going; a newer layer's slot stays. */
  release(itemId: string, slot: HTMLElement): void {
    if (this.#live.get(itemId)?.slot === slot) this.#live.delete(itemId);
  }
}

export const stage3DSlots = new Stage3DSlots();
