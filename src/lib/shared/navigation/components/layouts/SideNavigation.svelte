<!-- SideNavigation - Landscape/Side Navigation Layout -->
<script lang="ts">
  import type {
    Section,
    SectionHomeDestination,
  } from "#lib/shared/navigation/domain/types.js";
  import NavButton from "#lib/shared/navigation/components/buttons/NavButton.svelte";
  import ModuleSwitcherButton from "#lib/shared/navigation/components/buttons/ModuleSwitcherButton.svelte";
  import PropNavButton from "#lib/shared/navigation/components/buttons/PropNavButton.svelte";
  import { shouldHideUIForPanels } from "../../../application/state/animation-visibility-state.svelte";
  import {
    navigationState,
    MODULE_DEFINITIONS,
  } from "../../state/navigation-state.svelte";

  // Get current module color for themed navigation
  let moduleColor = $derived(() => {
    const currentModuleId = navigationState.currentModule;
    const moduleDefinition = MODULE_DEFINITIONS.find(
      (m) => m.id === currentModuleId
    );
    return moduleDefinition?.color ?? "#667eea"; // Default indigo
  });

  let {
    sections = [],
    currentSection = "",
    onSectionChange = () => {},
    sectionHome = null,
    onSectionHomeSelect = () => {},
    onModuleSwitcherTap = () => {},
    showModuleSwitcher = true,
    isUIVisible = true,
  } = $props<{
    sections: Section[];
    currentSection: string;
    onSectionChange?: (sectionId: string) => void;
    sectionHome?: SectionHomeDestination | null;
    onSectionHomeSelect?: () => void;
    onModuleSwitcherTap?: () => void;
    showModuleSwitcher?: boolean;
    isUIVisible?: boolean;
  }>();

  // Determine if navigation sections should be hidden (any modal panel open in side-by-side layout)
  let shouldHideNav = $derived(shouldHideUIForPanels());

  function handleSectionClick(section: Section) {
    if (!section.disabled) {
      onSectionChange(section.id);
    }
  }

</script>

<nav
  class="side-navigation"
  class:hidden={!isUIVisible}
  style="--module-color: {moduleColor()}"
>
  <!-- Module Switcher Button (Top) -->
  {#if showModuleSwitcher}
    <ModuleSwitcherButton onClick={onModuleSwitcherTap} />
  {/if}

  <!-- Current Module's Sections -->
  <div class="sections" class:hidden={shouldHideNav}>
    {#if sectionHome}
      <NavButton
        icon={sectionHome.icon}
        label={sectionHome.optionLabel ?? sectionHome.label}
        active={sectionHome.active}
        color={sectionHome.color || "var(--muted-foreground)"}
        gradient={sectionHome.gradient ||
          sectionHome.color ||
          "var(--muted-foreground)"}
        type="section"
        onClick={onSectionHomeSelect}
        ariaLabel={sectionHome.ariaLabel ?? sectionHome.label}
      />
    {/if}

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

  <!-- Prop Switcher (Bottom) -->
  <PropNavButton />
</nav>

<style>
  /* ============================================================================
     SIDE LAYOUT (Landscape Mobile)
     ============================================================================ */
  .side-navigation {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    /* iOS safe area - account for notch in landscape and home indicator */
    padding: max(8px, env(safe-area-inset-top, 0px)) 4px
      max(8px, env(safe-area-inset-bottom, 0px))
      max(4px, env(safe-area-inset-left, 0px));
    /* Module-colored background with subtle sheen */
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--module-color, #667eea) 12%, var(--theme-card-bg))
        0%,
      color-mix(
          in srgb,
          var(--module-color, #667eea) 6%,
          rgba(255, 255, 255, 0.04)
        )
        100%
    );
    backdrop-filter: var(--glass-backdrop-strong);
    /* Module-colored right border */
    border-right: 1px solid
      color-mix(
        in srgb,
        var(--module-color, #667eea) 30%,
        rgba(255, 255, 255, 0.15)
      );
    width: 72px;
    min-height: 100vh;
    z-index: var(--z-sticky);

    transition:
      transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      background 0.4s ease-out,
      border-color 0.4s ease-out;
  }

  /* Hidden state for side layout - slide left */
  .side-navigation.hidden {
    transform: translateX(-100%);
    opacity: 0;
    pointer-events: none;
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    justify-content: center;
    align-items: center;
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    /* Hide scrollbar but keep functionality */
    scrollbar-width: none;
    -ms-overflow-style: none;
    opacity: 1;
    transition: opacity var(--duration-emphasis) ease;
    pointer-events: auto;
  }

  .sections::-webkit-scrollbar {
    display: none;
  }

  /* Hidden state - fade to invisible while maintaining space */
  .sections.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .side-navigation :global(.nav-button.section) {
    padding: 8px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    width: var(--min-touch-target);
    flex: 0 0 auto;
  }

  /* Menu and Settings buttons - circular with visible background */
  .side-navigation :global(.nav-button.special) {
    flex: 0 0 auto !important;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    max-width: var(--min-touch-target);
    padding: 0;
    /* Glass background to make button clearly tappable */
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke);
    /* Ensure proper touch handling */
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    /* Create stacking context to prevent overlap issues */
    isolation: isolate;
    z-index: 1;
  }

  .side-navigation :global(.nav-button.special:hover) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .side-navigation :global(.nav-button.special.active) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    /* Override the section-style top border indicator */
    border-top: 1px solid var(--theme-stroke-strong);
    padding-top: 0;
  }

  /* Side layout - always hide labels (icon-only) */
  .side-navigation :global(.nav-label) {
    display: none !important;
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .side-navigation {
      background: rgba(0, 0, 0, 0.95);
      border-right: 2px solid white;
    }

    .side-navigation :global(.nav-button.active) {
      background: var(--theme-stroke-strong);
    }
  }
</style>
