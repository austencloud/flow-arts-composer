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
  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .page {
    border-top: var(--safe-top) solid transparent;
  }
</style>
