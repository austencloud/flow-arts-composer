<!-- TabOverflowSelector - 2026-ready tab overflow handler using Popover API -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type {
    Section,
    SectionHomeDestination,
  } from "#lib/shared/navigation/domain/types.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount } from "svelte";

  let {
    sections = [],
    currentSection = "",
    onSectionChange = () => {},
    sectionHome = null,
    onSectionHomeSelect = () => {},
    selectorLabel,
    moduleLabel = "",
  } = $props<{
    sections: Section[];
    currentSection: string;
    onSectionChange?: (sectionId: string) => void;
    sectionHome?: SectionHomeDestination | null;
    onSectionHomeSelect?: () => void;
    selectorLabel?: string;
    /**
     * The module these tabs belong to (e.g. "Create"). Shown as the popover's
     * heading so a compact layout still says WHERE the tab list came from —
     * on mobile the module name is otherwise nowhere on screen.
     */
    moduleLabel?: string;
  }>();

  let popoverElement: HTMLElement | null = null;
  let isOpen = $state(false);
  let hapticService: HapticFeedback | null = null;

  const currentDestination = $derived(
    sectionHome?.active
      ? sectionHome
      : sections.find((section: Section) => section.id === currentSection) ||
          sections[0]
  );

  function handleTriggerClick() {
    hapticService?.trigger("selection");
  }

  function closePopover() {
    if (popoverElement && typeof popoverElement.hidePopover === "function") {
      try {
        popoverElement.hidePopover();
      } catch {
        // The browser may have already closed it after the selection.
      }
    }
  }

  function handleHomeClick() {
    hapticService?.trigger("selection");
    onSectionHomeSelect();
    closePopover();
  }

  function handleSectionClick(section: Section) {
    if (!section.disabled) {
      hapticService?.trigger("selection");
      onSectionChange(section.id);
      closePopover();
    }
  }

  // Set up toggle event listener for chevron rotation
  onMount(() => {
    // Resolve haptic service
    hapticService = getHapticFeedback();

    const element = popoverElement;
    if (!element) return;

    const handleToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      isOpen = toggleEvent.newState === "open";
    };

    element.addEventListener("toggle", handleToggle);
    return () => {
      element.removeEventListener("toggle", handleToggle);
    };
  });
</script>

<!-- Compact Trigger Button - popovertarget handles clicks automatically -->
<button
  class="tab-picker-trigger"
  popovertarget="tab-overflow-popover"
  aria-label={`${currentDestination?.label ?? t("nav_select")}. ${selectorLabel ?? t("nav_select_tab")}`}
  aria-expanded={isOpen}
  aria-controls="tab-overflow-popover"
  onclick={handleTriggerClick}
  style="--current-section-color: {currentDestination?.color ||
    'var(--theme-accent)'}; --current-section-gradient: {currentDestination?.gradient ||
    currentDestination?.color ||
    'var(--theme-accent)'}"
>
  <span class="current-tab-icon">{@html currentDestination?.icon || ""}</span>
  <span class="current-tab-label"
    >{currentDestination?.label || t("nav_select")}</span
  >
  <i
    class="fas fa-chevron-down chevron"
    class:rotated={isOpen}
    aria-hidden="true"
  ></i>
</button>

<!-- Popover with all tabs -->
<div
  bind:this={popoverElement}
  id="tab-overflow-popover"
  popover="auto"
  class="tab-overflow-popover"
  aria-labelledby={moduleLabel ? "tab-overflow-popover-heading" : undefined}
>
  {#if moduleLabel}
    <h2 class="popover-heading" id="tab-overflow-popover-heading">
      {moduleLabel}
    </h2>
  {/if}

  <div class="tab-grid">
    {#if sectionHome}
      <button
        class="tab-option home-option"
        class:active={sectionHome.active}
        aria-current={sectionHome.active ? "page" : undefined}
        aria-label={sectionHome.ariaLabel ??
          sectionHome.optionLabel ??
          sectionHome.label}
        onclick={handleHomeClick}
        style="--section-color: {sectionHome.color ||
          'var(--theme-accent)'}; --section-gradient: {sectionHome.gradient ||
          sectionHome.color ||
          'var(--theme-accent)'}"
      >
        <span class="tab-icon">{@html sectionHome.icon}</span>
        <span class="tab-label"
          >{sectionHome.optionLabel ?? sectionHome.label}</span
        >
        {#if sectionHome.active}
          <i class="fas fa-check check-mark" aria-hidden="true"></i>
        {/if}
      </button>
    {/if}

    {#each sections as section}
      <button
        class="tab-option"
        class:active={sectionHome?.active !== true &&
          currentSection === section.id}
        class:disabled={section.disabled}
        disabled={section.disabled}
        aria-current={sectionHome?.active !== true &&
        currentSection === section.id
          ? "page"
          : undefined}
        onclick={() => handleSectionClick(section)}
        style="--section-color: {section.color ||
          'var(--theme-accent)'}; --section-gradient: {section.gradient ||
          section.color ||
          'var(--theme-accent)'}"
      >
        <span class="tab-icon">{@html section.icon}</span>
        <span class="tab-label">{section.label}</span>
        {#if sectionHome?.active !== true && currentSection === section.id}
          <i class="fas fa-check check-mark" aria-hidden="true"></i>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  /* ============================================================================
     TRIGGER BUTTON - Shows current tab, opens popover
     ============================================================================ */
  .tab-picker-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    min-height: var(--min-touch-target);
    flex: 1 1 0%;
    max-width: 240px;

    /* Use global theme system */
    background: color-mix(
      in srgb,
      var(--current-section-color) 12%,
      var(--theme-card-bg)
    );
    border: 1px solid
      color-mix(in srgb, var(--current-section-color) 38%, var(--theme-stroke));
    border-radius: 12px;

    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    letter-spacing: 0.01em;

    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;

    transition:
      background var(--transition-normal),
      border-color var(--transition-normal),
      transform var(--transition-fast);
  }

  .tab-picker-trigger:hover {
    background: color-mix(
      in srgb,
      var(--current-section-color) 18%,
      var(--theme-card-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--current-section-color) 58%,
      var(--theme-stroke)
    );
  }

  .tab-picker-trigger:active {
    transform: scale(0.98);
  }

  .current-tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-lg);
  }

  .current-tab-icon :global(i) {
    background: var(--current-section-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .current-tab-label {
    flex: 1 1 auto;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }

  .chevron {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.6;
    transition: transform var(--transition-normal);
  }

  .chevron.rotated {
    transform: rotate(180deg);
  }

  /* ============================================================================
     POPOVER - Native Popover API with 2026 styling
     Use :global() because popovers render in the top layer outside normal DOM
     ============================================================================ */
  :global(#tab-overflow-popover) {
    /* Fixed positioning at very bottom, covering bottom nav */
    position: fixed !important;
    inset: auto !important; /* Reset all inset properties */
    bottom: 0 !important; /* Flush with bottom edge */
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    transform: none;
    margin: 0 !important;

    /* Full width at bottom, like an action sheet */
    width: 100%;
    max-width: 100%;
    max-height: 60vh;
    overflow-y: auto;

    /* Use global theme system for elevated surface */
    background: var(--theme-panel-bg);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);

    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 16px 16px 0 0; /* Round top corners only */
    border-bottom: none; /* No border at bottom edge */
    padding: 16px 12px calc(12px + env(safe-area-inset-bottom, 0px)); /* Safe area for home indicator */

    /* Shadows for depth */
    box-shadow:
      0 8px 32px hsl(0 0% 0% / 0.4),
      0 2px 8px hsl(0 0% 0% / 0.2),
      inset 0 1px 0 0 hsl(0 0% 100% / 0.08);

    /* Smooth transitions using @starting-style */
    opacity: 1;
    scale: 1;
    transition:
      opacity var(--transition-emphasis),
      scale var(--transition-spring),
      overlay var(--transition-emphasis) allow-discrete,
      display var(--transition-emphasis) allow-discrete;
  }

  /* Starting style for smooth open animation - @starting-style is valid CSS */
  @starting-style {
    :global(#tab-overflow-popover:popover-open) {
      opacity: 0;
      scale: 0.95;
    }
  }

  /* Closing animation */
  :global(#tab-overflow-popover:not(:popover-open)) {
    opacity: 0;
    scale: 0.95;
  }

  .popover-heading {
    margin: 0 0 12px;
    padding: 0 4px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-muted, var(--theme-text));
    opacity: 0.75;
  }

  .tab-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 8px;
  }

  /* Single column for narrow popovers */
  @container (max-width: 300px) {
    .tab-grid {
      grid-template-columns: 1fr;
    }
  }

  .tab-option {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 16px 12px;
    min-height: 80px;

    background: color-mix(
      in srgb,
      var(--section-color) 8%,
      var(--theme-card-bg)
    );
    border: 1px solid
      color-mix(in srgb, var(--section-color) 24%, var(--theme-stroke));
    border-radius: 12px;

    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;

    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;

    transition:
      background var(--transition-normal),
      border-color var(--transition-normal),
      transform var(--transition-fast);
  }

  .tab-option:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--section-color) 14%,
      var(--theme-card-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--section-color) 48%,
      var(--theme-stroke)
    );
  }

  .tab-option:active:not(:disabled) {
    transform: scale(0.97);
  }

  .tab-option.active {
    background: color-mix(
      in srgb,
      var(--section-color) 20%,
      var(--theme-card-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--section-color) 62%,
      var(--theme-stroke)
    );
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--section-color) 25%, transparent),
      inset 0 1px 0 0 hsl(0 0% 100% / 0.1);
  }

  .tab-option.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-2xl);
  }

  .tab-icon :global(i) {
    background: var(--section-gradient, var(--section-color, #667eea));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .tab-label {
    text-align: center;
    line-height: 1.3;
  }

  .check-mark {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: var(--font-size-compact);
    color: var(--section-color);
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .tab-picker-trigger {
      background: hsl(0 0% 8%);
      border: 2px solid white;
    }

    .tab-overflow-popover {
      background: hsl(0 0% 5%);
      border: 2px solid white;
    }

    .tab-option {
      background: hsl(0 0% 8%);
      border: 1px solid white;
    }

    .tab-option.active {
      background: hsl(0 0% 15%);
      border: 2px solid white;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .tab-picker-trigger,
    .tab-overflow-popover,
    .tab-option,
    .chevron {
      transition: none;
    }

    /* @starting-style is valid CSS for entry animations */
    @starting-style {
      .tab-overflow-popover:popover-open {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  }

  /* Focus visible for keyboard navigation */
  .tab-picker-trigger:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .tab-option:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
</style>
