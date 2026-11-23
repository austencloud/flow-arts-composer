<script lang="ts">
  import ContactViewerRequired from "#lib/shared/3d/components/ContactViewerRequired.svelte";
</script>

<svelte:head>
  <title>Contact Viewer Boundary</title>
</svelte:head>

<main>
  <ContactViewerRequired />
</main>

<style>
  main {
    /* behind the status bar: a backdrop holding one centred notice */
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #090d18;
  }
</style>
