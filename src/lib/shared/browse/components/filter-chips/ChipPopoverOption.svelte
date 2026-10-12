<!--
  ChipPopoverOption.svelte

  One row of a FilterChipBase dropdown. Every chip that opens a list of choices
  renders these, so the list behaves the same wherever it appears.

  It exists because four chips had each written the row themselves and all four
  had the same bug: a bare `:hover` rule outranks `.selected` on specificity, so
  running the mouse down the list repainted the chosen row in the ordinary text
  colour. The one row you most need to see while choosing was the one row that
  disappeared under the cursor. Hovering the selection now tints it instead.

  The tick is always in the layout — hidden, not absent — so the labels hold
  their place as the selection moves.
-->
<script lang="ts">
  import { Icon, type IconDefinition } from "@austencloud/video-editor/icons";

  interface Props {
    label: string;
    selected?: boolean;
    /** Contextual match count, rendered dimmed after the label. */
    count?: number | null;
    /** FontAwesome class, or an icon definition from the video editor package, for a leading glyph (LOOP's per-component marks). */
    icon?: string | IconDefinition;
    /**
     * Overrides the accent for this one row. Options that carry their own
     * identity colour (LOOP components) pass it here; everything else inherits
     * `--chip-option-color` from the chip wrapper.
     */
    color?: string;
    /** Opt in to the attract presenter being able to press this row. */
    ghostKind?: string;
    onclick: () => void;
  }

  let {
    label,
    selected = false,
    count = null,
    icon,
    color,
    ghostKind,
    onclick,
  }: Props = $props();
</script>

<button
  class="chip-popover-option"
  class:selected
  style={color ? `--chip-option-color: ${color};` : undefined}
  type="button"
  role="option"
  aria-selected={selected}
  data-ghost={ghostKind ? "safe" : undefined}
  data-ghost-kind={ghostKind}
  data-ghost-label={ghostKind ? label : undefined}
  {onclick}
>
  <i class="opt-tick fas fa-check" aria-hidden="true"></i>
  {#if icon}
    {#if typeof icon === "string"}
      <i class="opt-icon {icon}" aria-hidden="true"></i>
    {:else}
      <Icon {icon} class="opt-icon" />
    {/if}
  {/if}
  <span class="opt-label">{label}</span>
  {#if count != null}
    <span class="opt-count">({count})</span>
  {/if}
</button>

<style>
  .chip-popover-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 6px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text-dim);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  /* Reserved, never removed — a tick that appears and disappears shifts every
     label beside it each time the selection moves. */
  .opt-tick {
    flex: 0 0 1em;
    font-size: 10px;
    visibility: hidden;
    color: var(--chip-option-color, var(--theme-accent));
  }
  .chip-popover-option.selected .opt-tick {
    visibility: visible;
  }

  .opt-icon,
  .chip-popover-option :global(.opt-icon) {
    flex-shrink: 0;
    width: 16px;
    font-size: 13px;
    text-align: center;
    color: var(--chip-option-color, var(--theme-accent));
  }

  .opt-label {
    line-height: 1.2;
  }

  .opt-count {
    opacity: 0.6;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .chip-popover-option.selected {
    color: var(--chip-option-color, var(--theme-accent));
    font-weight: 600;
  }

  .chip-popover-option:hover,
  .chip-popover-option:focus-visible {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text);
  }

  /* Written after the plain hover rule and at a higher specificity, so the
     chosen row keeps its colour while the cursor is on it. */
  .chip-popover-option.selected:hover,
  .chip-popover-option.selected:focus-visible {
    background: color-mix(
      in srgb,
      var(--chip-option-color, var(--theme-accent)) 18%,
      transparent
    );
    color: var(--chip-option-color, var(--theme-accent));
  }

  .chip-popover-option:focus-visible {
    outline: 2px solid var(--chip-option-color, var(--theme-accent));
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .chip-popover-option {
      transition: none;
    }
  }
</style>
