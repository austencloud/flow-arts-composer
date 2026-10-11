<!--
  PremiumModule - Premium subscription as a full module

  Shown to non-premium users in the main navigation.
  Disappears after user subscribes.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import PremiumShowcase from "./components/PremiumShowcase.svelte";

  let hapticService = $state<HapticFeedback | null>(null);

  $effect(() => {
    hapticService = getHapticFeedback();
  });
</script>

<div class="premium-module">
  <PremiumShowcase {hapticService} />
</div>

<style>
  .premium-module {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }
</style>
