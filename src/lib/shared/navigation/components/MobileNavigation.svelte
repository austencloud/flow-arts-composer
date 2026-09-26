<!-- Mobile Navigation - Responsive Bottom/Side Navigation Orchestrator -->
<!-- Automatically adapts between bottom (portrait) and side (landscape) layouts -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
  import type { ResponsiveSettings } from "../../device/domain/models/device-models";
  import { onMount } from "svelte";
  import type { Section, SectionHomeDestination } from "../domain/types";
  import BottomNavigation from "./layouts/BottomNavigation.svelte";
  import SideNavigation from "./layouts/SideNavigation.svelte";

  let {
    sections = [],
    currentSection,
    onSectionChange,
    sectionHome = null,
    onSectionHomeSelect,
    onModuleSwitcherTap,
    onLayoutChange,
    onHeightChange,
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
    onLayoutChange?: (isLandscape: boolean) => void;
    onHeightChange?: (height: number) => void;
    showModuleSwitcher?: boolean;
    isUIVisible?: boolean;
    onRevealNav?: () => void;
    isDashboard?: boolean;
    isEntryAnimating?: boolean;
  }>();

  // Services
  const localizedSections = $derived(
    sections.map((section) => ({
      ...section,
      label: t(section.labelKey),
      description: t(section.descKey),
    }))
  );

  let deviceDetector: DeviceDetector | null = null;

  // Responsive settings from DeviceDetector (single source of truth)
  let responsiveSettings = $state<ResponsiveSettings | null>(null);

  // Layout state - use DeviceDetector instead of duplicating logic
  let isLandscape = $derived(responsiveSettings?.isLandscapeMobile ?? false);

  // Notify parent when layout changes (reactive to isLandscape derived value)
  $effect(() => {
    // Notify parent of current layout state when it changes
    onLayoutChange?.(isLandscape);
    return undefined;
  });

  onMount(() => {
    // Resolve DeviceDetector service
    let deviceCleanup: (() => void) | undefined;
    try {
      deviceDetector = getDeviceDetector();

      if (deviceDetector) {
        // Get initial responsive settings
        responsiveSettings = deviceDetector.getResponsiveSettings();

        // Return cleanup function from onCapabilitiesChanged
        deviceCleanup = deviceDetector.onCapabilitiesChanged(() => {
          responsiveSettings = deviceDetector!.getResponsiveSettings();
        });
      }
    } catch (error) {
      console.warn("MobileNavigation: Failed to resolve DeviceDetector", error);
    }

    // Return cleanup function
    return () => {
      deviceCleanup?.();
    };
  });
</script>

{#if isLandscape}
  <SideNavigation
    sections={localizedSections}
    {currentSection}
    {onSectionChange}
    {sectionHome}
    {onSectionHomeSelect}
    {onModuleSwitcherTap}
    {showModuleSwitcher}
    {isUIVisible}
  />
{:else}
  <BottomNavigation
    sections={localizedSections}
    {currentSection}
    {onSectionChange}
    {sectionHome}
    {onSectionHomeSelect}
    {onModuleSwitcherTap}
    {onHeightChange}
    {showModuleSwitcher}
    {isUIVisible}
    {onRevealNav}
    {isDashboard}
    {isEntryAnimating}
  />
{/if}
