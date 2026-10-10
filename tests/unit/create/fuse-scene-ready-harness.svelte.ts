/**
 * Mounts FuseScene with props a test can change, the way the preview box
 * resizes a live scene.
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
    destroy(): void {
      unmount(component);
    },
  };
}
