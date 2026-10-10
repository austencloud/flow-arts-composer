<script lang="ts">
  import TunnelArtView from "$lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { ViewerPlaybackState } from "$lib/shared/sequence-viewer/domain/viewer-prop-groups";
  import { getPostStudioArtContext } from "./post-studio-art-context.svelte";

  interface Props {
    sequence: SequenceData;
    playing: boolean;
    bpm: number;
    leftPropType?: string;
    rightPropType?: string;
  }

  let { sequence, playing, bpm, leftPropType, rightPropType }: Props = $props();

  // TunnelArtView reads exactly one thing off the viewer's playback state — the
  // sequence the transport is showing. Post Studio has no viewer transport, so
  // the slot hands it the sequence directly rather than dragging in the whole
  // viewer playback object for one field.
  const playback = {
    animationState: { sequenceData: sequence },
  } as unknown as ViewerPlaybackState;

  // The studio owns the controller so the inspector's tunnel controls drive
  // this canvas. Activation is refcounted — both slots can be tunnels.
  const art = getPostStudioArtContext();
  const controller = art.tunnel;
  $effect(() => art.retainTunnel());
</script>

<div class="tunnel-slot">
  <TunnelArtView
    {sequence}
    {playback}
    {controller}
    {bpm}
    {leftPropType}
    {rightPropType}
    {playing}
    onPlayingChange={() => undefined}
    stageFit="cover"
  />
</div>

<style>
  .tunnel-slot {
    position: absolute;
    inset: 0;
    /* The slot is a frame in a composition, not a canvas the user drives — the
       studio's own transport owns play/pause. */
    pointer-events: none;
  }
</style>
