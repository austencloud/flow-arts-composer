<script lang="ts">
  /**
   * AdvancedControls — the shared "Advanced" disclosure for effect tuning.
   *
   * The essentials of an effect (color, intensity, one or two character knobs)
   * stay visible; the deep params live behind this collapsed disclosure so the
   * tuning screen fits a phone tray without a long scroll. Extracted from the
   * inline advanced-toggle the 3D viewer (EffectsSettingsPanel) already shipped,
   * so both the 2D customize panels and the 3D popover disclose the same way.
   *
   * A hairline top rule reads it as a section divider. Reduced-motion collapses
   * the slide. The toggle button is always present, so opening only grows the
   * content below it (expected disclosure behavior, opt-in) — no sibling shift.
   */
  import type { Snippet } from "svelte";

  interface Props {
    /** Toggle label. Defaults to "Advanced". */
    label?: string;
    /** Optional count of hidden controls, shown as a dim badge. */
    count?: number;
    /** Start expanded. Defaults to collapsed. */
    open?: boolean;
    children: Snippet;
  }

  let { label = "Advanced", count, open = false, children }: Props = $props();

  let isOpen = $state(open);
</script>

<div class="advanced">
  <button
    type="button"
    class="advanced-toggle"
    class:open={isOpen}
    aria-expanded={isOpen}
    onclick={() => (isOpen = !isOpen)}
  >
    <i class="fas fa-chevron-down chevron" aria-hidden="true"></i>
    <span class="advanced-label">{label}</span>
    {#if count != null && count > 0}
      <span class="advanced-count">{count}</span>
    {/if}
  </button>
  {#if isOpen}
    <div class="advanced-body">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .advanced {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    padding-top: 10px;
    margin-top: 2px;
  }

  .advanced-toggle {
    align-self: stretch;
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 4px 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color var(--duration-fast) var(--ease-standard);
  }
  .advanced-toggle:hover {
    color: var(--theme-text, #fff);
  }
  .advanced-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .chevron {
    font-size: 0.7rem;
    transition: transform var(--duration-normal) var(--ease-spring);
  }
  .advanced-toggle.open .chevron {
    transform: rotate(180deg);
  }

  .advanced-label {
    flex: 0 0 auto;
  }

  /* Dim count badge — how many deep controls hide behind the fold. */
  .advanced-count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  .advanced-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: advanced-slide var(--duration-normal) var(--ease-standard-out);
  }

  @keyframes advanced-slide {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .advanced-toggle,
    .chevron {
      transition: none;
    }
    .advanced-body {
      animation: none;
    }
  }
</style>
