<!--
  DisplaySection — one section of Settings → Display: a header band with a
  quiet "Reset to defaults", a stage that reserves its geometry before its
  renderer mounts, the switches under it, and a one-line caption teaching the
  gesture that reaches the same switches anywhere in the app.

  The three sections differ only in their stage and switches, so the frame is
  written once. Its shape follows PropTypeTab's section / stage / figcaption.

  Below the columns tier the tab opens one section at a time as its own
  screen (`onBack` set): a back arrow, the title and an icon-only Reset in a
  one-line header, the stage as the hero taking all the height the small
  switches leave, and no caption, so the screen never scrolls.

  Theme is the first of the columns tier's four columns (2026-11-02), and
  the drill tier's Theme screen; either way it is a fourth user of the frame: it has no
  Reset, so it passes its own header `action` (Use theme / Current theme),
  and its stage is a live background that fills the whole area (`bleed`)
  instead of a box of one ratio.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SettingsSectionHeader from "../../SettingsSectionHeader.svelte";

  interface Props {
    /** Section key, also the data hook for tests and evidence. */
    kind: "pictograph" | "animation" | "card" | "theme";
    icon: string;
    title: string;
    caption: string;
    /** Reset to defaults. Left out where `action` takes its place. */
    onReset?: () => void;
    /** The header's action in place of Reset (the Theme screen's Use theme). */
    action?: Snippet;
    /** The stage fills its whole area instead of a box of one ratio. */
    bleed?: boolean;
    /** The live renderer. The frame reserves its box whether or not it has mounted. */
    stage: Snippet;
    /** Right-click / long-press on the stage opens the same menu as elsewhere. */
    onStageContextMenu?: (event: MouseEvent) => void;
    controls: Snippet;
    /** Set when the section is a drill-down screen of its own. */
    onBack?: () => void;
  }

  let {
    kind,
    icon,
    title,
    caption,
    onReset,
    action: headerAction,
    bleed = false,
    stage,
    onStageContextMenu,
    controls,
    onBack,
  }: Props = $props();

  const uid = $props.id();
</script>

<section
  class="workspace-section display-section"
  class:screen={!!onBack}
  data-display-section={kind}
  aria-labelledby="{uid}-title"
>
  <!-- A screen of its own drops the icon tile: the box that opened it showed
       it, and the title needs the width to stay on one line. -->
  <SettingsSectionHeader
    icon={onBack ? undefined : icon}
    {title}
    headingId="{uid}-title"
  >
    {#snippet leading()}
      {#if onBack}
        <button
          type="button"
          class="icon-button"
          onclick={onBack}
          aria-label={t("common_back")}
        >
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        </button>
      {/if}
    {/snippet}
    {#snippet action()}
      {#if headerAction}
        {@render headerAction()}
      {:else if onBack}
        <button
          type="button"
          class="icon-button"
          onclick={onReset}
          aria-label="{t('settings_display_reset')}: {title}"
          title={t("settings_display_reset")}
        >
          <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
        </button>
      {:else}
        <PanelButton
          variant="quiet"
          onclick={onReset}
          ariaLabel="{t('settings_display_reset')}: {title}"
        >
          {t("settings_display_reset")}
        </PanelButton>
      {/if}
    {/snippet}
  </SettingsSectionHeader>

  <div class="section-body">
    <figure class="stage" data-stage={kind}>
      <div class="stage-area">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="stage-frame" class:bleed oncontextmenu={onStageContextMenu}>
          {@render stage()}
        </div>
      </div>
      {#if !onBack && caption}
        <figcaption class="stage-caption">{caption}</figcaption>
      {/if}
    </figure>

    <div class="controls">
      {@render controls()}
    </div>
  </div>
</section>

<style>
  .display-section {
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: color-mix(in srgb, var(--theme-text) 2%, transparent);
    container: display-section / inline-size;
  }

  .section-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    padding: 1rem var(--settings-row-inline, 1.15em) 1.25rem;
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
  }

  .stage-area {
    display: flex;
    justify-content: center;
    width: 100%;
  }

  /* The box is fixed before any renderer mounts, so a late pictograph, canvas
     or card never moves the switches under it. Each section sets the shape. */
  .stage-frame {
    position: relative;
    display: grid;
    place-items: center;
    /* The height cap is applied through the width so the ratio holds. */
    width: min(
      100%,
      var(--stage-max-w, 22rem),
      calc(var(--stage-max-h, 100rem) * var(--stage-ratio, 1))
    );
    aspect-ratio: var(--stage-ratio, 1);
    overflow: hidden;
    border-radius: 0.75rem;
    border: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  }

  /* A stage that is its whole area: the live background of the Theme
     screen has no ratio of its own, so it takes every pixel it is given. */
  .stage-frame.bleed,
  .screen .stage-frame.bleed {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
  }

  /* The drill-down screen's way back and its Reset: round icon buttons at
     the screen's lowered touch floor (2.25rem), as small as the switches. */
  .icon-button {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: 0.9375rem;
    cursor: pointer;
  }

  .icon-button:hover {
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
  }

  .icon-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .stage-caption {
    max-width: 34ch;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.4;
    text-align: center;
    text-wrap: balance;
  }

  /* The switches are picture tiles on one column ladder in all three
     sections (MenuItemTileGrid, DisplayPanel hostSized, CardContentToggles).
     The ladder reads this box's own width, so the same width gives the same
     tiles in every section; the picture size is a registered length, so it
     reaches every grid as the same pixels. Only the columns tier draws
     tiles (the drill screens draw chips), and its columns are at least 17rem
     of content (2026-11-02), so the ladder starts at four: ten tiles run
     4+4+2, never 3+3+3+1, and the pictograph's eight run 4×2. From 30rem
     they run 5×2; the card groups its seven per row. */
  .controls {
    min-width: 0;
    container: display-controls / inline-size;
  }

  .controls > :global(*) {
    --tile-grid-cols: 4;
    --tile-grid-gap: 8px;
    --tile-grid-art: clamp(
      2.5rem,
      (100cqi - (var(--tile-grid-cols) - 1) * var(--tile-grid-gap)) /
        var(--tile-grid-cols) - 2.5rem,
      8rem
    );
  }

  @container display-controls (min-width: 30rem) {
    .controls > :global(*) {
      --tile-grid-cols: 5;
    }
  }

  /* The animation's four Header chips wrap 3+1 on a column this narrow;
     two by two they stay one deliberate block under the tiles. */
  @container display-controls (width < 22rem) {
    .controls :global([data-header-parts] .menu-chip-row) {
      display: grid;
      grid-template-columns: repeat(2, max-content);
      justify-content: center;
    }
  }

  /* A column under 20rem (the four-column tier near its 81rem threshold,
     1440×900) has no room for the icon tile, the title and "Reset to
     defaults" on one line: "Pictograph" broke a letter onto a second line.
     The tile goes; the title and its action keep their size. */
  @container display-section (width < 20rem) {
    .display-section:not(.screen) :global(.section-icon) {
      display: none;
    }
  }

  /* A drill-down screen: the section is as tall as the tab, the switches
     keep their natural height and the stage takes everything that is left.
     A phone screen keeps its hero big and its controls small (Austen,
     2026-10-29 and 11-01): the touch floor drops to 2rem here, so chips,
     segments and the header's icon buttons are 32-36px, never 44px just to
     meet a floor. */
  .screen {
    flex: 1 1 auto;
    min-height: 0;
    --min-touch-target: 2rem;
    /* The card is the hero here: a thinner mat gives it the width. */
    --card-stage-pad: 0.25rem;
  }

  .screen :global(.section-header) {
    min-height: 0;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem;
    align-items: center;
  }

  /* One line at every width: the header holds two 2.25rem buttons and the
     title, so the title takes the rest and never wraps a letter at a time. */
  .screen :global(.section-header h2) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .screen .section-body {
    flex: 1 1 auto;
    min-height: 0;
    gap: 0.75rem;
    padding-block: 0.75rem;
  }

  .screen .stage {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
  }

  /* The frame is the largest box of its ratio the area holds: the screen's
     width is the cap, not the columns tier's 22rem. */
  .screen .stage-area {
    flex: 1 1 auto;
    min-height: 0;
    container-type: size;
    align-items: center;
  }

  .screen .stage-frame {
    width: min(100cqi, calc(100cqb * var(--stage-ratio, 1)));
  }

  /* Centred and capped, so the chips of a wide upright screen stay one
     group instead of a band across it. The width is explicit: the controls
     are an inline-size container and would shrink to nothing. */
  .screen .controls {
    align-self: center;
    width: min(100%, 40rem);
  }

  /* Side by side on a screen wider than it is tall (a phone on its side, a
     zoomed desktop): stacked, the stage would get what the switches leave of
     a short screen, so it takes a full-height column instead, with the
     switches centred beside it. Chips need less width than tiles did, so the
     stage gets half. An upright screen stacks however wide it is. */
  @container display-screen (orientation: landscape) {
    .screen .section-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
      gap: 1.25rem;
    }

    .screen .stage {
      align-self: stretch;
    }
  }

  @container display-screen (height < 26rem) {
    .screen .section-body {
      padding-block: 0.5rem;
    }
  }

  /* Columns: the section is as tall as the tab. The stage takes every pixel
     the switches leave, and the frame is the largest box of its ratio that
     fits that area, measured as a size container — so a 4K column carries a
     big stage instead of a capped one over an empty band. */
  @container display-tab (min-width: 81rem) {
    .display-section {
      flex: 1 1 auto;
      min-height: 0;
    }

    .section-body {
      flex: 1 1 auto;
      min-height: 0;
    }

    .stage {
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
    }

    /* The floor is back at 14rem now the Theme band is gone (Theme is the
       fourth column, 2026-11-02); it was 9rem while the band took 76px
       from every column. */
    .stage-area {
      flex: 1 1 auto;
      min-height: 14rem;
      container-type: size;
      align-items: center;
    }

    .stage-frame {
      width: min(100cqi, calc(100cqb * var(--stage-ratio, 1)));
    }
  }
</style>
