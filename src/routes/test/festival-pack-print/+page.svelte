<script lang="ts">
  import { goto } from "$app/navigation";
  import FestivalSamplerPrintView from "#lib/features/choreo-card/components/deck-releaser/FestivalSamplerPrintView.svelte";
</script>

<svelte:head>
  <title>Festival Sampler Print | Flow Arts Composer</title>
</svelte:head>

<div class="festival-print-page">
  <FestivalSamplerPrintView
    onExit={() => goto("/choreo_card/releaser")}
  />
</div>

<style>
  :global(body) {
    margin: 0;
    background: #0d0f16;
  }

  .festival-print-page {
    width: 100vw;
    height: 100vh;
  }
</style>
