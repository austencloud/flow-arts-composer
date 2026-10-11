<!--
OptionCardContent.svelte - Desktop option card wrapper

Delegates rendering to shared OptionPictograph primitive.
Used by the desktop hierarchy: OptionSection → OptionGrid → OptionCard → OptionCardContent

Dark mode is handled via CSS-first approach (:root.dark class).
-->
<script lang="ts">
  import type { PreparedPictographData } from "#lib/shared/pictograph/option/prepared-pictograph-data.js";
  import OptionPictograph from "#lib/shared/pictograph/option/OptionPictograph.svelte";

  interface Props {
    pictograph: PreparedPictographData;
    leftReversal?: boolean;
    rightReversal?: boolean;
  }

  const {
    pictograph,
    leftReversal = false,
    rightReversal = false,
  }: Props = $props();
</script>

<div class="option-card-content">
  <OptionPictograph {pictograph} {leftReversal} {rightReversal} />
</div>

<style>
  .option-card-content {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
