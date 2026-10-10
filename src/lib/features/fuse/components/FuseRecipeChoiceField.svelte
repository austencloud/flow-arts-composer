<script lang="ts" generics="T extends string">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  type ChoiceOption = {
    value: T;
    label: string;
    shortLabel?: string;
    ariaLabel?: string;
    disabled?: boolean;
  };

  let {
    title,
    options,
    value,
    onchange,
    ariaLabel,
  }: {
    title: string;
    options: ChoiceOption[];
    value: T;
    onchange: (value: T) => void;
    ariaLabel: string;
  } = $props();
</script>

<section class="recipe-field" aria-label={title}>
  <span class="field-label">{title}</span>
  <SegmentedControl
    {options}
    {value}
    {onchange}
    color="accent"
    size="md"
    {ariaLabel}
    semantics="radiogroup"
  />
</section>

<style>
  .recipe-field {
    display: grid;
    align-content: center;
    gap: var(--settings-spacing-sm, 8px);
    min-width: 0;
    padding: clamp(10px, 2cqh, 16px);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-md, 12px);
  }

  .field-label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  :global(.recipe-field .segmented-control) {
    width: 100%;
    min-height: var(--min-touch-target, 44px);
  }

  :global(.recipe-field .segment) {
    min-width: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 750;
  }
</style>
