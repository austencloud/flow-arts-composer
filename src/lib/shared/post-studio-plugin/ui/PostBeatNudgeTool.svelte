<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import type { PostItem } from "@austencloud/video-editor/core";
  import { editTakeSection } from "#lib/shared/media-composition/domain/take-timing.js";
  import PostGridOffsetControl from "#lib/shared/share/components/post-studio/builder/PostGridOffsetControl.svelte";
  import { tkaEditorOf } from "./tka-editor-context";
  import { beatsClipFor, timingSectionAt } from "./tka-beat-nudge";

  /**
   * "Nudge beats": Whole grid for the camera clip under the playhead, in the
   * editor rather than the Timing step, so the grid slides while the post
   * plays with its song, its letters and its step numbers. Every press is a
   * timing edit of that take, the same one the Timing step's box makes.
   */
  let {
    editor,
    item,
    locked,
  }: {
    editor: VideoEditorState;
    item: PostItem;
    locked: boolean;
  } = $props();

  const wrapper = $derived(tkaEditorOf(editor)?.wrapper ?? null);
  const clip = $derived(
    wrapper ? beatsClipFor(wrapper.project, item, editor.previewSeconds) : null
  );
  const timing = $derived(wrapper && clip ? wrapper.timing(clip.takeId) : null);
  const section = $derived(
    timing && clip ? timingSectionAt(timing, clip, editor.previewSeconds) : null
  );

  function setOffset(seconds: number): void {
    if (locked || !wrapper || !clip || !section) return;
    if (!Number.isFinite(seconds)) return;
    const id = section.id;
    const offsetSeconds = Math.round(seconds * 1e6) / 1e6;
    wrapper.editTiming(clip.takeId, (current) =>
      editTakeSection(current, id, wrapper.moveBeats, (part) =>
        part.offsetSeconds === offsetSeconds ? part : { ...part, offsetSeconds }
      )
    );
  }
</script>

{#if section}
  <div class="nudge">
    <p class="what">
      Whole grid for the camera clip under the playhead. Play the post and press
      the arrows until the letters land on the beat.
    </p>
    <PostGridOffsetControl
      offsetSeconds={section.offsetSeconds}
      onchange={setOffset}
      disabled={locked}
    />
  </div>
{:else}
  <p class="what">
    {clip
      ? "This clip's beats are not tapped yet. Tap them with Beats first."
      : "No camera clip plays here. Move the playhead over one."}
  </p>
{/if}

<style>
  .nudge {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }
  .what {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }
</style>
