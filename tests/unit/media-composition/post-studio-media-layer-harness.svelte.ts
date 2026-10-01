import { flushSync, mount, unmount } from "svelte";
import PostStudioMediaLayer from "$lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte";
import type { CompositionSourceBinding } from "$lib/shared/media-composition/state/media-composition-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

export function mountPlaybackMediaLayer() {
  let binding = $state.raw<CompositionSourceBinding>({
    roleKey: "take:performance",
    kind: "video",
    previewType: "video",
    renderMode: "external-media",
    label: "Performance",
    previewUrl: "blob:performance",
    status: "ready",
  });
  let sourceTimeSeconds = $state(0);
  let playing = $state(true);
  const target = document.body.appendChild(document.createElement("div"));
  const component = mount(PostStudioMediaLayer, {
    target,
    props: {
      get binding() {
        return binding;
      },
      get sourceTimeSeconds() {
        return sourceTimeSeconds;
      },
      get playing() {
        return playing;
      },
      fit: "cover",
      opacity: 1,
      sequence: { steps: [] } as unknown as SequenceData,
      clipId: "performance",
      transform: {
        scale: 1,
        translateX: 0,
        translateY: 0,
        rotationDegrees: 0,
        flipHorizontal: false,
      },
    },
  });
  flushSync();
  return {
    target,
    video: target.querySelector("video")!,
    canvas: target.querySelector("canvas")!,
    tick(time: number) {
      // The real workspace creates a new bindingFor() result each frame.
      binding = { ...binding };
      sourceTimeSeconds = time;
      flushSync();
    },
    changeSource(url: string) {
      binding = { ...binding, previewUrl: url };
      flushSync();
    },
    setPlaying(value: boolean) {
      playing = value;
      flushSync();
    },
    async destroy() {
      await unmount(component);
      target.remove();
    },
  };
}
