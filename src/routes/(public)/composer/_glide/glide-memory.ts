/**
 * Keeps where the /composer stage rests with each history entry, through
 * SvelteKit's page snapshot, so Back, Forward and reload return the reader to
 * the section they left. The browser's own scroll restore cannot: the stage's
 * scroll offsets mean nothing to the plain page the route first renders.
 *
 * SvelteKit restores a snapshot before the stage has started, while the page
 * is still arriving, and captures one while the stage is running, as the
 * reader leaves. The memory holds a restored place until the arriving stage
 * takes it, and hands a running stage's place to SvelteKit.
 */
import type { Snapshot } from "@sveltejs/kit";
import type { GlidePlace } from "./glide-plan";

export interface GlideStageLink {
  /** Where the stage rests now. */
  resting(): GlidePlace;
  /** Moves the running stage straight to a remembered place. */
  jump(place: GlidePlace): void;
}

export interface GlideMemory {
  /** Export this from the route's +page.svelte as `snapshot`. */
  readonly snapshot: Snapshot<GlidePlace | null>;
  /** The place restored for the navigation under way, once; null after. */
  takeRestored(): GlidePlace | null;
  /** Connects a running stage; the returned function disconnects it. */
  connect(stage: GlideStageLink): () => void;
}

export function createGlideMemory(): GlideMemory {
  let restored: GlidePlace | null = null;
  let running: GlideStageLink | null = null;

  return {
    snapshot: {
      capture: () => running?.resting() ?? null,
      restore: (place) => {
        if (!place) return;
        if (running) running.jump(place);
        else restored = place;
      },
    },
    takeRestored() {
      const place = restored;
      restored = null;
      return place;
    },
    connect(stage) {
      running = stage;
      return () => {
        if (running === stage) running = null;
      };
    },
  };
}
