<script lang="ts">
  // The prop-dodge prototype now lives as the Lab module's "Dodge" tab. This dev
  // route is a thin wrapper so the existing URL keeps working; the single source
  // of truth is DodgeTab.svelte.
  import DodgeTab from "#lib/features/lab/tabs/dodge/DodgeTab.svelte";
</script>

<svelte:head>
  <title>Prop-Dodge Harness</title>
</svelte:head>

<div class="wrapper">
  <DodgeTab />
</div>

<style>
  .wrapper {
    width: 100%;
    height: 100vh;
  }
</style>
