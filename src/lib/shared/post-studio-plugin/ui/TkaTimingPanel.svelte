<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import PostTimingPanel from "#lib/shared/share/components/post-studio/builder/PostTimingPanel.svelte";
  import PostTimingAnimationSettings from "#lib/shared/share/components/post-studio/builder/PostTimingAnimationSettings.svelte";
  import { useTkaEditor } from "./tka-editor-context";

  /**
   * The timing mode's panel: beside the stage on a wide screen, and in the
   * phone's settings sheet without the primary controls the dock holds.
   */
  let {
    editor: _editor,
    showPrimary = true,
  }: { editor: VideoEditorState; showPrimary?: boolean } = $props();

  const tka = useTkaEditor();
  const session = tka.timing;
  const timingUi = tka.timingUi;
</script>

<div class="timing-panel">
  <PostTimingPanel
    {session}
    {showPrimary}
    bind:animationOpen={timingUi.animationOpen}
  >
    {#snippet animation()}
      <div
        class="timing-animation"
        tabindex="-1"
        bind:this={timingUi.animationSection}
      >
        <PostTimingAnimationSettings editor={tka.editor} {session} />
      </div>
    {/snippet}
  </PostTimingPanel>
</div>

<style>
  .timing-panel {
    display: grid;
    align-content: start;
    gap: var(--post-gap);
    min-width: 0;
  }
  .timing-animation {
    min-width: 0;
  }
</style>
