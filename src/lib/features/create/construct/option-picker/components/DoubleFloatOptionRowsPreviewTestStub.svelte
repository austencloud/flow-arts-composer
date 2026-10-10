<script lang="ts">
  import type { PreparedPictographData } from "#lib/shared/pictograph/option/prepared-pictograph-data.js";

  const { pictograph, size, onSelect } = $props<{
    pictograph: PreparedPictographData;
    size: number;
    onSelect: (pictograph: PreparedPictographData) => void;
  }>();
</script>

<button
  class="option-card-stub"
  style:width="{size}px"
  style:height="{size}px"
  aria-label="Add {pictograph.letter}. Hold to preview."
  onclick={() => onSelect(pictograph)}
>
  <span aria-hidden="true">{pictograph.letter}</span>
</button>

<style>
  .option-card-stub {
    display: grid;
    place-items: end start;
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: white;
    font: 700 1.5rem monospace;
    background:
      radial-gradient(circle at 28% 68%, #3d44b8 0 6px, transparent 7px),
      radial-gradient(circle at 72% 32%, #dc2626 0 6px, transparent 7px),
      linear-gradient(135deg, #020617 48%, #64748b 49% 51%, #020617 52%);
  }
</style>
