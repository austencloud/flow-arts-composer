/**
 * Mounts ConstructScene with props a test can change, the way the preview
 * box resizes a live scene.
 */
import { flushSync, mount, unmount } from "svelte";
import ConstructScene from "$lib/features/create/shared/components/method-previews/ConstructScene.svelte";
import type { MethodPreviewShape } from "$lib/features/create/shared/components/method-previews/method-preview-layout";

export function mountConstructScene(
  target: HTMLElement,
  initial: { shape: MethodPreviewShape; width: number; height: number },
  onready: () => void
) {
  const props = $state({
    playing: false,
    turn: 0,
    accent: "#3b82f6",
    ...initial,
  });
  const component = mount(ConstructScene, {
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
