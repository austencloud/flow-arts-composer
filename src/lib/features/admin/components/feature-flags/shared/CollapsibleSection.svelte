<script lang="ts">
  /**
   * CollapsibleSection
   * Expandable/collapsible section for grouping content.
   *
   * Two modes:
   * - Uncontrolled (default): manages its own open state, seeded by `defaultOpen`.
   * - Controlled: pass `open` (boolean) + `onToggle`; the parent owns the state.
   */

  interface Props {
    title: string;
    icon?: string;
    iconColor?: string;
    count?: number;
    defaultOpen?: boolean;
    /** Controlled open state. When provided, overrides internal state. */
    open?: boolean;
    /** Called with the requested next open value when the header is clicked (controlled mode). */
    onToggle?: (next: boolean) => void;
    /** When true, draws a selection ring around the whole card (color from `iconColor`). */
    selected?: boolean;
    /** Optional action rendered in the header row (e.g. a copy button). */
    headerAction?: import("svelte").Snippet;
    children: import("svelte").Snippet;
  }

  let {
    title,
    icon,
    iconColor,
    count,
    defaultOpen = true,
    open = undefined,
    onToggle,
    selected = false,
    headerAction,
    children,
  }: Props = $props();

  let internalOpen = $state(true);
  $effect.pre(() => {
    internalOpen = defaultOpen;
  });

  const isControlled = $derived(open !== undefined);
  const isOpen = $derived(isControlled ? (open as boolean) : internalOpen);

  function handleClick() {
    const next = !isOpen;
    if (isControlled) {
      onToggle?.(next);
    } else {
      internalOpen = next;
    }
  }

  // Generate a stable ID from the title for aria-controls
  const sectionId = $derived(
    `section-${title.toLowerCase().replace(/\s+/g, "-")}`
  );
</script>

<div
  class="collapsible-section"
  class:open={isOpen}
  class:selected
  style={selected && iconColor ? `--ring-color: ${iconColor}` : undefined}
>
  <div class="section-header-row">
    <button
      type="button"
      class="section-header"
      onclick={handleClick}
      aria-expanded={isOpen}
      aria-controls={sectionId}
      aria-label="{isOpen ? 'Collapse' : 'Expand'} {title} section"
    >
      <div class="header-left">
        {#if icon}
          <span
            class="header-icon"
            style={iconColor ? `color: ${iconColor}` : ""}
          >
            <i class="fas {icon}" aria-hidden="true"></i>
          </span>
        {/if}
        <span class="header-title">{title}</span>
        {#if count !== undefined}
          <span class="header-count">{count}</span>
        {/if}
      </div>
    </button>

    {#if headerAction}
      <div class="header-action">{@render headerAction()}</div>
    {/if}

    <button
      type="button"
      class="chevron-btn"
      onclick={handleClick}
      tabindex="-1"
      aria-hidden="true"
    >
      <i class="fas fa-chevron-down chevron"></i>
    </button>
  </div>

  {#if isOpen}
    <div
      id={sectionId}
      class="section-content"
      role="region"
      aria-label="{title} content"
    >
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .collapsible-section {
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    overflow: hidden;
  }

  /* Selection ring wraps the whole card; the header/content padding already
     keeps text clear of the ring, so no extra inset is needed. */
  .collapsible-section.selected {
    box-shadow: 0 0 0 2px var(--ring-color, var(--theme-accent, #3b82f6));
  }

  .section-header-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .section-header {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    padding: 14px 16px;
    min-height: var(--min-touch-target); /* Accessibility: touch target */
    border: none;
    background: transparent;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-standard);
  }

  .section-header:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.04));
  }

  .header-action {
    display: flex;
    align-items: center;
    flex: none;
  }

  .chevron-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    padding: 0 14px;
    min-height: var(--min-touch-target);
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    background: currentColor;
    background: color-mix(in srgb, currentColor 15%, transparent);
    font-size: var(--font-size-sm, 14px);
  }

  .header-title {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
  }

  .header-count {
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
  }

  .chevron {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    transition: transform var(--duration-normal) var(--ease-standard);
  }

  .collapsible-section.open .chevron {
    transform: rotate(180deg);
  }

  .section-content {
    padding: 4px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
