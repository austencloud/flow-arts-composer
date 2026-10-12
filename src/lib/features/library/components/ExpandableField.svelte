<!--
  ExpandableField.svelte

  A collapsible field that starts as a chip button and expands
  to show the full input when clicked. Used for optional form fields.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

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
  }

  let { label, expanded, onExpandedChange, onCollapse, children }: Props =
    $props();

  function handleExpand() {
    onExpandedChange(true);
  }

  function handleCollapse() {
    onCollapse?.();
    onExpandedChange(false);
  }
</script>

{#if !expanded}
  <button type="button" class="expand-chip" onclick={handleExpand}>
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

<style>
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
