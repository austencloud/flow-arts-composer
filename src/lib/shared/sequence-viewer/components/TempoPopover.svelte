<script lang="ts">
  import BpmChips from "#lib/shared/animation-engine/components/controls/BpmChips.svelte";

  interface Props {
    bpm: number;
    onBpmChange: (bpm: number) => void;
  }
  let { bpm, onBpmChange }: Props = $props();
</script>

<BpmChips {bpm} variant="full" {onBpmChange} />
