<script lang="ts">
  /**
   * AdminTwoPanelLayout
   *
   * Responsive two-panel layout for list + detail views.
   * Detail panel placement matches the app's navigation layout:
   * - When sidebar is visible (desktop or landscape mobile) → drawer from right
   * - When bottom nav is visible → drawer from bottom
   *
   * Uses fine-grained reactivity:
   * - `hasSelection` prop controls whether drawer should be open
   * - `onClose` callback notifies parent when drawer is dismissed
   * - Local `drawerOpen` state tracks actual drawer visibility
   *
   * @example
   * <AdminTwoPanelLayout
   *   hasSelection={selectedItem !== null}
   *   onClose={() => selectedItem = null}
   * >
   *   {#snippet list()}...{/snippet}
   *   {#snippet detail()}...{/snippet}
   * </AdminTwoPanelLayout>
   */

  import { getDeviceDetector } from "#lib/shared/device/get-device-detector.js";
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import type { DeviceDetector } from '#lib/shared/device/services/device-detector.js'
  import type { ResponsiveSettings } from "../../device/domain/models/device-models";
  import { desktopSidebarState } from "../../layout/desktop-sidebar-state.svelte";
  import { ADMIN_SPACING } from "../styles/admin-theme";
  import Drawer from "../../foundation/ui/Drawer.svelte";

  interface AdminTwoPanelLayoutProps {
    hasSelection?: boolean;
    listWidth?: string;
    gap?: string;
    class?: string;
    list: Snippet;
    detail?: Snippet;
    onClose?: () => void;
  }

  let {
    hasSelection = false,
    listWidth = "400px",
    gap = ADMIN_SPACING.lg,
    class: className = "",
    list,
    detail,
    onClose,
  }: AdminTwoPanelLayoutProps = $props();

  // Local drawer state - synced with hasSelection prop
  let drawerOpen = $state(false);

  // Responsive settings from DeviceDetector
  let responsiveSettings = $state<ResponsiveSettings | null>(null);

  // Landscape mobile detection (phone rotated sideways)
  const isLandscapeMobile = $derived(
    responsiveSettings?.isLandscapeMobile ?? false
  );

  // Desktop sidebar visibility (wide desktop screens)
  const hasDesktopSidebar = $derived(desktopSidebarState.isVisible);

  // Drawer should come from RIGHT when any sidebar is showing:
  // - Desktop sidebar (wide screens with sidebar)
  // - Landscape mobile side nav (phone rotated)
  // Otherwise, drawer comes from BOTTOM (bottom nav is showing)
  const useSideDrawer = $derived(hasDesktopSidebar || isLandscapeMobile);
  const drawerPlacement = $derived(useSideDrawer ? "right" : "bottom");

  // Setup DeviceDetector listener
  onMount(() => {
    let deviceDetector: DeviceDetector | null = null;
    let cleanup: (() => void) | undefined;

    try {
      deviceDetector = getDeviceDetector();
      if (deviceDetector) {
        responsiveSettings = deviceDetector.getResponsiveSettings();

        cleanup = deviceDetector.onCapabilitiesChanged(() => {
          responsiveSettings = deviceDetector!.getResponsiveSettings();
        });
      }
    } catch (error) {
      console.warn(
        "AdminTwoPanelLayout: Failed to resolve DeviceDetector",
        error
      );
    }

    return () => cleanup?.();
  });

  // Sync drawer open state with hasSelection prop
  $effect(() => {
    drawerOpen = hasSelection;
  });

  // Handle drawer close from user interaction (backdrop, escape, swipe)
  function handleDrawerClose() {
    drawerOpen = false;
    // Notify parent to clear selection
    onClose?.();
  }
</script>

<div
  class="admin-two-panel-layout {className}"
  style="--list-width: {listWidth}; --gap: {gap}"
>
  <div class="list-panel themed-scrollbar">{@render list()}</div>
</div>

<Drawer
  bind:isOpen={drawerOpen}
  placement={drawerPlacement}
  showHandle={true}
  closeOnBackdrop={true}
  closeOnEscape={true}
  class="admin-detail-drawer {useSideDrawer ? 'side' : 'bottom'}"
  backdropClass="admin-detail-backdrop"
  onclose={handleDrawerClose}
  trapFocus={false}
  preventScroll={false}
>
  {@render detail?.()}
</Drawer>

<style>
  .admin-two-panel-layout {
    display: flex;
    gap: var(--gap);
    height: 100%;
    width: 100%;
    flex: 1;
    overflow: hidden;
  }

  .list-panel {
    flex: 1 1 auto;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Drawer customization - Side drawer (desktop sidebar or landscape mobile) */
  :global(.admin-detail-drawer.side) {
    --sheet-width: min(560px, 90vw);
    --sheet-bg: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    --sheet-filter: none;
  }

  /* Drawer customization - Bottom sheet (when bottom nav is showing) */
  :global(.admin-detail-drawer.bottom) {
    --sheet-height: 85vh;
    --sheet-bg: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    --sheet-filter: none;
    border-radius: 20px 20px 0 0;
  }

  :global(.admin-detail-backdrop) {
    background: var(--backdrop-light, rgba(0, 0, 0, 0.4));
  }
</style>
