<!--
  BackgroundTab: the theme showroom (a live preview stage and the ten
  choices). Clicking a choice applies it.

  Revision: Theme folds in (2026-11-02). Austen: "maybe themes should be
  folded into the display area". Settings has no Theme tab any more; this is
  the Theme screen of Settings → Display. With `onBack` set it renders
  through DisplaySection with the other Display screens' header grammar: a
  back arrow, one-line title, and Use theme where Reset sits on the others.
  `compact` (the drill tier's screen) makes the choices one wrapping row of
  small tiles so the screen never scrolls. Without `onBack` it keeps its old
  standalone layout.

  Revision: Theme is the fourth column (2026-11-02), then the first of four
  two-by-two cells (2026-11-02). With `cell` set it renders the same
  DisplaySection frame without a back arrow, as the first cell of the wide
  tier: palette icon tile, title, Use theme / Current theme where the others
  show Reset, the live stage over the cell's full height on the left, and
  the ten choices on the right as a 5×2 grid of picture tiles (2×5 on a
  pane under 22rem) in the other cells' tile family, or about 2.25rem tall
  with `compact` when the cells draw chips.

  Revision: cells fill, theme shows through (2026-11-03). Austen: the
  theme buttons "could just be taller in order to fill it, so you see more
  of the background". In a cell the stage runs the body's full height and
  the ten tiles fill the pane beside it top to bottom: 2×5, or 5×2 on a
  pane of 30rem or more that is two to two and a half times as wide as
  tall, so the tiles stay pictures, never pillars. Chip-mode cells use the
  same fill with shorter tiles.

  Revision: Theme applies on click (2026-11-06). Austen: "Should we have a use
  button when we choose the theme or should we just make it so you click your
  theme and then it immediately changes the background? I think that would be
  better, the second one." The Use theme button, the Current theme status and
  the Current badge are gone on every tier. A click applies the theme, so the
  selected tile is always the current theme: one mark, the full ring plus
  aria-pressed. The stage follows it, and the Theme header's action slot is
  empty.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import {
    holdBackground,
    releaseBackground,
  } from "#lib/shared/background/shared/state/background-hold.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
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
    cell = false,
    compact = false,
    title,
  } = $props<{
    settings: AppSettings;
    onUpdate?: (event: { key: string; value: unknown }) => void;
    /** Set when the showroom is a screen of Settings → Display. */
    onBack?: () => void;
    /** The first cell of Settings → Display's wide tier: the same
     *  DisplaySection frame as the screen, with no back arrow. */
    cell?: boolean;
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
  const currentType = $derived<BackgroundType>(
    BACKGROUND_CARD_REGISTRY.some(
      (theme) => theme.type === settings?.backgroundType
    )
      ? settings.backgroundType
      : BackgroundType.COSMIC
  );
  const current = $derived(
    getCardMetadata(currentType) ?? BACKGROUND_CARD_REGISTRY[0]
  );
  const needsThemeConfirmation = $derived(
    accountSetupState?.available &&
      accountSetupState.tasks.some(
        (task) => task.id === "theme" && !task.complete
      )
  );

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
  // animates. A screen or the standalone page holds it until a theme is
  // picked: a held controller queues a new theme until release, and the whole
  // page has to change on the click (2026-11-06).
  // The Display cell is on screen for the whole visit to Display, so it never
  // holds: the page's background runs the chosen theme beside it.
  const HOLD_KEY = "settings-theme-preview";
  onMount(() => {
    hapticService = getHapticFeedback();
    if (cell) return;
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

  function applyTheme(type: BackgroundType): void {
    hapticService?.trigger("selection");
    if (type !== currentType) {
      releaseBackground(HOLD_KEY);
      const theme = getCardMetadata(type);
      if (theme) applyThemeFromColors(undefined, theme.themeColors);
      onUpdate?.({ key: "backgroundType", value: type });
    }
    void recordThemeChoice();
  }
</script>

<!-- The header's action slot stays empty: the click on a tile is the action. -->
{#snippet noAction()}{/snippet}

{#snippet themeChoices()}
  <div class="theme-choices" aria-label={t("settings_theme_choices")}>
    {#each BACKGROUND_CARD_REGISTRY as theme}
      <button
        type="button"
        class:selected={currentType === theme.type}
        aria-pressed={currentType === theme.type}
        aria-label={themeName(theme.type)}
        onclick={() => applyTheme(theme.type as BackgroundType)}
      >
        <span
          class="choice-art"
          style:background={theme.gradient}
          aria-hidden="true"
        >
          <img src={`/images/theme-previews/${theme.type}.webp`} alt="" />
          <span class="choice-scrim"></span>
          <span class="choice-name">{themeName(theme.type)}</span>
        </span>
      </button>
    {/each}
  </div>
{/snippet}

{#if onBack || cell}
  <div
    class="theme-screen"
    class:compact
    class:cell
    data-theme-screen
    data-theme-cell={cell || undefined}
  >
    <DisplaySection
      kind="theme"
      icon="fas fa-palette"
      title={title ?? t("tab_settings_theme")}
      caption=""
      action={noAction}
      bleed
      {onBack}
      {cell}
    >
      {#snippet stage()}
        <div
          class="theme-stage screen-stage"
          aria-label={t("settings_previewing_theme", {
            theme: themeName(currentType),
          })}
          role="img"
        >
          <ThemePreview type={currentType} fallback={current?.gradient ?? ""} />
          <div class="stage-scrim"></div>
          <div class="stage-copy">
            <Crossfade key={currentType} duration={DURATION.normal}>
              <div class="stage-title-wrap">
                <p class="stage-title">{themeName(currentType)}</p>
                <p class="stage-description">
                  {themeDescription(currentType)}
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
        />
      </div>

      <section
        class="theme-stage"
        aria-label={t("settings_previewing_theme", {
          theme: themeName(currentType),
        })}
      >
        <ThemePreview type={currentType} fallback={current?.gradient ?? ""} />
        <div class="stage-scrim"></div>
        <div class="stage-copy">
          <p class="stage-label">{t("settings_live_preview")}</p>
          <Crossfade key={currentType} duration={DURATION.normal}>
            <div class="stage-title-wrap">
              <p class="stage-title">{themeName(currentType)}</p>
              <p>{themeDescription(currentType)}</p>
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
     a header band. */
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

  .theme-choices button.selected {
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

  @container theme-tab (max-width: 32rem) {
    .theme-workspace {
      --settings-row-inline: 0.9rem;
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

  .theme-screen.compact .choice-scrim {
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
  }

  /* The first cell of Settings → Display (revised 2026-11-03, "taller in
     order to fill it, so you see more of the background"): the ten tiles
     fill the switches pane top to bottom, so the pane holds pictures, not
     a small grid floating in empty space. The pane is a size container as
     tall as the stage (DisplaySection `fill`). Up to a 30rem pane they run
     2×5; from 30rem, where the pane is two to two and a half times as wide
     as tall, 5×2, so each tile is 0.8 to 1 times as wide as tall. A pane
     taller than that ratio keeps 2×5: at 3840×2160 the pane is 650×923
     and 5×2 would make 124×458 pillars where 2×5 gives 321×178
     pictures. The same fill holds when the cells draw chips (`compact`),
     with shorter tiles; it replaces the 2.25rem compact tile there. Selected is the full ring
     above. The stage is as wide as a
     1.2 box at the body's height (the card's ratio) where the 17rem pane
     allows it; the tiles take the rest. */
  .theme-screen.cell {
    --cell-stage-ratio: 1.2;
  }

  .theme-screen.cell .theme-choices {
    box-sizing: border-box;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(5, minmax(0, 1fr));
    height: 100%;
    gap: 8px;
  }

  .theme-screen.cell .theme-choices button {
    height: auto;
    min-height: 0;
    aspect-ratio: auto;
  }

  .theme-screen.cell.compact .theme-choices {
    gap: 0.375rem;
  }

  .theme-screen.cell .choice-name {
    right: 0.5rem;
    bottom: 0.4rem;
    left: 0.5rem;
    font-size: 0.8125rem;
    text-align: left;
  }

  .theme-screen.cell.compact .choice-scrim {
    inset: 35% 0 0;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.9));
  }

  @container display-controls (min-width: 30rem) and (min-aspect-ratio: 2 / 1) and (max-aspect-ratio: 5 / 2) {
    .theme-screen.cell .theme-choices {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
  }

  /* Tiles at least about 7rem tall (a pane of 40rem, 2×5) take the larger
     label size. */
  @container display-controls (min-height: 40rem) {
    .theme-screen.cell .choice-name {
      font-size: 14px;
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
