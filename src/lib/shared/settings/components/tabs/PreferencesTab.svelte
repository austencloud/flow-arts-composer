<!--
  PreferencesTab.svelte - Workflow and Behavior Preferences

  Controls app behavior like confirmation dialogs, prompts, and other
  workflow preferences that users may want to customize.

  Uses toggle rows (not chips) because behavior settings need descriptions
  to explain what they do. Chips work for visibility where the element name
  IS the setting, but preferences need context.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { AppSettings } from "../../domain/app-settings";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import { onMount } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { appEntryState } from "$lib/shared/onboarding/state/app-entry-state.svelte.ts";
  import { generateTourState } from "$lib/shared/onboarding/state/generate-tour-state.svelte";
  import {
    handleModuleChange,
    handleSectionChange,
  } from "$lib/shared/navigation-coordinator/navigation-coordinator.svelte";
  import OfflineLocalDataSection from "./preferences/OfflineLocalDataSection.svelte";
  import LanguagePreference from "./preferences/LanguagePreference.svelte";
  import { Collapsible } from "bits-ui";

  let { currentSettings, onSettingUpdate } = $props<{
    currentSettings: AppSettings;
    onSettingUpdate?: (event: { key: string; value: unknown }) => void;
  }>();

  // Services
  let hapticService: HapticFeedback | null = null;

  // Entry animation
  let isVisible = $state(false);
  let advancedOpen = $state(false);

  onMount(() => {
    hapticService = getHapticFeedback();
    setTimeout(() => (isVisible = true), 30);
  });

  // Derive toggle state from settings
  const showClearConfirmation = $derived(
    !currentSettings?.skipClearConfirmation
  );

  function handleToggleClearConfirmation() {
    hapticService?.trigger("selection");
    onSettingUpdate?.({
      key: "skipClearConfirmation",
      value: showClearConfirmation, // Toggle: if currently showing, now skip
    });
  }

  const showLoopConfirmation = $derived(!currentSettings?.skipLoopConfirmation);

  function handleToggleLoopConfirmation() {
    hapticService?.trigger("selection");
    onSettingUpdate?.({
      key: "skipLoopConfirmation",
      value: showLoopConfirmation,
    });
  }

  async function handleReplayTutorial() {
    hapticService?.trigger("selection");
    await handleModuleChange("create", "construct");
    appEntryState.replay();
  }

  async function handleReplayGenerateTour() {
    hapticService?.trigger("selection");
    // The tour modal is mounted in GeneratePanel, so land on Create > Generate
    // before starting it; otherwise restart() flips isActive with nothing rendered.
    // Must route through handleModuleChange (not navigationState.setCurrentModule):
    // setCurrentModule only moves the nav highlight, leaving ui-state's activeModule
    // — the actually-rendered module — on "settings", so GeneratePanel never mounts.
    // Await it so the module has switched before the tour restarts.
    await handleModuleChange("create", "generate");
    generateTourState.restart();
  }
</script>

<div class="preferences-tab" class:visible={isVisible}>
  <!-- Header -->
  <header class="tab-header">
    <div class="header-icon">
      <i class="fas fa-sliders" aria-hidden="true"></i>
    </div>
    <div class="header-content">
      <h1>{t("settings_preferences")}</h1>
      <p>{t("settings_customize_behavior")}</p>
    </div>
  </header>

  <LanguagePreference />

  <section class="section">
    <button
      type="button"
      class="toggle-row"
      onclick={() => handleSectionChange("keyboard")}
      aria-label={t("tab_settings_keyboard")}
    >
      <span class="toggle-info">
        <span class="toggle-label"
          ><i class="fas fa-keyboard" aria-hidden="true"></i>
          {t("tab_settings_keyboard")}</span
        >
      </span>
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </section>

  <!-- Confirmation Dialogs Section -->
  <section class="section">
    <h2 class="section-title">
      <i class="fas fa-message-question" aria-hidden="true"></i>
      {t("settings_confirmation_dialogs")}
    </h2>

    <div class="toggle-list">
      <!-- Clear Sequence Confirmation -->
      <button
        type="button"
        class="toggle-row"
        onclick={handleToggleClearConfirmation}
        aria-pressed={showClearConfirmation}
      >
        <div class="toggle-info">
          <span class="toggle-label">{t("settings_ask_before_clearing")}</span>
        </div>
        <div class="toggle-switch" class:active={showClearConfirmation}>
          <div class="toggle-knob"></div>
        </div>
      </button>

      <!-- LOOP Auto-Complete Confirmation -->
      <button
        type="button"
        class="toggle-row"
        onclick={handleToggleLoopConfirmation}
        aria-pressed={showLoopConfirmation}
      >
        <div class="toggle-info">
          <span class="toggle-label">{t("settings_ask_before_loop")}</span>
        </div>
        <div class="toggle-switch" class:active={showLoopConfirmation}>
          <div class="toggle-knob"></div>
        </div>
      </button>
    </div>
  </section>

  <!-- Guides Section -->
  <section class="section">
    <h2 class="section-title">
      <i class="fas fa-compass" aria-hidden="true"></i>
      {t("settings_guides")}
    </h2>

    <div class="guide-buttons">
      <button type="button" class="guide-button" onclick={handleReplayTutorial}>
        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
        <span>{t("settings_replay_construct_guide")}</span>
      </button>

      <button
        type="button"
        class="guide-button"
        onclick={handleReplayGenerateTour}
      >
        <i class="fas fa-circle-question" aria-hidden="true"></i>
        <span>{t("settings_replay_generate_tour")}</span>
      </button>
    </div>
  </section>

  <section class="section advanced-section">
    <Collapsible.Root bind:open={advancedOpen}>
      <Collapsible.Trigger class="advanced-trigger">
        <span class="advanced-trigger-icon">
          <i class="fas fa-database" aria-hidden="true"></i>
        </span>
        <span class="advanced-trigger-copy">
          <strong>{t("settings_advanced")}</strong>
          <small>{t("settings_advanced_desc")}</small>
        </span>
        <i
          class="fas fa-chevron-down advanced-chevron"
          class:open={advancedOpen}
          aria-hidden="true"
        ></i>
      </Collapsible.Trigger>

      <Collapsible.Content class="advanced-content">
        <div class="advanced-content-inner">
          <header class="advanced-content-header">
            <h3>{t("settings_offline_local_data")}</h3>
            <p>{t("settings_offline_local_data_desc")}</p>
          </header>
          <OfflineLocalDataSection />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  </section>
  <section class="section version-section">
    <span>v{__APP_VERSION__}</span>
    <button
      type="button"
      class="version-button"
      onclick={() => handleSectionChange("release-notes")}
    >
      {t("nav_ui_what_s_new")}
    </button>
  </section>
</div>

<style>
  .preferences-tab {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 16px;
    opacity: 0;
    transform: translateY(8px);
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;
  }

  .preferences-tab.visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* Header */
  .tab-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .header-icon {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
    border-radius: 16px;
    font-size: var(--font-size-2xl);
    color: white;
    flex-shrink: 0;
  }

  .header-content h1 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .header-content p {
    margin: 4px 0 0 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  /* Section */
  .section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .section-title i {
    font-size: var(--font-size-sm);
    color: var(--theme-accent, #f97316);
  }

  .section-title i.fa-compass {
    color: var(--semantic-info, #3b82f6);
  }

  /* Toggle List */
  .toggle-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    text-align: left;
    width: 100%;
    color: var(--theme-text);
  }

  .toggle-row:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .toggle-row:active {
    transform: scale(0.995);
  }

  .toggle-row:focus-visible {
    outline: 2px solid var(--theme-accent, #f97316);
    outline-offset: 2px;
  }

  .toggle-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .toggle-label {
    font-size: var(--font-size-base);
    font-weight: 500;
    color: var(--theme-text, #ffffff);
  }

  /* Toggle Switch */
  .toggle-switch {
    width: 52px;
    height: 32px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 16px;
    padding: 3px;
    transition: background var(--duration-normal) ease;
    flex-shrink: 0;
  }

  .toggle-switch.active {
    background: var(--semantic-success, #22c55e);
  }

  .toggle-knob {
    width: 26px;
    height: 26px;
    background: white;
    border-radius: 50%;
    transition: transform var(--duration-normal) ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch.active .toggle-knob {
    transform: translateX(20px);
  }

  /* Guide Buttons */
  .guide-buttons {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .guide-button {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    text-align: left;
    width: 100%;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-base);
    font-weight: 500;
  }

  .guide-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .guide-button:active {
    transform: scale(0.995);
  }

  .guide-button:focus-visible {
    outline: 2px solid var(--theme-accent, #f97316);
    outline-offset: 2px;
  }

  .guide-button i {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm);
    width: 20px;
    text-align: center;
  }

  .advanced-section {
    padding-top: 0.25rem;
    border-top: 1px solid var(--theme-stroke);
  }

  .version-section {
    flex-direction: row;
    align-items: center;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .version-button {
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    padding: 0.45rem 0.75rem;
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-min);
  }

  .version-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  :global(.advanced-trigger) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.875rem;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 0.875rem 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    color: var(--theme-text);
    background: var(--theme-card-bg);
    cursor: pointer;
    text-align: left;
  }

  :global(.advanced-trigger:hover) {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
  }

  :global(.advanced-trigger:focus-visible) {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .advanced-trigger-icon {
    display: grid;
    place-items: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 0.7rem;
    color: var(--theme-accent-strong, var(--theme-accent));
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  }

  .advanced-trigger-copy {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .advanced-trigger-copy strong {
    font-size: max(0.875rem, var(--font-size-base));
    font-weight: 650;
  }

  .advanced-trigger-copy small,
  .advanced-content-header p {
    color: var(--theme-text-dim);
    font-size: max(0.75rem, var(--font-size-compact));
    line-height: 1.4;
  }

  .advanced-chevron {
    color: var(--theme-text-dim);
    transition: transform var(--duration-fast) ease;
  }

  .advanced-chevron.open {
    transform: rotate(180deg);
  }

  :global(.advanced-content) {
    overflow: hidden;
  }

  .advanced-content-inner {
    margin-top: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg) 92%,
      var(--theme-text) 2%
    );
  }

  .advanced-content-header {
    margin-bottom: 1rem;
  }

  .advanced-content-header h3,
  .advanced-content-header p {
    margin: 0;
  }

  .advanced-content-header h3 {
    color: var(--theme-text);
    font-size: max(1rem, var(--font-size-base));
    font-weight: 650;
  }

  .advanced-content-header p {
    margin-top: 0.25rem;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .preferences-tab {
      padding: 12px;
      gap: 20px;
    }

    .header-icon {
      width: 48px;
      height: 48px;
      font-size: var(--font-size-xl);
    }

    .toggle-row {
      padding: 14px;
    }

    .toggle-switch {
      width: 48px;
      height: 28px;
    }

    .toggle-knob {
      width: 22px;
      height: 22px;
    }

    .toggle-switch.active .toggle-knob {
      transform: translateX(20px);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .preferences-tab,
    .toggle-row,
    .toggle-switch,
    .toggle-knob {
      transition: none !important;
    }

    .advanced-chevron {
      transition: none;
    }
  }
</style>
