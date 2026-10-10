<!--
  LevelsModule.svelte - Level progression labs (L4-L7 + Poi).
  Tabs appear in the sidebar.
-->
<script lang="ts">
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { LEVELS_TABS } from "#lib/shared/navigation/config/tab-definitions.js";

  // Directory names are historical and no longer track the level they serve:
  // level6-lab holds the interradial lab (now L4) and level5-lab holds the
  // centric lab (now L6). Levels 4 and 6 traded places in Aug 2026 - see the
  // `level-system` domain topic. Renaming the directories is a separate change.
  const tabComponents: Record<string, () => Promise<{ default: any }>> = {
    level4: () => import("#lib/features/levels/level6-lab/Level6LabModule.svelte"),
    level5: () => import("#lib/features/skewlab/SkewLabModule.svelte"),
    level6: () => import("#lib/features/levels/level5-lab/Level5LabModule.svelte"),
    "conjoined-grid": () => import("#lib/features/levels/conjoined-grid/ConjoinedGridTab.svelte"),
    poi: () => import("#lib/features/levels/poi-lab/PoiLabModule.svelte"),
  };

  const activeTab = $derived(navigationState.activeTab || LEVELS_TABS[0]?.id || "level4");

  let TabComponent = $state<any>(null);
  let loadError = $state<string | null>(null);

  $effect(() => {
    const loader = tabComponents[activeTab];
    if (loader) {
      loadError = null;
      try {
        const result = loader();
        if (result && typeof result.then === "function") {
          result
            .then((mod: { default: any }) => {
              TabComponent = mod.default;
            })
            .catch((err: Error) => {
              console.error(`Failed to load levels tab "${activeTab}":`, err);
              loadError = `Failed to load "${activeTab}" tab`;
              TabComponent = null;
            });
        } else {
          const mod = result as unknown as { default: any };
          if (mod && mod.default) {
            TabComponent = mod.default;
          } else {
            console.error(`Unexpected loader result for "${activeTab}":`, result);
            loadError = `Failed to load "${activeTab}" tab`;
            TabComponent = null;
          }
        }
      } catch (err) {
        console.error(`Error calling loader for "${activeTab}":`, err);
        loadError = `Failed to load "${activeTab}" tab`;
        TabComponent = null;
      }
    } else {
      if (navigationState.currentModule === "levels") {
        loadError = `Unknown tab: ${activeTab}`;
      }
      TabComponent = null;
    }
  });
</script>

<div class="levels-module">
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
  .levels-module {
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
