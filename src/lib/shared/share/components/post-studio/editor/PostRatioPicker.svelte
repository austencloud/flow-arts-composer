<script module lang="ts">
  export interface RatioOption<V extends string> {
    value: V;
    label: string;
    /** Width over height, drawn as an outline; the icon shows instead when absent. */
    ratio?: number;
    icon?: string;
    disabled?: boolean;
  }
</script>

<script lang="ts" generics="T extends string">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  /**
   * One shape picked from a few, each drawn as a small outline of itself
   * over its name: the post's canvas, or a clip's shape on the crop screen.
   */

  interface Props {
    options: RatioOption<T>[];
    /** Null when the current shape is none of the options. */
    value: T | null;
    onchange: (value: T) => void;
    ariaLabel: string;
    columns?: number;
  }

  let { options, value, onchange, ariaLabel, columns = 3 }: Props = $props();

  const byValue = $derived(new Map(options.map((option) => [option.value, option])));

  /** The outline fits a square this many rem across. */
  const GLYPH_REM = 1.125;
</script>

{#snippet content(pick: T)}
  {@const option = byValue.get(pick)}
  <span class="ratio-option">
    <span class="ratio-mark" aria-hidden="true">
      {#if option?.ratio}
        <span
          class="ratio-glyph"
          style:width="{option.ratio >= 1 ? GLYPH_REM : GLYPH_REM * option.ratio}rem"
          style:height="{option.ratio >= 1 ? GLYPH_REM / option.ratio : GLYPH_REM}rem"
        ></span>
      {:else if option?.icon}
        <i class="fa-solid {option.icon}"></i>
      {/if}
    </span>
    <span class="ratio-label">{option?.label}</span>
  </span>
{/snippet}

<div class="ratio-picker">
  <SegmentedControl
    color="accent"
    semantics="radiogroup"
    {columns}
    options={options.map((option) => ({
      value: option.value,
      label: option.label,
      disabled: option.disabled,
    }))}
    value={value ?? ("" as T)}
    {onchange}
    {ariaLabel}
    optionContent={content}
  />
</div>

<style>
  .ratio-picker :global(.segment) {
    min-height: 3.5rem;
  }

  .ratio-option {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
  }

  .ratio-mark {
    display: grid;
    place-items: center;
    width: 1.25rem;
    height: 1.25rem;
    font-size: 0.875rem;
  }

  .ratio-glyph {
    box-sizing: border-box;
    border: 2px solid currentColor;
    border-radius: 2px;
  }

  .ratio-label {
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }
</style>
