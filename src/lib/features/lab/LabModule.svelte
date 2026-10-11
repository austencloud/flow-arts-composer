<!--
  LabModule.svelte - Consolidated experiments and UI prototypes

  A unified module for temporary experiments that would otherwise clutter
  the sidebar as individual modules. Each tab is a self-contained experiment.

  Navigation between tabs is handled by the sidebar - no internal tab bar needed.

  When experiments graduate to production, move them to their proper module.
  When experiments are abandoned, delete the tab component.
-->
<script lang="ts">
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { LAB_TABS } from "#lib/shared/navigation/config/tab-definitions.js";

  // Dynamic tab imports - add new experiments here
  const tabComponents: Record<string, () => Promise<{ default: any }>> = {
    // level4, level5, level6, level7, poi graduated to Levels module (Mar 2026)
    // mandala, mandala-collection graduated to Mandala module (May 2026)
    themes: () => import("#lib/features/themes-lab/ThemesLab.svelte"),
    // multi-grid graduated to Levels module as conjoined-grid (Mar 2026)
    // community, connect graduated to Social module (Mar 2026)
    voice: () => import("./tabs/VoiceControlLab.svelte"),
    "pronunciation-recorder": () =>
      import("./pronunciation-recorder/PronunciationRecorderLab.svelte"),
    vtg: () => import("#lib/features/lab/vtg-lab/VtgLabModule.svelte"),
    // skel2tka graduated to Video module (Mar 2026)
    trigrid: () =>
      import("#lib/features/lab/trigrid-lab/TriGridLabModule.svelte"),
    effects: () =>
      import("#lib/features/lab/effects-lab/EffectsLabModule.svelte"),
    "prop-buttons": () => import("./tabs/PropButtonLab.svelte"),
    // retro, ascii-pictograph, retro-pictograph graduated to Retro module (Mar 2026)
    "phrase-effort": () =>
      import("#lib/features/lab/phrase-effort-lab/PhraseEffortLabModule.svelte"),
    village: () => import("#lib/features/village/VillageLabTab.svelte"),
    "pov-pattern": () => import("./tabs/PovPatternLab.svelte"),
    combinator: () => import("./tabs/combinator/CombinatorLab.svelte"),
    "collision-lab": () => import("./tabs/collision-lab/CollisionLab.svelte"),
    dodge: () => import("./tabs/dodge/DodgeTab.svelte"),
    "spatial-lab": () => import("./tabs/spatial-lab/SpatialLab.svelte"),
    "fan-relations": () =>
      import("./tabs/fan-relations/FanRelationsLab.svelte"),
    stickers: () => import("#lib/features/sticker-lab/StickerLab.svelte"),
    // pictograph-explorer graduated to the learn Codex tab as the unified CodexExplorer (Jun 2026)
    // hand-path-explorer, hand-path-builder graduated to Hand Paths module (Mar 2026)
    // video-trails, video-lab graduated to Video module (Mar 2026)
  };

  // Get current tab, default to first tab
  const activeTab = $derived(
    navigationState.activeTab || LAB_TABS[0]?.id || "spell-layouts"
  );

  // Load the active tab component
  let TabComponent = $state<any>(null);
  let loadError = $state<string | null>(null);

  $effect(() => {
    const loader = tabComponents[activeTab];
    if (loader) {
      loadError = null;
      // Call the loader and handle both Promise and direct module returns (HMR edge case)
      try {
        const result = loader();
        // Check if it's a Promise (has .then method)
        if (result && typeof result.then === "function") {
          result
            .then((mod: { default: any }) => {
              TabComponent = mod.default;
            })
            .catch((err: Error) => {
              console.error(`Failed to load lab tab "${activeTab}":`, err);
              loadError = `Failed to load "${activeTab}" tab`;
              TabComponent = null;
            });
        } else {
          // HMR might return the module directly instead of a Promise
          const mod = result as unknown as { default: any };
          if (mod && mod.default) {
            TabComponent = mod.default;
          } else {
            console.error(
              `Unexpected loader result for "${activeTab}":`,
              result
            );
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
      // Only error when lab is actually the active module - cross-module tab changes
      // fire here transiently during view transitions before uiState.activeModule updates.
      if (navigationState.currentModule === "lab") {
        loadError = `Unknown tab: ${activeTab}`;
      }
      TabComponent = null;
    }
  });
</script>

<div class="lab-module">
  {#if loadError}
    <div class="lab-error">
      <i class="fas fa-exclamation-triangle"></i>
      <span>{loadError}</span>
    </div>
  {:else if TabComponent}
    <TabComponent />
  {:else}
    <div class="lab-loading">
      <i class="fas fa-circle-notch fa-spin"></i>
      <span>Loading experiment...</span>
    </div>
  {/if}
</div>

<style>
  .lab-module {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .lab-loading,
  .lab-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: 14px;
  }

  .lab-error {
    color: var(--semantic-error, #ef4444);
  }

  .lab-loading i,
  .lab-error i {
    font-size: 24px;
  }
</style>
