<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import PostTimingTimeline from "$lib/shared/share/components/post-studio/builder/PostTimingTimeline.svelte";
  import { useTkaEditor } from "./tka-editor-context";

  /** The timing mode's timeline: the take's landings under the moves square. */
  let { editor: _editor }: { editor: VideoEditorState } = $props();

  const tka = useTkaEditor();
  const session = tka.timing;
</script>

<div class="timing-timeline">
  <PostTimingTimeline
    {session}
    squarePainter={tka.strips.painterFor?.("arrows") ?? null}
  />
</div>

<style>
  .timing-timeline {
    grid-area: timeline;
    min-width: 0;
  }
  :global(.post-editor[data-short-mapping="true"]) .timing-timeline {
    align-self: center;
  }
</style>
