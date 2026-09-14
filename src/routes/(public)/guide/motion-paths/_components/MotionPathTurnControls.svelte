<!--
  A guide-local presentation of the Shape Matrix turn palette. The guide owns
  which two axes it displays; the Matrix domain remains the source for values,
  labels, and ratio notation.
-->
<script lang="ts">
  import { Popover } from "bits-ui";
  import { flyFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import ShapeMatrixValueScroller from "$lib/shared/shape-matrix/app/components/ShapeMatrixValueScroller.svelte";
  import {
    matrixTurnSpokenLabel,
    matrixTurnVisibleLabel,
    matrixTurnsForLevel,
    type MatrixLabelMode,
  } from "$lib/shared/shape-matrix/domain/matrix-turn-band";
  import {
    turnValueToKey,
    type TurnValue,
  } from "$lib/shared/create/services/level-turn-values";

  type Hand = "left" | "right";

  interface Props {
    leftTurn: TurnValue;
    rightTurn: TurnValue;
    labelMode: MatrixLabelMode;
    onturn: (hand: Hand, turn: TurnValue) => void;
    onlabelmodechange: (mode: MatrixLabelMode) => void;
  }

  let { leftTurn, rightTurn, labelMode, onturn, onlabelmodechange }: Props =
    $props();

  let leftOpen = $state(false);
  let rightOpen = $state(false);
  const handColors = $derived(getSettings().primaryPropColors);

  const turnValues = matrixTurnsForLevel(4);
  const turnKeys = turnValues.map(turnValueToKey);
  const notationOptions = [
    { value: "turns" as const, label: "Turns" },
    { value: "ratios" as const, label: "Ratios" },
  ];

  function optionsFor(hand: Hand) {
    return turnValues.map((turn) => ({
      value: turnValueToKey(turn),
      label: matrixTurnSpokenLabel(turn, labelMode),
      shortLabel: matrixTurnVisibleLabel(turn, labelMode),
      tone: hand === "left" ? ("blue" as const) : ("red" as const),
    }));
  }

  function setOpen(hand: Hand, open: boolean): void {
    if (hand === "left") {
      leftOpen = open;
      if (open) rightOpen = false;
      return;
    }
    rightOpen = open;
    if (open) leftOpen = false;
  }

  function chooseTurn(hand: Hand, value: string): void {
    const turn = turnValues.find(
      (candidate) => turnValueToKey(candidate) === value
    );
    if (turn === undefined) return;
    onturn(hand, turn);
    if (hand === "left") leftOpen = false;
    else rightOpen = false;
  }
</script>

<div class="turn-controls" aria-label="Shape Matrix turn controls">
  <div class="notation-control">
    <SegmentedControl
      options={notationOptions}
      value={labelMode}
      onchange={onlabelmodechange}
      size="sm"
      density="tight"
      color="accent"
      semantics="radiogroup"
      ariaLabel="Turn label system"
    />
  </div>

  {#each [{ hand: "left" as const, label: "Left", turn: leftTurn }, { hand: "right" as const, label: "Right", turn: rightTurn }] as axis (axis.hand)}
    <Popover.Root
      open={axis.hand === "left" ? leftOpen : rightOpen}
      onOpenChange={(open) => setOpen(axis.hand, open)}
    >
      <Popover.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            class="turn-trigger"
            class:left={axis.hand === "left"}
            class:right={axis.hand === "right"}
            aria-label={`Choose ${axis.label.toLowerCase()} ${matrixTurnSpokenLabel(axis.turn, labelMode)}`}
          >
            <span class="hand-label">{axis.label}</span>
            <span class="turn-value" style:color={handColors?.[axis.hand]}
              >{matrixTurnVisibleLabel(axis.turn, labelMode)}</span
            >
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          </button>
        {/snippet}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          avoidCollisions={true}
          collisionPadding={8}
          forceMount
        >
          {#snippet child({ open, wrapperProps, props })}
            <div {...wrapperProps}>
              {#if open}
                <section
                  {...props}
                  class="turn-popover"
                  style:--dm-motion-blue={handColors?.left}
                  style:--dm-motion-red={handColors?.right}
                  transition:flyFade={{ y: -6, duration: DURATION.normal }}
                  aria-label={`Choose ${axis.label.toLowerCase()} ${labelMode === "ratios" ? "ratio" : "turn"}`}
                >
                  <ShapeMatrixValueScroller
                    label={`${axis.label} ${labelMode === "ratios" ? "ratio" : "turn"}`}
                    options={optionsFor(axis.hand)}
                    keys={turnKeys}
                    value={turnValueToKey(axis.turn)}
                    onchange={(value) => chooseTurn(axis.hand, value)}
                    layout="tray"
                    ariaLabel={`${axis.label} ${labelMode === "ratios" ? "ratio" : "turn"} value`}
                  />
                </section>
              {/if}
            </div>
          {/snippet}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  {/each}
</div>

<style>
  .turn-controls {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) repeat(2, minmax(6.5rem, 1fr));
    gap: var(--spacing-xs, 4px);
    width: 100%;
  }

  .notation-control {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .hand-label {
    color: var(--theme-text-muted);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.2;
  }

  .turn-trigger {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto 1fr;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    padding: 0.3rem 0.55rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.16));
    border-radius: 8px;
    background: var(--theme-card-bg, rgb(255 255 255 / 0.05));
    color: var(--theme-text, #fff);
    cursor: pointer;
    font: inherit;
    text-align: start;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast);
  }

  .turn-trigger:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 55%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #f59e0b) 10%,
      transparent
    );
  }

  .turn-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  .turn-value {
    grid-column: 1;
    min-width: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .turn-trigger i {
    grid-column: 2;
    grid-row: 1 / -1;
    color: var(--theme-text-muted);
    font-size: 0.75rem;
  }

  .turn-trigger.left .turn-value {
    color: var(--prop-blue-text, #818cf8);
  }

  .turn-trigger.right .turn-value {
    color: var(--prop-red-text, #fb7185);
  }

  .turn-popover {
    width: max-content;
    max-width: var(--bits-popover-content-available-width, calc(100vw - 1rem));
    padding: var(--spacing-sm, 8px);
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.16));
    border-radius: 10px;
    background-color: var(--theme-bg-deep, #0a0f17);
    background-image: linear-gradient(
      var(--theme-panel-bg, #171717),
      var(--theme-panel-bg, #171717)
    );
    max-height: var(
      --bits-popover-content-available-height,
      calc(100dvh - 16px)
    );
    overflow-y: auto;
    overscroll-behavior: contain;
    box-shadow: 0 12px 30px rgb(0 0 0 / 0.28);
    z-index: var(--z-dropdown, 1000);
  }

  @container (max-width: 410px) {
    .turn-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .notation-control {
      grid-column: 1 / -1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .turn-trigger {
      transition: none;
    }
  }
</style>
