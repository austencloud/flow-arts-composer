<script lang="ts">
  import {
    loadQftSession,
    saveQftSession,
  } from "#lib/shared/notation/qft/qft-session.js";
  import { createQftAppState } from "./_state/qft-app-state.svelte";
  import { setQftAppContext } from "./_context/qft-app-context";
  import QftAppShell from "./_components/QftAppShell.svelte";
  import QftArchivePanel from "./_components/QftArchivePanel.svelte";
  import QftBackground from "./_components/QftBackground.svelte";
  import QftInfoPanel from "./_components/QftInfoPanel.svelte";
  import QftLanding from "./_components/QftLanding.svelte";

  const state = createQftAppState({
    loadSession: loadQftSession,
    saveSession: saveQftSession,
  });
  setQftAppContext(state);
</script>

<QftBackground />
<QftAppShell />

{#if !state.entered}
  <QftLanding />
{/if}

{#if state.showArchive}
  <QftArchivePanel />
{/if}

{#if state.showInfo}
  <QftInfoPanel />
{/if}
