<!--
  PropTurnsControl.svelte

  Internal controls for adjusting turns and rotation of a single prop.
  Designed to be used inside PropControlPair which provides the card styling.
  Uses CSS custom properties from parent card for color theming.

  Full mode stacks turns, rotation, path, and prop controls. Compact mode keeps
  the primary actions together and gives path choices a full-width second row.

  With wholeSteps, a −1 / +1 pair flanks the half-turn pair (same grammar as
  the duration row: coarse outside, fine inside). The pair appears only when
  the card itself is wide enough to hold it at full touch size, and the inner
  pair then reads −½ / +½ so the two sizes are told apart at a glance.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { handLabel, pathShapeLabel } from "./control-labels";
  import type { Snippet } from "svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PathShapeValue } from "../../services/step-operations/path-shape-handler";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

  type PathChoice = PathShapeValue | "auto";

  interface Props {
    hand: "left" | "right";
    turns: number | "fl";
    rotationDirection: RotationDirection;
    showRotation: boolean;
    /** Compact mode: single row layout for mobile */
    compact?: boolean;
    pathShape?: PathShapeValue | undefined;
    isShift?: boolean;
    /** False at the lower turn limit: the "−" button shows pressed flat. */
    canDecrease?: boolean;
    /** False at the upper turn limit: the "+" button shows pressed flat. */
    canIncrease?: boolean;
    /** Offer the −1 / +1 pair when the card has room for it. */
    wholeSteps?: boolean;
    /** False when −1 would change nothing (at 0, or at a float). */
    canDecreaseWhole?: boolean;
    /** False at the upper turn limit. */
    canIncreaseWhole?: boolean;
    onTurnsChange: (delta: number) => void;
    onRotationChange: (direction: RotationDirection) => void;
    onPathShapeChange?: (shape: PathShapeValue) => void;
    onPathShapeClear?: () => void;
    trailingControl?: Snippet;
  }

  let {
    hand,
    turns,
    rotationDirection,
    showRotation,
    compact = false,
    pathShape,
    isShift = true,
    canDecrease = true,
    canIncrease = true,
    wholeSteps = false,
    canDecreaseWhole = true,
    canIncreaseWhole = true,
    onTurnsChange,
    onRotationChange,
    onPathShapeChange,
    onPathShapeClear,
    trailingControl,
  }: Props = $props();

  const displayTurns = $derived(turns === "fl" ? "fl" : turns);

  const directionIcon = $derived(
    rotationDirection === RotationDirection.NO_ROTATION
      ? "fa-minus"
      : rotationDirection === RotationDirection.CLOCKWISE
        ? "fa-rotate-right"
        : "fa-rotate-left"
  );

  const directionLabel = $derived(
    rotationDirection === RotationDirection.NO_ROTATION
      ? ""
      : rotationDirection === RotationDirection.CLOCKWISE
        ? t("create_controls_cw_short")
        : t("create_controls_ccw_short")
  );

  // Ghost sizer: the longer of the two labels reserves the button width so
  // flipping CW <-> CCW never resizes the toggle.
  const longestDirectionLabel = $derived.by(() => {
    const cw = t("create_controls_cw_short");
    const ccw = t("create_controls_ccw_short");
    return ccw.length >= cw.length ? ccw : cw;
  });

  function handleTurnsChangeClick(e: MouseEvent, delta: number) {
    e.stopPropagation();
    onTurnsChange(delta);
  }

  const shapes: PathShapeValue[] = ["arc", "linear", "concave"];

  // "Auto" follows the global path setting; its accessible name says which.
  const globalHint = $derived.by(() => {
    const vm = getAnimationVisibilityManager();
    if (vm.getMotionAwarePaths()) return t("viewer_ui_hybrid");
    const s = vm.getPathShape();
    return pathShapeLabel(s);
  });

  const pathOptions: { value: PathChoice; label: string; ariaLabel: string }[] =
    $derived([
      {
        value: "auto",
        label: t("viewer_ui_auto"),
        ariaLabel: `${t("create_controls_reset_path", { hand: handLabel(hand) })} (${globalHint})`,
      },
      ...shapes.map((shape) => ({
        value: shape,
        label: pathShapeLabel(shape),
        ariaLabel: t("create_controls_path", {
          hand: handLabel(hand),
          shape: pathShapeLabel(shape),
        }),
      })),
    ]);
  const pathChoice = $derived<PathChoice>(pathShape ?? "auto");

  function handlePathChoice(choice: PathChoice) {
    if (choice === "auto") onPathShapeClear?.();
    else onPathShapeChange?.(choice);
  }

  function handleInvert(e: MouseEvent) {
    e.stopPropagation();
    const opposite =
      rotationDirection === RotationDirection.CLOCKWISE
        ? RotationDirection.COUNTER_CLOCKWISE
        : RotationDirection.CLOCKWISE;
    onRotationChange(opposite);
  }
</script>

<div
  class="turns-controls"
  class:blue={hand === "left"}
  class:red={hand === "right"}
  class:compact
  class:whole-steps={wholeSteps}
>
  <!-- Turns row. The whole-turn buttons are always in the markup when
       offered; the card's own width decides whether they show, so resizing
       never re-renders the row. -->
  <div class="turns-row" class:compact>
    {#if wholeSteps}
      <button
        class="ctrl-btn whole"
        class:compact
        disabled={!canDecreaseWhole}
        aria-label={t("create_controls_less_turn_whole", {
          hand: handLabel(hand),
        })}
        onclick={(e) => handleTurnsChangeClick(e, -1)}
      >
        <span class="step-num" aria-hidden="true">−1</span>
      </button>
    {/if}
    <button
      class="ctrl-btn half"
      class:compact
      disabled={!canDecrease}
      aria-label={t("create_controls_less_turns", { hand: handLabel(hand) })}
      onclick={(e) => handleTurnsChangeClick(e, -0.5)}
    >
      <i class="fas fa-minus half-icon" aria-hidden="true"></i>
      {#if wholeSteps}
        <span class="step-num half-num" aria-hidden="true">−½</span>
      {/if}
    </button>
    <span class="turns-value" class:compact>{displayTurns}</span>
    <button
      class="ctrl-btn half"
      class:compact
      disabled={!canIncrease}
      aria-label={t("create_controls_more_turns", { hand: handLabel(hand) })}
      onclick={(e) => handleTurnsChangeClick(e, 0.5)}
    >
      <i class="fas fa-plus half-icon" aria-hidden="true"></i>
      {#if wholeSteps}
        <span class="step-num half-num" aria-hidden="true">+½</span>
      {/if}
    </button>
    {#if wholeSteps}
      <button
        class="ctrl-btn whole"
        class:compact
        disabled={!canIncreaseWhole}
        aria-label={t("create_controls_more_turn_whole", {
          hand: handLabel(hand),
        })}
        onclick={(e) => handleTurnsChangeClick(e, 1)}
      >
        <span class="step-num" aria-hidden="true">+1</span>
      </button>
    {/if}
  </div>

  <!-- Rotation direction toggle. The slot is always laid out so the turns
       stepper never moves when a dash/static motion gains or loses turns;
       at 0 turns the toggle is reserved (invisible and disabled). -->
  <button
    class="invert-btn"
    class:compact
    class:reserved={!showRotation}
    disabled={!showRotation}
    aria-hidden={!showRotation}
    aria-label={t("create_controls_toggle_rotation", {
      hand: handLabel(hand),
      direction: directionLabel,
    })}
    onclick={handleInvert}
  >
    <i class="fas {directionIcon}" aria-hidden="true"></i>
    <span class="invert-label-stack">
      <span class="invert-label ghost" aria-hidden="true"
        >{longestDirectionLabel}</span
      >
      <span class="invert-label">{directionLabel}</span>
    </span>
  </button>

  <!-- Path shape override (only for motions that traverse the grid). Exactly
       one choice is active, so this is the shared SegmentedControl; "Auto"
       is the cleared state that follows the global path setting. -->
  {#if onPathShapeChange && onPathShapeClear && isShift}
    <div class="path-row" class:compact>
      <SegmentedControl
        options={pathOptions}
        value={pathChoice}
        color={hand === "left" ? "blue" : "red"}
        size="sm"
        ariaLabel={t("create_controls_path", {
          hand: handLabel(hand),
          shape: globalHint,
        })}
        onchange={handlePathChoice}
      />
    </div>
  {/if}

  {#if trailingControl}
    <div class="trailing-control">
      {@render trailingControl()}
    </div>
  {/if}
</div>

<style>
  .turns-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  /* Compact: primary actions share the first row; path choices get the full
     second row so labels and touch targets do not collapse. */
  .turns-controls.compact {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      "turns rotation trailing"
      "path path path";
    align-items: center;
    gap: 6px;
    width: 100%;
  }

  .turns-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .turns-row.compact {
    grid-area: turns;
    justify-self: center;
    gap: 6px;
  }

  /* ============================================================================
     WHOLE-TURN PAIR
     The host card (PropControlPair with sizedCards) is the size container,
     so the pair follows the room the card actually has (phone, split drawer,
     4K) rather than the screen class. The widths below are the card's content
     box, which is what a size query measures. Below the fit width the row is
     the plain − value + stepper.
     ============================================================================ */

  .ctrl-btn.whole,
  .half-num {
    display: none;
  }

  .step-num {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  /* Full card: four 44px buttons, the value, and four 10px gaps = 260px. */
  @container hand-card (min-width: 260px) {
    .turns-controls:not(.compact) .turns-row {
      gap: 10px;
    }
    .turns-controls:not(.compact) .ctrl-btn.whole {
      display: flex;
    }
    .turns-controls:not(.compact) .half-num {
      display: inline;
    }
    .turns-controls:not(.compact) .half-icon {
      display: none;
    }
  }

  /* Compact card: the stepper (four buttons, a 36px value, 4px gaps = 228px)
     shares its row with the rotation and prop buttons (6 + 44 + 6 + 44). */
  @container hand-card (min-width: 328px) {
    .turns-controls.compact .turns-row {
      gap: 4px;
    }
    .turns-controls.compact .ctrl-btn.whole {
      display: flex;
    }
    .turns-controls.compact .half-num {
      display: inline;
    }
    .turns-controls.compact .half-icon {
      display: none;
    }
  }

  .turns-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
    min-width: var(--min-touch-target);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .turns-value.compact {
    font-size: 1.35rem;
    min-width: 36px;
  }

  /* ============================================================================
     CONTROL BUTTONS (turns +/-)
     ============================================================================ */

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 10px;
    border: 1px solid;
    cursor: pointer;
    font-size: 1.1rem;
    transition:
      transform var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  .ctrl-btn.compact {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 8px;
    font-size: 0.95rem;
  }

  .ctrl-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .ctrl-btn:focus-visible,
  .invert-btn:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 2px;
  }

  /* At a turn limit the button sits pressed flat: no fill, no raise, the
     glyph dimmed. It keeps its slot so the stepper never moves. */
  .turns-controls .ctrl-btn:disabled,
  .turns-controls.blue .ctrl-btn:disabled,
  .turns-controls.red .ctrl-btn:disabled {
    background: transparent;
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    box-shadow: none;
    cursor: default;
  }

  /* Blue ctrl buttons */
  .turns-controls.blue .ctrl-btn {
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.2);
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.4);
    color: var(--prop-color, var(--semantic-info));
  }

  .turns-controls.blue .ctrl-btn:hover:not(:disabled) {
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.3);
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.6);
    box-shadow: 0 2px 8px rgba(var(--prop-color-rgb, 59, 130, 246), 0.25);
  }

  /* Red ctrl buttons */
  .turns-controls.red .ctrl-btn {
    background: rgba(var(--prop-color-rgb, 239, 68, 68), 0.2);
    border-color: rgba(var(--prop-color-rgb, 239, 68, 68), 0.4);
    color: var(--prop-color, var(--semantic-error));
  }

  .turns-controls.red .ctrl-btn:hover:not(:disabled) {
    background: rgba(var(--prop-color-rgb, 239, 68, 68), 0.3);
    border-color: rgba(var(--prop-color-rgb, 239, 68, 68), 0.6);
    box-shadow: 0 2px 8px rgba(var(--prop-color-rgb, 239, 68, 68), 0.25);
  }

  .invert-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: var(--min-touch-target);
    padding: 0 20px;
    border-radius: 10px;
    border: 1px solid;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    transition:
      transform var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
  }

  /* Reserved slot: keeps its geometry, shows nothing, takes no input. */
  .invert-btn.reserved {
    opacity: 0;
    pointer-events: none;
  }

  /* Compact: icon-only square button, positioned before turns row */
  .invert-btn.compact {
    grid-area: rotation;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    padding: 0;
    border-radius: 8px;
    font-size: 0.95rem;
    flex-shrink: 0;
  }

  .turns-controls.compact .invert-label {
    display: none;
  }

  .invert-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .invert-label-stack {
    display: grid;
  }

  .invert-label-stack > .invert-label {
    grid-area: 1 / 1;
    text-align: center;
  }

  .invert-label {
    font-size: inherit;
    font-weight: inherit;
  }

  .invert-label.ghost {
    visibility: hidden;
  }

  /* Blue invert button */
  .turns-controls.blue .invert-btn {
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.25);
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.5);
    color: var(--prop-color, var(--semantic-info));
    box-shadow: 0 2px 8px rgba(var(--prop-color-rgb, 59, 130, 246), 0.15);
  }

  .turns-controls.blue .invert-btn:hover:not(:disabled) {
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.35);
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.7);
    box-shadow: 0 2px 12px rgba(var(--prop-color-rgb, 59, 130, 246), 0.3);
  }

  /* Red invert button */
  .turns-controls.red .invert-btn {
    background: rgba(var(--prop-color-rgb, 239, 68, 68), 0.25);
    border-color: rgba(var(--prop-color-rgb, 239, 68, 68), 0.5);
    color: var(--prop-color, var(--semantic-error));
    box-shadow: 0 2px 8px rgba(var(--prop-color-rgb, 239, 68, 68), 0.15);
  }

  .turns-controls.red .invert-btn:hover:not(:disabled) {
    background: rgba(var(--prop-color-rgb, 239, 68, 68), 0.35);
    border-color: rgba(var(--prop-color-rgb, 239, 68, 68), 0.7);
    box-shadow: 0 2px 12px rgba(var(--prop-color-rgb, 239, 68, 68), 0.3);
  }

  .path-row {
    padding-top: 8px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    margin-top: 2px;
    width: 100%;
  }

  .path-row.compact {
    grid-area: path;
    padding-top: 6px;
    margin-top: 0;
  }

  .trailing-control {
    width: 100%;
  }

  .turns-controls.compact .trailing-control {
    grid-area: trailing;
    width: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .ctrl-btn,
    .invert-btn {
      transition: none;
    }
    .ctrl-btn:active:not(:disabled),
    .invert-btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
