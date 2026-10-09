/**
 * Mounts CreateMethodPreview with an `open` a test can change, the way the
 * front door opens and closes the board around a mounted preview.
 */
import { flushSync, mount, unmount } from "svelte";
import CreateMethodPreview from "$lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte";
import type { MethodPreviewSceneModule } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";

export function mountMethodPreview(
  target: HTMLElement,
  initial: {
    open: boolean;
    loader: () => Promise<MethodPreviewSceneModule>;
  }
) {
  const props = $state({ open: initial.open });
  const component = mount(CreateMethodPreview, {
    target,
    props: {
      methodId: "construct",
      color: "#3b82f6",
      loader: initial.loader,
      get open() {
        return props.open;
      },
    },
  });
  flushSync();
  return {
    setOpen(open: boolean): void {
      props.open = open;
      flushSync();
    },
    destroy(): void {
      unmount(component);
    },
  };
}
