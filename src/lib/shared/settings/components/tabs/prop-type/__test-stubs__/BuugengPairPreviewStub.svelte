<!-- Stands in for BuugengPairPreview in component tests, which serve no grid
     artwork. It records the pair it was asked to draw. -->
<script lang="ts">
  let {
    leftFlipped,
    rightFlipped,
    dimHand = null,
  }: {
    leftFlipped: boolean;
    rightFlipped: boolean;
    dimHand?: "left" | "right" | null;
    [key: string]: unknown;
  } = $props();
</script>

<span
  class="pair-preview-stub"
  data-left-flipped={leftFlipped}
  data-right-flipped={rightFlipped}
  data-dim-hand={dimHand ?? ""}
></span>
