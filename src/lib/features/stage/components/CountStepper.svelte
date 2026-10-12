<script lang="ts">
  /**
   * Inline minus / value / plus row for the Stage sidebar.
   *
   * Not `StepperCard`: that one is a grid-cell card with ripple, haptics and
   * portrait/landscape layouts, built for the generator's parameter grid. This
   * is a row inside a properties panel. The Stage had grown two copies of this
   * markup (mark beats, performer count) before it was given an owner.
   */
  interface Props {
    value: number;
    min: number;
    max: number;
    onchange: (value: number) => void;
    /** Names what is being counted, for the ± buttons' accessible names. */
    label: string;
    step?: number;
  }

  let { value, min, max, onchange, label, step = 1 }: Props = $props();
</script>

<div class="count-stepper">
  <button
    type="button"
    class="count-btn"
    onclick={() => onchange(value - step)}
    disabled={value <= min}
    aria-label="Decrease {label}"
  >
    <i class="fas fa-minus" aria-hidden="true"></i>
  </button>
  <span class="count-value" aria-live="polite">{value}</span>
  <button
    type="button"
    class="count-btn"
    onclick={() => onchange(value + step)}
    disabled={value >= max}
    aria-label="Increase {label}"
  >
    <i class="fas fa-plus" aria-hidden="true"></i>
  </button>
</div>

<style>
  .count-stepper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .count-btn {
    display: flex;
    width: 2.75rem;
    height: 2.75rem;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    font-size: 0.75rem;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
  }

  .count-btn:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
  }

  .count-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .count-value {
    min-width: 2ch;
    color: var(--theme-text, white);
    font-size: 1.1rem;
    font-weight: 700;
    /* The value changes under the buttons, so the digits must not resize. */
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .count-btn {
      transition: none;
    }
  }
</style>
