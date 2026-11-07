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

  Theme is the first of the wide tier's four cells (2026-11-02), and the
  drill tier's Theme screen; either way it is a fourth user of the frame: it
  has no Reset, so it passes its own header `action` (Use theme / Current
  theme), and its stage is a live background that fills the whole area
  (`bleed`) instead of a box of one ratio.

  Revision: two-by-two cells (2026-11-02). Austen, at 1740×1420 on the four
  columns: "no it looks awkward". The columns did not share a shape (the
  Theme preview ran header to floor while the other stages floated small in
  tall empty columns). On the wide tier each section is now a `cell` of a
  2×2 grid: the header as before, then the stage on the left taking the
  cell's whole free height, and the switches centred on the right in a pane
  of at least 17rem. Every cell is the same size, so the four stages start
  and end on the same lines.

  Revision: cells fill, theme shows through (2026-11-03). Austen, at
  1740×1420: "a little over containerized", "the gray theme against
  whatever background we've chosen just feels a little drab", and the
  theme buttons "could just be taller in order to fill it, so you see more
  of the background". A cell carries no tint of its own any more: the
  workspace's panel glass is the only surface, so the chosen theme reads
  through every cell. The bleed cell (Theme) is a `fill` cell: its stage
  runs the body's full height and its switches pane stretches to the same
  height as a size container, which the theme tiles fill.

  Revision: Theme applies on click (2026-11-06). Austen: "you click your theme
  and then it immediately changes the background". Theme's `action` is now an
  empty snippet, which keeps Reset out of its header: the icon tile and title
  stay and the slot is empty.
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
    /** The header's action in place of Reset. Theme passes an empty one. */
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
    /** One cell of the wide tier's 2×2 grid: stage left, switches right. */
    cell?: boolean;
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
    cell = false,
  }: Props = $props();

  const uid = $props.id();
</script>

<section
  class="workspace-section display-section"
  class:screen={!!onBack}
  class:cell
  class:fill={cell && bleed}
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
      {#if !onBack && !cell && caption}
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
  .screen .stage-frame.bleed,
  .cell .stage-frame.bleed {
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
     reaches every grid as the same pixels. Only the wide tier's cells draw
     tiles (the drill screens and short cells draw chips), and a cell's pane
     is at least 17rem, so the ladder starts at four: ten tiles run 4+4+2,
     never 3+3+3+1, and the pictograph's eight run 4×2. From 30rem they run
     5×2; the card groups its seven per row. In a cell the picture is also
     capped by the pane's height (`--cell-art-cap`, set per section below),
     so a wide, short pane never grows its deck past the stage. */
  .controls {
    min-width: 0;
    container: display-controls / inline-size;
  }

  .controls > :global(*) {
    --tile-grid-cols: 4;
    --tile-grid-gap: 8px;
    --tile-grid-art: clamp(
      2.5rem,
      min(
        (100cqi - (var(--tile-grid-cols) - 1) * var(--tile-grid-gap)) /
          var(--tile-grid-cols) - 2.5rem,
        var(--cell-art-cap, 8rem)
      ),
      8rem
    );
  }

  @container display-controls (min-width: 30rem) {
    .controls > :global(*) {
      --tile-grid-cols: 5;
    }
  }

  /* The animation's four Header chips wrap 3+1 on a pane this narrow; two
     by two they stay one deliberate block under the tiles. */
  @container display-controls (width < 22rem) {
    .controls :global([data-header-parts] .menu-chip-row) {
      display: grid;
      grid-template-columns: repeat(2, max-content);
      justify-content: center;
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

  /* A cell of the wide tier (2026-11-02): the section is a quarter of the
     tab, with no tint of its own (2026-11-03): the workspace's panel glass
     is the one surface, so the theme shows through. Its body is a size container laid out as the landscape screen is,
     stage left and switches right. The stage is as tall as the body and as
     wide as its ratio allows at that height, but never so wide that the
     switches get less than 17rem: where both cannot hold, the stage gives
     way and its frame is the largest box of its ratio that still fits. */
  .cell {
    flex: 1 1 auto;
    min-height: 0;
    background: none;
    --cell-gap: 1rem;
  }

  .cell .section-body {
    flex: 1 1 auto;
    flex-direction: row;
    align-items: center;
    gap: var(--cell-gap);
    min-height: 0;
    padding: 0.75rem 1rem;
    container: display-cell / size;
  }

  .cell .stage {
    flex: 0 0 auto;
    align-self: stretch;
    width: min(
      100cqb * var(--cell-stage-ratio, var(--stage-ratio, 1)),
      100cqi - 17rem - var(--cell-gap)
    );
    min-height: 0;
  }

  .cell .stage-area {
    flex: 1 1 auto;
    min-height: 0;
    container-type: size;
    align-items: center;
  }

  .cell .stage-frame {
    width: min(100cqi, calc(100cqb * var(--stage-ratio, 1)));
  }

  /* The bleed stage is as tall as a square stage beside it would be: the
     full height, or its own width where the 17rem pane leaves the stages
     narrower than tall. So it never runs header to floor while the other
     cells' stages stop short (the shape the columns tier was rejected for). */
  .cell .stage-frame.bleed {
    height: min(100%, 100cqi);
  }

  /* A fill cell (Theme, 2026-11-03): the stage is the body's full height,
     as wide as the 17rem pane allows, and the pane is as tall as the body,
     a size container its tiles fill (BackgroundTab `.cell`). The other
     cells keep their ratio stages centred. */
  .cell.fill .stage-frame.bleed {
    height: 100%;
  }

  .cell.fill .controls {
    align-self: stretch;
    max-height: none;
    container: display-controls / size;
  }

  /* The switches fill the pane's width and centre in its height. Chips
     take the drill screens' lowered floor (2rem), so the stage keeps the
     height and the chips stay 32-36px. */
  .cell .controls {
    flex: 1 1 0;
    max-height: 100%;
    --min-touch-target: 2rem;
  }

  /* The tallest decks cap the picture by the stage's height (100cqb, the
     cell body): the card's two tile rows beside 21rem of labels, segments
     and gaps, and the animation's three rows (ten tiles at four across)
     beside 17rem of chrome and its Header row. All four cells are one
     height, so they share the cap and their tiles stay one family. */
  .cell .controls > :global(*) {
    --cell-art-cap: min((100cqb - 21rem) / 2, (100cqb - 17rem) / 3);
  }
</style>
