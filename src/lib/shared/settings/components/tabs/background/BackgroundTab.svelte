<!--
  BackgroundTab: the theme showroom (a live preview stage, the ten choices,
  and Use theme / Current theme).

  Revision: Theme folds in (2026-11-02). Austen: "maybe themes should be
  folded into the display area". Settings has no Theme tab any more; this is
  the Theme screen of Settings → Display. With `onBack` set it renders
  through DisplaySection with the other Display screens' header grammar: a
  back arrow, one-line title, and Use theme where Reset sits on the others.
  `compact` (the drill tier's screen) makes the choices one wrapping row of
  small tiles so the screen never scrolls. Without `onBack` it keeps its old
  standalone layout.

  Revision: Theme is the fourth column (2026-11-02). With `column` set it
  renders the same DisplaySection frame without a back arrow, as the first
  of the columns tier's four columns: palette icon tile, title, Use theme /
  Current theme where the others show Reset, the live stage over the free
  height, and the ten choices as a 5×2 (or 2×5 on a narrow column) grid of
  picture tiles in the pictograph tiles' size family.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import {
    holdBackground,
    releaseBackground,
  } from "#lib/shared/background/shared/state/background-hold.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
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
  import { onMount, untrack } from "svelte";
  import type { AppSettings } from "../../../domain/app-settings";
  import { applyThemeFromColors } from "../../../utils/background-theme-calculator";
  import SettingsSectionHeader from "../../SettingsSectionHeader.svelte";
  import DisplaySection from "../display/DisplaySection.svelte";
  import ThemePreview from "./ThemePreview.svelte";

  const SAVE_ERROR_TOAST_MS = 10_000;

  let {
    settings,
    onUpdate,
    onBack,
    column = false,
    compact = false,
    title,
  } = $props<{
    settings: AppSettings;
    onUpdate?: (event: { key: string; value: unknown }) => void;
    /** Set when the showroom is a screen of Settings → Display. */
    onBack?: () => void;
    /** The first column of Settings → Display's columns tier: the same
     *  DisplaySection frame as the screen, with no back arrow. */
    column?: boolean;
    /** Small tiles in one wrapping row, for a screen that must not scroll. */
    compact?: boolean;
    /** The screen's title; Display passes the Theme label. */
    title?: string;
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

  // Opening this page is the choice. A new member looked at the themes, kept
  // the one they had, and the setup checklist still asked them to choose one.
  // Setup progress loads after mount, so wait for it, then record once.
  let themeVisitRecorded = false;
  $effect(() => {
    if (themeVisitRecorded || !needsThemeConfirmation) return;
    themeVisitRecorded = true;
    untrack(() => void accountSetupState?.markThemeChosen());
  });

  // The page's background holds still under a showroom so only the stage
  // animates. A screen or the standalone page holds it for its whole visit.
  // The Display column is on screen for the whole visit to Display, so it
  // holds only while it previews a theme other than the current one: once
  // Use theme applies it, the page's background runs the new theme.
  const HOLD_KEY = "settings-theme-preview";
  onMount(() => {
    hapticService = getHapticFeedback();
    if (column) return;
    holdBackground(HOLD_KEY);
    return () => releaseBackground(HOLD_KEY);
  });

  $effect(() => {
    if (!column || previewIsCurrent) return;
    holdBackground(HOLD_KEY);
    return () => releaseBackground(HOLD_KEY);
  });

  async function recordThemeChoice(): Promise<void> {
    if (!accountSetupState) return;
    await accountSetupState.markThemeChosen();
    if (!accountSetupState.saveError) return;
    showToast({
      message: accountSetupState.saveError,
      type: "error",
      duration: SAVE_ERROR_TOAST_MS,
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
    if (!canApplyPreview || !preview) return;
    hapticService?.trigger("success");
    if (!previewIsCurrent) {
      applyThemeFromColors(undefined, preview.themeColors);
      onUpdate?.({ key: "backgroundType", value: previewType });
    }
    void recordThemeChoice();
  }
</script>

{#snippet applyAction()}
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

{#snippet themeChoices()}
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
{/snippet}

{#if onBack || column}
  <div
    class="theme-screen"
    class:compact
    class:column
    data-theme-screen
    data-theme-column={column || undefined}
  >
    <DisplaySection
      kind="theme"
      icon="fas fa-palette"
      title={title ?? t("tab_settings_theme")}
      caption=""
      action={applyAction}
      bleed
      {onBack}
    >
      {#snippet stage()}
        <div
          class="theme-stage screen-stage"
          aria-label={t("settings_previewing_theme", {
            theme: themeName(previewType),
          })}
          role="img"
        >
          <ThemePreview type={previewType} fallback={preview?.gradient ?? ""} />
          <div class="stage-scrim"></div>
          <div class="stage-copy">
            <Crossfade key={previewType} duration={DURATION.normal}>
              <div class="stage-title-wrap">
                <p class="stage-title">{themeName(previewType)}</p>
                <p class="stage-description">
                  {themeDescription(previewType)}
                </p>
              </div>
            </Crossfade>
          </div>
        </div>
      {/snippet}
      {#snippet controls()}
        {@render themeChoices()}
      {/snippet}
    </DisplaySection>
  </div>
{:else}
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
            {@render applyAction()}
          {/snippet}
        </SettingsSectionHeader>
      </div>

      <section
        class="theme-stage"
        aria-label={t("settings_previewing_theme", {
          theme: themeName(previewType),
        })}
      >
        <ThemePreview type={previewType} fallback={preview?.gradient ?? ""} />
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

      {@render themeChoices()}
    </section>
  </div>
{/if}

<style>
  /* The tab is the page's scroller. The panel always fills the tab's height
     and scrolls it only below its minimum height. */
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
    /* Stacked, the preview takes whatever height the band and choices leave,
       so a tall window shows more preview instead of empty space. */
    grid-template-rows: auto minmax(clamp(220px, 38dvh, 380px), 1fr) auto;
    flex: 1 0 auto;
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
    .theme-workspace {
      grid-template-rows: auto minmax(220px, 1fr) auto;
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

  /* ── Theme screen of Settings → Display ──
     The section is the screen's height. The live background is the stage and
     takes every pixel the header and choices leave (DisplaySection `bleed`);
     the choices sit under it, or beside it on a screen wider than tall. */
  .theme-screen {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .theme-screen .screen-stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
    isolation: isolate;
    container: theme-stage / size;
  }

  .theme-screen .stage-copy {
    right: clamp(0.75rem, 4cqi, 2rem);
    bottom: clamp(0.75rem, 4cqb, 2rem);
    left: clamp(0.75rem, 4cqi, 2rem);
  }

  .theme-screen .stage-title-wrap .stage-title {
    font-size: clamp(1.75rem, 9cqi, 4rem);
  }

  .theme-screen .stage-title-wrap .stage-description {
    min-height: 0;
    margin-top: 0.5rem;
  }

  /* The description goes where it would crowd the title (no-page-scroll:
     the stage gives up words before the screen gives up its fit). */
  @container theme-stage (height < 12rem) or (width < 16rem) {
    .theme-screen .stage-title-wrap .stage-description {
      display: none;
    }
  }

  /* The screen's choices: no band of their own, the section body pads them. */
  .theme-screen .theme-choices {
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: 0.5rem;
    padding: 0;
    border-top: 0;
    background: none;
  }

  .theme-screen .theme-choices button {
    min-height: 0;
    aspect-ratio: 16 / 10;
  }

  /* Compact: one wrapping row of small tiles (about 2.25rem tall, no 44px
     floor), so a phone keeps its stage big. */
  .theme-screen.compact .theme-choices {
    grid-template-columns: repeat(auto-fill, minmax(4.125rem, 1fr));
    gap: 0.375rem;
  }

  .theme-screen.compact .theme-choices button {
    height: 2.25rem;
    aspect-ratio: auto;
    border-radius: 0.5rem;
  }

  .theme-screen.compact .choice-name {
    right: 0.25rem;
    bottom: 0.3rem;
    left: 0.25rem;
    font-size: 0.75rem;
    text-align: center;
  }

  /* A small tile marks the current theme with a dot, not a badge that
     would cover its name; the button's label says it in words. */
  .theme-screen.compact .choice-current {
    top: 0.25rem;
    right: 0.25rem;
    left: auto;
    width: 0.5rem;
    height: 0.5rem;
    padding: 0;
    overflow: hidden;
    font-size: 0;
    border-radius: 50%;
    background: var(--theme-accent, #fff);
    border-color: #fff;
  }

  .theme-screen.compact .choice-scrim {
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
  }

  /* The fourth column of Settings → Display: ten picture tiles in the
     family of the pictograph's tiles beside it. A 17-22rem column takes
     them 2×5 as wide, short bands; from 22rem, 5×2 near-square tiles. No
     count leaves a single tile on a row. Selected is the full ring above;
     current keeps its "Current" badge. */
  .theme-screen.column .theme-choices {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .theme-screen.column .theme-choices button {
    aspect-ratio: 2.4;
  }

  .theme-screen.column .choice-name {
    right: 0.5rem;
    bottom: 0.4rem;
    left: 0.5rem;
    font-size: 0.8125rem;
  }

  .theme-screen.column .choice-current {
    top: 0.3rem;
    left: 0.3rem;
    padding: 1px 5px;
    font-size: 0.6875rem;
  }

  @container display-controls (min-width: 22rem) {
    .theme-screen.column .theme-choices {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .theme-screen.column .theme-choices button {
      aspect-ratio: 0.9;
    }

    .theme-screen.column .choice-name {
      right: 0.25rem;
      left: 0.25rem;
      text-align: center;
    }
  }

  /* The header's action is the height of the back arrow (2.25rem) in both
     states, so Use theme replacing Current theme never moves the stage. The
     column keeps the other columns' full-size header action instead, so
     its header lines up with theirs. */
  .theme-screen:not(.column) .theme-status {
    min-height: 2.25rem;
  }

  .theme-screen:not(.column) .apply-action :global(.panel-btn) {
    min-height: 2.25rem;
    padding-block: 0.375rem;
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
