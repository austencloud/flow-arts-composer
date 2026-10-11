<script lang="ts">
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  let {
    activeHand,
    leftCount,
    rightCount,
    disabled = false,
    onchange,
  }: {
    activeHand: HandSide;
    leftCount: number;
    rightCount: number;
    disabled?: boolean;
    onchange: (hand: HandSide) => void;
  } = $props();

  const options = $derived([
    {
      value: HandSide.LEFT,
      label: "Left",
      ariaLabel: `Left hand, ${leftCount} step${leftCount === 1 ? "" : "s"}`,
      tone: "blue" as const,
      disabled,
    },
    {
      value: HandSide.RIGHT,
      label: "Right",
      ariaLabel: `Right hand, ${rightCount} step${rightCount === 1 ? "" : "s"}`,
      tone: "red" as const,
      disabled,
    },
  ]);
</script>

{#snippet handOption(hand: HandSide)}
  {@const isLeft = hand === HandSide.LEFT}
  <span class="hand-option-content" class:left={isLeft} class:right={!isLeft}>
    <span class="hand-color-mark" aria-hidden="true"></span>
    {isLeft ? "Left hand" : "Right hand"}
  </span>
{/snippet}

<div class="hand-picker">
  <SegmentedControl
    {options}
    value={activeHand}
    {onchange}
    color="blue"
    semantics="radiogroup"
    ariaLabel="Active hand"
    optionContent={handOption}
  />
</div>

<style>
  .hand-picker {
    width: 100%;
    min-width: 0;
  }

  .hand-option-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    min-height: 40px;
    color: var(--theme-text-dim, #cbd5e1);
    font-size: var(--assemble-hand-label-size, 15px);
    font-weight: 600;
    white-space: nowrap;
  }

  .hand-color-mark {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
    background: var(--hand-color);
  }

  .hand-option-content.left {
    --hand-color: var(--prop-blue, #2e8bf0);
  }

  .hand-option-content.right {
    --hand-color: var(--prop-red, #ed1c24);
  }

  :global(.segment.selected) .hand-option-content {
    color: var(--theme-text, #ffffff);
  }

  .hand-picker :global(.indicator[data-tone="blue"]) {
    background: color-mix(in srgb, var(--prop-blue, #2e8bf0) 18%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--prop-blue, #2e8bf0) 55%, transparent);
  }

  .hand-picker :global(.indicator[data-tone="red"]) {
    background: color-mix(in srgb, var(--prop-red, #ed1c24) 18%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--prop-red, #ed1c24) 55%, transparent);
  }

  @container tool-panel (max-width: 520px) {
    .hand-option-content {
      min-height: 36px;
    }
  }
</style>
