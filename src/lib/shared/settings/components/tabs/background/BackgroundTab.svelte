<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import {
    holdBackground,
    releaseBackground,
  } from "#lib/shared/background/shared/state/background-hold.svelte.js";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { tryGetAccountSetupContext } from "#lib/shared/onboarding/context/account-setup-context.js";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import {
    BACKGROUND_CARD_REGISTRY,
    getCardMetadata,
  } from "@austencloud/backgrounds/card";
  import { onMount } from "svelte";
  import type { AppSettings } from "../../../domain/app-settings";
  import { applyThemeFromColors } from "../../../utils/background-theme-calculator";
  import SettingsSectionHeader from "../../SettingsSectionHeader.svelte";
  import ThemePreview from "./ThemePreview.svelte";

  let { settings, onUpdate } = $props<{
    settings: AppSettings;
    onUpdate?: (event: { key: string; value: unknown }) => void;
  }>();

  const accountSetupState = tryGetAccountSetupContext();
  const descriptions: Record<string, string> = {
    ember: "Warm sparks and a low glow for late-night practice.",
    cosmic: "A deep night field with room for your work to stand out.",
    ocean: "Cool water and drifting life beneath the surface.",
    forest: "Layered green light with a little breathing room.",
    winter: "A calm blue field with crisp, quiet motion.",
    pride: "A full spectrum with bright, celebratory movement.",
    blossom: "Pink blossoms and drifting petals.",
    autumn: "Falling color, warm air, and a little fire.",
    celestial: "Open sky, sunlight, and a clear horizon.",
    void: "Near-black space for maximum focus on the composition.",
  };

  function themeName(type: string): string {
    return t(`settings_theme_${type}` as TranslationKey);
  }

  function themeDescription(type: string): string {
    return descriptions[type]
      ? t(`settings_theme_${type}_desc` as TranslationKey)
      : "";
  }

  let hapticService: HapticFeedback | null = null;
  let previewType = $state<BackgroundType>(
    settings?.backgroundType || BackgroundType.COSMIC
  );

  const currentType = $derived(
    settings?.backgroundType || BackgroundType.COSMIC
  );
  const preview = $derived(
    getCardMetadata(previewType) ?? BACKGROUND_CARD_REGISTRY[0]
  );
  const previewIsCurrent = $derived(previewType === currentType);
  const needsThemeConfirmation = $derived(
    accountSetupState?.available &&
      accountSetupState.tasks.some(
        (task) => task.id === "theme" && !task.complete
      )
  );
  const canApplyPreview = $derived(!previewIsCurrent || needsThemeConfirmation);

  $effect(() => {
    if (!BACKGROUND_CARD_REGISTRY.some((theme) => theme.type === previewType)) {
      previewType = currentType;
    }
  });

  onMount(() => {
    hapticService = getHapticFeedback();
    holdBackground("settings-theme-preview");
    return () => releaseBackground("settings-theme-preview");
  });

  async function recordThemeChoice(): Promise<void> {
    if (!accountSetupState) return;
    await accountSetupState.markThemeChosen();
    if (!accountSetupState.saveError) return;
    showToast({
      message: accountSetupState.saveError,
      type: "error",
      duration: 10_000,
      announcement: "polite",
      action: {
        label: t("common_retry"),
        onClick: () => void accountSetupState.retrySave(),
      },
    });
  }

  function previewTheme(type: BackgroundType): void {
    previewType = type;
    hapticService?.trigger("selection");
  }

  function applyPreview(): void {
    if (!canApplyPreview) return;
    hapticService?.trigger("success");
    if (!previewIsCurrent) {
      applyThemeFromColors(undefined, preview.themeColors);
      onUpdate?.({ key: "backgroundType", value: previewType });
    }
    void recordThemeChoice();
  }
</script>

<div class="background-tab themed-scrollbar">
  <section class="theme-workspace" aria-labelledby="theme-heading">
    <div class="theme-band">
      <SettingsSectionHeader
        icon="fas fa-palette"
        title={t("settings_choose_theme")}
        description={t("settings_themes_available", {
          count: BACKGROUND_CARD_REGISTRY.length,
        })}
        headingId="theme-heading"
      >
        {#snippet action()}
          <Crossfade key={canApplyPreview ? previewType : "current"}>
            {#if canApplyPreview}
              <span class="apply-action">
                <PanelButton variant="primary" onclick={applyPreview}>
                  {t("settings_use_theme", { theme: themeName(previewType) })}
                </PanelButton>
              </span>
            {:else}
              <!-- A state, not an action, so it reads as a quiet label. -->
              <span class="theme-status">
                <i class="fas fa-check" aria-hidden="true"></i>
                {t("settings_current_theme")}
              </span>
            {/if}
          </Crossfade>
        {/snippet}
      </SettingsSectionHeader>
    </div>

    <section
      class="theme-stage"
      aria-label={t("settings_previewing_theme", {
        theme: themeName(previewType),
      })}
    >
      <ThemePreview type={previewType} fallback={preview.gradient} />
      <div class="stage-scrim"></div>
      <div class="stage-copy">
        <p class="stage-label">{t("settings_live_preview")}</p>
        <Crossfade key={previewType} duration={DURATION.normal}>
          <div class="stage-title-wrap">
            <p class="stage-title">{themeName(previewType)}</p>
            <p>{themeDescription(previewType)}</p>
          </div>
        </Crossfade>
      </div>
    </section>

    <div class="theme-choices" aria-label={t("settings_theme_choices")}>
      {#each BACKGROUND_CARD_REGISTRY as theme}
        <button
          type="button"
          class:previewing={previewType === theme.type}
          aria-pressed={previewType === theme.type}
          aria-label={currentType === theme.type
            ? t("settings_theme_current_aria", {
                theme: themeName(theme.type),
              })
            : themeName(theme.type)}
          onclick={() => previewTheme(theme.type as BackgroundType)}
        >
          <span
            class="choice-art"
            style:background={theme.gradient}
            aria-hidden="true"
          >
            <img src={`/images/theme-previews/${theme.type}.webp`} alt="" />
            <span class="choice-scrim"></span>
            <span class="choice-name">{themeName(theme.type)}</span>
            {#if currentType === theme.type}
              <span class="choice-current">{t("settings_current")}</span>
            {/if}
          </span>
        </button>
      {/each}
    </div>
  </section>
</div>

<style>
  /* The tab is the page's scroller while the panel stacks. Side by side, the
     panel fills the tab and scrolls it only below its minimum height. */
  .background-tab {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    max-width: var(--shell-w, 100%);
    min-height: 0;
    margin: 0 auto;
    overflow-y: auto;
    box-sizing: border-box;
    container: theme-tab / inline-size;
  }

  /* Matches the Preferences and Props panels: one bordered surface opened by
     a header band. The band carries the apply action so it sits beside the
     choices it applies. */
  .theme-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "band"
      "stage"
      "choices";
    flex: 0 0 auto;
    min-width: 0;
    margin: clamp(0.75em, 1.4cqi, 1.75em) clamp(0.75em, 2cqi, 3em);
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 1.25em;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(0, 0, 0, 0.88)) 14%,
      #070b10 86%
    );
    box-shadow: var(--theme-panel-shadow, 0 1rem 3rem rgba(0, 0, 0, 0.35));
    isolation: isolate;
    --settings-row-inline: 1.15em;
  }

  :global(html[data-theme-luminance="bright"]) .theme-workspace {
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(255, 255, 255, 0.88)) 14%,
      #f6f7f9 86%
    );
  }

  .theme-band {
    grid-area: band;
    min-width: 0;
    background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  }

  .theme-status {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    min-height: var(--min-touch-target, 44px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    white-space: nowrap;
  }

  .theme-status i {
    color: var(--theme-accent-text, var(--theme-accent));
  }

  /* The label stays visible at every width; the band hides span labels on
     narrow tabs, which suits icon actions but not this one. */
  .apply-action :global(.panel-btn) {
    white-space: nowrap;
  }

  /* ── Live preview ── */

  .theme-stage {
    grid-area: stage;
    position: relative;
    height: clamp(220px, 38dvh, 380px);
    min-width: 0;
    overflow: hidden;
    isolation: isolate;
    background: var(--theme-panel-bg);
  }

  .stage-scrim {
    position: absolute;
    z-index: 1;
    inset: 35% 0 0;
    background: linear-gradient(
      transparent,
      color-mix(in srgb, #000 80%, transparent)
    );
    pointer-events: none;
  }

  .stage-copy {
    position: absolute;
    z-index: 2;
    right: clamp(18px, 4cqi, 36px);
    bottom: clamp(18px, 4cqi, 36px);
    left: clamp(18px, 4cqi, 36px);
    color: white;
    pointer-events: none;
  }

  .stage-label {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.8;
  }

  .stage-title-wrap p {
    max-width: 38ch;
    min-height: 2.8em;
    margin: 10px 0 0;
    font-size: 14px;
    line-height: 1.4;
  }

  .stage-title-wrap .stage-title {
    max-width: none;
    min-height: 0;
    margin: 0;
    font-family: system-ui, sans-serif;
    font-size: clamp(36px, 5cqi, 64px);
    font-weight: 700;
    line-height: 0.9;
    letter-spacing: -0.05em;
  }

  /* ── Choices ── */

  .theme-choices {
    grid-area: choices;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    min-width: 0;
    min-height: 0;
    gap: 8px;
    padding: 1rem var(--settings-row-inline);
    border-top: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  }

  .theme-choices button {
    position: relative;
    display: block;
    min-width: 0;
    min-height: 104px;
    padding: 0;
    overflow: hidden;
    color: var(--theme-text);
    text-align: left;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .theme-choices button:hover {
    border-color: var(--theme-stroke-strong);
    box-shadow: 0 0 0 1px var(--theme-stroke-strong);
  }

  .theme-choices button.previewing {
    border-color: var(--theme-accent);
    box-shadow: 0 0 0 2px var(--theme-accent);
  }

  .theme-choices button:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .choice-art {
    position: absolute;
    inset: 0;
    display: block;
    overflow: hidden;
    isolation: isolate;
    background: var(--theme-card-bg);
  }

  .choice-art img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform var(--transition-fast);
  }

  .choice-scrim {
    position: absolute;
    z-index: 1;
    inset: 35% 0 0;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.9));
    pointer-events: none;
  }

  .theme-choices button:hover .choice-art img,
  .theme-choices button:focus-visible .choice-art img {
    transform: scale(1.04);
  }

  .theme-choices button:active .choice-art img {
    transform: scale(1.01);
  }

  .choice-name {
    position: absolute;
    z-index: 2;
    right: 10px;
    bottom: 9px;
    left: 10px;
    overflow: hidden;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
    white-space: nowrap;
  }

  .choice-current {
    position: absolute;
    z-index: 2;
    top: 8px;
    left: 8px;
    padding: 3px 6px;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    background: rgba(0, 0, 0, 0.68);
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: 5px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  }

  /* A phone has no room for the title and "Use Celestial" side by side, so
     the action takes its own full-width row under the title. */
  @container theme-tab (max-width: 32rem) {
    .theme-workspace {
      --settings-row-inline: 0.9rem;
    }

    .theme-band :global(.section-header) {
      flex-wrap: wrap;
      align-items: center;
    }

    .theme-band :global(.section-action) {
      flex: 1 1 100%;
    }

    .apply-action,
    .apply-action :global(.panel-btn) {
      display: flex;
      width: 100%;
    }
  }

  /* Phones keep two large choices a row; a tablet fits all ten in two rows. */
  @container theme-tab (width < 37.5rem) {
    .theme-choices {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .theme-choices button {
      min-height: 120px;
    }
  }

  @media (max-height: 650px) and (min-width: 760px) {
    .theme-stage {
      height: 220px;
    }
  }

  /* ── Side by side ── the preview takes the room, the band and choices sit
     in a column on the right, split from it by one seam. */
  @media (min-aspect-ratio: 1/1) {
    @container theme-tab (min-width: 62.5rem) {
      .theme-workspace {
        flex: 1 1 0;
        min-height: 38rem;
        grid-template-columns: minmax(0, 1fr) clamp(360px, 36cqi, 640px);
        grid-template-rows: auto minmax(0, 1fr);
        grid-template-areas:
          "stage band"
          "stage choices";
      }

      .theme-stage {
        height: auto;
        min-height: 0;
        border-right: 1px solid var(--theme-stroke);
      }

      .theme-choices {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-rows: repeat(5, minmax(100px, 1fr));
        border-top: 0;
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .theme-choices button,
    .choice-art img {
      transition: none;
    }
  }

  @media (prefers-contrast: high) {
    .theme-workspace {
      border-width: 2px;
    }
  }
</style>
