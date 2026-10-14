<!--
  StepControlsZone.svelte

  The PERSISTENT blue/red turn controls at the bottom of the step editor drawer.
  Rendered once by StepEditorCoordinator, OUTSIDE the top-zone crossfade, so the
  colored blue/red frames (PropControlPair) survive a single ↔ multi switch and
  MORPH in place: only the inner control crossfades (single per-hand stepper ↔
  batch value palette), the frame persists.

  Shows only when there's something to edit turns for — a single regular beat, or
  a multi-selection. Start-placement / no-selection have no turn pair and are
  handled by the top zone (StepEditorPanel).
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { handLabel } from "./control-labels";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import {
    MAX_HAND_CARD_WIDTH,
    NARROW_EDITOR_WIDTH,
    SHORT_EDITOR_HEIGHT,
  } from "./editor-layout";
  import { getViewportManager } from "#lib/shared/device/get-viewport-manager.js";
  import PropControlPair from "./PropControlPair.svelte";
  import PropTurnsControl from "./PropTurnsControl.svelte";
  import PropTypeRow from "./PropTypeRow.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { TargetHand } from "#lib/shared/create/domain/panel-types.js";
  import {
    HandSide,
    MotionType,
    RotationDirection,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PathShapeValue } from "../../services/step-operations/path-shape-handler";
  import {
    aggregateTurns,
    formatTurn,
    type TurnsAggregate,
  } from "../../services/step-operations/turns-aggregation";

  type BatchMode = "set" | "adjust";
  type SetOption = number | "fl";

  // The hand picker is the shared SegmentedControl: exactly one hand is
  // active, and each option carries its prop tone plus a non-color label.
  const HAND_OPTIONS: {
    value: TargetHand;
    label: string;
    tone: "blue" | "red";
  }[] = $derived([
    { value: "left", label: handLabel("left"), tone: "blue" },
    { value: "right", label: handLabel("right"), tone: "red" },
  ]);

  interface Props {
    selectionMode: "single" | "multi";
    /** Fallback layout until the zone has measured its own width. */
    stacked?: boolean;
    compact?: boolean;
    // Single-select: the displayed regular step (null when none / start placement)
    stepData: StepData | null;
    onTurnsChange: (color: HandSide, delta: number) => void;
    onRotationChange: (color: HandSide, direction: RotationDirection) => void;
    onOpenPropSheet?: (hand: "left" | "right") => void;
    onPathShapeChange?: (color: HandSide, shape: PathShapeValue) => void;
    onPathShapeClear?: (color: HandSide) => void;
    // Multi-select: every selected step + the batch turns writer
    batchSteps: StepData[];
    onBatchTurnsChange: (
      color: HandSide,
      mode: BatchMode,
      amount: number | "fl"
    ) => void;
  }

  let {
    selectionMode,
    stacked = false,
    compact = false,
    stepData,
    onTurnsChange,
    onRotationChange,
    onOpenPropSheet,
    onPathShapeChange,
    onPathShapeClear,
    batchSteps,
    onBatchTurnsChange,
  }: Props = $props();

  // The zone composes by its own width (the drawer's), not the viewport: a
  // tablet sheet fits two cards, a landscape phone's side panel does not. The
  // viewport-derived props only cover the first paint before measurement.
  let zoneWidth = $state(0);
  // A short screen (phone landscape, a half-height window) also takes the
  // one-card composition: two full cards would leave the preview no height.
  const viewport = getViewportManager();
  const narrow = $derived(
    zoneWidth > 0
      ? zoneWidth < NARROW_EDITOR_WIDTH ||
          viewport.height <= SHORT_EDITOR_HEIGHT
      : stacked || compact
  );

  // ---- Single-select display turns (mirrors StepEditorPanel's derivations) ----
  const leftMotion = $derived(stepData?.motions?.[HandSide.LEFT]);
  const rightMotion = $derived(stepData?.motions?.[HandSide.RIGHT]);

  const normalizeTurns = (turns: number | string | undefined): number =>
    turns === "fl" ? -0.5 : Number(turns) || 0;

  const currentLeftTurns = $derived(normalizeTurns(leftMotion?.turns));
  const currentRightTurns = $derived(normalizeTurns(rightMotion?.turns));

  const displayLeftTurns = $derived(
    leftMotion?.turns === "fl" ? "fl" : currentLeftTurns
  );
  const displayRightTurns = $derived(
    rightMotion?.turns === "fl" ? "fl" : currentRightTurns
  );

  const showLeftRotation = $derived.by(() => {
    if (currentLeftTurns < 0) return false;
    if (
      (leftMotion?.motionType === MotionType.STATIC ||
        leftMotion?.motionType === MotionType.DASH) &&
      currentLeftTurns === 0
    ) {
      return false;
    }
    return true;
  });
  const showRightRotation = $derived.by(() => {
    if (currentRightTurns < 0) return false;
    if (
      (rightMotion?.motionType === MotionType.STATIC ||
        rightMotion?.motionType === MotionType.DASH) &&
      currentRightTurns === 0
    ) {
      return false;
    }
    return true;
  });

  // Turn limits, mirroring the coordinator's clamp: shifts (pro/anti) may go
  // down to a float ("fl", −0.5); everything else stops at 0; all stop at 3.
  const MAX_TURNS = 3;
  const minTurnsFor = (motionType: MotionType | undefined): number =>
    motionType === MotionType.PRO || motionType === MotionType.ANTI ? -0.5 : 0;
  const canDecreaseLeft = $derived(
    currentLeftTurns > minTurnsFor(leftMotion?.motionType)
  );
  const canIncreaseLeft = $derived(currentLeftTurns < MAX_TURNS);
  const canDecreaseRight = $derived(
    currentRightTurns > minTurnsFor(rightMotion?.motionType)
  );
  const canIncreaseRight = $derived(currentRightTurns < MAX_TURNS);

  const leftRotation = $derived(
    leftMotion?.rotationDirection ?? RotationDirection.NO_ROTATION
  );
  const rightRotation = $derived(
    rightMotion?.rotationDirection ?? RotationDirection.NO_ROTATION
  );

  const leftPathShape = $derived(leftMotion?.pathShape);
  const rightPathShape = $derived(rightMotion?.pathShape);
  const leftIsShift = $derived(
    leftMotion ? leftMotion.startLocation !== leftMotion.endLocation : false
  );
  const rightIsShift = $derived(
    rightMotion ? rightMotion.startLocation !== rightMotion.endLocation : false
  );

  // ---- Multi-select aggregates (mirrors BatchStepEditor) ----
  const leftAgg = $derived(
    aggregateTurns(batchSteps.map((s) => s.motions?.[HandSide.LEFT]?.turns))
  );
  const rightAgg = $derived(
    aggregateTurns(batchSteps.map((s) => s.motions?.[HandSide.RIGHT]?.turns))
  );

  // Per-hand batch mode. Defaults to "Set all" — the palette shows the spread.
  let leftMode = $state<BatchMode>("set");
  let rightMode = $state<BatchMode>("set");
  let mobileHand = $state<TargetHand>("left");

  const MODE_OPTIONS: { value: BatchMode; label: string }[] = $derived([
    { value: "set", label: t("create_controls_set_all") },
    { value: "adjust", label: t("create_controls_adjust") },
  ]);
  const SET_OPTIONS: SetOption[] = ["fl", 0, 0.5, 1, 1.5, 2, 2.5, 3];

  function fmt(v: SetOption): string {
    return v === "fl" ? "fl" : `${v}`;
  }
  const norm = (v: SetOption): number => (v === "fl" ? -0.5 : v);

  function isActiveOption(agg: TurnsAggregate, opt: SetOption): boolean {
    return !agg.mixed && agg.value !== null && norm(agg.value) === norm(opt);
  }
  // The shared value palette: one absolute value is active when every selected
  // step agrees; a mixed selection highlights nothing until a tap sets them.
  function setOptionsFor(color: HandSide) {
    return SET_OPTIONS.map((opt) => ({
      value: opt,
      label: fmt(opt),
      ariaLabel: t("create_controls_set_turns", {
        hand: handLabel(color),
        turns: fmt(opt),
      }),
    }));
  }
  function activeSetOption(agg: TurnsAggregate): SetOption {
    // null never matches an option, which hides the indicator.
    return (SET_OPTIONS.find((opt) => isActiveOption(agg, opt)) ??
      null) as SetOption;
  }
  function adjustDisplay(agg: TurnsAggregate): string {
    if (!agg.mixed) return agg.value === null ? "0" : fmt(agg.value);
    return `${formatTurn(agg.min)}–${formatTurn(agg.max)}`;
  }

  // Show the turn pair only when there's turns to edit: a single regular beat or
  // a live multi-selection. Start placement / no selection show nothing here.
  const showPair = $derived(
    selectionMode === "multi" ? batchSteps.length > 0 : stepData != null
  );
</script>

{#if showPair}
  <div
    class="controls-zone"
    class:stacked={narrow}
    style:--max-hand-card-width="{MAX_HAND_CARD_WIDTH}px"
    bind:clientWidth={zoneWidth}
  >
    {#if narrow}
      <div class="mobile-hand-picker">
        <SegmentedControl
          options={HAND_OPTIONS}
          value={mobileHand}
          onchange={(hand) => (mobileHand = hand)}
          ariaLabel={t("create_controls_choose_prop")}
        />
      </div>
    {/if}

    <PropControlPair
      stacked={narrow}
      compact={narrow}
      labelsHidden={narrow}
      visibleHand={narrow ? mobileHand : "both"}
    >
      {#snippet leftContent()}
        <Crossfade key={selectionMode} duration={DURATION.fast}>
          {#if selectionMode === "multi"}
            {@render batchHand(
              "blue",
              HandSide.LEFT,
              leftAgg,
              leftMode,
              (m) => (leftMode = m)
            )}
          {:else}
            {@render singleHand(
              "blue",
              HandSide.LEFT,
              displayLeftTurns,
              leftRotation,
              showLeftRotation,
              leftPathShape,
              leftIsShift,
              canDecreaseLeft,
              canIncreaseLeft
            )}
          {/if}
        </Crossfade>
      {/snippet}
      {#snippet rightContent()}
        <Crossfade key={selectionMode} duration={DURATION.fast}>
          {#if selectionMode === "multi"}
            {@render batchHand(
              "red",
              HandSide.RIGHT,
              rightAgg,
              rightMode,
              (m) => (rightMode = m)
            )}
          {:else}
            {@render singleHand(
              "red",
              HandSide.RIGHT,
              displayRightTurns,
              rightRotation,
              showRightRotation,
              rightPathShape,
              rightIsShift,
              canDecreaseRight,
              canIncreaseRight
            )}
          {/if}
        </Crossfade>
      {/snippet}
    </PropControlPair>
  </div>
{/if}

{#snippet singleHand(
  colorName: "blue" | "red",
  color: HandSide,
  turns: number | "fl",
  rotation: RotationDirection,
  showRotation: boolean,
  pathShape: PathShapeValue | undefined,
  isShift: boolean,
  canDecrease: boolean,
  canIncrease: boolean
)}
  <div class="hand-inner">
    <PropTurnsControl
      hand={color === HandSide.LEFT ? "left" : "right"}
      {turns}
      rotationDirection={rotation}
      {showRotation}
      compact={narrow}
      {pathShape}
      {isShift}
      {canDecrease}
      {canIncrease}
      onTurnsChange={(delta) => onTurnsChange(color, delta)}
      onRotationChange={(dir) => onRotationChange(color, dir)}
      onPathShapeChange={onPathShapeChange
        ? (shape) => onPathShapeChange(color, shape)
        : undefined}
      onPathShapeClear={onPathShapeClear
        ? () => onPathShapeClear(color)
        : undefined}
    >
      {#snippet trailingControl()}
        <PropTypeRow
          hand={color === HandSide.LEFT ? "left" : "right"}
          compact={narrow}
          {onOpenPropSheet}
        />
      {/snippet}
    </PropTurnsControl>
  </div>
{/snippet}

{#snippet batchHand(
  colorName: "blue" | "red",
  color: HandSide,
  agg: TurnsAggregate,
  mode: BatchMode,
  setMode: (m: BatchMode) => void
)}
  <div class="hand-inner">
    <SegmentedControl
      options={MODE_OPTIONS}
      value={mode}
      color={colorName}
      size="sm"
      onchange={setMode}
    />
    {#if mode === "set"}
      <!-- Absolute value palette — tap sets every selected step to that value. -->
      <SegmentedControl
        options={setOptionsFor(color)}
        value={activeSetOption(agg)}
        color={colorName}
        columns={4}
        ariaLabel={t("create_controls_set_all")}
        onchange={(opt) => onBatchTurnsChange(color, "set", opt)}
      />
    {:else}
      <!-- Relative nudge — ±0.5 to each step, preserving offsets. -->
      <div class="stepper">
        <button
          class="ctrl-btn"
          type="button"
          aria-label={t("create_controls_less_turns", {
            hand: handLabel(color),
          })}
          onclick={() => onBatchTurnsChange(color, "adjust", -0.5)}
        >
          <i class="fas fa-minus" aria-hidden="true"></i>
        </button>
        <span class="turns-value" class:mixed={agg.mixed}
          >{adjustDisplay(agg)}</span
        >
        <button
          class="ctrl-btn"
          type="button"
          aria-label={t("create_controls_more_turns", {
            hand: handLabel(color),
          })}
          onclick={() => onBatchTurnsChange(color, "adjust", 0.5)}
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
        </button>
      </div>
    {/if}
  </div>
{/snippet}

<style>
  .controls-zone {
    box-sizing: border-box;
    padding: 12px;
    padding-bottom: max(12px, env(safe-area-inset-bottom, 12px));
    flex-shrink: 0;
    min-height: 0;
    border-top: 1px solid var(--theme-stroke);
    background: var(--theme-panel-bg);
  }

  .controls-zone.stacked {
    padding: 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom, 8px));
  }

  .mobile-hand-picker {
    padding: 0 0 6px;
  }

  /* Inner column so single (stepper + prop row) and batch (segmented + palette)
     both stack the same way inside the shared card. */
  .hand-inner {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    width: 100%;
  }

  /* ===== Batch: Adjust stepper — the same ±/value grammar as the single
     stepper in PropTurnsControl, so single ↔ multi only swaps the content. ===== */
  .stepper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-radius: 10px;
    border: 1px solid rgba(var(--prop-color-rgb, 59, 130, 246), 0.4);
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.2);
    color: var(--prop-color, var(--semantic-info));
    font-size: 1.1rem;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }

  .ctrl-btn:hover {
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.3);
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.6);
  }

  .ctrl-btn:active {
    transform: scale(0.95);
  }

  .ctrl-btn:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 2px;
  }

  .turns-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
    min-width: var(--min-touch-target, 44px);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .turns-value.mixed {
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    letter-spacing: 0.02em;
  }

  @media (prefers-reduced-motion: reduce) {
    .ctrl-btn {
      transition: none;
    }
    .ctrl-btn:active {
      transform: none;
    }
  }
</style>
