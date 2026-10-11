/**
 * Mounts FuseScene with props a test can change, the way the preview box
 * resizes a live scene and the turn coordinator gives it turns.
 */
import { flushSync, mount, unmount } from "svelte";
import FuseScene from "#lib/features/create/shared/components/method-previews/FuseScene.svelte";
import type { MethodPreviewShape } from "#lib/features/create/shared/components/method-previews/method-preview-layout.js";

export function mountFuseScene(
  target: HTMLElement,
  initial: { shape: MethodPreviewShape; width: number; height: number },
  onready: () => void
) {
  const props = $state({
    playing: false,
    turn: 0,
    accent: "#a855f7",
    ...initial,
  });
  const component = mount(FuseScene, {
    target,
    props: {
      get playing() {
        return props.playing;
      },
      get turn() {
        return props.turn;
      },
      get shape() {
        return props.shape;
      },
      get width() {
        return props.width;
      },
      get height() {
        return props.height;
      },
      get accent() {
        return props.accent;
      },
      onready,
    },
  });
  flushSync();
  return {
    resize(next: {
      shape: MethodPreviewShape;
      width: number;
      height: number;
    }): void {
      props.shape = next.shape;
      props.width = next.width;
      props.height = next.height;
      flushSync();
    },
    /** Start a turn, as the coordinator does. */
    play(turn: number): void {
      props.turn = turn;
      props.playing = true;
      flushSync();
    },
    /** The turn passes to the next card. */
    stop(): void {
      props.playing = false;
      flushSync();
    },
    destroy(): void {
      unmount(component);
    },
  };
}
