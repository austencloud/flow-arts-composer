/**
 * Desktop Sidebar Visibility Service
 * Determines when the desktop navigation sidebar should be visible
 */

import type { DeviceDetector } from '#lib/shared/device/services/device-detector.js'
import type { ViewportManager } from '#lib/shared/device/services/viewport-manager.svelte.js'
import { BREAKPOINTS } from "../../device/domain/constants/device-constants";
import {
  desktopSidebarState,
  updateDesktopSidebarVisibility,
} from "../../layout/desktop-sidebar-state.svelte";

/**
 * Hook to manage desktop sidebar visibility based on device and viewport
 */
export function useDesktopSidebarVisibility(
  deviceDetector: DeviceDetector,
  viewportService: ViewportManager
) {
  // Subscribe to viewport changes
  const unsubscribe = viewportService.onViewportChange(() => {
    updateVisibility();
  });

  // Initial update
  updateVisibility();

  function updateVisibility() {
    const isDesktop = deviceDetector.isDesktop();
    const viewportWidth = viewportService.width;

    // Check if we're in a module that uses side-by-side layout
    // For now, we'll use viewport width as a proxy
    // In the Create module, this would be determined by CreateModuleLayoutManager
    const isSideBySideLayout = viewportWidth >= BREAKPOINTS.DESKTOP;

    updateDesktopSidebarVisibility(
      isDesktop,
      viewportWidth,
      isSideBySideLayout
    );
  }

  return {
    get isVisible() {
      return desktopSidebarState.isVisible;
    },
    cleanup: unsubscribe,
  };
}
