<!--
  DisplaySection — one section of Settings → Display: a header band with a
  quiet "Reset to defaults", a stage that reserves its geometry before its
  renderer mounts, the switches under it, and a one-line caption teaching the
  gesture that reaches the same switches anywhere in the app.

  The three sections differ only in their stage and switches, so the frame is
  written once. Its shape follows PropTypeTab's section / stage / figcaption.

  Below the three-column tier the tab opens one section at a time as its own
  screen (`onBack` set): a back arrow before the title, the stage taking the
  height the switches leave, so the screen never scrolls.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SettingsSectionHeader from "../../SettingsSectionHeader.svelte";

  interface Props {
    /** Section key, also the data hook for tests and evidence. */
    kind: "pictograph" | "animation" | "card";
    icon: string;
    title: string;
    caption: string;
    onReset: () => void;
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
  <SettingsSectionHeader {icon} {title} headingId="{uid}-title">
    {#snippet leading()}
      {#if onBack}
        <button
          type="button"
          class="back-button"
          onclick={onBack}
          aria-label={t("common_back")}
        >
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        </button>
      {/if}
    {/snippet}
    {#snippet action()}
      <PanelButton
        variant="quiet"
        onclick={onReset}
        ariaLabel="{t('settings_display_reset')}: {title}"
      >
        {t("settings_display_reset")}
      </PanelButton>
    {/snippet}
  </SettingsSectionHeader>

  <div class="section-body">
    <figure class="stage" data-stage={kind}>
      <div class="stage-area">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="stage-frame" oncontextmenu={onStageContextMenu}>
          {@render stage()}
        </div>
      </div>
      <figcaption class="stage-caption">{caption}</figcaption>
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

  /* The drill-down screen's way back, as on the Download video screen. */
  .back-button {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: 1rem;
    cursor: pointer;
  }

  .back-button:focus-visible {
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
     reaches every grid as the same pixels. Ten tiles run 3-wide on a phone,
     4+4+2 from 22rem and 5×2 from 30rem; the card groups its seven per row. */
  .controls {
    min-width: 0;
    container: display-controls / inline-size;
  }

  .controls > :global(*) {
    --tile-grid-cols: 3;
    --tile-grid-gap: 6px;
    --tile-grid-art: clamp(
      2.5rem,
      (100cqi - (var(--tile-grid-cols) - 1) * var(--tile-grid-gap)) /
        var(--tile-grid-cols) - 2.5rem,
      8rem
    );
  }

  @container display-controls (min-width: 22rem) {
    .controls > :global(*) {
      --tile-grid-cols: 4;
      --tile-grid-gap: 8px;
    }
  }

  @container display-controls (min-width: 30rem) {
    .controls > :global(*) {
      --tile-grid-cols: 5;
    }
  }

  /* A drill-down screen: the section is as tall as the tab, the switches and
     caption keep their natural height and the stage takes what is left. */
  .screen {
    flex: 1 1 auto;
    min-height: 0;
  }

  .screen .section-body {
    flex: 1 1 auto;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);
  }

  .screen .stage {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
  }

  .screen .stage-area {
    flex: 1 1 auto;
    min-height: 0;
    container-type: size;
    align-items: center;
  }

  .screen .stage-frame {
    width: min(100cqi, calc(100cqb * var(--stage-ratio, 1)));
  }

  .screen .stage-caption {
    flex: 0 0 auto;
  }

  /* On a screen of its own the stage is the flexible part, so the switches
     take as little height as they can read at: five to a row, the picture
     capped by the screen's height as well as its width (the tab sizes the
     screen as the display-screen container). */
  .screen .section-body {
    gap: 0.75rem;
    padding-block: 0.75rem;
  }

  /* Centred and capped, so the switches of a wide upright screen do not
     stretch into a band of oversized tiles. The width is explicit: the
     controls are an inline-size container and would shrink to nothing. */
  .screen .controls {
    align-self: center;
    width: min(100%, 40rem);
  }

  .screen .controls > :global(*) {
    --tile-grid-cols: 5;
    --tile-grid-gap: 6px;
    --tile-grid-art: clamp(
      1.5rem,
      min((100cqi - 4 * var(--tile-grid-gap)) / 5 - 2.5rem, 5cqh),
      6rem
    );
  }

  /* Side by side on a screen wider than it is tall (a phone on its side, a
     zoomed desktop): stacked, the stage would get what the switches leave of
     a short screen, so it takes a full-height column instead, with the
     switches centred beside it. A fixed 2:3 split gives the switches the
     same width, and so the same tiles, in all three sections. An upright
     screen stacks however wide it is. */
  @container display-screen (orientation: landscape) {
    .screen .section-body {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      align-items: stretch;
      gap: 1.5rem;
    }
  }

  /* A short screen (a phone on its side) tightens the header and the
     switches' rhythm so the card's three rows of groups fit beside the
     stage. */
  @container display-screen (height < 26rem) {
    .screen :global(.section-header) {
      min-height: 0;
      padding-block: 0.4em;
    }

    /* Beside a stage capped by the height, the switches take two thirds, so
       their labels keep to one line. */
    .screen .section-body {
      padding-block: 0.25rem;
      grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    }

    .screen .controls > :global(*) {
      --card-toggles-row-gap: 0.3rem;
      --card-toggles-label-gap: 0.1rem;
    }
  }

  /* Columns: the section is as tall as the tab. The stage takes every pixel
     the switches leave, and the frame is the largest box of its ratio that
     fits that area, measured as a size container — so a 4K column carries a
     big stage instead of a capped one over an empty band. */
  @container display-tab (min-width: 64rem) {
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
