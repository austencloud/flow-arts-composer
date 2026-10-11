/**
 * Mounts GenerateScene with props a test can change, the way the preview
 * box resizes a live scene.
 */
import { flushSync, mount, unmount } from "svelte";
import GenerateScene from "#lib/features/create/shared/components/method-previews/GenerateScene.svelte";
import type { MethodPreviewShape } from "#lib/features/create/shared/components/method-previews/method-preview-layout.js";

export function mountGenerateScene(
  target: HTMLElement,
  initial: { shape: MethodPreviewShape; width: number; height: number },
  onready: () => void
) {
  const props = $state({
    playing: false,
    turn: 0,
    accent: "#22c55e",
    ...initial,
  });
  const component = mount(GenerateScene, {
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
