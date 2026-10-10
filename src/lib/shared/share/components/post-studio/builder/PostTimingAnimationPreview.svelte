<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PostEditorState } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
  import PostStudioSequenceAnimationLayer from "../PostStudioSequenceAnimationLayer.svelte";
  import { mappingPreviewAppearance } from "./post-timing-animation";
  import type { PostTimingSession } from "./post-timing-session.svelte";

  let {
    editor,
    session,
    sequence,
    defaultPropType,
  }: {
    editor: PostEditorState;
    session: PostTimingSession;
    sequence: SequenceData;
    defaultPropType?: PropType;
  } = $props();

  const appearance = $derived(
    mappingPreviewAppearance(editor.project, session.takeId)
  );
  const frame = $derived(session.paintFrame);
</script>

{#if frame}
  <div class="preview" aria-label="Mapped animation preview">
    <PostStudioSequenceAnimationLayer
      {sequence}
      sequencePosition={frame.sequencePosition}
      displayedBeatNumber={frame.displayedBeatNumber}
      sequencePassIndex={frame.sequenceFrame.pass}
      animationTimeSeconds={session.mediaSeconds}
      breakdownMotion
      breakdownMode="arrows"
      playing={session.playing}
      leftPropType={defaultPropType}
      rightPropType={defaultPropType}
      animationAppearance={appearance}
    />
  </div>
{/if}

<style>
  .preview {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
