<!--
  ExpandToggleButton.svelte

  Simple button to toggle expanded state in animation controls
-->
<script lang="ts">
  let {
    isExpanded = false,
    onToggle = () => {},
  }: {
    isExpanded?: boolean;
    onToggle?: () => void;
  } = $props();
</script>

<button
  class="expand-toggle-btn"
  class:expanded={isExpanded}
  onclick={onToggle}
  aria-label={isExpanded ? "Collapse controls" : "Expand controls"}
  type="button"
>
  <i
    class="fas {isExpanded ? 'fa-chevron-down' : 'fa-chevron-up'}"
    aria-hidden="true"
  ></i>
</button>

<style>
  .expand-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
  }

  .expand-toggle-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .expand-toggle-btn:active {
    transform: scale(0.96);
  }

  .expand-toggle-btn.expanded {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-accent);
  }

  .expand-toggle-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .expand-toggle-btn {
      transition: none;
    }
  }
</style>
