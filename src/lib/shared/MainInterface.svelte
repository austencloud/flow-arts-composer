<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getLanSyncCoordinator } from "$lib/shared/lan-sync/get-lan-sync-coordinator";
  import { getSyncRoomDiscovery } from "$lib/shared/lan-sync/get-sync-room-discovery";
  /**
   * MainInterface
   * Domain: Application Layout Shell
   *
   * Pure layout orchestration component.
   * Delegates all business logic to specialized managers.
   */
  import { onMount } from "svelte";
  import { getActiveTab } from "./application/state/ui/ui-state.svelte";
  import { handleHMRInit } from "./hmr-helper";
  import { getDeviceDetector } from "./device/get-device-detector";
  import { getViewportManager } from "./device/get-viewport-manager";
  import {
    layoutState,
    moduleHasPrimaryNav,
    setCurrentWord,
    setLearnHeader,
    setPrimaryNavHeight,
    setPrimaryNavLandscape,
    setTabAccessibility,
    setViewportWidth,
  } from "./layout/layout-state.svelte";
  import {
    currentModule,
    currentModuleName,
    currentSection,
    handleModuleHome,
    handleModuleChange,
    handleSectionChange,
    initializeNavigationHistory,
    getModuleDefinitions,
    moduleSections,
    navigationCoordinator,
  } from "./navigation-coordinator/navigation-coordinator.svelte";

  // Get module definitions reactively
  const moduleDefinitions = $derived(getModuleDefinitions());

  // Layout components
  import MobileNavigation from "./navigation/components/MobileNavigation.svelte";
  import DesktopNavigationSidebar from "./navigation/components/DesktopNavigationSidebar.svelte";
  import ModuleSwitcher from "./navigation/components/ModuleSwitcher.svelte";
  // Domain managers
  import ModuleRenderer from "./modules/ModuleRenderer.svelte";
  import PWAInstallationManager from "./pwa/PWAInstallationManager.svelte";
  import { desktopSidebarState } from "./layout/desktop-sidebar-state.svelte";
  // Keyboard shortcuts

  import { deepLinker } from "./navigation/services/deep-linker";
  import { useDesktopSidebarVisibility } from "./navigation/services/desktop-sidebar-visibility.svelte";
  import { browseScrollState } from "$lib/shared/browse/state/browse-scroll-state.svelte";
  import type {
    ModuleId,
    SectionHomeDestination,
  } from "./navigation/domain/types";
  import { navigationState } from "./navigation/state/navigation-state.svelte";
  import { hasOpenDrawers } from "./foundation/ui/drawer/drawer-stack";
  import CommandPalette from "./keyboard/components/CommandPalette.svelte";
  import KeyboardShortcutCoordinator from "./keyboard/coordinators/KeyboardShortcutCoordinator.svelte";

  // My Props drawer - rendered here (outside sidebar) because the sidebar's
  // backdrop-filter creates a containing block that traps position:fixed
  import MyPropsDrawer from "./navigation/components/account/MyPropsDrawer.svelte";
  import { myPropsDrawerState } from "./navigation/components/account/my-props-drawer-state.svelte";

  // 🚀 Performance: Module prefetching
  import {
    preloadCriticalModules,
    prefetchLikelyNextModules,
  } from "./navigation/utils/module-prefetch";

  // Debug tools
  import AdminToolbar from "./debug/components/AdminToolbar.svelte";
  import ImpersonationBar from "./debug/components/ImpersonationBar.svelte";
  import { initUserPreviewContext } from "./debug/context/user-preview-context";
  import {
    userPreviewState,
    clearUserPreview,
  } from "./debug/state/user-preview-state.svelte";
  import { adminToolbarState } from "./debug/state/admin-toolbar-state.svelte";
  import { featureFlagService } from "./auth/services/post-hog-feature-flag-service.svelte";
  import ToastContainer from "./toast/components/ToastContainer.svelte";

  const sectionHome = $derived.by<SectionHomeDestination | null>(() => {
    const moduleId = currentModule();
    const moduleDefinition = moduleDefinitions.find(
      (definition) => definition.id === moduleId
    );
    if (!moduleDefinition?.home) return null;

    return {
      ...moduleDefinition.home,
      icon: moduleDefinition.home.icon ?? moduleDefinition.icon,
      color: moduleDefinition.color,
      gradient: moduleDefinition.color,
      active: navigationState.isModuleHomeOpen(moduleId),
    };
  });

  // LAN Sync
  import NearbySyncBanner from "./lan-sync/components/NearbySyncBanner.svelte";
  import { lanSyncState } from "./lan-sync/state/lan-sync-state.svelte";

  // Props
  let { isEntryAnimating = false } = $props<{
    isEntryAnimating?: boolean;
  }>();

  // Initialize user preview context for app-wide access
  initUserPreviewContext();

  // Reactive state
  const activeModule = $derived(getActiveTab()); // Using legacy getActiveTab for now
  const isModuleLoading = $derived(activeModule === null);

  // Show banner offset when user preview OR admin toolbar is open
  const isAdmin = $derived(featureFlagService.userRole === "admin");

  // Window width tracking for mobile detection
  const MOBILE_BREAKPOINT = 768;
  let mainWindowWidth = $state(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  const isMainMobile = $derived(mainWindowWidth < MOBILE_BREAKPOINT);

  $effect(() => {
    if (typeof window === "undefined") return;
    mainWindowWidth = window.innerWidth;
    setViewportWidth(window.innerWidth);
    const handleResize = () => {
      mainWindowWidth = window.innerWidth;
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  // Desktop: top bar needs padding only when admin toolbar is explicitly open (F9)
  // Mobile: no top bar at all, so isPreviewMode is always false on mobile
  const isPreviewMode = $derived(
    isAdmin && !isMainMobile && adminToolbarState.isOpen
  );

  // Impersonation indicator (border + bottom bar) - independent of toolbar open state
  const isImpersonating = $derived(isAdmin && userPreviewState.isActive);

  function handleExitPreview() {
    clearUserPreview();
    featureFlagService.clearDebugRoleOverride();
  }

  // Desktop sidebar visibility management
  let desktopSidebarVisibility: ReturnType<
    typeof useDesktopSidebarVisibility
  > | null = null;
  const showDesktopSidebar = $derived(desktopSidebarState.isVisible);

  // Primary navigation visibility - hide during Browse module scroll
  const isPrimaryNavVisible = $derived(() => {
    const module = currentModule();
    if (module === "browse") {
      return browseScrollState.isUIVisible;
    }
    return true;
  });

  // Sync state to coordinators
  $effect(() => {
    navigationCoordinator.canAccessEditAndExportPanels =
      layoutState.canAccessEditAndExportPanels;
  });

  // Sync preview banner state to body for drawer CSS positioning
  $effect(() => {
    if (isPreviewMode) {
      document.body.classList.add("has-preview-banner");
    } else {
      document.body.classList.remove("has-preview-banner");
    }
  });

  // Handle reveal navigation from peek indicator
  function handleRevealNav() {
    browseScrollState.forceShowUI();
  }

  function handleSectionHomeSelect() {
    handleModuleHome(currentModule(), "navigation");
  }

  // 🚀 Prefetch likely next modules when current module changes
  $effect(() => {
    const module = currentModule();
    if (module) {
      prefetchLikelyNextModules(module);
    }
  });

  onMount(() => {
    if (typeof window === "undefined") return;
    // Initialize HMR error handling - detects module MIME errors and reloads
    handleHMRInit();

    // 🚀 PERFORMANCE: Preload critical modules during idle time
    // Only prefetch from Dashboard - prefetching on Settings/other modules
    // would defeat lazy loading (Create has 150+ files = 5+ seconds)
    preloadCriticalModules(currentModule());

    // Enable native back/forward by wiring navigation state to history
    initializeNavigationHistory();

    // Initialize deep linking for shareable sequence URLs
    try {
      deepLinker.initialize();
    } catch (error) {
      console.warn("Failed to initialize deep link service:", error);
    }

    // Initialize desktop sidebar visibility
    try {
      const deviceDetectorInstance = getDeviceDetector();
      const viewportService = getViewportManager();
      desktopSidebarVisibility = useDesktopSidebarVisibility(
        deviceDetectorInstance,
        viewportService
      );
    } catch (error) {
      console.warn(
        "MainInterface: Failed to initialize desktop sidebar visibility",
        error
      );
    }

    // Initialize LAN sync services (coordinator and discovery)
    try {
      const lanSyncCoordinator = getLanSyncCoordinator();
      const syncRoomDiscovery = getSyncRoomDiscovery();

      lanSyncState.initialize(lanSyncCoordinator);
      lanSyncState.initializeDiscovery(syncRoomDiscovery);
    } catch (error) {
      console.warn(
        "MainInterface: Failed to initialize LAN sync services",
        error
      );
    }

    return () => {
      desktopSidebarVisibility?.cleanup();
      lanSyncState.cleanup();
    };
  });
</script>

<!-- Skip to main content link for keyboard/screen reader users -->
<a href="#main-content" class="skip-link">{t("nav_skip_main")}</a>

<!-- Admin Toolbar (F9) -->
<AdminToolbar />

<!-- LAN Sync Nearby Banner -->
<NearbySyncBanner />

<!-- Connect Module Invite Overlay -->
{#await import("$lib/features/connect/components/InviteOverlay.svelte") then mod}
  <mod.default />
{/await}

<div
  class="main-interface"
  class:nav-landscape={layoutState.isPrimaryNavLandscape}
  class:has-desktop-sidebar={showDesktopSidebar}
  class:has-preview-banner={isPreviewMode}
  class:is-impersonating={isImpersonating}
  style="--primary-nav-height: {layoutState.primaryNavHeight}px; --desktop-sidebar-width: {desktopSidebarState.width}px;"
>
  <!-- Desktop Navigation Sidebar (only on desktop in side-by-side layout) -->
  {#if showDesktopSidebar}
    <DesktopNavigationSidebar
      currentModule={currentModule()}
      currentSection={currentSection()}
      modules={moduleDefinitions}
      onModuleChange={handleModuleChange}
      onModuleHomeSelect={(moduleId) =>
        handleModuleHome(moduleId, "navigation")}
      onSectionChange={handleSectionChange}
      {isEntryAnimating}
    />
  {/if}

  <!-- Content + Navigation Wrapper (flex layout) -->
  <div class="content-wrapper">
    <!-- Impersonation bar (top of content, both platforms) -->
    {#if isImpersonating && userPreviewState.data.profile}
      <ImpersonationBar
        previewProfile={userPreviewState.data.profile}
        onExitPreview={handleExitPreview}
      />
    {/if}

    <!-- Main Content Area -->
    <main
      id="main-content"
      class="content-area"
      class:nav-hidden={!isPrimaryNavVisible()}
      class:nav-landscape={layoutState.isPrimaryNavLandscape}
      class:entry-animating={isEntryAnimating}
    >
      <ModuleRenderer
        {activeModule}
        {isModuleLoading}
        onTabAccessibilityChange={setTabAccessibility}
        onCurrentWordChange={setCurrentWord}
        onLearnHeaderChange={setLearnHeader}
      />
    </main>

    <!-- Mobile Navigation (conditionally rendered) -->
    {#if moduleHasPrimaryNav(currentModule()) && !showDesktopSidebar}
      <MobileNavigation
        sections={moduleSections()}
        currentSection={currentSection()}
        onSectionChange={handleSectionChange}
        {sectionHome}
        onSectionHomeSelect={handleSectionHomeSelect}
        onModuleSwitcherTap={() => {
          // Open module switcher drawer directly
          window.dispatchEvent(new CustomEvent("module-switcher-toggle"));
        }}
        onLayoutChange={setPrimaryNavLandscape}
        onHeightChange={setPrimaryNavHeight}
        isUIVisible={isPrimaryNavVisible()}
        onRevealNav={handleRevealNav}
        isDashboard={false}
        {isEntryAnimating}
      />
    {/if}
  </div>

  <!-- Domain Managers -->
  <PWAInstallationManager />
  <!-- Module Switcher Drawer (opens via custom event) -->
  <ModuleSwitcher
    currentModule={currentModule()}
    currentModuleName={currentModuleName()}
    modules={moduleDefinitions}
    onModuleChange={handleModuleChange}
    onModuleHomeSelect={(moduleId) => handleModuleHome(moduleId, "navigation")}
  />
  <!-- Keyboard Shortcuts -->
  <KeyboardShortcutCoordinator />
  <CommandPalette />
  <!-- Toast Notifications -->
  <ToastContainer />
</div>

<!-- My Props drawer - must render outside .main-interface to escape
     the sidebar's backdrop-filter containing block -->
{#if myPropsDrawerState.propState}
  <MyPropsDrawer
    bind:isOpen={myPropsDrawerState.isOpen}
    propState={myPropsDrawerState.propState}
    onclose={() => {
      myPropsDrawerState.close();
    }}
  />
{/if}

<style>
  /* Skip link - visually hidden until focused (sr-only pattern) */
  .skip-link {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
    /* Style for when focused */
    background: var(--theme-panel-bg);
    color: var(--theme-text, white);
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    z-index: var(--z-priority);
  }

  .skip-link:focus {
    position: fixed;
    top: 16px;
    left: 16px;
    width: auto;
    height: auto;
    padding: 12px 24px;
    margin: 0;
    overflow: visible;
    clip: auto;
    white-space: normal;
  }

  .main-interface {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    position: relative;
    background: transparent;
    /* Edge-to-edge safe area (Android 15+ / iOS notch+cutout): the native
       WebView draws behind the status bar and camera cutout. On mobile the
       primary nav is the BOTTOM bar, so the top of the screen is raw module
       content — reserve the top inset here or that content sits under the
       cutout. --safe-area-inset-top comes from @capacitor/system-bars; env()
       is the web/PWA fallback; both resolve to 0 on desktop and on pre-15
       Android (where StatusBar already reserves the strip), so no double pad. */
    padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
    transition:
      padding-left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      padding-top 0.2s ease;
  }

  /* Desktop sidebar support */
  .main-interface.has-desktop-sidebar {
    padding-left: var(--desktop-sidebar-width, 280px);
  }

  /* Impersonation border - 3px blue outline around entire viewport */
  .main-interface.is-impersonating {
    border: 3px solid rgba(59, 130, 246, 0.7);
    box-sizing: border-box;
  }

  /* Debug banner support (desktop admin toolbar open) - push content down */
  /* Banner height: 56px content + 2px border = 58px total */
  .main-interface.has-preview-banner {
    padding-top: 58px;
  }

  /* Push desktop sidebar down when banner is shown */
  .main-interface.has-preview-banner :global(.desktop-navigation-sidebar) {
    top: 58px;
  }

  @media (max-width: 768px) {
    /* Mobile: no top admin bar, so no padding-top needed */
    .main-interface.has-preview-banner {
      padding-top: 0;
    }
  }

  /* Content + Navigation Wrapper - flex container for content and nav */
  .content-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  .content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  /* Landscape mode - reserve the side navigation outside the content box.
     Browse and other keep-alive modules use absolutely positioned hosts,
     which can occupy a parent's padding box and end up underneath the nav. */
  .content-area.nav-landscape {
    margin-left: 72px !important;
    margin-left: max(72px, env(safe-area-inset-left)) !important;
  }

  /* Reset the mobile rail reservation when the desktop sidebar is visible */
  .main-interface.has-desktop-sidebar .content-area {
    margin-left: 0 !important;
  }

  /* ============================================================================
     ENTRY ANIMATION - Choreographed app entry after first-run wizard
     ============================================================================ */

  /* Content area slides up + fades in */
  .content-area.entry-animating {
    animation: entry-content-in 350ms cubic-bezier(0.16, 1, 0.3, 1) 400ms both;
  }

  @keyframes entry-content-in {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .main-interface {
      transition: none !important;
      animation: none !important;
    }

    .content-area.entry-animating {
      animation: none;
    }
  }

  @media (prefers-contrast: high) {
    .main-interface {
      border: 2px solid #667eea;
    }
  }

  @media print {
    .main-interface {
      height: auto;
      overflow: visible;
    }

    .content-area {
      overflow: visible;
      height: auto;
    }
  }
</style>
