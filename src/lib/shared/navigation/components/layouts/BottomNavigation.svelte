<!-- BottomNavigation - Portrait/Bottom Navigation Layout -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount } from "svelte";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type {
    Section,
    SectionHomeDestination,
  } from "#lib/shared/navigation/domain/types.js";
  import NavButton from "#lib/shared/navigation/components/buttons/NavButton.svelte";
  import ModuleSwitcherButton from "#lib/shared/navigation/components/buttons/ModuleSwitcherButton.svelte";
  import PropNavButton from "#lib/shared/navigation/components/buttons/PropNavButton.svelte";
  import TabOverflowSelector from "#lib/shared/navigation/components/TabOverflowSelector.svelte";
  import NetworkStatusIndicator from "../../../offline/components/NetworkStatusIndicator.svelte";
  import { shouldHideUIForPanels } from "../../../application/state/animation-visibility-state.svelte";
  import {
    navigationState,
    MODULE_DEFINITIONS,
  } from "../../state/navigation-state.svelte";
  import { sequencePanelManager } from "#lib/shared/browse/state/sequence-panel-state.svelte.js";
  import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import { adminToolbarState } from "#lib/shared/debug/state/admin-toolbar-state.svelte.js";

  // Module color no longer needed - using global theme system

  let {
    sections = [],
    currentSection = "",
    onSectionChange = () => {},
    sectionHome = null,
    onSectionHomeSelect = () => {},
    onModuleSwitcherTap = () => {},
    onHeightChange = () => {},
    showModuleSwitcher = true,
    isUIVisible = true,
    onRevealNav = () => {},
    isDashboard = false,
    isEntryAnimating = false,
  } = $props<{
    sections: Section[];
    currentSection: string;
    onSectionChange?: (sectionId: string) => void;
    sectionHome?: SectionHomeDestination | null;
    onSectionHomeSelect?: () => void;
    onModuleSwitcherTap?: () => void;
    onHeightChange?: (height: number) => void;
    showModuleSwitcher?: boolean;
    isUIVisible?: boolean;
    onRevealNav?: () => void;
    isDashboard?: boolean;
    isEntryAnimating?: boolean;
  }>();

  let navElement = $state<HTMLElement | null>(null);
  let peekHasAnimated = $state(false);
  let availableWidth = $state(0);
  let hapticService: HapticFeedback | undefined;

  // Calculate required width for all tabs
  // Layout: [ModuleSwitcher] [Tab1] [Tab2] [Tab3] [Tab4] [Prop]
  // Each element: 48px minimum touch target
  // Gaps: 8px between each element
  //
  // Fixed buttons on sides:
  // - Left: Module switcher (48px)
  // - Right: Prop button (48px)
  // - Gaps: 8px on each side of center area (16px total)
  // Total fixed: 48 + 48 + 16 = 112px
  //
  // Each tab needs: 48px min + 8px gap = 56px effective width
  const BUTTON_WIDTH = 56; // 48px touch target + 8px gap
  const FIXED_BUTTONS_WIDTH = 112; // Module switcher + inbox + gaps

  // Calculate required width - directly access sections.length for proper reactivity
  let requiredWidth = $derived(
    sections.length * BUTTON_WIDTH + FIXED_BUTTONS_WIDTH
  );

  // Create has too many peer methods for the bottom bar, so it always uses the
  // compact selector. The module home appears in that selector alongside the
  // methods, preserving the same hierarchy as desktop and the module drawer.
  let shouldUseOverflowSelector = $derived(
    sectionHome !== null ||
      (availableWidth > 0 && availableWidth < requiredWidth)
  );

  // The compact selector replaces the per-tab row, so the module's own name
  // disappears from the bar. Hand it to the popover as its heading.
  const currentModuleLabel = $derived.by(() => {
    const module = MODULE_DEFINITIONS.find(
      (module) => module.id === navigationState.currentModule
    );
    return module ? t(module.labelKey) : "";
  });

  // Handle tap on peek indicator to reveal navigation
  function handlePeekTap() {
    onRevealNav();
  }

  // Trigger entrance animation once when peek becomes visible
  $effect(() => {
    if (!isUIVisible && !peekHasAnimated) {
      peekHasAnimated = true;
    } else if (isUIVisible) {
      peekHasAnimated = false;
    }
  });

  // Determine if navigation sections should be hidden (any modal panel open in side-by-side layout)
  let shouldHideNav = $derived(shouldHideUIForPanels());
  let shouldHideCenterSelector = $derived(
    shouldHideNav || sectionHome?.active === true
  );

  function handleSectionClick(section: Section) {
    if (!section.disabled) {
      onSectionChange(section.id);
    }
  }

  // Admin toolbar - accessible via long-press on module switcher for admins
  const isAdmin = $derived(featureFlagService.userRole === "admin");

  function handleModuleSwitcherLongPress() {
    if (isAdmin) {
      adminToolbarState.toggle();
    }
  }

  onMount(() => {
    try {
      hapticService = getHapticFeedback();
    } catch (error) {
      console.warn("BottomNavigation: Failed to resolve HapticFeedback", error);
    }

    // Set up ResizeObserver to measure navigation height and width
    let resizeObserver: ResizeObserver | null = null;
    if (navElement) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const height =
            entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
          const width =
            entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
          onHeightChange(height);
          availableWidth = width;
        }
      });
      resizeObserver.observe(navElement);

      // Report initial measurements
      const rect = navElement.getBoundingClientRect();
      if (rect.height > 0) {
        onHeightChange(rect.height);
      }
      if (rect.width > 0) {
        availableWidth = rect.width;
      }
    }

    // Return cleanup function
    return () => {
      resizeObserver?.disconnect();
    };
  });
</script>

<!-- Peek Indicator - Shows when nav is hidden AND no gallery panels are open -->
{#if !isUIVisible && !sequencePanelManager.isOpen}
  <button
    class="peek-indicator"
    class:animate-entrance={peekHasAnimated}
    onclick={handlePeekTap}
    aria-label={t("nav_ui_show_navigation")}
  >
    <i class="fas fa-chevron-up" aria-hidden="true"></i>
  </button>
{/if}

<nav
  class="bottom-navigation"
  class:hidden={!isUIVisible}
  class:floating={isDashboard}
  class:entry-animating={isEntryAnimating}
  bind:this={navElement}
>
  <!-- Left side: Module Switcher -->
  <div class="left-buttons">
    <!-- Module Switcher Button - now shown even in settings for consistent home/back affordance -->
    <!-- Long-press opens admin toolbar for admins -->
    {#if showModuleSwitcher}
      <ModuleSwitcherButton
        onClick={onModuleSwitcherTap}
        onLongPress={handleModuleSwitcherLongPress}
      />
    {/if}
  </div>

  <!-- Network Status Indicator (mobile) - positioned absolutely to not affect layout -->
  <div class="network-status-overlay">
    <NetworkStatusIndicator variant="mobile" />
  </div>

  <!-- Current Module's Sections - Use overflow selector for modules with >4 tabs -->
  {#if shouldUseOverflowSelector}
    <div
      class="sections-overflow"
      class:hidden={shouldHideCenterSelector}
      inert={shouldHideCenterSelector || undefined}
      aria-hidden={shouldHideCenterSelector ? "true" : undefined}
    >
      <TabOverflowSelector
        {sections}
        {currentSection}
        {onSectionChange}
        {sectionHome}
        {onSectionHomeSelect}
        selectorLabel={sectionHome
          ? t("nav_choose_method")
          : t("nav_select_tab")}
        moduleLabel={currentModuleLabel}
      />
    </div>
  {:else}
    <div class="sections" class:hidden={shouldHideNav}>
      {#each sections as section}
        <NavButton
          icon={section.icon}
          label={section.label}
          active={sectionHome?.active !== true && currentSection === section.id}
          disabled={section.disabled}
          color={section.color || "var(--muted-foreground)"}
          gradient={section.gradient ||
            section.color ||
            "var(--muted-foreground)"}
          type="section"
          onClick={() => handleSectionClick(section)}
          ariaLabel={section.label}
        />
      {/each}
    </div>
  {/if}

  <!-- Right side button - Prop Switcher -->
  <div class="right-buttons">
    <PropNavButton />
  </div>
</nav>

<style>
  /* ============================================================================
     DESIGN TOKENS - Single source of truth for layout values
     ============================================================================ */
  .bottom-navigation {
    /* Layout tokens */
    --nav-gap: 8px; /* Minimum 8px for touch target spacing (Material 3) */
    --nav-padding: 10px;
    --nav-min-height: 64px;

    /* Button tokens */
    --section-button-min: 48px;
    --section-button-max: 72px;

    /* Typography tokens */
    --label-size-full: 10px;
    --label-size-compact: 10px;
    --icon-size-default: 20px;
    --icon-size-large: 22px;

    /* Timing */
    --transition-smooth: var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* ============================================================================
     BOTTOM LAYOUT (Portrait Mobile)
     ============================================================================ */
  .bottom-navigation {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--nav-gap);

    /* Use global theme system for consistent navigation appearance */
    background: var(--theme-panel-bg);

    /* Subtle top edge with theme stroke */
    border-top: 1px solid var(--theme-stroke, var(--theme-stroke));
    box-shadow:
      0 -1px 0 0 hsl(0 0% 0% / 0.3),
      inset 0 1px 0 0 hsl(0 0% 100% / 0.05);

    /* Container queries for responsive behavior */
    container-type: inline-size;
    container-name: bottom-nav;

    /* Exclude from view transitions */
    view-transition-name: none;
    z-index: var(--z-sticky);

    /* iOS safe area - push content above home indicator on iPhones */
    padding-bottom: env(safe-area-inset-bottom, 0px);

    transition:
      transform var(--transition-smooth),
      opacity var(--transition-smooth),
      background 0.4s ease-out,
      border-color 0.4s ease-out;
  }

  /* Hidden state - consistent positioning, only transform/opacity change */
  .bottom-navigation.hidden {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    transform: translateY(100%);
    opacity: 0;
    pointer-events: none;
  }

  /* ============================================================================
     FLOATING MODE (Dashboard) - Transparent, fixed position with floating buttons
     ============================================================================ */
  .bottom-navigation.floating {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: transparent;
    border-top: none;
    box-shadow: none;
    padding-bottom: max(10px, env(safe-area-inset-bottom));
    pointer-events: none; /* Let clicks pass through the bar itself */
  }

  /* Re-enable pointer events on interactive children */
  .bottom-navigation.floating :global(.nav-button),
  .bottom-navigation.floating :global(.menu-button) {
    pointer-events: auto;
  }

  /* Give floating buttons a subtle backdrop for visibility */
  .bottom-navigation.floating :global(.nav-button.special),
  .bottom-navigation.floating :global(.menu-button) {
    background: hsl(0 0% 0% / 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow:
      0 4px 12px hsl(0 0% 0% / 0.4),
      0 0 0 1px hsl(0 0% 100% / 0.05);
  }

  .bottom-navigation.floating :global(.nav-button.special),
  .bottom-navigation.floating :global(.menu-button) {
    border-color: hsl(0 0% 100% / 0.15);
  }

  .sections {
    display: flex;
    flex-direction: row;
    gap: var(--nav-gap);
    flex: 1 1 0%;
    justify-content: center;
    align-items: center;
    min-width: 0;
    /* Leave room for module switcher (48px) + settings/back (48px) + gaps (16px) = 112px */
    max-width: calc(100% - 112px);
    opacity: 1;
    transition: opacity var(--transition-smooth);
    pointer-events: auto;
    overflow: visible;
  }

  .sections.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .sections-overflow {
    display: flex;
    flex-direction: row;
    flex: 1 1 0%;
    justify-content: center;
    align-items: center;
    min-width: 0;
    /* Leave room for module switcher (48px) + settings/back (48px) + gaps (16px) = 112px */
    max-width: calc(100% - 112px);
    opacity: 1;
    transition: opacity var(--transition-smooth);
    pointer-events: auto;
  }

  .sections-overflow.hidden {
    opacity: 0;
    pointer-events: none;
  }

  /* ============================================================================
     LEFT BUTTONS CONTAINER (Module Switcher)
     ============================================================================ */
  .left-buttons {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  /* ============================================================================
     NETWORK STATUS OVERLAY - Positioned absolutely to not affect nav layout
     ============================================================================ */
  .network-status-overlay {
    position: absolute;
    left: 56px; /* Position after module switcher (48px + 8px gap) */
    top: 50%;
    transform: translateY(-50%);
    z-index: calc(var(--z-sticky) + 1); /* Above navigation but below modals */
    pointer-events: none; /* Let clicks pass through to navigation */
  }

  /* Re-enable pointer events on the indicator itself */
  .network-status-overlay :global(.network-status) {
    pointer-events: auto;
  }

  /* ============================================================================
     RIGHT BUTTONS CONTAINER (Prop Switcher)
     ============================================================================ */
  .right-buttons {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  /* ============================================================================
     BUTTON SIZING - Clean specificity, no !important
     ============================================================================ */

  /* Section buttons (tabs) */
  .bottom-navigation :global(.nav-button.section) {
    padding: 6px;
    min-width: var(--section-button-min);
    min-height: var(--section-button-min);
    flex: 1 1 auto;
    max-width: var(--section-button-max);
    border-radius: 12px;
  }

  /* Special buttons (Settings) - using global theme accent */
  .bottom-navigation :global(.nav-button.special) {
    flex: 0 0 auto;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    padding: 0;
    background: transparent;
    /* Fallback #818cf8 (indigo-400) ensures visibility before theme loads */
    border: 1px solid var(--theme-accent, #818cf8);
    border-radius: 50%;
    box-shadow: 0 2px 8px hsl(0 0% 0% / 0.3);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      opacity 0.15s ease,
      transform 0.1s ease;
  }

  .bottom-navigation :global(.nav-button.special:hover) {
    opacity: 0.85;
  }

  .bottom-navigation :global(.nav-button.special:active) {
    transform: scale(0.95);
  }

  .bottom-navigation :global(.nav-button.special.active) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #818cf8) 15%,
      transparent
    );
  }

  /* No labels on special buttons - icon only */
  .bottom-navigation :global(.nav-button.special .nav-label-full),
  .bottom-navigation :global(.nav-button.special .nav-label-compact) {
    display: none;
  }

  /* Theme-colored gear icon */
  .bottom-navigation :global(.nav-button.special .nav-icon) {
    font-size: var(--font-size-xl);
  }

  .bottom-navigation :global(.nav-button.special .nav-icon i) {
    /* Fallback #818cf8 (indigo-400) ensures visibility before theme loads */
    color: var(--theme-accent, #818cf8);
    -webkit-text-fill-color: var(--theme-accent, #818cf8);
  }

  /* ============================================================================
     CONTAINER QUERIES - Responsive label behavior

     Breakpoints rationale:
     - 520px+: Full labels visible (tablets, large phones landscape)
     - 400-519px: Compact labels (most phones portrait)
     - <400px: Icons only (iPhone SE, small devices)

     These align with actual device widths accounting for nav padding.
     ============================================================================ */

  /* Full labels mode (520px+) */
  @container bottom-nav (min-width: 520px) {
    .bottom-navigation :global(.nav-label-full) {
      display: block;
    }

    .bottom-navigation :global(.nav-button.section) {
      max-width: 80px;
      gap: 3px;
    }

    .bottom-navigation :global(.nav-label) {
      font-size: var(--label-size-full);
    }
  }

  /* Compact labels mode (400-519px) */
  @container bottom-nav (min-width: 400px) and (max-width: 519px) {
    .bottom-navigation :global(.nav-label-compact) {
      display: block;
    }

    .bottom-navigation :global(.nav-button.section) {
      max-width: 64px;
      gap: 2px;
    }

    .bottom-navigation :global(.nav-label) {
      font-size: var(--label-size-compact);
    }
  }

  /* Icons only mode (<400px) - iPhone SE territory */
  @container bottom-nav (max-width: 399px) {
    .bottom-navigation :global(.nav-button.section) {
      max-width: var(--min-touch-target);
      padding: 6px 4px;
    }

    .bottom-navigation :global(.nav-icon) {
      font-size: var(--icon-size-large);
    }

    /* Both special buttons are already 50px round - no changes needed at small sizes */
  }

  /* Fallback for browsers without container query support */
  @supports not (container-type: inline-size) {
    @media (min-width: 520px) {
      .bottom-navigation :global(.nav-label-full) {
        display: block;
      }
    }

    @media (min-width: 400px) and (max-width: 519px) {
      .bottom-navigation :global(.nav-label-compact) {
        display: block;
      }

      .bottom-navigation :global(.nav-button.section) {
        max-width: 64px;
      }
    }

    @media (max-width: 399px) {
      .bottom-navigation :global(.nav-icon) {
        font-size: var(--font-size-xl);
      }
    }
  }

  .peek-indicator {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--min-touch-target);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: max(10px, env(safe-area-inset-bottom));
    /* Subtle gradient, not heavy-handed */
    background: linear-gradient(
      to top,
      hsl(0 0% 0% / 0.4) 0%,
      hsl(0 0% 0% / 0.1) 60%,
      transparent 100%
    );
    border: none;
    cursor: pointer;
    z-index: calc(var(--z-sticky) - 1);
    transition: background var(--duration-normal) ease;
  }

  .peek-indicator:hover {
    background: linear-gradient(
      to top,
      hsl(0 0% 0% / 0.5) 0%,
      hsl(0 0% 0% / 0.15) 60%,
      transparent 100%
    );
  }

  /* Focus state for keyboard navigation */
  .peek-indicator:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  .peek-indicator i {
    font-size: var(--font-size-sm);
    color: hsl(0 0% 100% / 0.5);
    opacity: 0;
    transform: translateY(8px);
  }

  /* Single entrance animation - plays once when indicator appears */
  .peek-indicator.animate-entrance i {
    animation: peek-entrance var(--duration-dramatic)
      cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  @keyframes peek-entrance {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .bottom-navigation {
      background: hsl(0 0% 5%);
      border-top: 2px solid white;
    }

    .bottom-navigation :global(.nav-button.active) {
      background: hsl(0 0% 100% / 0.25);
    }

    .bottom-navigation :global(.nav-button.special) {
      /* High contrast: add visible background */
      background: hsl(0 0% 10%);
    }

    .peek-indicator {
      background: linear-gradient(
        to top,
        hsl(0 0% 0% / 0.95) 0%,
        transparent 100%
      );
    }

    .peek-indicator i {
      color: white;
    }
  }

  /* ============================================================================
     ENTRY ANIMATION - Slide up from bottom after first-run wizard
     ============================================================================ */
  .bottom-navigation.entry-animating {
    animation: nav-slide-up 350ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both;
  }

  @keyframes nav-slide-up {
    from {
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .bottom-navigation,
    .sections,
    .sections-overflow,
    .peek-indicator {
      transition: none;
    }

    .peek-indicator.animate-entrance i {
      animation: none;
      opacity: 1;
      transform: translateY(0);
    }

    .bottom-navigation.entry-animating {
      animation: none;
    }
  }
</style>
