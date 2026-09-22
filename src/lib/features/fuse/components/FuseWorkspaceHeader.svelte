<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { getFuseContext } from "../context/fuse-context";
  import type { FuseRecipeDestination } from "../domain/fuse-recipe-destination";
  import { buildFuseRecipeSummaries } from "../domain/fuse-recipe-summaries";
  import type { FuseMode } from "../state/fuse-state.svelte";
  import FuseModeBar from "./FuseModeBar.svelte";
  import FuseRecipeRail from "./FuseRecipeRail.svelte";

  let {
    onOpenRecipe = () => {},
    onOpenSetting = () => {},
    onModeChange,
    recipeOpen = false,
    flatRecipeRail = false,
  }: {
    onOpenRecipe?: () => void;
    onOpenSetting?: (destination: FuseRecipeDestination) => void;
    onModeChange: (mode: FuseMode) => void;
    /** Whether the recipe panel is showing. The trigger is a toggle, so it has
     *  to say which way it points. */
    recipeOpen?: boolean;
    /** True while the individual recipe cards are visible. Portaled editors
     * must close when a resize replaces that rail with the recipe button. */
    flatRecipeRail?: boolean;
  } = $props();

  const { state: fuseState } = getFuseContext();
  let activeSetting = $state<FuseRecipeDestination | null>(null);

  const optionsDisabled = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );
  const summaries = $derived(
    buildFuseRecipeSummaries({
      requestedLength: fuseState.requestedLength,
      generationLevel: fuseState.generationLevel,
      maxTurnIntensity: fuseState.maxTurnIntensity,
      gridMode: fuseState.gridMode,
      constraintPreset: fuseState.constraintPreset,
      handPathMode: fuseState.handPathMode,
      motionTypeFilter: fuseState.motionTypeFilter,
      startLocation: fuseState.startLocation,
      startOrientation: fuseState.startOrientation,
      traversalDirection: fuseState.traversalDirection,
      mode: fuseState.mode,
      driverSide: fuseState.driverSide,
      rule: fuseState.rule,
    })
  );
  const compactSummary = $derived(
    `${summaries.length} · L${fuseState.generationLevel} · ${summaries.grid} · ${summaries.pairing}`
  );

  $effect(() => {
    if (optionsDisabled) activeSetting = null;
  });

  $effect(() => {
    if (!flatRecipeRail) activeSetting = null;
  });

  function setTileOpen(
    destination: FuseRecipeDestination,
    open: boolean
  ): void {
    if (open) {
      activeSetting = destination;
    } else if (activeSetting === destination) {
      activeSetting = null;
    }
  }
</script>

<!-- One recipe. Where there is room it lays out flat as a row of setting cards;
     narrower layouts drill into the same state behind the recipe button. -->
<header class="fuse-header">
  <div class="title-block">
    <h2 aria-label="Fuse two paths">
      <span class="title-full">Fuse two paths</span>
      <span class="title-compact" aria-hidden="true">Fuse</span>
    </h2>
    <p>Build two one-hand LOOPs into one sequence.</p>
  </div>

  <!-- Separate/Linked is the one recipe decision that changes what the whole tab
       is, so it stays a visible switch instead of hiding behind an editor. Where
       the rail fits, this moves into the Pairing tile — same control, sitting in
       the slot it governs. -->
  <div class="mode-switch">
    <FuseModeBar compact={true} onSelect={onModeChange} />
  </div>

  <FuseRecipeRail
    {summaries}
    disabled={optionsDisabled}
    {activeSetting}
    onSettingOpenChange={setTileOpen}
    {onModeChange}
    onEditRule={() => onOpenSetting("pairing")}
  />

  <!-- The way into the recipe panel, at every width. Where the rail is showing
       it narrows to its icon and sits beside the title: the tiles each open one
       setting, this opens all of them in a column, and both doors stay on the
       header rather than one of them being reachable only by backing out of the
       other. It is a toggle, so the same control closes what it opened. -->
  <div class="recipe-trigger" class:is-open={recipeOpen}>
    <PanelButton
      variant="secondary"
      disabled={optionsDisabled}
      onclick={onOpenRecipe}
      ariaLabel={recipeOpen
        ? "Close Fuse recipe settings"
        : "Open Fuse recipe settings"}
    >
      <i class="fas fa-sliders" aria-hidden="true"></i>
      <span class="recipe-label">
        <span>Fuse recipe</span>
        <strong>{compactSummary}</strong>
      </span>
      <i class="fas fa-chevron-right recipe-chevron" aria-hidden="true"></i>
    </PanelButton>
  </div>
</header>

<style>
  .fuse-header {
    grid-area: header;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--settings-spacing-md, 14px);
    min-height: var(--min-touch-target, 48px);
    padding: var(--settings-spacing-sm, 8px) var(--settings-spacing-md, 14px);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 20px);
    background: var(--theme-panel-bg);
  }

  .title-block {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  h2 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: clamp(1.05rem, 2.2cqw, 1.35rem);
    font-weight: 750;
    letter-spacing: -0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title-block p {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .title-compact {
    display: none;
  }

  /* The lone auto margin in the row: it collects all the slack so the switch
     stays beside the title instead of drifting to the middle. */
  .mode-switch {
    display: flex;
    flex: 0 1 auto;
    min-width: 0;
    margin-right: auto;
  }

  /* Two short words — size to them, never to the rail's leftover space. */
  .mode-switch :global(.fuse-mode-bar) {
    width: min(100%, 14rem);
    min-width: 9.5rem;
  }

  .recipe-trigger {
    flex: 0 1 auto;
    min-width: 0;
  }

  .recipe-trigger :global(.panel-btn) {
    width: min(100%, 30rem);
    min-width: 17rem;
    min-height: 3.25rem;
    justify-content: flex-start;
    gap: 10px;
    padding: 8px 12px;
  }

  .recipe-label {
    display: grid;
    flex: 1;
    gap: 1px;
    min-width: 0;
    text-align: left;
  }

  .recipe-label > span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
  }

  .recipe-label strong {
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recipe-chevron {
    color: var(--theme-text-dim);
    font-size: 11px;
  }

  @container fuse (max-width: 760px) {
    .fuse-header {
      flex-wrap: wrap;
    }

    /* The switch takes its own row rather than squeezing the recipe button
       below a usable width. */
    .mode-switch {
      flex: 1 0 100%;
      order: 3;
      margin-right: 0;
    }

    .mode-switch :global(.fuse-mode-bar) {
      width: 100%;
    }
  }

  @container fuse (max-width: 520px) {
    .fuse-header {
      gap: 8px;
      padding: 7px 8px;
    }

    .title-full,
    .title-block p {
      display: none;
    }

    .title-compact {
      display: inline;
    }

    .title-block {
      flex: 0 0 auto;
    }

    .recipe-trigger {
      flex: 1;
    }

    .recipe-trigger :global(.panel-btn) {
      width: 100%;
      min-width: 0;
    }
  }

  @container fuse (min-width: 1680px) and (min-height: 900px) {
    .fuse-header {
      gap: 18px;
      min-height: 5.25rem;
      padding: 10px 12px 10px 18px;
    }

    /* One row: the title at its head, the rail taking the rest of it. The
       title used to hold a centred row of its own, which spent 42px of
       workspace height on two words and left the cards under it at 84px —
       short enough that ToggleCard's own container queries dropped the Grid
       card's icons to 12px and turned its two options sideways to fit. The
       row the title gave up went into the rail's track height, so the cards
       are what grew. Nothing else is in this row at this size: the mode switch
       lives in the Pairing card and the recipe door in the cards themselves. */
    .title-block {
      flex: 0 0 auto;
    }

    /* Row 1 is one line. The subtitle costs ~40px of workspace height here, and
       spending it tips the page into overflow — the scrollbar that appears
       takes the source card under its 940px seam and collapses its seven
       actions into two ragged rows. The tab is already labelled Fuse in the nav
       and the tiles below state the recipe, so the sentence is the affordable
       thing to drop. */
    .title-block p {
      display: none;
    }

    /* The Pairing tile holds the switch at this size — two of them in one header
       row would be the same control twice. */
    .mode-switch {
      display: none;
    }

    /* The recipe button is gone at this size, and so is the column of rows it
       opened: every one of those rows — Length, Level, Grid, Style, Starting —
       is a card in the rail below, holding its own control. A door onto a list
       that restates the row of cards under it is the redundancy this rail was
       built to remove. The rule editor still opens as a track on the right, but
       from the Rule card at the right end of the rail — the only setting a card
       cannot hold outright, and now the panel grows out of the card itself. */
    .recipe-trigger {
      display: none;
    }
  }

  @container fuse (min-width: 2600px) and (min-height: 1400px) {
    .fuse-header {
      min-height: 6.5rem;
      padding: 14px 18px 14px 24px;
    }

    .title-block {
      flex-basis: 20rem;
    }

    h2 {
      font-size: 1.65rem;
    }
  }
</style>
