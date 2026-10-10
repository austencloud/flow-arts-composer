<!--
  PreferencesTab.svelte - Workflow and Behavior Preferences

  Language, confirmation dialogs, guides and local data, laid out as one
  workspace panel with the same section bands as the Account tab.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { AppSettings } from "../../domain/app-settings";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { appEntryState } from "#lib/shared/onboarding/state/app-entry-state.svelte.ts";
  import { generateTourState } from "#lib/shared/onboarding/state/generate-tour-state.svelte.js";
  import {
    handleModuleChange,
    handleSectionChange,
  } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import OfflineLocalDataSection from "./preferences/OfflineLocalDataSection.svelte";
  import LanguagePreference from "./preferences/LanguagePreference.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SettingToggleButton from "../SettingToggleButton.svelte";
  import SettingsSectionHeader from "../SettingsSectionHeader.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import {
    applyNativeUpdate,
    checkForNativeUpdate,
    nativeUpdate,
  } from "#lib/shared/offline/services/native-update.svelte.js";

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

  // Phone app only: what the update button says and does right now.
  const appUpdateLabel = $derived.by(() => {
    switch (nativeUpdate.status) {
      case "checking":
        return t("settings_app_update_checking");
      case "downloading":
        return t("settings_app_update_downloading", {
          percent: nativeUpdate.percent,
        });
      case "ready":
        return t("settings_app_update_restart_to_update");
      case "up-to-date":
        return t("settings_app_update_up_to_date");
      case "failed":
        return t("settings_app_update_failed");
      default:
        return t("settings_app_update_check");
    }
  });
  const appUpdateBusy = $derived(
    nativeUpdate.status === "checking" || nativeUpdate.status === "downloading"
  );

  function handleAppUpdate() {
    hapticService?.trigger("selection");
    if (nativeUpdate.status === "ready") void applyNativeUpdate();
    else void checkForNativeUpdate();
  }

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
  <div class="preferences-workspace">
    <div class="workspace-column">
      <div class="workspace-section">
        <LanguagePreference />
      </div>

      <section
        class="workspace-section"
        aria-labelledby="confirmations-heading"
      >
        <SettingsSectionHeader
          icon="fas fa-comment-dots"
          title={t("settings_confirmation_dialogs")}
          headingId="confirmations-heading"
        />
        <div class="toggle-list">
          <SettingToggleButton
            label={t("settings_ask_before_clearing")}
            checked={showClearConfirmation}
            onToggle={handleToggleClearConfirmation}
          />
          <SettingToggleButton
            label={t("settings_ask_before_loop")}
            checked={showLoopConfirmation}
            onToggle={handleToggleLoopConfirmation}
          />
        </div>
      </section>
    </div>

    <div class="workspace-column">
      <section class="workspace-section" aria-labelledby="keyboard-heading">
        <SettingsSectionHeader
          icon="fas fa-keyboard"
          title={t("tab_settings_keyboard")}
          description={t("tab_desc_settings_keyboard")}
          headingId="keyboard-heading"
        >
          {#snippet action()}
            <PanelButton
              variant="quiet"
              onclick={() => handleSectionChange("keyboard")}
              ariaLabel={t("tab_desc_settings_keyboard")}
            >
              <i class="fas fa-arrow-right" aria-hidden="true"></i>
              <span>{t("settings_presets_manage")}</span>
            </PanelButton>
          {/snippet}
        </SettingsSectionHeader>
      </section>

      <section class="workspace-section" aria-labelledby="guides-heading">
        <SettingsSectionHeader
          icon="fas fa-compass"
          title={t("settings_guides")}
          headingId="guides-heading"
        />
        <div class="section-body guide-actions">
          <PanelButton variant="secondary" onclick={handleReplayTutorial}>
            <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
            <span>{t("settings_replay_construct_guide")}</span>
          </PanelButton>
          <PanelButton variant="secondary" onclick={handleReplayGenerateTour}>
            <i class="fas fa-circle-question" aria-hidden="true"></i>
            <span>{t("settings_replay_generate_tour")}</span>
          </PanelButton>
        </div>
      </section>

      <section class="workspace-section" aria-labelledby="advanced-heading">
        <SettingsSectionHeader
          icon="fas fa-database"
          title={t("settings_advanced")}
          description={t("settings_advanced_desc")}
          headingId="advanced-heading"
        >
          {#snippet action()}
            <span class="disclosure-action">
              <PanelButton
                variant="quiet"
                onclick={() => (advancedOpen = !advancedOpen)}
                ariaExpanded={advancedOpen}
                ariaControls="advanced-content"
                ariaLabel={t("settings_advanced")}
              >
                <i
                  class="fas fa-chevron-down advanced-chevron"
                  class:open={advancedOpen}
                  aria-hidden="true"
                ></i>
              </PanelButton>
            </span>
          {/snippet}
        </SettingsSectionHeader>
        {#if advancedOpen}
          <div
            id="advanced-content"
            class="section-body advanced-body"
            transition:growFade
          >
            <OfflineLocalDataSection />
          </div>
        {/if}
      </section>
    </div>

    <footer class="version-band">
      <span class="version-text">
        <span>v{__APP_VERSION__}</span>
        {#if nativeUpdate.currentVersion}
          <span>
            {t("settings_app_update_bundle", {
              version: nativeUpdate.currentVersion,
            })}
          </span>
        {/if}
      </span>
      <span class="version-actions">
        <PanelButton
          variant="quiet"
          onclick={() => handleSectionChange("release-notes")}
        >
          <i class="fas fa-bullhorn" aria-hidden="true"></i>
          <span>{t("nav_ui_what_s_new")}</span>
        </PanelButton>
        {#if nativeUpdate.available}
          <span class="update-action" aria-live="polite">
            <PanelButton
              variant={nativeUpdate.status === "ready" ? "primary" : "quiet"}
              disabled={appUpdateBusy}
              ariaBusy={appUpdateBusy}
              onclick={handleAppUpdate}
            >
              <i
                class={appUpdateBusy
                  ? "fas fa-circle-notch fa-spin"
                  : "fas fa-mobile-screen"}
                aria-hidden="true"
              ></i>
              <span>{appUpdateLabel}</span>
            </PanelButton>
          </span>
        {/if}
      </span>
    </footer>
  </div>
</div>

<style>
  /* Matches the Account tab: one panel in the middle of the tab, sections
     opened by header bands and split by hairlines. */
  .preferences-tab {
    container: preferences-tab / inline-size;
    display: grid;
    /* Never shrinks below its content, so the bottom padding stays clear of
       the navigation bar when the page scrolls. */
    flex: 1 0 auto;
    align-content: safe center;
    width: 100%;
    min-height: 100%;
    min-width: 0;
    padding: clamp(0.75em, 1.4cqi, 1.75em) clamp(0.75em, 2cqi, 3em);
    opacity: 0;
    transition: opacity var(--duration-normal) ease;
  }

  .preferences-tab.visible {
    opacity: 1;
  }

  .preferences-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    /* Preferences hold a few short rows, so past two columns the panel stays
       a settings measure in the middle of the tab instead of thinning into a
       wide strip. */
    max-width: 84rem;
    min-width: 0;
    margin-inline: auto;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    --panel-inner-radius: calc(1.25rem - 1px);
    border-radius: 1.25em;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(0, 0, 0, 0.88)) 14%,
      #070b10 86%
    );
    box-shadow: var(--theme-panel-shadow, 0 1rem 3rem rgba(0, 0, 0, 0.35));
    isolation: isolate;
  }

  :global(html[data-theme-luminance="bright"]) .preferences-workspace {
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(255, 255, 255, 0.88)) 14%,
      #f6f7f9 86%
    );
  }

  .workspace-column,
  .workspace-section {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .workspace-column + .workspace-column,
  .workspace-section + .workspace-section {
    border-top: 1px solid var(--theme-stroke);
  }

  .workspace-section {
    background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  }

  /* The shorter column's last section fills the leftover height, so the
     section surface reaches the version band. */
  .workspace-section:last-child {
    flex: 1 1 auto;
  }

  /* A section that is only a header band needs no rule under it; the next
     section's top rule already separates them. */
  .workspace-section > :global(.section-header:last-child) {
    border-bottom: 0;
  }

  /* The panel does not clip its children, so the language menu can hang
     past its edge; the tinted pieces at the corners round themselves. */
  .workspace-column:first-child > .workspace-section:first-child,
  .workspace-column:first-child
    > .workspace-section:first-child
    :global(.section-header) {
    border-top-left-radius: var(--panel-inner-radius);
    border-top-right-radius: var(--panel-inner-radius);
  }

  .version-band {
    border-bottom-left-radius: var(--panel-inner-radius);
    border-bottom-right-radius: var(--panel-inner-radius);
  }

  .section-body {
    min-width: 0;
    padding: 0.85em 1.15em 1em;
  }

  .toggle-list {
    display: flex;
    flex-direction: column;
  }

  .toggle-list :global(.setting-toggle) {
    padding-inline: 1.15em;
  }

  .toggle-list :global(.setting-toggle + .setting-toggle) {
    border-top: 1px solid var(--theme-stroke);
  }

  .guide-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6em;
  }

  .disclosure-action :global(.panel-btn) {
    min-width: var(--min-touch-target, 44px);
  }

  .advanced-chevron {
    transition: transform var(--transition-fast);
  }

  .advanced-chevron.open {
    transform: rotate(180deg);
  }

  .advanced-body {
    padding-top: 0.5em;
  }

  .version-band {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6em 1em;
    padding: 0.75em 1.15em;
    border-top: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
    background: color-mix(in srgb, var(--theme-text) 3%, transparent);
    font-size: max(0.875rem, var(--font-size-min));
    font-variant-numeric: tabular-nums;
  }

  .version-text {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25em 0.9em;
  }

  .version-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
  }

  /* Holds the longest status ("Downloading 100%") so the label can change
     without pushing What's new. */
  .update-action :global(.panel-btn) {
    min-width: 13em;
  }

  /* Two columns that share one seam, with the version band across the foot. */
  @container preferences-tab (min-width: 48rem) {
    .preferences-workspace {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .workspace-column + .workspace-column {
      border-top: 0;
      border-left: 1px solid var(--theme-stroke);
    }

    .workspace-column:first-child > .workspace-section:first-child,
    .workspace-column:first-child
      > .workspace-section:first-child
      :global(.section-header) {
      border-top-right-radius: 0;
    }

    .workspace-column:nth-child(2) > .workspace-section:first-child,
    .workspace-column:nth-child(2)
      > .workspace-section:first-child
      :global(.section-header) {
      border-top-right-radius: var(--panel-inner-radius);
    }

    .version-band {
      grid-column: 1 / -1;
    }
  }

  @container preferences-tab (min-width: 105rem) {
    .section-body,
    .version-band {
      padding-inline: 1.35em;
    }

    .toggle-list :global(.setting-toggle) {
      padding-inline: 1.35em;
    }
  }

  @container preferences-tab (max-width: 32rem) {
    .preferences-tab {
      align-content: start;
      padding-inline: 0.65rem;
    }

    .section-body,
    .version-band {
      padding-inline: 0.9rem;
    }

    .toggle-list :global(.setting-toggle) {
      padding-inline: 0.9rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .preferences-tab,
    .advanced-chevron {
      transition: none;
    }
  }

  @media (prefers-contrast: high) {
    .preferences-workspace {
      border-width: 2px;
    }
  }
</style>
