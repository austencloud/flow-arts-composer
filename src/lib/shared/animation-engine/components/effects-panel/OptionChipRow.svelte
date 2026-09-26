<script lang="ts" generics="T extends string">
  import { effectUiLabel } from "./effect-ui-label";
  /**
   * OptionChipRow — single-select chip row for effect-customize panels.
   *
   * The shared replacement for the `.option-row` markup that used to be copy-
   * pasted into every `*Customize.svelte`. A row label sits above a wrapping
   * group of `role="radio"` chips (exactly one active). Each option may carry a
   * leading FontAwesome icon or a color swatch dot (palette rows). The chip
   * never shrinks below its own text, so long labels ("Prop-Matched") wrap as
   * whole chips instead of overflowing the button box.
   *
   * Not SegmentedControl: that primitive keeps every segment equal-width, which
   * becomes unreadable for a large set of variable-length labels. These chips
   * keep their words intact and wrap instead.
   */
  interface Option {
    value: T;
    label: string;
    /** Optional consequence shown by the tile layout. */
    description?: string;
    /** FontAwesome class without the leading "fas", e.g. "fa-ruler". */
    icon?: string;
    /** CSS color for a leading swatch dot (palette rows). */
    swatch?: string;
  }

  interface Props {
    /** Row label shown above the chip group. */
    label: string;
    /** radiogroup aria-label; defaults to the row label. */
    ariaLabel?: string;
    options: readonly Option[];
    value: T;
    onChange: (value: T) => void;
    /** Selected border/fill color. Defaults to the current theme accent. */
    color?: string;
    /** Prevent selection while the owning workflow is busy. */
    disabled?: boolean;
    /** Stack the label above the chips when the option set needs more room. */
    layout?: "inline" | "stacked";
  }

  const {
    label,
    ariaLabel,
    options,
    value,
    onChange,
    color = "var(--theme-accent, #8b5cf6)",
    disabled = false,
    layout = "inline",
  }: Props = $props();
</script>

<div
  class="option-row"
  class:stacked={layout === "stacked"}
  style:--option-accent={color}
>
  <span class="option-label">{effectUiLabel(label)}</span>
  <div
    class="chip-group"
    role="radiogroup"
    aria-label={effectUiLabel(ariaLabel ?? label)}
  >
    {#each options as option (option.value)}
      <button
        class="chip"
        class:swatch-chip={option.swatch != null}
        class:active={value === option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        {disabled}
        data-ghost={value === option.value || disabled ? undefined : "safe"}
        data-ghost-kind={value === option.value || disabled
          ? undefined
          : "effect-param"}
        data-ghost-label={effectUiLabel(option.label)}
        onclick={() => onChange(option.value)}
      >
        {#if option.swatch != null}
          <span
            class="swatch"
            style="background: {option.swatch}"
            aria-hidden="true"
          ></span>
        {:else if option.icon}
          <i class="fas {option.icon}" aria-hidden="true"></i>
        {/if}
        <span class="chip-copy">
          <span class="chip-label">{effectUiLabel(option.label)}</span>
          {#if option.description}
            <span class="chip-description"
              >{effectUiLabel(option.description)}</span
            >
          {/if}
        </span>
      </button>
    {/each}
  </div>
</div>

<style>
  /* Dense inline row: label sits BESIDE the chips (not stacked above), so a
     segmented control is one ~44px row instead of two. The chip group takes the
     remaining width and wraps only when it genuinely can't fit. */
  .option-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .option-label {
    flex: 0 0 auto;
    min-width: 3.25rem;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .chip-group {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip-copy {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .chip-label {
    min-width: 0;
  }

  .chip-description {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    line-height: 1.25;
  }

  .option-row.stacked {
    flex-direction: column;
    align-items: stretch;
  }

  .stacked .option-label {
    min-width: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }

  .chip {
    flex: 1 1 auto;
    min-width: max-content;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 10px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .chip:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .chip.active {
    background: color-mix(in srgb, var(--option-accent) 17%, transparent);
    border-color: var(--option-accent);
    color: var(--theme-text, white);
  }

  .chip:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .chip:focus-visible {
    outline: 2px solid var(--option-accent);
    outline-offset: 2px;
  }

  .chip i {
    font-size: var(--font-size-compact, 12px);
  }

  /* Palette swatch rows pack two-up so a 6-7 color list stays compact. */
  .swatch-chip {
    flex: 1 1 40%;
  }

  .swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  @media (prefers-reduced-motion: reduce) {
    .chip {
      transition: none;
    }
  }
</style>
