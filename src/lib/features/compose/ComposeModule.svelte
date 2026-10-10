<!--
  ComposeModule.svelte - Choreography & Arrangement Module

  Tabs:
  - Arrange: Tunnel mode - layer sequences on canvas with split-view controls
  - Browse: Saved compositions gallery
  - Timeline: Timeline-based composition editor

  Architecture:
  - ArrangeTab: Desktop-first split-view (canvas left, controls right)
  - Tunnel mode: Add up to 4 sequences, play them together
  - PlaybackOverlay used for Browse tab saved compositions
-->
<script lang="ts">
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { onMount, untrack } from "svelte";
  import { removeCurrentUrlParams } from "#lib/shared/navigation/services/url-state.js";
  import { getComposeModuleState } from "./shared/state/compose-module-state.svelte.ts";
  import type { ComposeTab } from "./shared/state/compose-module-state.svelte.ts";
  import type { URLSyncer } from "#lib/shared/navigation/services/url-syncer.js";
  import { getURLSyncer } from "#lib/shared/navigation/get-url-syncer.js";
  import { deepLinker } from "#lib/shared/navigation/services/deep-linker.js";
  import { consumeSequenceHandoff } from "#lib/shared/coordinators/sequence-handoff.svelte.js";
  import { arrangeGridState } from "./tabs/arrange/state/arrange-grid-state.svelte";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";

  import ArrangeTab from "./tabs/arrange/ArrangeTab.svelte";
  import BrowseTab from "./tabs/browse/CompositionBrowseTab.svelte";
  import TimelinePanel from "./timeline/components/TimelinePanel.svelte";

  // Import playback overlay (for Browse tab - legacy saved compositions)
  import PlaybackOverlay from "./tabs/playback/PlaybackTab.svelte";

  // Get module state (singleton)
  const composeState = getComposeModuleState();

  // Services
  let urlSyncService: URLSyncer | null = $state(null);

  // Track if deep link has been processed
  let deepLinkProcessed = $state(false);

  // Sync current tab with navigation state
  $effect(() => {
    const section = navigationState.activeTab;
    if (
      section === "arrange" ||
      section === "browse" ||
      section === "timeline"
    ) {
      composeState.setCurrentTab(section as ComposeTab);
    }
  });

  // Sync tab to URL for sharing
  $effect(() => {
    if (!urlSyncService) return;
    const currentModule = navigationState.currentModule;
    if (currentModule !== "compose") return;

    // TODO: Sync composition ID to URL when viewing saved compositions
  });

  onMount(() => {
    // Resolve services
    try {
      urlSyncService = getURLSyncer();
    } catch (error) {
      console.warn("Failed to resolve navigation services:", error);
    }

    // Set default tab if none persisted or invalid
    const section = navigationState.activeTab;
    if (
      !section ||
      (section !== "arrange" && section !== "browse" && section !== "timeline")
    ) {
      navigationState.setActiveTab("arrange");
    }

    // Check for sequence handoff from Viewer (e.g., "Open in Compose" button)
    const url = new URL(window.location.href);
    if (url.searchParams.has("handoff")) {
      const handoff = consumeSequenceHandoff();
      removeCurrentUrlParams(["handoff"]);
      if (handoff) {
        // Navigate to Arrange tab
        navigationState.setActiveTab("arrange");
        composeState.setCurrentTab("arrange");

        // Set up single cell layout and add the sequence
        arrangeGridState.setPresetLayout("single");
        const firstCell = arrangeGridState.visibleCells[0];
        const word =
          handoff.sequence.word || handoff.sequence.name || "Sequence";

        if (firstCell) {
          const result = arrangeGridState.addLayerToCell(
            firstCell.id,
            handoff.sequence
          );
          if (result.success) {
            showToast({
              message: `Loaded "${word}" into Compose`,
              type: "success",
              duration: 3000,
            });
          } else {
            showToast({
              message: result.error || "Failed to load sequence",
              type: "error",
              duration: 5000,
            });
          }
        }
      }
    }

    // Check for deep link (e.g., shared composition URL)
    const deepLinkData = deepLinker.consumeData("compose");
    if (deepLinkData) {
      try {
        // TODO: Load composition by ID and open playback overlay
        // For now, just navigate to the specified tab
        if (
          deepLinkData.tabId &&
          (deepLinkData.tabId === "arrange" ||
            deepLinkData.tabId === "browse" ||
            deepLinkData.tabId === "timeline")
        ) {
          navigationState.setActiveTab(deepLinkData.tabId);
          composeState.setCurrentTab(deepLinkData.tabId as ComposeTab);
        }
      } catch (err) {
        console.error("❌ Failed to load deep link composition:", err);
      }
    }

    // Mark deep link as processed
    deepLinkProcessed = true;
  });

  // Check if tab is active
  function isTabActive(tab: ComposeTab): boolean {
    return composeState.currentTab === tab;
  }
</script>

<div class="compose-module">
  <div class="content-container">
    {#key composeState.currentTab}
      <div class="tab-panel">
        {#if isTabActive("arrange")}
          <ArrangeTab />
        {:else if isTabActive("browse")}
          <BrowseTab />
        {:else if isTabActive("timeline")}
          <TimelinePanel />
        {/if}
      </div>
    {/key}
  </div>

  <!-- Playback Overlay - renders fullscreen over tabs when open -->
  {#if composeState.isPlaybackOpen}
    <div class="playback-overlay">
      <PlaybackOverlay />
    </div>
  {/if}
</div>

<style>
  .compose-module {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: transparent;
    color: var(--foreground, #ffffff);
  }

  .content-container {
    position: relative;
    flex: 1;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .tab-panel {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* Playback overlay - fullscreen over tabs */
  .playback-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
    background: transparent;
  }
</style>
