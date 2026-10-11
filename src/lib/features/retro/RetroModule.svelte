<!--
  RetroModule.svelte - Retro era renderers: 1989 DOS terminal, 1995 Win95 desktop.
  Tabs appear in the sidebar. Navigation handled by the nav system.
-->
<script lang="ts">
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { RETRO_TABS } from "#lib/shared/navigation/config/tab-definitions.js";

  const tabComponents: Record<string, () => Promise<{ default: any }>> = {
    dos: () => import("./dos/components/DosTerminal.svelte"),
    desktop: () => import("./win95/components/shell/RetroDesktop.svelte"),
    timeline: () => import("./labs/PictographTimelineLab.svelte"),
    history: () => import("./labs/PictographHistoryLab.svelte"),
  };

  const activeTab = $derived(navigationState.activeTab || RETRO_TABS[0]?.id || "dos");

  let TabComponent = $state<any>(null);
  let loadError = $state<string | null>(null);

  $effect(() => {
    const loader = tabComponents[activeTab];
    if (loader) {
      loadError = null;
      loader()
        .then((mod: { default: any }) => {
          TabComponent = mod.default;
        })
        .catch((err: Error) => {
          console.error(`Failed to load retro tab "${activeTab}":`, err);
          loadError = `Failed to load "${activeTab}" tab`;
          TabComponent = null;
        });
    } else {
      if (navigationState.currentModule === "retro") {
        loadError = `Unknown tab: ${activeTab}`;
      }
      TabComponent = null;
    }
  });
</script>

<div class="retro-module">
  {#if loadError}
    <div class="load-error">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <span>{loadError}</span>
    </div>
  {:else if TabComponent}
    <TabComponent />
  {:else}
    <div class="loading">
      <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
    </div>
  {/if}
</div>

<style>
  .retro-module {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .load-error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    height: 100%;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 1.5rem;
  }
</style>
