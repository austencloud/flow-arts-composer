<!--
  Hall of Shame Route

  Age-gated gallery for adult content.
  Deep-linking is prevented by requiring fresh verification.
-->
<script lang="ts">
  import HallOfShameGallery from "#lib/features/hall-of-shame/components/HallOfShameGallery.svelte";
</script>

<svelte:head>
  <title>Hall of Shame | TKA</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta name="description" content="Age-restricted content gallery" />
</svelte:head>

<div class="shame-route">
  <HallOfShameGallery />
</div>

<style>
  .shame-route {
    min-height: 100vh;
    background: var(--theme-panel-bg, #0a0a0f);
  }
</style>
