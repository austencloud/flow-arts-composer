<!--
OptionPictographCell.svelte - Mobile option pictograph cell wrapper

Lightweight wrapper that delegates to shared OptionPictograph primitive.
Used by mobile hierarchy: OptionViewerSwipeLayout → OptionViewerSection → OptionPictographCell

Dark mode is handled via CSS-first approach (:root.dark class).
-->

<script lang="ts">
  import type { PreparedPictographData } from "#lib/shared/pictograph/option/prepared-pictograph-data.js";
  import OptionPictograph from "#lib/shared/pictograph/option/OptionPictograph.svelte";

  let {
    pictographData,
    leftReversal = false,
    rightReversal = false,
  } = $props<{
    pictographData: PreparedPictographData;
    leftReversal?: boolean;
    rightReversal?: boolean;
  }>();
</script>

<div class="option-pictograph-cell">
  <OptionPictograph
    pictograph={pictographData}
    {leftReversal}
    {rightReversal}
  />
</div>

<style>
  .option-pictograph-cell {
    width: 100%;
    height: 100%;
    display: block;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
</style>
