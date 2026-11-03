import type { PostStage3D } from "../item-kinds";

/**
 * The 3D clip open full size for setting up its shot, if any. The clip's own
 * stage moves into the editor's frame while it is open, so the picture that
 * grows is the one the post was showing, and it shows the draft: nothing
 * reaches the clip until Save.
 */
interface OpenShot {
  itemId: string;
  draft: PostStage3D;
  /** Where the stage sits while the editor is open; null until it is laid out. */
  frame: HTMLElement | null;
}

let open = $state.raw<OpenShot | null>(null);

export const stage3DShotEditor = {
  get open(): OpenShot | null {
    return open;
  },
  start(itemId: string, stage: PostStage3D): void {
    open = { itemId, draft: stage, frame: null };
  },
  setDraft(draft: PostStage3D): void {
    if (open) open = { ...open, draft };
  },
  setFrame(frame: HTMLElement | null): void {
    if (open && open.frame !== frame) open = { ...open, frame };
  },
  close(): void {
    open = null;
  },
  /** The stage a clip shows: its draft while open, else its own. */
  draftFor(itemId: string): PostStage3D | null {
    return open?.itemId === itemId ? open.draft : null;
  },
  frameFor(itemId: string): HTMLElement | null {
    return open?.itemId === itemId ? open.frame : null;
  },
};
