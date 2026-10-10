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
  }: {
    turnCount: number;
    rotationDirection: RotationDirection;
    onchangeTurnCount: (turnCount: number) => void;
    onchangeRotationDirection: (direction: RotationDirection) => void;
    stacked?: boolean;
    /** Numeric builder values; -0.5 is the builder's internal float token. */
    turnCounts?: readonly number[];
    showTurns?: boolean;
  } = $props();

  const FLOAT_VALUE = "float";
  const ROTATION_OPTIONS = [
    { value: RotationDirection.CLOCKWISE, label: "CW" },
    { value: RotationDirection.COUNTER_CLOCKWISE, label: "CCW" },
  ];

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
    ROTATION_OPTIONS.map((option) => ({
      ...option,
      disabled: turnCount === -0.5,
    }))
  );

  function selectTurn(value: string): void {
    onchangeTurnCount(value === FLOAT_VALUE ? -0.5 : Number(value));
  }
</script>

<div class="motion-settings" class:stacked class:direction-only={!showTurns}>
  <div class="setting rotation-setting">
    <span class="setting-label">Direction</span>
    <SegmentedControl
      options={rotationOptions}
      value={rotationDirection}
      onchange={onchangeRotationDirection}
      size="sm"
      color="accent"
    />
  </div>
  {#if showTurns}
    <div class="setting turn-setting">
      <span class="setting-label">Turns</span>
      <SegmentedControl
        options={turnOptions}
        value={turnValue}
        onchange={selectTurn}
        size="sm"
        color="accent"
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
    flex: 0 0 126px;
  }

  .direction-only .rotation-setting {
    flex: 1 1 auto;
  }

  .turn-setting {
    flex: 1 1 410px;
  }

  .setting-label {
    padding-left: 4px;
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
