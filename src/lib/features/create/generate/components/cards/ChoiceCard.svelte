<script lang="ts" generics="T extends string">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import BaseCard from "./BaseCard.svelte";

  type ChoiceOption = {
    value: T;
    label: string;
    shortLabel?: string;
    ariaLabel?: string;
    disabled?: boolean;
    tone?: "blue" | "red" | "both" | "accent";
  };

  let {
    title,
    currentValue,
    options,
    value,
    onchange,
    color,
    shadowColor,
    accent = "accent",
    gridColumnSpan = 6,
    cardIndex = 0,
    headerFontSize = "9px",
    ariaLabel,
  } = $props<{
    title: string;
    currentValue: string;
    options: ChoiceOption[];
    value: T;
    onchange: (value: T) => void;
    color: string;
    shadowColor: string;
    accent?: "blue" | "red" | "accent";
    gridColumnSpan?: number;
    cardIndex?: number;
    headerFontSize?: string;
    ariaLabel: string;
  }>();
</script>

<BaseCard
  {title}
  {currentValue}
  {color}
  {shadowColor}
  clickable={false}
  {gridColumnSpan}
  {cardIndex}
  {headerFontSize}
  {ariaLabel}
>
  {#snippet children()}
    <div class="choice-control">
      <SegmentedControl
        {options}
        {value}
        {onchange}
        color={accent}
        size="md"
        {ariaLabel}
        semantics="radiogroup"
      />
    </div>
  {/snippet}
</BaseCard>

<style>
  .choice-control {
    position: relative;
    z-index: 2;
    width: 100%;
  }

  .choice-control :global(.segmented-control) {
    min-height: var(--min-touch-target);
    background: color-mix(in srgb, var(--theme-panel-bg) 72%, transparent);
    border-color: color-mix(in srgb, var(--theme-text) 24%, transparent);
  }

  .choice-control :global(.segment) {
    min-width: 0;
    font-weight: 750;
  }
</style>
