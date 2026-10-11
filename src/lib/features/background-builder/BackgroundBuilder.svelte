<script lang="ts">
  import { onMount } from "svelte";
  import CosmicLab from "./components/CosmicLab.svelte";
  import OceanLab from "./components/OceanLab.svelte";
  import ForestLab from "./components/ForestLab.svelte";
  import BlossomLab from "./components/BlossomLab.svelte";
  import PrideLab from "./components/PrideLab.svelte";
  import EmberLab from "./components/EmberLab.svelte";
  import WinterLab from "./components/WinterLab.svelte";
  import AutumnLab from "./components/AutumnLab.svelte";
  import {
    backgroundBuilderState,
    type BackgroundBuilderTab,
  } from "./state/background-builder-state.svelte";
  import { applyThemeForBackground } from "#lib/shared/settings/utils/background-theme-calculator.js";
  import { BackgroundType } from "@austencloud/backgrounds";

  interface Tab {
    id: BackgroundBuilderTab;
    label: string;
    icon: string;
  }

  const tabs: Tab[] = [
    { id: "ocean", label: "Ocean", icon: "fa-water" },
    { id: "cosmic", label: "Cosmic", icon: "fa-moon" },
    { id: "forest", label: "Forest", icon: "fa-tree" },
    { id: "blossom", label: "Blossom", icon: "fa-spa" },
    { id: "rainbow", label: "Rainbow", icon: "fa-rainbow" },
    { id: "ember", label: "Ember", icon: "fa-fire" },
    { id: "winter", label: "Winter", icon: "fa-snowflake" },
    { id: "autumn", label: "Autumn", icon: "fa-leaf" },
  ];

  // Map tab IDs to BackgroundType for theme application
  const tabToBackgroundType: Record<
    BackgroundBuilderTab,
    BackgroundType | null
  > = {
    ocean: BackgroundType.OCEAN,
    cosmic: BackgroundType.COSMIC,
    forest: BackgroundType.FOREST,
    blossom: BackgroundType.BLOSSOM,
    rainbow: BackgroundType.PRIDE,
    ember: BackgroundType.EMBER,
    winter: BackgroundType.WINTER,
    autumn: BackgroundType.AUTUMN,
  };

  function applyThemeForTab(tabId: BackgroundBuilderTab) {
    const backgroundType = tabToBackgroundType[tabId];
    if (backgroundType) {
      applyThemeForBackground(backgroundType);
    }
  }

  function setTab(tabId: BackgroundBuilderTab) {
    backgroundBuilderState.setCurrentTab(tabId);
    applyThemeForTab(tabId);
  }

  // Apply theme for initial tab on mount
  onMount(() => {
    applyThemeForTab(backgroundBuilderState.currentTab);
  });
</script>

<div class="background-builder">
  <header>
    <h1>Background Builder</h1>
    <p>Design and iterate on background elements</p>
  </header>

  <nav class="tabs">
    {#each tabs as tab}
      <button
        class="tab"
        class:active={backgroundBuilderState.currentTab === tab.id}
        onclick={() => setTab(tab.id)}
      >
        <i class="fas {tab.icon}"></i>
        {tab.label}
      </button>
    {/each}
  </nav>

  <main class="content">
    {#if backgroundBuilderState.currentTab === "ocean"}
      <OceanLab />
    {:else if backgroundBuilderState.currentTab === "cosmic"}
      <CosmicLab />
    {:else if backgroundBuilderState.currentTab === "forest"}
      <ForestLab />
    {:else if backgroundBuilderState.currentTab === "blossom"}
      <BlossomLab />
    {:else if backgroundBuilderState.currentTab === "rainbow"}
      <PrideLab />
    {:else if backgroundBuilderState.currentTab === "ember"}
      <EmberLab />
    {:else if backgroundBuilderState.currentTab === "winter"}
      <WinterLab />
    {:else if backgroundBuilderState.currentTab === "autumn"}
      <AutumnLab />
    {:else if backgroundBuilderState.currentTab === "gradient"}
      <div class="placeholder">
        <i class="fas fa-fill-drip"></i>
        <p>Gradient Lab - Coming Soon</p>
      </div>
    {/if}
  </main>
</div>

<style>
  .background-builder {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0a1628;
    color: #ffffff;
  }

  header {
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  header h1 {
    margin: 0 0 4px 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  header p {
    margin: 0;
    color: #8899aa;
    font-size: 0.875rem;
  }

  .tabs {
    display: flex;
    gap: 4px;
    padding: 12px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    overflow-x: auto;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #8899aa;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .tab:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
  }

  .tab.active {
    background: rgba(125, 211, 252, 0.15);
    border-color: rgba(125, 211, 252, 0.3);
    color: #7dd3fc;
  }

  .tab i {
    font-size: 1rem;
  }

  .content {
    flex: 1;
    overflow: auto;
    padding: 24px;
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 400px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: #556677;
  }

  .placeholder i {
    font-size: 3rem;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .placeholder p {
    font-size: 1rem;
  }
</style>
