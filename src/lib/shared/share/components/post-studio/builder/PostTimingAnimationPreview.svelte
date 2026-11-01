<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PostEditorState } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
  import PostStudioSequenceAnimationLayer from "#lib/shared/post-studio-plugin/ui/PostStudioSequenceAnimationLayer.svelte";
  import { postFollowers } from "#lib/shared/post-studio-plugin/tunnel-performers.js";
  import { staggeredFrames } from "#lib/shared/post-studio-plugin/staggered-performers.js";
  import { createPerformerSequences } from "#lib/shared/post-studio-plugin/performer-sequences.svelte.js";
  import { mappingPreviewAppearance } from "./post-timing-animation";
  import type { PostTimingSession } from "./post-timing-session.svelte.js";

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

  // A tunnel post: the performers behind the red/blue pair ride the same
  // tapped count here as they do on the post, so the take lines up with all
  // of them.
  const followers = $derived(postFollowers(editor.project));
  const staggered = $derived(
    frame && followers.length > 0
      ? staggeredFrames(
          frame.sequenceFrame,
          sequence.steps.map((step) => step.duration ?? 1),
          followers.map((follower) => follower.beatsBehind)
        )
      : null
  );
  const followerSequences = createPerformerSequences(
    () => sequence,
    () => followers
  );
  const leader = $derived(staggered?.leader ?? frame?.sequenceFrame ?? null);
</script>

{#if frame && leader}
  <div class="preview" aria-label="Mapped animation preview">
    <PostStudioSequenceAnimationLayer
      {sequence}
      sequencePosition={leader.enginePosition}
      displayedBeatNumber={leader.move}
      sequencePassIndex={leader.pass}
      animationTimeSeconds={session.mediaSeconds}
      breakdownMotion
      breakdownMode="arrows"
      playing={session.playing}
      leftPropType={defaultPropType}
      rightPropType={defaultPropType}
      animationAppearance={appearance}
      followerPositions={staggered?.followers.map(
        (follower) => follower.enginePosition
      ) ?? []}
      followerSequences={followerSequences.current}
      followerFrames={staggered?.followers ?? []}
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
