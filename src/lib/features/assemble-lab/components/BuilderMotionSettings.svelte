<script lang="ts" module>
  export interface BuilderMotionLabels {
    direction: string;
    turns: string;
    clockwise: string;
    counterclockwise: string;
  }

  const DEFAULT_LABELS: BuilderMotionLabels = {
    direction: "Direction",
    turns: "Turns",
    clockwise: "CW",
    counterclockwise: "CCW",
  };
</script>

<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  let {
    turnCount,
    rotationDirection,
    onchangeTurnCount,
    onchangeRotationDirection,
    stacked = false,
    turnCounts = [-0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3],
    showTurns = true,
    showDirectionLabel = true,
    size = "sm",
    fitTurns = false,
    labels = DEFAULT_LABELS,
  }: {
    turnCount: number;
    rotationDirection: RotationDirection;
    onchangeTurnCount: (turnCount: number) => void;
    onchangeRotationDirection: (direction: RotationDirection) => void;
    stacked?: boolean;
    /** Numeric builder values; -0.5 is the builder's internal float token. */
    turnCounts?: readonly number[];
    showTurns?: boolean;
    /** A host short of height lets the two direction words stand on their own. */
    showDirectionLabel?: boolean;
    size?: "sm" | "phone";
    /** Wrap the turns into even rows when one row would squeeze them. */
    fitTurns?: boolean;
    /** The host's translated words. */
    labels?: BuilderMotionLabels;
  } = $props();

  const FLOAT_VALUE = "float";
  /** The narrowest a turn may get before its row wraps. */
  const TURN_MIN_PX = { phone: 36, sm: 44 } as const;
  /** The track's own padding and border, and the gap between two segments. */
  const TRACK_CHROME_PX = 8;
  const SEGMENT_GAP_PX = 2;

  const turnValue = $derived(
    turnCount === -0.5 ? FLOAT_VALUE : String(turnCount)
  );
  const turnOptions = $derived(
    turnCounts.map((value) => ({
      value: value === -0.5 ? FLOAT_VALUE : String(value),
      label: value === -0.5 ? "fl" : String(value),
    }))
  );
  const rotationOptions = $derived(
    [
      { value: RotationDirection.CLOCKWISE, label: labels.clockwise },
      {
        value: RotationDirection.COUNTER_CLOCKWISE,
        label: labels.counterclockwise,
      },
    ].map((option) => ({
      ...option,
      disabled: turnCount === -0.5,
    }))
  );

  let turnWidth = $state(0);
  const turnColumns = $derived.by(() => {
    if (!fitTurns || turnWidth === 0) return undefined;
    const count = turnOptions.length;
    const perRow = Math.max(
      1,
      Math.floor(
        (turnWidth - TRACK_CHROME_PX + SEGMENT_GAP_PX) /
          (TURN_MIN_PX[size] + SEGMENT_GAP_PX)
      )
    );
    if (count <= perRow) return undefined;
    return Math.ceil(count / Math.ceil(count / perRow));
  });

  function selectTurn(value: string): void {
    onchangeTurnCount(value === FLOAT_VALUE ? -0.5 : Number(value));
  }
</script>

<div class="motion-settings" class:stacked class:direction-only={!showTurns}>
  <div class="setting rotation-setting">
    {#if showDirectionLabel}
      <span class="setting-label">{labels.direction}</span>
    {/if}
    <SegmentedControl
      options={rotationOptions}
      value={rotationDirection}
      onchange={onchangeRotationDirection}
      {size}
      density={size === "phone" ? "tight" : "standard"}
      color="accent"
      ariaLabel={labels.direction}
    />
  </div>
  {#if showTurns}
    <div class="setting turn-setting" bind:clientWidth={turnWidth}>
      <span class="setting-label">{labels.turns}</span>
      <SegmentedControl
        options={turnOptions}
        value={turnValue}
        onchange={selectTurn}
        {size}
        density={fitTurns ? "tight" : "standard"}
        columns={turnColumns}
        color="accent"
        ariaLabel={labels.turns}
      />
    </div>
  {/if}
</div>

<style>
  .motion-settings {
    display: flex;
    align-items: end;
    gap: var(--settings-spacing-sm, 8px);
    width: 100%;
    min-width: 0;
  }

  .motion-settings.stacked {
    align-items: stretch;
    flex-direction: column;
  }

  .setting {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .rotation-setting {
    flex: 0 0 var(--builder-direction-width, 126px);
  }

  /* A long direction name takes two lines inside its segment. */
  .rotation-setting :global(.segment) {
    line-height: 1.15;
  }

  .direction-only .rotation-setting {
    flex: 1 1 auto;
  }

  .turn-setting {
    flex: 1 1 410px;
  }

  .setting-label {
    padding-left: var(--builder-label-inset, 4px);
    color: var(
      --assemble-text-secondary,
      color-mix(in srgb, var(--theme-text, #fff) 84%, transparent)
    );
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .stacked .rotation-setting,
  .stacked .turn-setting {
    flex-basis: auto;
  }
</style>
