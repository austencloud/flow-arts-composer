<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import MandalaPane from "$lib/shared/sequence-viewer/components/MandalaPane.svelte";
  import { getPostStudioArtContext } from "./post-studio-art-context.svelte";

  interface Props {
    sequence: SequenceData;
    leftPropType?: string;
    rightPropType?: string;
  }

  let { sequence, leftPropType, rightPropType }: Props = $props();

  // The viewer's own mandala pane, on the studio's shared controller — so shape,
  // spin, speed, colors, weight and depth in the inspector move this bloom.
  //
  // The slot used to draw its own frame from `renderMandalaFrameToCanvas` with a
  // hardcoded spec. That path is the export worker's, it covers a subset of the
  // look (no palette, no colour mode, no gradient), and nothing could steer it.
  // `controlsPlacement="external"` drops the pane's bottom dock, because the
  // controls live in the inspector.
  const controller = getPostStudioArtContext().mandala;
</script>

<div class="mandala-slot">
  <MandalaPane
    ctrl={controller}
    controlsPlacement="external"
    showDownload={false}
    {sequence}
    {leftPropType}
    {rightPropType}
  />
</div>

<style>
  .mandala-slot {
    position: absolute;
    inset: 0;
    /* A frame in a composition, not a canvas the user drives — the studio's own
       transport and inspector own it. */
    pointer-events: none;
  }
</style>
