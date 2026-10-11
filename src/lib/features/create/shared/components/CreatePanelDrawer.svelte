<!--
  CreatePanelDrawer.svelte
  
  Centralized drawer wrapper for all Create module panels that need responsive layout behavior:
  - Desktop/Side-by-side: Slides from right, takes up tool panel space
  - Mobile/Portrait: Slides from bottom, full width with dynamic height
  
  This component encapsulates the common drawer positioning logic and styles,
  ensuring consistency across Animation Panel, Edit Panel, and future panels.
  
  Usage:
  Use CreatePanelDrawer with bind:isOpen, provide panel content via children slot
-->
<script lang="ts">
  import { browser } from "$app/env";
  import { onMount } from "svelte";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import { tryGetCreateModuleContext } from "../context/create-module-context";
  import { responsiveLayoutManager } from "#lib/shared/create/services/responsive-layout-manager.js";
  import type { ResponsiveLayoutManager } from "#lib/shared/create/services/responsive-layout-manager.js";
  import type { Snippet } from "svelte";

  let {
    isOpen = $bindable(false),
    panelName,
    combinedPanelHeight = 0,
    fullHeightOnMobile = false,
    // Undefined, not true: Drawer shows the grab bar on bottom sheets and not on
    // side panels, which is the distinction that matters. Forcing it on here is
    // what put a stray 4px tick inside the inner edge of every desktop panel.
    showHandle = undefined,
    closeOnBackdrop = false,
    focusTrap = false,
    autoFocus = true,
    lockScroll = false,
    keepMounted = false,
    keyboardShortcutsPassthrough = false,
    labelledBy,
    ariaLabel,
    placement: placementOverride, // Override context-derived placement (for standalone use)
    onClose,
    onBackdropClick,
    children,
  }: {
    isOpen?: boolean;
    panelName: string; // Used for CSS class names (e.g., "animation", "edit")
    combinedPanelHeight?: number;
    fullHeightOnMobile?: boolean; // If true, panel takes ~95vh on mobile instead of 70vh
    showHandle?: boolean | undefined;
    closeOnBackdrop?: boolean;
    focusTrap?: boolean;
    autoFocus?: boolean;
    lockScroll?: boolean;
    keepMounted?: boolean;
    keyboardShortcutsPassthrough?: boolean; // See Drawer; only for a panel the Create shortcuts act on
    labelledBy?: string;
    ariaLabel?: string;
    placement?: "bottom" | "right"; // Override for standalone use outside Create module
    onClose?: () => void;
    onBackdropClick?: (event: MouseEvent) => boolean; // Return true to close, false to keep open
    children: Snippet;
  } = $props();

  // Get layout context (may be null when used outside Create module)
  const createModuleContext = tryGetCreateModuleContext();

  // Fallback layout detection for when CreateModuleContext isn't available
  // (e.g., when AnimationSheetCoordinator is used in Browse module)
  let fallbackIsSideBySide = $state(false);
  let layoutService: ResponsiveLayoutManager | null = null;

  onMount(() => {
    if (!createModuleContext && browser) {
      layoutService = responsiveLayoutManager;
      if (layoutService) {
        fallbackIsSideBySide = layoutService.shouldUseSideBySideLayout();
      } else {
        fallbackIsSideBySide = window.innerWidth >= 1024;
      }
    }
  });

  // Update fallback on resize when no context
  $effect(() => {
    if (createModuleContext || !browser) return;

    const handleResize = () => {
      if (layoutService) {
        fallbackIsSideBySide = layoutService.shouldUseSideBySideLayout();
      } else {
        fallbackIsSideBySide = window.innerWidth >= 1024;
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  // Use context if available, otherwise use fallback detection
  const isSideBySideLayout = $derived.by(() =>
    createModuleContext
      ? createModuleContext.layout.shouldUseSideBySideLayout
      : fallbackIsSideBySide
  );

  // Get measured tool panel width for accurate panel sizing
  const toolPanelWidth = $derived.by(() =>
    createModuleContext ? createModuleContext.panelState.toolPanelWidth : 0
  );

  // Drawer handle footprint (height + vertical margins). Keep in sync with SheetDragHandle variables.
  const drawerHandleFootprint = 29;

  // Calculate panel height for mobile/bottom placement
  const panelHeightStyle = $derived.by(() => {
    if (isSideBySideLayout) {
      return "height: 100%;";
    }
    // If fullHeightOnMobile is set, fill the entire drawer height
    // Use 100% to fill the drawer-inner, and set the drawer itself to 100dvh
    if (fullHeightOnMobile) {
      return "height: 100%;";
    }
    // Otherwise use measured height if available
    if (combinedPanelHeight > 0) {
      const adjustedHeight = Math.max(
        combinedPanelHeight - drawerHandleFootprint,
        0
      );
      return `height: ${adjustedHeight}px;`;
    }
    // Fallback while measurements resolve
    return "height: 70vh;";
  });

  // Determine drawer placement based on layout (or use override for standalone use)
  const drawerPlacement = $derived.by(() => {
    if (placementOverride) return placementOverride;
    return isSideBySideLayout ? "right" : "bottom";
  });

  // Generate unique key when layout mode changes to force drawer re-mount
  // This ensures proper positioning when switching between mobile/desktop layouts
  const drawerKey = $derived.by(() =>
    isSideBySideLayout ? `${panelName}-side` : `${panelName}-bottom`
  );

  // Dynamic CSS classes
  const drawerClass = $derived.by(
    () =>
      `${panelName}-panel-container glass-surface${
        isSideBySideLayout ? " side-by-side-layout" : ""
      }`
  );

  const drawerBackdropClass = $derived.by(
    () =>
      `${panelName}-panel-backdrop${
        isSideBySideLayout ? " side-by-side-layout" : ""
      }`
  );

  // Dynamic inline styles for width and full-height mode
  const drawerStyle = $derived.by(() => {
    const styles: string[] = [];

    if (isSideBySideLayout && toolPanelWidth > 0) {
      styles.push(`--measured-panel-width: ${toolPanelWidth}px`);
    }

    // Create's crossfade contains fixed drawers inside the workspace, which
    // already excludes navigation. Subtracting navigation again clips the
    // editor header and leaves an empty strip below its controls.
    if (fullHeightOnMobile && !isSideBySideLayout) {
      if (createModuleContext) {
        styles.push("--panel-full-height: 100%", "--panel-bottom-offset: 0px");
      } else {
        styles.push(
          `--panel-full-height: calc(100dvh - var(--primary-nav-height, 0px))`,
          `--panel-bottom-offset: var(--primary-nav-height, 0px)`
        );
      }
    }

    return styles.join("; ");
  });

  // Handle close event
  function handleClose() {
    // Update the bindable isOpen state
    isOpen = false;
    // Call the optional onClose callback
    onClose?.();
  }

  // Watch for external close (e.g., via vaul-svelte gesture)
  // When isOpen transitions false, ensure onClose is called
  // Use a plain variable (not $state) to avoid triggering the effect when updating
  let wasOpen = isOpen;
  $effect(() => {
    if (wasOpen && !isOpen) {
      // Drawer was closed externally (gesture, etc.)
      // Call onClose to notify parent
      onClose?.();
    }
    wasOpen = isOpen;
  });

  // Handle backdrop click with custom logic
  function handleBackdropClickInternal(event: MouseEvent): boolean {
    if (onBackdropClick) {
      const shouldClose = onBackdropClick(event);
      if (shouldClose) {
        handleClose();
      }
      return shouldClose;
    }
    // Default behavior if no custom handler
    if (closeOnBackdrop) {
      handleClose();
      return true;
    }
    return false;
  }
</script>

{#key drawerKey}
  {#if drawerStyle}
    <div style={drawerStyle}>
      <Drawer
        bind:isOpen
        {...labelledBy ? { labelledBy } : {}}
        {...ariaLabel ? { ariaLabel } : {}}
        onclose={handleClose}
        onbackdropclick={handleBackdropClickInternal}
        {closeOnBackdrop}
        {showHandle}
        dismissible={true}
        respectLayoutMode={true}
        placement={drawerPlacement}
        class={drawerClass}
        backdropClass={drawerBackdropClass}
        trapFocus={focusTrap}
        {autoFocus}
        preventScroll={lockScroll}
        {keepMounted}
        {keyboardShortcutsPassthrough}
      >
        <div class="create-drawer-body" style={panelHeightStyle}>
          {@render children()}
        </div>
      </Drawer>
    </div>
  {:else}
    <Drawer
      bind:isOpen
      {...labelledBy ? { labelledBy } : {}}
      {...ariaLabel ? { ariaLabel } : {}}
      onclose={handleClose}
      onbackdropclick={handleBackdropClickInternal}
      {closeOnBackdrop}
      {showHandle}
      dismissible={true}
      respectLayoutMode={true}
      placement={drawerPlacement}
      class={drawerClass}
      backdropClass={drawerBackdropClass}
      trapFocus={focusTrap}
      {autoFocus}
      preventScroll={lockScroll}
      {keepMounted}
      {keyboardShortcutsPassthrough}
    >
      <div class="create-drawer-body" style={panelHeightStyle}>
        {@render children()}
      </div>
    </Drawer>
  {/if}
{/key}

<style>

  /* Base drawer content styling - more opaque for floating over busy content */
  :global(.drawer-content[class*="-panel-container"]) {
    --sheet-bg: linear-gradient(
      135deg,
      rgba(0, 0, 0, 0.75),
      rgba(0, 0, 0, 0.85)
    );
    --sheet-filter: blur(24px);
    /* Ensure panel appears above navigation (z-index: 100) */
    --sheet-z-index: 150;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    box-shadow: none;
  }

  /* The step editor keeps a dense, animated SVG tree open for the lifetime of
     the drawer. Sampling the scene behind that native dialog can corrupt its
     composited surface into a theme-colored ellipse in Chromium. Give this
     long-lived editor a stable paint surface instead of a backdrop filter. */
  :global(.drawer-content.step-editor-panel-container) {
    --sheet-bg: var(--sheet-bg-solid, rgb(15, 15, 20));
    --sheet-filter: none;
    background: var(--sheet-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /*
   * Side-by-side layout (Desktop): Panels slide from right
   * Width uses measured tool panel container width for pixel-perfect alignment
   * Only set positioning - let base Drawer handle transforms and transitions
   */
  :global(
    .drawer-content[class*="-panel-container"].side-by-side-layout[data-placement="right"]
  ) {
    top: var(--create-panel-top, 64px);
    bottom: var(--create-panel-bottom, 0);
    /* top + bottom together will stretch element vertically */
    /* Use measured tool panel width for exact alignment */
    width: var(--measured-panel-width, clamp(360px, 44.44vw, 900px));
    max-width: 100%;
  }

  /* This is a flush workspace pane on desktop, not a floating card. Pinning
     the edge geometry also keeps descendants inside the drawer's paint box. */
  :global(
    .drawer-content.step-editor-panel-container.side-by-side-layout[data-placement="right"]
  ) {
    border-radius: 0;
    overflow: hidden;
  }

  /*
   * Animation panel: Full height on desktop (respects preview banner if visible)
   * Uses --preview-banner-height set by PreviewModeBanner when F9 debug panel is open
   */
  :global(
    .drawer-content.animation-panel-container.side-by-side-layout[data-placement="right"]
  ) {
    top: var(--preview-banner-height, 0);
  }

  /*
   * Mobile/Stacked layout: Panels slide from bottom
   * Height determined by combinedPanelHeight prop via .create-drawer-body
   * Let base Drawer handle positioning from bottom
   * Width is already set by base Drawer
   * Height is controlled by .create-drawer-body below
   */
  :global(.drawer-content[class*="-panel-container"][data-placement="bottom"]) {
    /* Override the default 100dvh max-height cap from base Drawer */
    --sheet-max-height: 100dvh;
    /* When --panel-full-height is set, fill the visible workspace above navigation. */
    height: var(--panel-full-height, auto);
    bottom: var(--panel-bottom-offset, 0);
    display: flex;
    flex-direction: column;
    /* Height will be determined by .create-drawer-body child */
  }

  /*
   * Backdrop styling - transparent and non-interactive
   * Swipe-to-dismiss is handled on the drawer content itself, not the backdrop
   */
  :global(.drawer-overlay[class*="-panel-backdrop"]) {
    /* Transparent, non-interactive backdrop so clicks pass through to the
       button panel. Swipe-to-dismiss lives on the drawer content itself. */
    --sheet-backdrop-bg: transparent;
    --sheet-backdrop-pointer-events: none;
    --sheet-z-index: 50;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /*
   * Backdrop for side-by-side: only covers right side of screen
   * Left side (sequence area) remains interactive
   * IMPORTANT: When desktop sidebar is visible, offset by sidebar width
   * so clicks on the sidebar are not blocked
   */
  :global(.drawer-overlay[class*="-panel-backdrop"].side-by-side-layout) {
    top: var(--create-panel-top, 64px);
    bottom: var(--create-panel-bottom, 0);
    left: var(--create-panel-left, 50%);
    right: 0;
  }

  /*
   * When desktop sidebar is visible, constrain backdrop to not cover it
   * Uses --desktop-sidebar-width set by MainInterface.svelte
   */
  :global(.has-desktop-sidebar .drawer-overlay[class*="-panel-backdrop"]) {
    left: var(--desktop-sidebar-width, 220px);
  }


  .create-drawer-body {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    /* height set dynamically via inline style for reactive sizing */
    /* When height: 100dvh is set inline, it will force drawer-content to that height */
    transition: height var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    background: transparent; /* Background is on drawer-content */
  }


  /* Reduced motion preference - disable height transitions */
  @media (prefers-reduced-motion: reduce) {
    .create-drawer-body {
      transition: none;
    }

    /* vaul-svelte respects prefers-reduced-motion automatically */
  }

  /* High contrast mode - stronger borders */
  @media (prefers-contrast: high) {
    :global(.drawer-content[class*="-panel-container"]) {
      border-top: 2px solid white;
    }
  }
</style>
