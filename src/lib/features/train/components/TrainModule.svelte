<!--
  TrainModule.svelte - Root Train Module Component

  Manages tab navigation between Practice and Progress tabs.
  Syncs with global navigation state and provides smooth transitions.
-->
<script lang="ts">
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import type { Section } from "#lib/shared/navigation/domain/types.js";

  import PracticePanel from "./practice/PracticePanel.svelte";
  import ProgressPanel from "./progress/ProgressPanel.svelte";

  type TrainSection = "practice" | "progress";
  let activeSection = $state<TrainSection>("practice");

  // Sync with navigation state (View Transitions handled by navigation-coordinator)
  $effect(() => {
    const navTab = navigationState.activeTab;
    if (navTab && ["practice", "progress"].includes(navTab)) {
      activeSection = navTab as TrainSection;
    }
  });
</script>

<div class="train-module">
  {#key activeSection}
    <div class="section-panel">
      {#if activeSection === "practice"}
        <PracticePanel />
      {:else if activeSection === "progress"}
        <ProgressPanel />
      {/if}
    </div>
  {/key}
</div>

<style>
  .train-module {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
  }

  .section-panel {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
