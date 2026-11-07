<!--
  Settings → Display: what pictographs, animations and cards show, each beside
  a live example bound to the same global switches the long-press menus write.
  Four equal cells, two by two, filling the tab where it is wide and tall
  enough, with every section always visible.

  Below the wide tier (see the last revision for its size) the sections do not
  fit one screen, and settings never scroll (no-page-scroll.md). The tab then
  shows three drill-down boxes sharing its height, each with a live thumbnail
  of its section's stage, its title and a two-line summary of what is on, and
  opens one section at a time as its own screen with a back arrow, as the
  Download video screen's File and Show panes do. A screen of its own keeps
  the stage big and its switches small (chips, the `compact` sections).

  The animation section is imported lazily: it carries the animation engine,
  which nothing else in Settings needs. Its frame holds the same header and
  stage box while it loads, then crossfades to the live section.

  Revision: Theme folds in (2026-11-02). Austen: "maybe themes should be
  folded into the display area". Theme is the first item on both tiers
  (Theme, Pictograph, Animation, Card) and the Theme tab left the bar. Below
  64rem it is a fourth box opening BackgroundTab as a drill screen; at 64rem
  and up it is a band above the columns whose Change swaps the columns for
  the showroom. `/settings/theme` is an alias that opens it. The boxes lost
  their 14rem cap and share the whole height ("a big-ass empty space
  underneath the last option", at 690×830).

  Revision: Theme is the fourth column (2026-11-02). Austen, at 1440×900:
  "it's weird that the theme is so understated when we're on the actual
  larger page ... such a very small section". The band and its showroom
  swap are gone: the columns tier is four equal columns (Theme, Pictograph,
  Animation, Card), the Theme column being BackgroundTab's `column` mode in
  the same DisplaySection frame. The tier is used only where each column
  keeps at least 17rem of content, a tab of 81rem (COLUMNS_MIN_REM below);
  under it the drill tier's four boxes show. The columns tier's stage floor
  is back at 14rem (it was 9rem to pay for the band). `/settings/theme`
  opens the Theme screen on the drill tier and opens nothing on the columns
  tier, where the Theme column is already on screen.

  Revision: two-by-two cells (2026-11-02). Austen, at 1740×1420: "no it
  looks awkward". The four columns did not share a shape: the Theme preview
  ran from header to floor while the other three stages floated small in
  the middle of tall, empty columns. The wide tier is now a 2×2 grid (Theme
  and Pictograph on top, Animation and Card below) of equal cells, each its
  header, then its stage on the left at the cell's full height and its
  switches centred on the right (DisplaySection `cell`). The four-across
  arrangement is gone. The tier needs both a width and a height
  (WIDE_MIN_WIDTH_REM, WIDE_MIN_HEIGHT_REM below); under either, the drill
  tier shows. Cells at least CELL_TILES_MIN_REM tall draw picture tiles,
  shorter cells draw the drill screens' chips, all four alike.
  `/settings/theme` behaves on the wide tier as it did on the columns tier.

  Revision: cells fill, theme shows through (2026-11-03). Austen, at
  1740×1420: "I don't think we're utilizing the available space much",
  "a little over containerized", "the gray theme against whatever
  background we've chosen just feels a little drab", and the theme buttons
  "could just be taller in order to fill it, so you see more of the
  background". The Theme cell's stage runs the body's full height and its
  ten tiles fill the pane beside it top to bottom (2×5, or 5×2 on a pane of
  30rem or more that is 2 to 2.5 times as wide as tall; BackgroundTab).
  The workspace's surface is the theme's panel glass (`--theme-panel-bg`)
  instead of the near-black mix, and the cells and the animation slot lost
  their 2% tints, so only the frame and the cell hairlines remain.

  Revision: Theme applies on click (2026-11-06). Austen: "Should we have a use
  button when we choose the theme or should we just make it so you click your
  theme and then it immediately changes the background? I think that would be
  better, the second one." The Use theme button
  is gone on both tiers; BackgroundTab applies a theme when its tile is pressed.
-->
<script lang="ts">
  import { onMount, untrack, type Component } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { getVisibilityStateManager } from "#lib/shared/pictograph/shared/state/visibility-state.svelte.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { getExportOptionsState } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import {
    BACKGROUND_CARD_REGISTRY,
    getCardMetadata,
  } from "@austencloud/backgrounds/card";
  import type { AppSettings } from "../../domain/app-settings";
  import BackgroundTab from "./background/BackgroundTab.svelte";
  import ThemePreview from "./background/ThemePreview.svelte";
  import DisplaySection from "./display/DisplaySection.svelte";
  import PictographDisplaySection from "./display/PictographDisplaySection.svelte";
  import CardDisplaySection from "./display/CardDisplaySection.svelte";
  import CardDisplayStage from "./display/CardDisplayStage.svelte";
  import {
    loadDisplayExample,
    type DisplayExample,
  } from "./display/display-example-data";
  import {
    animationSummary,
    cardSummary,
    pictographSummary,
  } from "./display/display-switches";

  type SectionKind = "theme" | "pictograph" | "animation" | "card";

  let {
    settings,
    onUpdate,
  }: {
    settings?: AppSettings;
    onUpdate?: (event: { key: string; value: unknown }) => void;
  } = $props();

  // The Theme box's thumbnail is the showroom's static preview image over the
  // theme's gradient, not a live background canvas. Measured 2026-11-02 on
  // the boxes screen at 412x915 beside the live animation thumbnail: live
  // 56 fps, but 33 fps (p95 50 ms) under 4x CPU throttling, against 50 fps
  // (p95 33 ms) static. 33 is too close to the 30 fps floor for a phone.
  // The Theme screen itself still draws the live background.
  const LIVE_THEME_THUMBNAIL = false;

  const themeType = $derived<BackgroundType>(
    settings?.backgroundType || BackgroundType.COSMIC
  );
  const themeCard = $derived(
    getCardMetadata(themeType) ?? BACKGROUND_CARD_REGISTRY[0]
  );
  const themeName = $derived(
    t(`settings_theme_${themeType}` as TranslationKey)
  );

  let example = $state<DisplayExample | null>(null);
  let AnimationSection = $state<Component<{
    example: DisplayExample | null;
    onBack?: () => void;
    compact?: boolean;
    cell?: boolean;
  }> | null>(null);
  // The animation box's thumbnail is the section's own stage, loaded lazily
  // with it: it carries the animation engine.
  let AnimationStage = $state<Component<{ example: DisplayExample }> | null>(
    null
  );

  // The tab's own size decides the tier; 0 until the first measure, when
  // nothing is laid out yet. The workspace takes 2cqi side margins, block
  // margins of at most 1.75rem, a 1px border all round and one 1px hairline
  // each way, and splits what is left into two by two cells.
  //
  // Width: a cell's body pads 1rem on both sides and keeps a 1rem gap, and
  // needs 17rem (272px) of switches beside a stage of at least 14rem
  // (224px): (0.96W - 3) / 2 >= 32 + 16 + 272 + 224 = 544 gives
  // W >= 1137px; 71.25rem = 1140px.
  const WIDE_MIN_WIDTH_REM = 71.25;
  // Height: a cell's header is 73px and its body pads 0.75rem top and
  // bottom, over a 14rem stage: (H - 2 x 28 - 3) / 2 >= 73 + 24 + 224 = 321
  // gives H >= 701px; 44rem = 704px.
  const WIDE_MIN_HEIGHT_REM = 44;
  // Cells at least this tall draw picture tiles, shorter ones chips, all
  // four alike. The card's tile deck is the tallest of the four: 388px at
  // its smallest tiles (measured), and about 432px where a pane under 18rem
  // folds four Info picks (a signed-in user's QR / Mandala / Both / None)
  // into two rows. A cell gives its stage and switches its height less the
  // 73px header and 24px of padding: 388 + 97 = 485px, 30.25rem = 484px
  // (a 1920×1080 cell is 486px); 432 + 97 = 529px, 33rem = 528px.
  const CELL_TILES_MIN_REM = 30.25;
  const CELL_TILES_NARROW_MIN_REM = 33;
  let tabWidth = $state(0);
  let tabHeight = $state(0);
  let remPx = $state(16);
  const tier = $derived<"cells" | "drill" | null>(
    tabWidth === 0 || tabHeight === 0
      ? null
      : tabWidth >= WIDE_MIN_WIDTH_REM * remPx &&
          tabHeight >= WIDE_MIN_HEIGHT_REM * remPx
        ? "cells"
        : "drill"
  );
  // A cell's size from the tab's, by the same margins the workspace uses,
  // so the first frame already draws the right switches. The card's pane
  // is what its 1.2 stage leaves of the cell (DisplaySection `cell`).
  const cellChips = $derived.by(() => {
    const clamp = (min: number, value: number, max: number) =>
      Math.min(Math.max(min, value), max);
    const marginInline = clamp(0.75 * remPx, 0.02 * tabWidth, 3 * remPx);
    const marginBlock = clamp(0.75 * remPx, 0.014 * tabWidth, 1.75 * remPx);
    const cellWidth = (tabWidth - 2 * marginInline - 3) / 2;
    const cellHeight = (tabHeight - 2 * marginBlock - 3) / 2;
    const body = cellWidth - 3 * remPx;
    const stageHeight = cellHeight - 73 - 1.5 * remPx;
    const cardPane = body - Math.min(1.2 * stageHeight, body - 17 * remPx);
    const needed =
      cardPane >= 18 * remPx ? CELL_TILES_MIN_REM : CELL_TILES_NARROW_MIN_REM;
    return cellHeight < needed * remPx;
  });

  let open = $state<SectionKind | null>(null);
  const back = () => (open = null);

  // `/settings/theme` (the old Theme tab, and the account-setup checklist's
  // theme task) lands here with the Theme screen asked for. The drill tier
  // opens it; the wide tier already shows the Theme cell, so the
  // request is only cleared. It waits for the first measure to know which.
  $effect(() => {
    const request = navigationState.requestedScreen;
    const current = tier;
    if (
      current === null ||
      request?.moduleId !== "settings" ||
      request.sectionId !== "display" ||
      request.screen !== "theme"
    )
      return;
    untrack(() => {
      if (current === "drill") open = "theme";
      navigationState.clearRequestedScreen();
    });
  });

  const vm = getVisibilityStateManager();
  const animationVisibility = getAnimationVisibilityManager();
  const composition = getImageCompositionManager();
  const exportOptions = getExportOptionsState();
  let version = $state(0);
  const uid = $props.id();

  onMount(() => {
    let alive = true;
    remPx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    void loadDisplayExample().then((built) => {
      if (alive) example = built;
    });
    void import("./display/AnimationDisplaySection.svelte").then((module) => {
      if (alive) AnimationSection = module.default;
    });
    void import("./display/AnimationDisplayStage.svelte").then((module) => {
      if (alive) AnimationStage = module.default;
    });
    // The box summaries follow every switch, wherever it was flipped.
    const bump = () => version++;
    vm.registerObserver(bump, ["all"]);
    animationVisibility.registerObserver(bump);
    composition.registerObserver(bump);
    void vm.ensureSettingsLoaded().then(bump);
    return () => {
      alive = false;
      vm.unregisterObserver(bump);
      animationVisibility.unregisterObserver(bump);
      composition.unregisterObserver(bump);
    };
  });

  const boxes = $derived.by(() => {
    void version;
    void exportOptions.imageDarkMode;
    return [
      {
        kind: "theme" as const,
        label: t("tab_settings_theme"),
        summary: themeName,
        ratio: 1.2,
      },
      {
        kind: "pictograph" as const,
        label: t("settings_display_pictograph"),
        summary: pictographSummary(vm),
        // The thumbnail's frame: its section stage's own ratio.
        ratio: 1,
      },
      {
        kind: "animation" as const,
        label: t("settings_display_animation"),
        summary: animationSummary(animationVisibility),
        ratio: 1,
      },
      {
        kind: "card" as const,
        label: t("settings_display_card"),
        summary: cardSummary(composition, vm, exportOptions.imageDarkMode),
        ratio: 1.2,
      },
    ];
  });
</script>

<!-- What each box's thumbnail draws: its section's stage (the card at its
     first length), reading the same managers, so a switch flipped on a
     screen shows in its box on the way back. -->
{#snippet thumbnail(kind: SectionKind, shown: DisplayExample)}
  {#if kind === "theme"}
    {#if LIVE_THEME_THUMBNAIL}
      <ThemePreview type={themeType} fallback={themeCard?.gradient ?? ""} />
    {:else}
      <!-- The showroom's own preview image over the theme's gradient. -->
      <span
        class="theme-picture"
        style:background={themeCard?.gradient}
        aria-hidden="true"
      >
        <img src={`/images/theme-previews/${themeType}.webp`} alt="" />
      </span>
    {/if}
  {:else if kind === "pictograph"}
    <PictographContainer
      pictographData={shown.pictograph}
      gridMode={GridMode.DIAMOND}
      disableContentTransitions
    />
  {:else if kind === "animation"}
    {#if AnimationStage}<AnimationStage example={shown} />{/if}
  {:else}
    <CardDisplayStage sequence={shown.cards[4]} />
  {/if}
{/snippet}

{#snippet animationSection(
  onBack: (() => void) | undefined,
  compact: boolean,
  cell: boolean
)}
  <Crossfade
    key={AnimationSection ? "live" : "loading"}
    duration={DURATION.normal}
    fill
  >
    {#if AnimationSection}
      <AnimationSection {example} {onBack} {compact} {cell} />
    {:else}
      <DisplaySection
        kind="animation"
        icon="fas fa-play"
        title={t("settings_display_animation")}
        caption={t("settings_display_animation_caption")}
        onReset={() => {}}
        {onBack}
        {cell}
      >
        {#snippet stage()}{/snippet}
        {#snippet controls()}{/snippet}
      </DisplaySection>
    {/if}
  </Crossfade>
{/snippet}

<div
  class="display-tab"
  bind:clientWidth={tabWidth}
  bind:clientHeight={tabHeight}
  data-tier={tier}
>
  {#if tier === "cells"}
    <div class="display-workspace cells">
      <div
        class="display-columns"
        data-controls={cellChips ? "chips" : "tiles"}
      >
        <BackgroundTab
          settings={settings ?? ({} as AppSettings)}
          {onUpdate}
          cell
          compact={cellChips}
          title={t("tab_settings_theme")}
        />
        <PictographDisplaySection {example} cell compact={cellChips} />
        <div class="animation-slot">
          {@render animationSection(undefined, cellChips, true)}
        </div>
        <CardDisplaySection {example} cell compact={cellChips} />
      </div>
    </div>
  {:else if tier === "drill"}
    <div class="display-workspace drill">
      <Crossfade key={open ?? "boxes"} duration={DURATION.normal}>
        {#if open === "theme"}
          <BackgroundTab
            settings={settings ?? ({} as AppSettings)}
            {onUpdate}
            onBack={back}
            compact
            title={t("tab_settings_theme")}
          />
        {:else if open === "pictograph"}
          <PictographDisplaySection {example} onBack={back} compact />
        {:else if open === "animation"}
          <div class="animation-slot">
            {@render animationSection(back, true, false)}
          </div>
        {:else if open === "card"}
          <CardDisplaySection {example} onBack={back} compact />
        {:else}
          <div class="drill-boxes" data-display-boxes>
            {#each boxes as box (box.kind)}
              <!-- The thumbnail is a picture of the stage, not a control: it
                   is inert and lets clicks through, and the box's one button
                   covers the whole box. -->
              <div
                class="drill-box"
                data-box={box.kind}
                style:--thumb-ratio={box.ratio}
              >
                <div class="drill-thumb-area">
                  <div class="drill-thumb" data-thumb={box.kind} inert>
                    {#if box.kind === "theme" || example}{@render thumbnail(
                        box.kind,
                        example as DisplayExample
                      )}{/if}
                  </div>
                </div>
                <span class="drill-label" id="{uid}-{box.kind}-label"
                  >{box.label}</span
                >
                <small class="drill-summary" id="{uid}-{box.kind}-summary"
                  >{box.summary}</small
                >
                <i
                  class="fa-solid fa-chevron-right drill-chevron"
                  aria-hidden="true"
                ></i>
                <button
                  type="button"
                  class="drill-hit"
                  data-drill={box.kind}
                  aria-labelledby="{uid}-{box.kind}-label {uid}-{box.kind}-summary"
                  onclick={() => (open = box.kind)}
                ></button>
              </div>
            {/each}
          </div>
        {/if}
      </Crossfade>
    </div>
  {/if}
</div>

<style>
  .display-tab {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    max-width: var(--shell-w, 100%);
    min-height: 0;
    margin: 0 auto;
    overflow-y: auto;
    box-sizing: border-box;
    container: display-tab / inline-size;
  }

  /* One bordered surface, sections opened by header bands and split by
     hairlines. Its surface is the theme's own panel glass, the translucent
     `--theme-panel-bg` the shell's back pill uses, not the 86% near-black
     mix of the other settings panels (2026-11-03): the chosen theme shows
     through the whole tab. */
  .display-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    flex: 0 0 auto;
    min-width: 0;
    margin: clamp(0.75em, 1.4cqi, 1.75em) clamp(0.75em, 2cqi, 3em);
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 1.25em;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.8));
    box-shadow: var(--theme-panel-shadow, 0 1rem 3rem rgba(0, 0, 0, 0.35));
    isolation: isolate;
    --settings-row-inline: 1.15em;
  }

  :global(html[data-theme-luminance="bright"]) .display-workspace {
    background: var(--theme-panel-bg, rgba(255, 255, 255, 0.88));
  }

  .animation-slot {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  @container display-tab (max-width: 32rem) {
    .display-workspace {
      --settings-row-inline: 0.9rem;
    }
  }

  /* Drill-down: the workspace is the tab's height, and the boxes or the open
     section fill it. The crossfade stacks both layers in that one box. */
  .display-workspace.drill {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    container: display-screen / size;
  }

  .drill > :global(.crossfade) {
    position: absolute;
    inset: 0;
  }

  .drill > :global(.crossfade > .layer),
  .drill .animation-slot :global(.crossfade > .layer) {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .drill .animation-slot {
    flex: 1 1 auto;
    min-height: 0;
  }

  .drill .animation-slot > :global(.crossfade) {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* The boxes follow the Download video screen's File and Show panes, with
     the section's stage as the picture: thumbnail, title, the summary under
     it, a chevron saying it opens. Four equal quarters of the frame's whole
     height, centred across: no height cap, so a tall window gives taller
     boxes and bigger thumbnails instead of a dead band under the last one
     (Austen, 2026-11-02, at 690×830). */
  .drill-boxes {
    --box-pad: 0.625rem;
    --boxes-gap: 0.5rem;
    --boxes-pad: 0.75rem;
    display: grid;
    grid-template-rows: repeat(4, minmax(0, 1fr));
    gap: var(--boxes-gap);
    box-sizing: border-box;
    width: min(100%, 44rem);
    height: 100%;
    margin-inline: auto;
    padding: var(--boxes-pad) min(var(--settings-row-inline), 0.5rem);
  }

  /* The box is a size container, so the thumbnail is sized from its height
     before anything mounts in it (no-layout-shift). */
  .drill-box {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-rows: 1fr auto auto 1fr;
    column-gap: 0.75rem;
    row-gap: 0.25rem;
    align-items: center;
    min-height: 0;
    padding: var(--box-pad);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.875rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    container: drill-box / size;
  }

  .drill-box:hover {
    border-color: var(--theme-accent, #8b7cff);
    background: var(--theme-surface-hover, rgba(255, 255, 255, 0.1));
  }

  .drill-box:has(.drill-hit:focus-visible) {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* The box's whole face is its one target. */
  .drill-hit {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }

  .drill-hit:focus-visible {
    outline: none;
  }

  /* Upright: the thumbnail fills the box's height at its stage's ratio.
     A tall box would make it wider than the box can spare, so it stops at
     60% of the box's width and never leaves the title and summary less than
     7rem; the box keeps its height and the text column takes the rest.
     The column is sized by the widest stage (the card's and the theme's
     1.2) in every box, so the four titles line up; a square thumbnail
     centres in it. */
  .drill-thumb-area {
    grid-column: 1;
    grid-row: 1 / -1;
    width: min(
      60cqi,
      calc(100cqi - 2 * 0.75rem - 1rem - 7rem),
      calc(100cqb * 1.2)
    );
    height: 100%;
    display: grid;
    place-items: center;
    container-type: size;
  }

  .drill-thumb {
    position: relative;
    width: min(100cqi, calc(100cqb * var(--thumb-ratio, 1)));
    aspect-ratio: var(--thumb-ratio, 1);
    overflow: hidden;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-text) 3%, transparent);
    pointer-events: none;
    --card-stage-pad: 0.25rem;
  }

  .drill-thumb > :global(*) {
    width: 100%;
    height: 100%;
  }

  /* The theme's picture where no live background draws: the showroom's own
     preview image over the theme's gradient. */
  .theme-picture {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .theme-picture img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .drill-label {
    grid-column: 2;
    grid-row: 2;
    min-width: 0;
    overflow: hidden;
    font-size: 1rem;
    font-weight: 650;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drill-summary {
    grid-column: 2;
    grid-row: 3;
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.68));
    font-size: 0.875rem;
    line-height: 1.35;
  }

  .drill-chevron {
    grid-column: 3;
    grid-row: 1 / -1;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.68));
  }

  /* A screen wider than it is tall (a phone on its side, a zoomed desktop):
     the four boxes stand in one row, each its thumbnail above its title. */
  @container display-screen (orientation: landscape) {
    .drill-boxes {
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns: repeat(4, minmax(0, 1fr));
      width: 100%;
    }

    .drill-box {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: minmax(0, 1fr) auto auto;
    }

    .drill-thumb-area {
      grid-column: 1 / -1;
      grid-row: 1;
      width: 100%;
      min-height: 0;
    }

    .drill-label {
      grid-column: 1;
      grid-row: 2;
    }

    .drill-summary {
      grid-column: 1;
      grid-row: 3;
    }

    .drill-chevron {
      grid-column: 2;
      grid-row: 2 / span 2;
    }
  }

  /* Two by two (2026-11-02): four equal cells filling the tab, Theme and
     Pictograph on top, Animation and Card below, split by structural
     hairlines in the theme stroke. Each cell lays out its stage beside its
     switches (DisplaySection `cell`). */
  .display-workspace.cells {
    grid-template-rows: minmax(0, 1fr);
    flex: 1 1 auto;
    min-height: 0;
  }

  .display-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    flex: 1 1 auto;
    min-height: 0;
  }

  .display-columns > :global(:nth-child(even)) {
    border-left: 1px solid var(--theme-stroke);
  }

  .display-columns > :global(:nth-child(n + 3)) {
    border-top: 1px solid var(--theme-stroke);
  }

  .display-columns > :global(*) {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  /* The crossfade box and its layer pass the cell's height through. */
  .display-columns .animation-slot > :global(.crossfade) {
    flex: 1 1 auto;
    min-height: 0;
  }

  .display-columns .animation-slot :global(.crossfade > .layer) {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  @media (min-width: 64rem) {
    .display-tab {
      max-width: max(var(--shell-w, 100%), calc((100dvh - 12rem) * 2.6));
    }
  }
</style>
