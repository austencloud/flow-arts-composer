<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    createCardPreviewState,
    type CardPreviewState,
  } from "./card-preview-state.svelte";

  interface Props {
    sequence: SequenceData | null;
    enabled: boolean;
    darkMode?: boolean;
    onState: (state: CardPreviewState) => void;
    onHarness?: (harness: { setWord: (word: string) => void }) => void;
  }

  let {
    sequence,
    enabled,
    darkMode = false,
    onState,
    onHarness,
  }: Props = $props();
  let currentSequence = $state(sequence);

  $effect(() => {
    currentSequence = sequence;
  });

  const previewState = createCardPreviewState({
    getSequence: () => currentSequence,
    getEnabled: () => enabled,
    getDarkMode: () => darkMode,
    getResolvedAutoLayout: () => null,
  });

  onState(previewState);
  onHarness?.({
    setWord(word) {
      if (currentSequence) {
        (currentSequence as { word: string }).word = word;
      }
    },
  });
</script>

<output
  data-url={previewState.url ?? ""}
  data-preparing={String(previewState.isPreparing)}
  data-revision={previewState.revision ?? ""}
></output>
