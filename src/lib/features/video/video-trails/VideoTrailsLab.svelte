<script lang="ts">

import { getDetectionCorrector } from "#lib/features/video/video-trails/get-detection-corrector.js";
import { getVideoTipAdapter } from "#lib/features/video/video-trails/get-video-tip-adapter.js";
import { getVideoTrailsRepository } from "#lib/features/video/video-trails/get-video-trails-repository.js";
  import { onDestroy, type Component } from "svelte";
  import { createVideoTrailsState } from "./state/video-trails-state.svelte";
  import { setVideoTrailsContext } from "./context/video-trails-context";
  import type { VideoTrailsView } from "./domain/types";

  const trailsState = createVideoTrailsState(
    getVideoTrailsRepository(),
    getDetectionCorrector(),
    getVideoTipAdapter(),
  );
  setVideoTrailsContext({ state: trailsState });

  const views: { id: VideoTrailsView; label: string; icon: string }[] = [
    { id: "workspace", label: "Workspace", icon: "fa-video" },
    { id: "detection-studio", label: "Detection Studio", icon: "fa-crosshairs" },
    { id: "library", label: "Library", icon: "fa-folder-open" },
  ];

  let WorkspaceView: Component | null = $state(null);
  let DetectionStudioView: Component | null = $state(null);
  let LibraryView: Component | null = $state(null);

  $effect(() => {
    switch (trailsState.activeView) {
      case "workspace":
        if (!WorkspaceView) {
          import("./views/WorkspaceView.svelte").then((m) => { WorkspaceView = m.default; });
        }
        break;
      case "detection-studio":
        if (!DetectionStudioView) {
          import("./views/DetectionStudioView.svelte").then((m) => { DetectionStudioView = m.default; });
        }
        break;
      case "library":
        if (!LibraryView) {
          import("./views/LibraryView.svelte").then((m) => { LibraryView = m.default; });
        }
        break;
    }
  });

  onDestroy(() => trailsState.destroy());
</script>

<div class="video-trails-root">
  <div class="sub-nav" role="tablist">
    {#each views as view}
      <button
        class="sub-nav-tab"
        class:active={trailsState.activeView === view.id}
        role="tab"
        aria-selected={trailsState.activeView === view.id}
        onclick={() => { trailsState.activeView = view.id; }}
      >
        <i class="fas {view.icon}" aria-hidden="true"></i>
        <span>{view.label}</span>
      </button>
    {/each}
  </div>

  <div class="view-container">
    {#if trailsState.activeView === "workspace" && WorkspaceView}
      <WorkspaceView />
    {:else if trailsState.activeView === "detection-studio" && DetectionStudioView}
      <DetectionStudioView />
    {:else if trailsState.activeView === "library" && LibraryView}
      <LibraryView />
    {:else}
      <div class="loading-view">Loading video trails...</div>
    {/if}
  </div>
</div>

<style>
  .video-trails-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text, #ffffff);
  }

  .sub-nav {
    display: flex;
    gap: 2px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .sub-nav-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .sub-nav-tab:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
  }

  .sub-nav-tab.active {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-accent, #f43f5e);
  }

  .view-container {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .loading-view {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }
</style>
