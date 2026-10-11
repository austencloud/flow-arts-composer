<!--
  TrainSetup.svelte - Initial setup screen for selecting a sequence

  Responsive drawer pattern: bottom on mobile, right on desktop
-->
<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import type { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
  import { onMount } from "svelte";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    onSequenceSelected: (sequence: SequenceData) => void;
  }

  let { onSequenceSelected }: Props = $props();

  // Services - resolved lazily
  let loaderService = $state<PublicSequencesLoader | null>(null);

  // State
  let showBrowser = $state(false);
  let isMobile = $state(false);
  let isLoadingFullSequence = $state(false);

  onMount(() => {
    loaderService = getBrowseLoader();
  });

  $effect(() => {
    isMobile = window.innerWidth < 768;
    const handleResize = () => {
      isMobile = window.innerWidth < 768;
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  function openBrowser() {
    showBrowser = true;
  }

  function closeBrowser() {
    showBrowser = false;
  }

  async function handleSequenceSelect(sequence: SequenceData) {
    if (!loaderService) return;

    // Load full sequence data including steps
    try {
      isLoadingFullSequence = true;
      const fullSequence = await loaderService.loadFullSequenceData(
        sequence.name
      );

      if (fullSequence) {
        closeBrowser();
        onSequenceSelected(fullSequence);
      }
    } catch (error) {
      console.error("[TrainSetup] Error loading full sequence:", error);
      showToast(t("train_load_sequence_failed"), "error");
    } finally {
      isLoadingFullSequence = false;
    }
  }
</script>

<div class="train-setup">
  <div class="setup-container">
    <!-- Header -->
    <header class="setup-header">
      <div class="icon-container">
        <i class="fas fa-dumbbell" aria-hidden="true"></i>
      </div>
      <h1>{t("train_mode_title")}</h1>
      <p>{t("train_mode_description")}</p>
    </header>

    <!-- Main Content -->
    <div class="content">
      <div class="feature-list">
        <div class="feature">
          <i class="fas fa-video" aria-hidden="true"></i>
          <span>{t("train_feature_camera")}</span>
        </div>
        <div class="feature">
          <i class="fas fa-hand-paper" aria-hidden="true"></i>
          <span>{t("train_feature_hand")}</span>
        </div>
        <div class="feature">
          <i class="fas fa-chart-line" aria-hidden="true"></i>
          <span>{t("train_feature_scoring")}</span>
        </div>
      </div>

      <!-- Call to Action -->
      <button class="select-sequence-button" onclick={openBrowser}>
        <i class="fas fa-th-list" aria-hidden="true"></i>
        <span>{t("train_select_sequence")}</span>
      </button>
    </div>
  </div>

  <!-- Loading Overlay -->
  {#if isLoadingFullSequence}
    <div class="loading-overlay">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
      <p>{t("train_loading_sequence")}</p>
    </div>
  {/if}

  <!-- Sequence Picker Modal -->
  <SequencePickerModal
    open={showBrowser}
    onSelect={handleSequenceSelect}
    onClose={closeBrowser}
  />
</div>

<style>
  .train-setup {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg);
    color: var(--theme-text, white);
    overflow: hidden;
    position: relative;
  }

  .setup-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    overflow: auto;
  }

  .setup-header {
    text-align: center;
    margin-bottom: 3rem;
  }

  .icon-container {
    width: 80px;
    height: 80px;
    margin: 0 auto 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 20%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 20%,
        transparent
      )
    );
    border-radius: 20px;
    border: 2px solid
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 30%,
        transparent
      );
  }

  .icon-container i {
    font-size: 2.5rem;
    background: linear-gradient(
      135deg,
      var(--semantic-info, var(--semantic-info)),
      var(--theme-accent-strong, var(--theme-accent-strong))
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .setup-header h1 {
    font-size: 2rem;
    font-weight: 800;
    margin: 0 0 0.75rem 0;
    background: linear-gradient(
      135deg,
      var(--semantic-info, var(--semantic-info)),
      var(--theme-accent-strong, var(--theme-accent-strong))
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .setup-header p {
    margin: 0;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 1rem;
    max-width: 400px;
    margin: 0 auto;
  }

  .content {
    width: 100%;
    max-width: 400px;
  }

  .feature-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2.5rem;
  }

  .feature {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .feature i {
    font-size: 1.25rem;
    color: var(--semantic-info, var(--semantic-info));
    width: 24px;
    text-align: center;
  }

  .feature span {
    flex: 1;
    font-size: 0.95rem;
    color: color-mix(in srgb, var(--theme-text, white) 90%, transparent);
  }

  .select-sequence-button {
    width: 100%;
    padding: 1.25rem 2rem;
    background: linear-gradient(
      135deg,
      var(--semantic-info, var(--semantic-info)),
      var(--theme-accent-strong, var(--theme-accent-strong))
    );
    border: none;
    border-radius: 12px;
    color: var(--theme-text, white);
    font-size: 1.125rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    transition: all var(--duration-normal);
    box-shadow: 0 4px 12px
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 30%,
        transparent
      );
  }

  .select-sequence-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 40%,
        transparent
      );
  }

  .select-sequence-button i {
    font-size: 1.25rem;
  }

  /* Loading Overlay */
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    z-index: var(--z-modal);
  }

  .loading-overlay p {
    color: var(--theme-text, white);
    font-size: 1rem;
    margin: 0;
  }

  @media (max-width: 768px) {
    .setup-header h1 {
      font-size: 1.75rem;
    }

    .icon-container {
      width: 60px;
      height: 60px;
      margin-bottom: 1rem;
    }

    .icon-container i {
      font-size: 2rem;
    }
  }

</style>
