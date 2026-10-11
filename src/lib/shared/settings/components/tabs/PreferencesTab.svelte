<!--
  PreferencesTab.svelte - Workflow and Behavior Preferences

  Language, confirmation dialogs, shortcuts, guides, version and local data,
  laid out as one workspace panel with the same section bands as the Account
  tab. Every item is a full-width row: a switch, or a row that opens a page or
  replays a guide.
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
  import SettingActionRow from "../SettingActionRow.svelte";
  import {
    SKIPPABLE_CONFIRMATIONS,
    type SkippableConfirmation,
  } from "../../confirmations";
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

  // A switch reads "ask before…", so it is on while the skip flag is off.
  function toggleConfirmation(key: SkippableConfirmation) {
    hapticService?.trigger("selection");
    onSettingUpdate?.({ key, value: !currentSettings?.[key] });
  }

  // "Version 0.45.0", plus the phone app's downloaded bundle when it has one.
  const versionLine = $derived(
    [
      t("settings_version_number", { version: __APP_VERSION__ }),
      nativeUpdate.currentVersion
        ? t("settings_app_update_bundle", {
            version: nativeUpdate.currentVersion,
          })
        : "",
    ]
      .filter(Boolean)
      .join(" · ")
  );

  function openSettingsPage(section: "keyboard" | "release-notes") {
    hapticService?.trigger("selection");
    handleSectionChange(section);
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
          description={t("settings_confirmation_dialogs_desc")}
          headingId="confirmations-heading"
        />
        <div class="row-list">
          {#each SKIPPABLE_CONFIRMATIONS as confirmation (confirmation.key)}
            <SettingToggleButton
              label={t(confirmation.label)}
              checked={!currentSettings?.[confirmation.key]}
              onToggle={() => toggleConfirmation(confirmation.key)}
            />
          {/each}
        </div>
      </section>
    </div>

    <div class="workspace-column">
      <section class="workspace-section" aria-labelledby="guides-heading">
        <SettingsSectionHeader
          icon="fas fa-compass"
          title={t("settings_shortcuts_and_guides")}
          headingId="guides-heading"
        />
        <div class="row-list">
          <SettingActionRow
            icon="fas fa-keyboard"
            label={t("tab_desc_settings_keyboard")}
            description={t("settings_keyboard_shortcuts_desc")}
            opensPage
            onclick={() => openSettingsPage("keyboard")}
          />
          <SettingActionRow
            icon="fas fa-wand-magic-sparkles"
            label={t("settings_construct_guide")}
            actionLabel={t("settings_replay")}
            ariaLabel={t("settings_replay_construct_guide")}
            onclick={handleReplayTutorial}
          />
          <SettingActionRow
            icon="fas fa-circle-question"
            label={t("settings_generate_tour")}
            actionLabel={t("settings_replay")}
            ariaLabel={t("settings_replay_generate_tour")}
            onclick={handleReplayGenerateTour}
          />
        </div>
      </section>

      <section class="workspace-section" aria-labelledby="about-heading">
        <SettingsSectionHeader
          icon="fas fa-circle-info"
          title={t("settings_about_app")}
          headingId="about-heading"
        />
        <div class="row-list">
          <SettingActionRow
            icon="fas fa-bullhorn"
            label={t("nav_ui_what_s_new")}
            description={versionLine}
            opensPage
            onclick={() => openSettingsPage("release-notes")}
          />
          {#if nativeUpdate.available}
            <div aria-live="polite">
              <SettingActionRow
                icon="fas fa-mobile-screen"
                label={appUpdateLabel}
                busy={appUpdateBusy}
                disabled={appUpdateBusy}
                onclick={handleAppUpdate}
              />
            </div>
          {/if}
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
  </div>
</div>

<style>
  /* Matches the Account tab: one panel in the middle of the tab, sections
     opened by header bands and split by hairlines. Every item is a full-width
     row, so nothing floats loose inside a section. */
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
    --settings-row-inline: 1.15em;
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
     section surface reaches the panel's foot. */
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

  .workspace-column:last-child > .workspace-section:last-child,
  .workspace-column:last-child
    > .workspace-section:last-child
    > :global(.section-header:last-child) {
    border-bottom-left-radius: var(--panel-inner-radius);
    border-bottom-right-radius: var(--panel-inner-radius);
  }

  .section-body {
    min-width: 0;
    padding: 0.85em var(--settings-row-inline) 1em;
  }

  .row-list {
    display: flex;
    flex-direction: column;
  }

  .row-list :global(.setting-toggle),
  .row-list :global(.setting-action) {
    padding-inline: var(--settings-row-inline);
  }

  .row-list > :global(* + *) {
    border-top: 1px solid var(--theme-stroke);
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

  /* Two columns that share one seam. */
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

    .workspace-column:first-child > .workspace-section:last-child,
    .workspace-column:first-child
      > .workspace-section:last-child
      > :global(.section-header:last-child) {
      border-bottom-left-radius: var(--panel-inner-radius);
    }

    .workspace-column:last-child > .workspace-section:last-child,
    .workspace-column:last-child
      > .workspace-section:last-child
      > :global(.section-header:last-child) {
      border-bottom-left-radius: 0;
    }
  }

  @container preferences-tab (min-width: 105rem) {
    .preferences-workspace {
      --settings-row-inline: 1.35em;
    }
  }

  @container preferences-tab (max-width: 32rem) {
    .preferences-tab {
      align-content: start;
      padding-inline: 0.65rem;
    }

    .preferences-workspace {
      --settings-row-inline: 0.9rem;
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
