<!--
  OptionPickerHeader.svelte

  Shared controls for the construct option picker. Every inline width renders
  the same header and lets container queries recompose its geometry. The compact
  variant is reserved for a genuine disclosure surface. Every surface exposes:
    • the All / Continuous filter (left),
    • the working Level (centered, wearing the canonical level colours),
  over a turns row that appears when the level HAS turns.

  Level gates the turn palette, per TKA canon (shared table in
  level-turn-values.ts): L1 base motions only, L2 whole turns, L3 half turns +
  floats. Every legal value is its own button — no stepper to click through, and
  the float that the stepper could never reach is now one tap.

  No Turns disclosure toggle and no Reset: Level already decides whether turns
  exist (L1 = none, so the row is simply absent), and resetting is two taps on
  the 0 buttons. Both were chrome that restated a control already on screen.
-->
<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import LevelSelector from "$lib/shared/components/LevelSelector.svelte";
  import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { growFade, popIn, flyFade } from "$lib/shared/transitions/motion";
  import { DURATION, STAGGER } from "$lib/shared/transitions/transitions";
  import {
    formatTurnValue,
    keyToTurnValue,
    turnValueToKey,
    turnValuesForLevel,
    type TurnLevel,
    type TurnValue,
  } from "$lib/shared/create/services/level-turn-values";

  interface Props {
    layout?: "wide" | "compact";
    /** Embedded demos can pin turns from outside the picker. In that case the
     *  filter remains useful, but showing local turn controls would be a lie. */
    showTurnControls?: boolean;
    showFilter: boolean;
    isContinuousOnly: boolean;
    optionAvailability?: { shownCount: number; hiddenCount: number };
    onToggleContinuous?: (value: boolean) => void;
    // Level — gates which turn values the hands may take
    level: TurnLevel;
    onLevelChange: (level: TurnLevel) => void;
    // Turns
    leftTurns: TurnValue;
    rightTurns: TurnValue;
    leftRotation: RotationDirection;
    rightRotation: RotationDirection;
    onLeftChange: (value: TurnValue) => void;
    onRightChange: (value: TurnValue) => void;
    onLeftRotationChange: (dir: RotationDirection) => void;
    onRightRotationChange: (dir: RotationDirection) => void;
  }

  const {
    layout = "wide",
    showTurnControls = true,
    showFilter,
    isContinuousOnly,
    optionAvailability,
    onToggleContinuous,
    level,
    onLevelChange,
    leftTurns,
    rightTurns,
    leftRotation,
    rightRotation,
    onLeftChange,
    onRightChange,
    onLeftRotationChange,
    onRightRotationChange,
  }: Props = $props();

  const hasLeftTurns = $derived(leftTurns === "fl" || leftTurns > 0);
  const hasRightTurns = $derived(rightTurns === "fl" || rightTurns > 0);

  // Level 1 is base motions — there is nothing to dial, so the row isn't there.
  const turnsAvailable = $derived(level > 1);

  const hiddenCount = $derived(
    isContinuousOnly ? (optionAvailability?.hiddenCount ?? 0) : 0
  );
  const filterExplanation = $derived(
    hiddenCount > 0
      ? `${hiddenCount} dash/static options hidden because their spin direction reverses. Change CW/CCW or choose All to include them.`
      : "Continuous keeps options that continue the previous spin direction."
  );

  // Inline controls use icons to leave room for Level. A hidden-option count
  // belongs inside Continuous so changing spin direction explains its own result.
  const filterOptions = $derived([
    { value: "all", label: "All" },
    {
      value: "continuous",
      label:
        hiddenCount > 0 ? `Continuous. ${filterExplanation}` : "Continuous",
    },
  ]);
  const filterValue = $derived(isContinuousOnly ? "continuous" : "all");

  // One button per legal turn value at this level: L2 → 0 1 2 3,
  // L3 → fl · 0 · 0.5 · 1 · 1.5 · 2 · 2.5 · 3.
  const turnOptions = $derived(
    turnValuesForLevel(level).map((v) => ({
      value: turnValueToKey(v),
      label: formatTurnValue(v),
    }))
  );

  function opposite(d: RotationDirection): RotationDirection {
    return d === RotationDirection.CLOCKWISE
      ? RotationDirection.COUNTER_CLOCKWISE
      : RotationDirection.CLOCKWISE;
  }
  function dirIcon(d: RotationDirection): string {
    return d === RotationDirection.CLOCKWISE
      ? "fa-rotate-right"
      : "fa-rotate-left";
  }
  function dirLabel(d: RotationDirection): string {
    return d === RotationDirection.CLOCKWISE ? "CW" : "CCW";
  }
</script>

<div
  class="oph"
  class:compact={layout === "compact"}
  class:whole-turns={level === 2}
>
  <!-- Row 1: filter left, Level dead center. The right cell is an empty
       counterweight — equal-fr sides are what keep Level centered on the band
       rather than centered on "whatever is left over". -->
  <div
    class="oph-bar"
    class:filter-only={!showTurnControls}
    class:turns-only={!showFilter && showTurnControls}
  >
    <div class="oph-side start">
      {#if showFilter}
        <div
          class="filter-seg"
          role="group"
          aria-label="Option filter"
          title={filterExplanation}
        >
          {#if layout === "compact"}
            <span class="control-label">Options</span>
          {/if}
          <SegmentedControl
            options={filterOptions}
            value={filterValue}
            size="sm"
            color="accent"
            ghostKind="option-filter"
            toggleOnActivate
            onchange={(v) => onToggleContinuous?.(v === "continuous")}
          >
            {#snippet optionContent(value)}
              <span class="filter-option">
                {#if layout === "compact"}
                  <span>{value === "all" ? "All" : "Continuous"}</span>
                {:else}
                  <i
                    class={value === "all"
                      ? "fas fa-asterisk"
                      : "fas fa-infinity"}
                    aria-hidden="true"
                  ></i>
                {/if}
                {#if value === "continuous" && hiddenCount > 0}
                  <span class="filter-hidden-count">{hiddenCount} hidden</span>
                {/if}
              </span>
            {/snippet}
          </SegmentedControl>
        </div>
      {/if}
    </div>

    {#if showTurnControls}
      <!-- Level decides which turn buttons exist below, so it gets the center
           and the level colour system rather than neutral filter chrome. -->
      <div class="level-control">
        {#if layout === "compact"}
          <span class="control-label">Level</span>
        {/if}
        <LevelSelector
          value={level}
          compact={layout === "compact"}
          onchange={(n) => onLevelChange(n as TurnLevel)}
          ariaLabel="Working difficulty level"
        />
      </div>

      <div class="oph-side end"></div>
    {/if}
  </div>

  <!-- Row 2: blue then red, present whenever the level has turns. Each hand uses
       the same reading order: turn amount first, spin direction at the trailing
       edge. The matching columns make the two settings easy to compare when the
       hand panels stack. -->
  {#if showTurnControls && turnsAvailable}
    <!-- growFade (not svelte's slide) so the row's own height drives the reflow
         AND reduced motion collapses it — svelte's JS transitions ignore the
         media query the CSS layer respects. -->
    <div
      class="oph-turns-row"
      transition:growFade={{ axis: "y", duration: DURATION.emphasis }}
    >
      <div
        class="hand-half blue"
        class:has-spin={hasLeftTurns}
        role="group"
        aria-label="Left turns"
        in:flyFade={{ y: 6 }}
      >
        <div class="hand-meta">
          <!-- No Blue/Red word: the half is already blue/red (tint, border,
               selected turn indicator) and the group is aria-labeled "Blue/Red
               turns" for screen readers. Colour carries the identity. -->
          <!-- Spin direction is a real choice in BOTH modes: it's baked into
               each dash/static tile, and in Continuous it decides which
               dash/static options survive the direction-reversal filter. So the
               toggle shows whenever this hand has turns, not only in All mode. -->
          <span class="spin-slot">
            {#if hasLeftTurns}
              <button
                class="spin-inline edge"
                transition:popIn
                title="Spin direction for dash & static options on this hand (shifts keep their own direction)"
                aria-label="Toggle left dash/static spin (currently {dirLabel(
                  leftRotation
                )})"
                onclick={() => onLeftRotationChange(opposite(leftRotation))}
              >
                <i class="fas {dirIcon(leftRotation)}" aria-hidden="true"></i>
                <span class="dir">{dirLabel(leftRotation)}</span>
              </button>
            {/if}
          </span>
        </div>
        <div class="turn-seg">
          <SegmentedControl
            options={turnOptions}
            value={turnValueToKey(leftTurns)}
            size="sm"
            color="blue"
            ghostKind="turn"
            onchange={(v) => onLeftChange(keyToTurnValue(v))}
          />
        </div>
      </div>
      <!-- Red trails blue by one micro-beat: the two halves read as one gesture
           rather than a single slab dropping in. -->
      <div
        class="hand-half red"
        class:has-spin={hasRightTurns}
        role="group"
        aria-label="Right turns"
        in:flyFade={{ y: 6, delay: STAGGER.micro }}
      >
        <div class="hand-meta">
          <span class="spin-slot">
            {#if hasRightTurns}
              <button
                class="spin-inline edge"
                transition:popIn
                title="Spin direction for dash & static options on this hand (shifts keep their own direction)"
                aria-label="Toggle right dash/static spin (currently {dirLabel(
                  rightRotation
                )})"
                onclick={() => onRightRotationChange(opposite(rightRotation))}
              >
                <i class="fas {dirIcon(rightRotation)}" aria-hidden="true"></i>
                <span class="dir">{dirLabel(rightRotation)}</span>
              </button>
            {/if}
          </span>
        </div>
        <div class="turn-seg">
          <SegmentedControl
            options={turnOptions}
            value={turnValueToKey(rightTurns)}
            size="sm"
            color="red"
            ghostKind="turn"
            onchange={(v) => onRightChange(keyToTurnValue(v))}
          />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Header band: faint top gradient + hairline divider separate it from options. */
  .oph {
    --filter-control-width: calc(var(--min-touch-target, 44px) * 2 + 66px);
    display: flex;
    flex-direction: column;
    /* No gap: the row/row spacing lives on .oph-turns-row's margin-top instead,
       because growFade collapses margins with the height. A flex `gap` would
       survive the collapse and snap away 12px at the end of the transition. */
    gap: 0;
    width: 100%;
    padding: 12px 16px 14px;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.045) 0%,
      rgba(255, 255, 255, 0) 100%
    );
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  /* Row 1: [filter | LEVEL | counterweight]. Equal-fr sides put Level on the
     band's true center; the turn buttons are NOT here — they live on row 2 — so
     this row's height never changes. */
  .oph-bar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    min-height: var(--min-touch-target, 44px);
  }

  .oph-side {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .oph-side.end {
    justify-content: flex-end;
  }

  .oph-bar.filter-only {
    grid-template-columns: 1fr;
  }

  .level-control {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }

  .control-label {
    display: none;
  }

  /* Reserve room for the count even in All mode, so switching filters or spin
     directions never pushes the level selector sideways. */
  .filter-seg {
    width: var(--filter-control-width);
  }

  .filter-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .filter-hidden-count {
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    white-space: nowrap;
  }

  /* The full level rail fits between equal counterweights at this width. Keep
     compressing the same controls below it; the option grid's breakpoint must
     never switch the header into a different visual system. */
  @container (width < 900px) {
    .oph:not(.compact) .oph-bar:not(.filter-only) {
      grid-template-columns:
        minmax(var(--filter-control-width), 1fr) auto
        minmax(var(--filter-control-width), 1fr);
    }

    .oph:not(.compact) :global(.level-selector) {
      gap: 0.5rem;
    }

    .oph:not(.compact) :global(.level-selector .lvl) {
      width: clamp(10rem, calc((100cqw - 16.5rem) / 3), 12.25rem);
      gap: 0.45rem;
      padding-inline: 0.5rem;
    }
  }

  /* Counterweight centering is useful only while there is room to spend on an
     empty third column. Below that point the level rail borrows the space and
     every control keeps the same icon, colour, surface, and interaction model. */
  @container (width < 1000px) {
    .oph:not(.compact) .oph-bar:not(.filter-only) {
      grid-template-columns:
        var(--filter-control-width)
        minmax(0, 1fr);
      gap: 10px;
    }

    .oph:not(.compact) .oph-side.end {
      display: none;
    }

    .oph:not(.compact) .oph-bar.turns-only {
      grid-template-columns: minmax(0, 1fr);
    }

    .oph:not(.compact) .oph-bar.turns-only .oph-side.start {
      display: none;
    }

    .oph:not(.compact) .level-control,
    .oph:not(.compact) :global(.level-selector) {
      width: 100%;
    }

    .oph:not(.compact) :global(.level-selector .lvl) {
      flex: 1 1 0;
      width: auto;
      min-width: 0;
    }
  }

  /* Row 2: two equal halves — blue then red — revealed by sliding down. Each
     half keeps its spin direction at the trailing edge, out of flow. */
  .oph-turns-row {
    display: flex;
    gap: 10px;
    margin-top: 12px;
  }

  .hand-half {
    position: relative;
    flex: 1 1 0;
    display: flex;
    align-items: center;
    gap: 10px;
    /* The turn buttons fill the half; the spin button is pinned out of flow on
       the trailing edge. Its gutter is reserved only while this hand has turns
       (.has-spin) — the padding animates so the turn buttons slide as the gutter
       and its CW/CCW button appear or collapse together, never a snap. The
       gutter is a touch wider than the button so it clears the panel edge (outer
       inset below) AND the stepper (inner gap) instead of hugging either. */
    --spin-gutter: 88px;
    padding: 8px 12px;
    min-width: 260px;
    border-radius: 12px;
    border: 1px solid;
    transition: padding var(--duration-normal, 200ms) ease;
  }

  .hand-half.blue.has-spin,
  .hand-half.red.has-spin {
    padding-right: var(--spin-gutter);
  }

  /* One button per legal turn value — grows to fill whatever the level's palette
     needs (4 buttons at L2, 8 at L3) inside a fixed-height row. */
  .turn-seg {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* The meta wrapper is structural on compact screens. On desktop its children
     participate directly in the hand row, preserving the established layout. */
  .hand-meta,
  .spin-slot {
    display: contents;
  }

  .hand-half.blue {
    --hand-color: var(--prop-blue, #3b82f6);
    --prop-color-rgb: 59, 130, 246;
    background: linear-gradient(
      180deg,
      rgba(59, 130, 246, 0.16) 0%,
      rgba(59, 130, 246, 0.06) 100%
    );
    border-color: rgba(59, 130, 246, 0.4);
  }

  .hand-half.red {
    --hand-color: var(--prop-red, #ef4444);
    --prop-color-rgb: 239, 68, 68;
    background: linear-gradient(
      180deg,
      rgba(239, 68, 68, 0.16) 0%,
      rgba(239, 68, 68, 0.06) 100%
    );
    border-color: rgba(239, 68, 68, 0.4);
  }

  .spin-inline:focus-visible {
    outline: 2px solid var(--theme-accent, #6ea8fe);
    outline-offset: 2px;
  }

  /* Dash/static spin — themed via the half's --prop-color-rgb. */
  .spin-inline {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0 10px;
    border-radius: 7px;
    border: 1px solid rgba(var(--prop-color-rgb), 0.5);
    background: rgba(var(--prop-color-rgb), 0.22);
    color: rgba(255, 255, 255, 0.92);
    font-size: 0.72rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition:
      background-color var(--duration-fast, 0.15s) ease,
      border-color var(--duration-fast, 0.15s) ease,
      transform var(--duration-fast, 0.15s) ease;
  }

  .spin-inline:hover {
    background: rgba(var(--prop-color-rgb), 0.34);
    border-color: rgba(var(--prop-color-rgb), 0.7);
  }

  .spin-inline:active {
    transform: scale(0.96);
  }

  /* Pin the spin button to the half's trailing edge, vertically centered.
     Out of flow, so it has its own room and never shifts the centered stepper. */
  .spin-inline.edge {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }

  .hand-half.blue .spin-inline.edge,
  .hand-half.red .spin-inline.edge {
    right: 14px;
  }

  .spin-inline.edge:active {
    transform: translateY(-50%) scale(0.96);
  }

  /* Fixed-width direction label so CW <-> CCW toggling never resizes the chip. */
  .spin-inline .dir {
    display: inline-block;
    min-width: 2.4ch;
    text-align: left;
  }

  /* Half-turn palettes need more room than Level 2's four values per hand.
     Resize-driven recomposition follows the divider directly. */
  @container (width < 1000px) {
    .oph:not(.compact) .oph-turns-row {
      flex-direction: column;
      gap: 8px;
    }

    .oph:not(.compact) .hand-half {
      flex: 0 0 auto;
      width: 100%;
      min-width: 0;
    }
  }

  /* Keep Level 2 on one row when both palettes and their spin controls fit. */
  @container (640px <= width < 1000px) {
    .oph.whole-turns:not(.compact) .oph-turns-row {
      flex-direction: row;
      gap: 10px;
    }

    .oph.whole-turns:not(.compact) .hand-half {
      flex: 1 1 0;
      width: auto;
    }
  }

  /* At phone-width inline surfaces, names yield before targets do. The level
     colours and numerals remain identical to desktop, while the spin direction
     keeps its full accessible name in aria-label and a genuine 44px target. */
  @container (width < 560px) {
    .oph:not(.compact) {
      padding: 8px 8px 10px;
    }

    .oph:not(.compact) .oph-bar:not(.filter-only) {
      gap: 8px;
    }

    .oph:not(.compact) :global(.level-selector) {
      gap: 6px;
    }

    .oph:not(.compact) :global(.level-selector .lvl) {
      height: var(--min-touch-target, 44px);
      padding-inline: 0.25rem;
    }

    .oph:not(.compact) :global(.level-selector .name) {
      display: none;
    }

    .oph:not(.compact) .hand-half {
      --spin-gutter: 58px;
      padding: 6px 8px;
      border-radius: 10px;
    }

    .oph:not(.compact) .hand-half.blue .spin-inline.edge,
    .oph:not(.compact) .hand-half.red .spin-inline.edge {
      right: 8px;
    }

    .oph:not(.compact) .spin-inline.edge {
      justify-content: center;
      width: var(--min-touch-target, 44px);
      height: var(--min-touch-target, 44px);
      padding: 0;
    }

    .oph:not(.compact) .spin-inline .dir {
      display: none;
    }

    .oph:not(.compact) .turn-seg :global(.segment) {
      padding-inline: 0.2rem;
    }
  }

  /* Popover layout: Options and Level share the first row; each hand gets one
     horizontal row beneath it. This keeps the complete Level 3 palette above
     the picker on short phones without shrinking any touch target. */
  .oph.compact {
    padding: 8px;
    background: transparent;
    border-bottom: none;
  }

  .oph.compact .oph-bar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
    gap: 8px;
    min-height: 0;
  }

  .oph.compact .oph-bar.filter-only,
  .oph.compact .oph-bar.turns-only {
    grid-template-columns: minmax(0, 1fr);
  }

  .oph.compact .oph-bar.turns-only .oph-side.start,
  .oph.compact .oph-side.end {
    display: none;
  }

  .oph.compact .oph-side.start,
  .oph.compact .filter-seg,
  .oph.compact .level-control {
    width: 100%;
  }

  .oph.compact .filter-seg,
  .oph.compact .level-control {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }

  /* The compact tray sits over animated backgrounds. A deeper accent keeps
     the selected filter label readable at enhanced contrast without changing
     the shared control everywhere else it appears. */
  .oph.compact .filter-seg :global(.segmented-control.accent .indicator) {
    background: color-mix(in srgb, var(--theme-accent, #8b6cff) 48%, black);
  }

  .oph.compact .control-label {
    display: block;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .oph.compact :global(.level-selector) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }

  .oph.compact :global(.level-selector .lvl) {
    width: 100%;
    height: var(--min-touch-target, 44px);
    padding: 0;
  }

  .oph.compact .oph-turns-row {
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }

  .oph.compact .hand-half {
    flex: 0 0 auto;
    display: grid;
    /* [turn palette][spin 44px]. Both hands use the same trailing action column
       here and in the inline header. */
    grid-template-columns: minmax(0, 1fr) var(--min-touch-target, 44px);
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    padding: 6px;
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--hand-color) 9%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.05))
    );
    border-color: color-mix(
      in srgb,
      var(--hand-color) 26%,
      var(--theme-stroke, rgba(255, 255, 255, 0.12))
    );
  }

  .oph.compact .hand-half.blue,
  .oph.compact .hand-half.red {
    padding: 6px;
    background: color-mix(
      in srgb,
      var(--hand-color) 9%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.05))
    );
    border-color: color-mix(
      in srgb,
      var(--hand-color) 26%,
      var(--theme-stroke, rgba(255, 255, 255, 0.12))
    );
  }

  .oph.compact .spin-slot {
    display: flex;
    grid-column: 2;
    grid-row: 1;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
  }

  .oph.compact .turn-seg {
    grid-column: 1;
    grid-row: 1;
    width: 100%;
  }

  .oph.compact .turn-seg :global(.segment) {
    padding-inline: 0.2rem;
  }

  .oph.compact .spin-inline.edge {
    position: static;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    transform: none;
  }

  .oph.compact .spin-inline .dir {
    /* The rotation icon communicates the state visually; the button's full
       aria-label keeps CW / CCW explicit without stealing Level 3 width. */
    display: none;
  }

  .oph.compact .spin-inline.edge:active {
    transform: scale(0.96);
  }

  @media (prefers-reduced-motion: reduce) {
    .hand-half {
      transition: none;
    }
    .spin-inline {
      transition: none;
    }
    .spin-inline:active {
      transform: none;
    }
    /* Keep the edge button's positioning transform under reduced motion. */
    .spin-inline.edge:active {
      transform: translateY(-50%);
    }

    .oph.compact .spin-inline.edge:active {
      transform: none;
    }
  }
</style>
