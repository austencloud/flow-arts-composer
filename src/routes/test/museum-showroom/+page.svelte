<script lang="ts">
  import PropsShowroom from "#lib/features/museum/components/showroom/PropsShowroom.svelte";
</script>

<svelte:head>
  <title>Museum props showroom</title>
</svelte:head>

<div class="test-page">
  <PropsShowroom />
</div>

<style>
  :global(body) {
    overflow: hidden;
    background: #0a0a0a;
  }

  .test-page {
    position: fixed;
    inset: 0;
  }
</style>
