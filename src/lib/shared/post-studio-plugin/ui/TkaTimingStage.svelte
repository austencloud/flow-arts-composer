<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import PostTimingStage from "#lib/shared/share/components/post-studio/builder/PostTimingStage.svelte";
  import PostTimingAnimationPreview from "#lib/shared/share/components/post-studio/builder/PostTimingAnimationPreview.svelte";
  import { useTkaEditor } from "./tka-editor-context";

  /** The timing mode's stage: the take being mapped beside the animation. */
  let { editor: _editor }: { editor: VideoEditorState } = $props();

  const tka = useTkaEditor();
  const session = tka.timing;
  const timingUi = tka.timingUi;

  // Back to editing stops the take.
  $effect(() => () => session.pause());
</script>

<div class="timing-stage" style:--take-ratio={timingUi.ratio}>
  <PostTimingStage
    {session}
    bind:ratio={timingUi.ratio}
    onOpenAnimation={() => void timingUi.openAnimation()}
  >
    {#snippet preview()}<PostTimingAnimationPreview
        editor={tka.editor}
        {session}
        sequence={tka.displaySequence}
      />{/snippet}
  </PostTimingStage>
</div>

<style>
  .timing-stage {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  :global(.post-editor[data-layout="wide"]) .timing-stage {
    flex: none;
    width: min(
      calc(100cqh * var(--take-ratio)),
      calc(100cqw - var(--post-panel-width) - 1rem)
    );
  }
  :global(.post-editor[data-layout="phone"]) .timing-stage {
    height: 100%;
  }
</style>
