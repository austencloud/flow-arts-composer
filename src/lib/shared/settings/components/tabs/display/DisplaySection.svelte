<!--
  DisplaySection — one section of Settings → Display: a header band with a
  quiet "Reset to defaults", a stage that reserves its geometry before its
  renderer mounts, the switches under it, and a one-line caption teaching the
  gesture that reaches the same switches anywhere in the app.

  The three sections differ only in their stage and switches, so the frame is
  written once. Its shape follows PropTypeTab's section / stage / figcaption.
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
  }: Props = $props();

  const uid = $props.id();
</script>

<section
  class="workspace-section display-section"
  data-display-section={kind}
  aria-labelledby="{uid}-title"
>
  <SettingsSectionHeader {icon} {title} headingId="{uid}-title">
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

  /* Stacked, in a section that is wide but short (a tablet, a phone on its
     side): the switches sit beside the stage instead of a screen below it. */
  @container display-tab (width < 64rem) {
    @container display-section (min-width: 40rem) {
      /* A fixed 2:3 split, so the switches get the same width, and so the same
         tiles, in all three sections; the frame keeps its own caps. */
      .section-body {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
        align-items: center;
        gap: 1.5rem;
      }
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
