<!-- FeedbackModule - Main container for feedback functionality -->
<script lang="ts">
  import { navigationState } from "../../../shared/navigation/state/navigation-state.svelte";
  import TrackerTab from "./tracker/TrackerTab.svelte";
  import FeedbackSubmitTab from "./submit/FeedbackSubmitTab.svelte";
  import FeedbackManageTab from "./manage/FeedbackManageTab.svelte";
  import MyFeedbackTab from "./my-feedback/MyFeedbackTab.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  // Track active tab for this module
  const activeTab = $derived(navigationState.activeTab);

  // Update context tracker whenever navigation changes

</script>

<div class="feedback-module">
  {#key activeTab}
    <div class="tab-panel">
      {#if activeTab === "tracker"}
        <TrackerTab />
      {:else if activeTab === "submit"}
        <FeedbackSubmitTab />
      {:else if activeTab === "my-feedback"}
        <MyFeedbackTab />
      {:else if activeTab === "manage"}
        <FeedbackManageTab />
      {:else}
        <div class="placeholder">
          <i class="fas fa-comment-dots" aria-hidden="true"></i>
          <h2>{t("module_feedback")}</h2>
          <p>{t("feedback_select_tab")}</p>
        </div>
      {/if}
    </div>
  {/key}
</div>

<style>
  .feedback-module {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: transparent;
    color: var(--theme-text, var(--theme-text));
    position: relative;
    overflow: hidden;
  }

  .tab-panel {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    opacity: 0.6;
  }

  .placeholder i {
    font-size: var(--font-size-3xl);
    color: var(--semantic-success, var(--semantic-success));
  }

  .placeholder h2 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 600;
  }

  .placeholder p {
    margin: 0;
    font-size: var(--font-size-sm);
    opacity: 0.7;
  }
</style>
