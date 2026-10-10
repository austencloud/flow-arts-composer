<!--
  /1995/scribe, /1995/filemgr, etc. - Deep links into TKA-OS

  Renders RetroDesktop and auto-opens the matching application window.
  Skips the boot sequence for deep links.
-->
<script lang="ts">
  import { page } from "$app/state";
  import RetroDesktop from "#lib/features/retro/win95/components/shell/RetroDesktop.svelte";

  // Extract the app path from the catch-all route param
  const appPath = $derived(page.params.app);
</script>

<svelte:head>
  <title>TKA-OS v1.0</title>
</svelte:head>

<RetroDesktop initialApp={appPath} />
