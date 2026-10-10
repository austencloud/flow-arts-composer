<!-- TrackerTab - Public read-only view of feedback for all logged-in users -->
<script lang="ts">
  import { createFeedbackTrackerState } from "../../state/feedback-tracker-state.svelte";
  import TrackerList from "./TrackerList.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  const state = createFeedbackTrackerState();

  // Subscribe on creation, cleanup when component is destroyed
  $effect(() => {
    state.subscribe();
    return () => {
      state.unsubscribe();
    };
  });
</script>

<div class="tracker-tab">
  <header class="tab-header">
    <div class="header-content">
      <div class="header-icon">
        <i class="fas fa-binoculars" aria-hidden="true"></i>
      </div>
      <div class="header-text">
        <h1>{t("feedback_tracker_title")}</h1>
        <p>{t("feedback_tracker_subtitle")}</p>
      </div>
    </div>
  </header>

  <div class="tab-content">
    <TrackerList trackerState={state} />
  </div>
</div>

<style>
  .tracker-tab {
    container-type: size;
    container-name: tracker;
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .tab-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: clamp(12px, 3cqi, 20px);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: rgba(245, 158, 11, 0.15);
    border-radius: 10px;
    color: #f59e0b;
    font-size: var(--font-size-base, 1rem);
  }

  .header-text h1 {
    margin: 0;
    font-size: clamp(1rem, 2.5cqi, 1.25rem);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .header-text p {
    margin: 0;
    font-size: clamp(0.75rem, 1.8cqi, 0.875rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  /* Content area */
  .tab-content {
    flex: 1;
    overflow: hidden;
  }
</style>
