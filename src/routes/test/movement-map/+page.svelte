<script lang="ts">
  import MovementMapLab from "#lib/features/movement-map/MovementMapLab.svelte";
</script>

<svelte:head>
  <title>Movement Map — Level 1</title>
</svelte:head>

<div class="page">
  <MovementMapLab />
</div>

<style>
  .page {
    height: 100dvh;
    overflow: hidden;
  }
</style>
