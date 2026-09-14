<!-- src/lib/shared/shape-matrix/app/components/ShapeMatrixAxisStepper.svelte
  One axis of the Level Matrix: a prev/next stepper through the turn values
  the chosen difficulty allows, showing the value in the current notation
  only. The value itself is a button that opens every value of the level in
  one palette, so a far value is one press away instead of a run of steps.
  Rows (blue, left hand) and columns (red, right hand) each get one, so
  there is no Apply-to mode and no "Mixed" placeholder. The corner layout
  scales with the grid's corner cell; the plain layout is a header control. -->
<script lang="ts">
  import { Popover } from "bits-ui";
  import {
    matrixTurnSpokenLabel,
    matrixTurnVisibleLabel,
  } from "$lib/shared/shape-matrix/domain/matrix-turn-band";
  import {
    keyToTurnValue,
    turnValueToKey,
    type TurnValue,
  } from "$lib/shared/create/services/level-turn-values";
  import { flyFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";

  interface Props {
    hand: "left" | "right";
    /** Corner: sized in container units inside the grid's corner cell. */
    layout?: "plain" | "corner";
  }
  let { hand, layout = "plain" }: Props = $props();

  const appState = getShapeMatrixAppContext();
  const axisName = $derived(hand === "left" ? "Rows" : "Columns");
  const turn = $derived(
    hand === "left" ? appState.leftTurn : appState.rightTurn
  );
  const turns = $derived(appState.availableTurns);
  const index = $derived(turns.indexOf(turn));
  const canStep = $derived(turns.length > 1);

  const visible = $derived(matrixTurnVisibleLabel(turn, appState.labelMode));
  const spoken = $derived(matrixTurnSpokenLabel(turn, appState.labelMode));
  const unit = $derived(appState.labelMode === "ratios" ? "ratio" : "turn");

  /* The palette: every value of the level, read in the grid's notation.
     Past six values it wraps to two rows, as the compact tray's palette
     does (see ShapeMatrixValueScroller), so Level 4's fourteen ratios are
     read and pressed as a block rather than a line. */
  const choices = $derived(
    turns.map((value) => ({
      value: turnValueToKey(value),
      label: matrixTurnSpokenLabel(value, appState.labelMode),
      shortLabel: matrixTurnVisibleLabel(value, appState.labelMode),
    }))
  );
  const columns = $derived(
    turns.length > 6 ? Math.ceil(turns.length / 2) : undefined
  );
  let open = $state(false);

  function step(delta: number): void {
    const next = turns[index + delta] as TurnValue | undefined;
    if (next === undefined) return;
    appState.setTurnFor(hand, next);
  }

  function choose(key: string): void {
    appState.setTurnFor(hand, keyToTurnValue(key));
    open = false;
  }

  /* Arrow keys still step the value in place; the palette is for jumps. */
  function onKey(event: KeyboardEvent): void {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  }
</script>

<div
  class="axis-stepper"
  class:rows={hand === "left"}
  class:columns={hand === "right"}
  class:corner={layout === "corner"}
  role="group"
  aria-label={`${axisName}: ${spoken}`}
>
  <button
    type="button"
    class="step"
    aria-label={`Previous ${axisName.toLowerCase()} value`}
    disabled={!canStep || index <= 0}
    onclick={() => step(-1)}
  >
    <i class="fas fa-chevron-left" aria-hidden="true"></i>
  </button>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        {@const { onkeydown: triggerKeydown, ...triggerProps } = props as {
          onkeydown?: (event: KeyboardEvent) => void;
        } & Record<string, unknown>}
        <button
          {...triggerProps}
          type="button"
          class="value"
          disabled={!canStep}
          aria-label={`${axisName} value: ${spoken}. Choose from every ${unit} at this level`}
          onkeydown={(event) => {
            onKey(event);
            if (!event.defaultPrevented) triggerKeydown?.(event);
          }}
        >
          {visible}
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
        {#snippet child({ open: contentOpen, wrapperProps, props })}
          <div {...wrapperProps}>
            {#if contentOpen}
              <div
                {...props}
                class="axis-popover"
                role="dialog"
                aria-label={`${axisName} ${unit}`}
                transition:flyFade={{ y: -6, duration: DURATION.normal }}
              >
                <span class="popover-title">
                  {axisName} {unit} · Level {appState.level}
                </span>
                <SegmentedControl
                  options={choices}
                  value={turnValueToKey(turn)}
                  onchange={choose}
                  {columns}
                  size="md"
                  density={columns ? "standard" : "tight"}
                  color={hand === "left" ? "blue" : "red"}
                  semantics="radiogroup"
                  ariaLabel={`${axisName} ${unit}`}
                />
              </div>
            {/if}
          </div>
        {/snippet}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  <button
    type="button"
    class="step"
    aria-label={`Next ${axisName.toLowerCase()} value`}
    disabled={!canStep || index >= turns.length - 1}
    onclick={() => step(1)}
  >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
  </button>
</div>

<style>
  .axis-stepper {
    --axis-color: var(--prop-blue-text, #818cf8);
    --step-size: var(--min-touch-target, 44px);
    --value-size: var(--font-size-md, 1rem);
    display: inline-flex;
    align-items: stretch;
    min-width: 0;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: 10px;
    background: var(--theme-card-bg, rgb(255 255 255 / 0.05));
    overflow: hidden;
  }

  .axis-stepper.columns {
    --axis-color: var(--prop-red-text, #f87171);
  }

  /* Inside the corner cell the stepper reads in that cell's container
     units, so it shrinks with a laptop grid and grows on a wide one. */
  .axis-stepper.corner {
    --step-size: clamp(1.5rem, 18cqi, 2.75rem);
    --value-size: clamp(0.9rem, 11cqi, 1.4rem);
    border-radius: 8px;
  }

  .step {
    display: grid;
    flex: 0 0 auto;
    width: var(--step-size);
    min-height: var(--step-size);
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.7));
    font: inherit;
    font-size: calc(var(--value-size) * 0.7);
    cursor: pointer;
    transition:
      color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease;
  }

  .step:hover:not(:disabled) {
    color: var(--theme-text, #fff);
    background: color-mix(in srgb, var(--axis-color) 14%, transparent);
  }

  .step:disabled {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.28));
    cursor: default;
  }

  .step:focus-visible,
  .value:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: -2px;
  }

  /* The value is the third button of the stepper: same frame, the hand's
     colour, and the same tint as the chevrons when hovered or open. */
  .value {
    display: inline-flex;
    flex: 1 1 auto;
    min-width: 3rem;
    align-items: center;
    justify-content: center;
    padding: 0.2rem 0.35rem;
    border: 0;
    border-inline: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    background: transparent;
    color: var(--axis-color);
    font: inherit;
    font-size: var(--value-size);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--duration-fast, 150ms) ease;
  }

  .value:hover:not(:disabled),
  .value[data-state="open"] {
    background: color-mix(in srgb, var(--axis-color) 14%, transparent);
  }

  .value:disabled {
    cursor: default;
  }

  .axis-stepper.corner .value {
    min-width: 0;
  }

  /* Sized to the palette it holds; the viewport only caps it. The same
     frame as the compact level-and-turn popover. */
  .axis-popover {
    display: grid;
    width: max-content;
    max-width: var(--bits-popover-content-available-width, calc(100vw - 16px));
    max-height: var(
      --bits-popover-content-available-height,
      calc(100dvh - 16px)
    );
    gap: 0.5rem;
    padding: 0.5rem 0.6rem 0.6rem;
    border: 1px solid var(--theme-stroke-strong, rgb(255 255 255 / 0.18));
    border-radius: 12px;
    background-color: var(--theme-bg-deep, #0a0f17);
    background-image: linear-gradient(
      var(--theme-panel-bg, #101721),
      var(--theme-panel-bg, #101721)
    );
    box-shadow: 0 16px 42px var(--theme-shadow, rgb(0 0 0 / 0.42));
    color: var(--theme-text, #fff);
    overflow: auto;
    overscroll-behavior: contain;
    outline: none;
    transform-origin: var(--bits-popover-content-transform-origin, top left);
    z-index: var(--z-dropdown, 1000);
  }

  .popover-title {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }

  @media (prefers-reduced-motion: reduce) {
    .step,
    .value {
      transition: none;
    }
  }
</style>
