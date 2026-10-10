<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import SequenceShowcasePreview from "#lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte";

  interface Props {
    word: string;
    posterUrl?: string | null;
    loadSequence: () => Promise<SequenceData | null>;
    playbackActive?: boolean;
    playbackMounted?: boolean;
    onRequestPlayback?: () => void;
  }

  let {
    word,
    posterUrl = null,
    loadSequence,
    playbackActive = true,
    playbackMounted = playbackActive,
    onRequestPlayback,
  }: Props = $props();
</script>

<!-- Messages keep playback deliberate: opening the live player is a separate
     action from opening the sequence in the full viewer. -->
<SequenceShowcasePreview
  {word}
  {posterUrl}
  {loadSequence}
  {playbackActive}
  {playbackMounted}
  {onRequestPlayback}
  activation="manual"
/>
