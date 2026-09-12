<!--
CustomizeCard.svelte - Single card absorbing Style and Start/End
Shows the settings that actually differ from this surface's baseline, capped
to three rows. Click opens the expanded overlay.
(Rhythm was removed pending a finished rhythm-preset design.)
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { StartEndOptions, PanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";
  import { onMount, getContext } from "svelte";
  import { customizeOverlayWasOpen } from "$lib/shared/create/state/customize-overlay-hmr";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";
  import CardHeader from "./shared/CardHeader.svelte";
  import {
    buildCustomizeSummary,
    capSummaryFacts,
    summaryRowBudget,
    PRODUCTION_STYLE_BASELINE,
    type CustomizeStyleBaseline,
  } from "./customize-summary";

  let {
    constraintPreset,
    handPathMode,
    motionTypeFilter,
    startEndOptions,
    level = 3,
    gridMode = GridMode.DIAMOND,
    isFreeformMode = true,
    styleBaseline = PRODUCTION_STYLE_BASELINE,
    onConstraintPresetChange,
    onHandPathModeChange,
    onMotionTypeFilterChange,
    handRelationship = "free",
    handRelationshipInverted = false,
    matchHandTurns = false,
    onHandRelationshipChange = null,
    onHandRelationshipInvertedChange = null,
    onMatchHandTurnsChange = null,
    onStartEndChange,
    onResetAll = null,
    color = "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)",
    shadowColor = "190deg 75% 50%",
    cardIndex = 0,
    headerFontSize = "9px",
  } = $props<{
    constraintPreset: "smooth" | "mixed" | "choppy";
    handPathMode: "smooth" | "mixed" | "choppy";
    motionTypeFilter: "no-dash" | "prefer-dash" | null;
    startEndOptions?: StartEndOptions;
    level?: number;
    gridMode?: GridMode;
    isFreeformMode?: boolean;
    /**
     * What "untouched" means on THIS surface. The public Composer demo opens
     * on its own recipe, so without this it would report two changes the
     * visitor never made.
     */
    styleBaseline?: CustomizeStyleBaseline;
    onConstraintPresetChange: (v: "smooth" | "mixed" | "choppy") => void;
    onHandPathModeChange: (v: "smooth" | "mixed" | "choppy") => void;
    onMotionTypeFilterChange: (v: "no-dash" | "mixed" | "prefer-dash") => void;
    handRelationship?: HandRelationship;
    handRelationshipInverted?: boolean;
    matchHandTurns?: boolean;
    onHandRelationshipChange?: ((v: HandRelationship) => void) | null;
    onHandRelationshipInvertedChange?: ((v: boolean) => void) | null;
    onMatchHandTurnsChange?: ((v: boolean) => void) | null;
    onStartEndChange?: (options: StartEndOptions) => void;
    onResetAll?: (() => void) | null;
    color?: string;
    shadowColor?: string;
    cardIndex?: number;
    headerFontSize?: string;
  }>();

  let hapticService: HapticFeedback | null = $state(null);
  const panelState = getContext<PanelCoordinationState>("panelState");

  onMount(() => {
    hapticService = getHapticFeedback();

    // Put the overlay back after a hot reload (development only). The card is
    // the only place that holds the live settings and their change callbacks,
    // so reopening from here hands the overlay working controls rather than the
    // stale snapshot the previous state object was holding when Vite replaced it.
    if (customizeOverlayWasOpen() && !panelState?.isCustomizeOverlayOpen) {
      openOverlay();
    }
  });

  // One pass answers both questions: is anything non-default, and what is it.
  // isDefault comes straight from the fact list, so the word "Default" can
  // never disagree with the rows underneath it.
  const summary = $derived(
    buildCustomizeSummary(
      {
        constraintPreset,
        handPathMode,
        motionTypeFilter,
        handRelationship,
        handRelationshipInverted,
        matchHandTurns,
        startEndOptions,
        gridMode,
      },
      styleBaseline
    )
  );

  // What fits on THIS card. The grid squeezes this row hardest — at 375x667
  // the card is 64px tall with a 28px summary band, room for one row — so the
  // budget is measured rather than fixed at three. The full list still reaches
  // the accessible name either way.
  let cardHeight = $state(0);
  const summaryLines = $derived(
    capSummaryFacts(summary.facts, summaryRowBudget(cardHeight))
  );

  function handleClick() {
    hapticService?.trigger("selection");
    openOverlay();
  }

  function openOverlay() {
    panelState?.openCustomizeOverlay?.({
      constraintPreset,
      handPathMode,
      motionTypeFilter,
      startEndOptions: startEndOptions ?? null,
      level,
      gridMode,
      isFreeformMode,
      styleBaseline,
      onConstraintPresetChange,
      onHandPathModeChange,
      onMotionTypeFilterChange,
      handRelationship,
      handRelationshipInverted,
      matchHandTurns,
      onHandRelationshipChange,
      onHandRelationshipInvertedChange,
      onMatchHandTurnsChange,
      onStartEndChange: onStartEndChange ?? null,
      onResetAll: onResetAll ?? null,
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  }
</script>

<button
  class="customize-card"
  style="--card-color: {color}; --shadow-color: {shadowColor}; --card-index: {cardIndex};"
  bind:clientHeight={cardHeight}
  onclick={handleClick}
  onkeydown={handleKeydown}
  aria-label="Customize: {summary.accessibleSummary}. Click to configure style and positions."
>
  <CardHeader title="Customize" {headerFontSize} />
  {#if summary.isDefault}
    <div class="card-value">Default</div>
  {:else}
    <div class="card-summary" data-rows={summaryLines.length}>
      {#each summaryLines as line}
        <span class="summary-line">{line}</span>
      {/each}
    </div>
  {/if}
</button>

<style>
  .customize-card {
    container-type: size;
    container-name: customize-card;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
    padding: clamp(6px, 2cqh, 12px) clamp(4px, 1.5cqw, 8px);
    border-radius: 16px;
    background: var(--card-color);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    cursor: pointer;
    color: white;
    text-align: center;
    border: none;
    font-family: inherit;

    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.12),
      0 1px 2px hsl(var(--shadow-color) / 0.15),
      0 2px 4px hsl(var(--shadow-color) / 0.12),
      0 4px 8px hsl(var(--shadow-color) / 0.1),
      inset 0 1px 0 var(--theme-stroke);

    transition: all var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Glossy sheen */
  .customize-card::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60%;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-text) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-text) 15%, transparent) 40%,
      color-mix(in srgb, var(--theme-text) 5%, transparent) 70%,
      transparent 100%
    );
    border-radius: 16px 16px 0 0;
    pointer-events: none;
    z-index: 1;
  }

  @media (hover: hover) {
    .customize-card:hover {
      transform: translateY(-2px);
      filter: brightness(1.08);
      box-shadow:
        0 2px 4px hsl(var(--shadow-color) / 0.12),
        0 4px 8px hsl(var(--shadow-color) / 0.1),
        0 8px 16px hsl(var(--shadow-color) / 0.08),
        0 16px 24px hsl(var(--shadow-color) / 0.06),
        0 0 40px hsl(var(--shadow-color) / 0.25);
    }
  }

  .customize-card:active {
    transform: translateY(0) scale(0.98);
    transition: all var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .card-value {
    font-size: var(--card-text-size);
    font-weight: var(--card-text-weight);
    letter-spacing: var(--card-text-spacing);
    text-shadow: var(--card-text-shadow);
    color: white;
    text-align: center;
    line-height: 1.1;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    width: 100%;
    margin: clamp(2px, 0.5cqh, 4px) 0;
    position: relative;
    z-index: 2;
  }

  /* Same flexible middle band as .card-value, so switching between Default and
     a summary never resizes the card. overflow:hidden is the backstop — the
     grid and card wrappers keep overflow visible for popovers, so the text has
     to contain itself. */
  .card-summary {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(1px, 0.5cqh, 4px);
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    margin: clamp(2px, 0.5cqh, 4px) 0;
    position: relative;
    z-index: 2;
  }

  .summary-line {
    font-size: var(--card-text-size);
    font-weight: var(--card-text-weight);
    letter-spacing: var(--card-text-spacing);
    color: white;
    text-shadow: var(--card-text-shadow);
    /* overflow:hidden drives the ellipsis, and it clips vertically too — 1.1
       leading is tighter than the font's ink box, so descenders were being
       shaved off "Props: Choppy". */
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* Scale down as rows stack, as a fraction of the shared card text size
     rather than the card's own width: the desktop grid is capped at 750px, so
     a cqw ramp would freeze at ~10px while every sibling card's value grew to
     30px at 4K. The LOOP card's long-label tiers use the same two fractions,
     so the pair reads as siblings. */
  .card-summary[data-rows="2"] .summary-line {
    font-size: clamp(
      15px,
      calc(var(--card-text-size, clamp(16px, 2.2vmin, 30px)) * 0.62),
      22px
    );
    font-weight: 600;
    letter-spacing: 0;
  }

  /* The floors matter: the base size is vmin-driven, so a short viewport
     (1440x900) would otherwise put three rows at ~10px inside a band with
     95px of room. */
  .card-summary[data-rows="3"] .summary-line {
    font-size: clamp(
      13px,
      calc(var(--card-text-size, clamp(16px, 2.2vmin, 30px)) * 0.5),
      16px
    );
    font-weight: 600;
    letter-spacing: 0;
  }

  .customize-card:focus-visible {
    outline: 2px solid var(--theme-stroke-strong);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .customize-card {
      transition: none;
    }
  }
</style>
