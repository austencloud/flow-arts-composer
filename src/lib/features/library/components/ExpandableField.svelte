<!--
  ExpandableField.svelte

  A collapsible field that starts as a chip button and expands
  to show the full input when clicked. Used for optional form fields.
  The chip and the field trade places in one box that eases its height.
-->
<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import { Crossfade, motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  interface Props {
    /** Label shown on the chip and field header */
    label: string;
    /** Whether the field is currently expanded */
    expanded: boolean;
    /** Called when expand state changes */
    onExpandedChange: (expanded: boolean) => void;
    /** Called when field is collapsed (to reset value) */
    onCollapse?: () => void;
    /** Content to render when expanded */
    children: Snippet;
    /**
     * Span the row as a dashed add-row, like the card rows around it,
     * instead of sizing the chip to its label.
     */
    fill?: boolean;
  }

  let {
    label,
    expanded,
    onExpandedChange,
    onCollapse,
    children,
    fill = false,
  }: Props = $props();

  let root: HTMLElement | null = null;

  async function handleExpand() {
    onExpandedChange(true);
    // Crossfade hands focus to the first control (the remove button); the
    // input is what the press was for. preventScroll: the browser would jump
    // the panel to the field's full height before the box has grown into it.
    await tick();
    root
      ?.querySelector<HTMLElement>(
        ".expandable-field textarea, .expandable-field input"
      )
      ?.focus({ preventScroll: true });
    followIntoView();
  }

  function scrollParent(node: HTMLElement): HTMLElement | null {
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
    }
    return null;
  }

  /**
   * At the foot of a scrolling panel (the save view on a phone) the field
   * would open out of sight. Scroll with the box each frame while it eases,
   * so the field rises into view on the same clock instead of jumping there.
   */
  function followIntoView() {
    const node = root;
    const scroller = node && scrollParent(node);
    if (!node || !scroller) return;
    const end = performance.now() + motionDuration(DURATION.normal) + 50;
    const follow = () => {
      const view = scroller.getBoundingClientRect();
      const padBottom = parseFloat(getComputedStyle(scroller).paddingBottom);
      const rect = node.getBoundingClientRect();
      const below = rect.bottom - (view.bottom - padBottom);
      // Never scroll the field's own top out of view to reveal its bottom.
      const shift = Math.min(below, rect.top - view.top);
      if (shift > 0.5) scroller.scrollTop += shift;
      if (performance.now() < end) requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
  }

  function handleCollapse() {
    onCollapse?.();
    onExpandedChange(false);
  }
</script>

<div class="expandable" bind:this={root}>
  <Crossfade key={expanded} animateHeight>
    {#if !expanded}
      <button
        type="button"
        class="expand-chip"
        class:fill
        onclick={handleExpand}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        Add {label}
      </button>
    {:else}
      <div class="expandable-field">
        <div class="field-header">
          <span class="field-label">{label}</span>
          <button
            type="button"
            class="collapse-btn"
            onclick={handleCollapse}
            aria-label="Remove {label.toLowerCase()}"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
        {@render children()}
      </div>
    {/if}
  </Crossfade>
</div>

<style>
  .expandable {
    width: 100%;
  }

  .expand-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    min-height: var(--min-touch-target);
    background: transparent;
    border: 1.5px dashed var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    border-radius: 24px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-base, 16px);
    cursor: pointer;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
  }

  .expand-chip.fill {
    display: flex;
    width: 100%;
    padding: 12px 16px;
    border-radius: 12px;
  }

  .expand-chip:hover {
    border-color: color-mix(in srgb, var(--theme-text, #fff) 40%, transparent);
    color: var(--theme-text);
    background: var(--theme-card-bg);
  }

  .expand-chip i {
    font-size: var(--font-size-base, 16px);
  }

  .expandable-field {
    width: 100%;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    margin-top: 4px;
  }

  .field-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .field-label {
    font-size: var(--font-size-base, 16px);
    font-weight: 600;
    color: var(--theme-text);
  }

  .collapse-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: var(--theme-text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
  }

  .collapse-btn:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text);
  }
</style>
