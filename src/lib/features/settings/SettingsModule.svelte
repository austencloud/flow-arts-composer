<!--
  SettingsModule.svelte - Settings as a proper module

  Uses standard bottom navigation (tabs provided via SETTINGS_TABS)
  Content renders based on navigationState.activeTab

  Tabs: Profile, Props, Background, Misc
  Accessed via gear icon in sidebar footer (not in main module list)

  Mobile: Swipe left from left edge to exit (matches portal animation direction)
-->
<script lang="ts">
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import {
    getSettings,
    updateSetting,
  } from "$lib/shared/application/state/app-state.svelte";
  import { areServicesInitialized } from "$lib/shared/application/state/services.svelte";
  import IOSSkeletonLoader from "$lib/shared/settings/components/IOSSkeletonLoader.svelte";
  import Toast from "$lib/shared/settings/components/Toast.svelte";
  import { handleModuleChange } from "$lib/shared/navigation-coordinator/navigation-coordinator.svelte";
  import type { ModuleId } from "$lib/shared/navigation/domain/types";
  import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
  import type { ResponsiveSettings } from "$lib/shared/device/domain/models/device-models";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { applyThemeForBackground } from "$lib/shared/settings/utils/background-theme-calculator";
  import type { AppSettings } from "$lib/shared/settings/domain/app-settings";

  // Navigation state - use global activeTab
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";

  // Import all tab components directly
  import ProfileTab from "$lib/shared/settings/components/tabs/ProfileTab.svelte";
  import ReleaseNotesTab from "$lib/shared/settings/components/tabs/ReleaseNotesTab.svelte";
  import PropTypeTab from "$lib/shared/settings/components/tabs/PropTypeTab.svelte";
  import BackgroundTab from "$lib/shared/settings/components/tabs/background/BackgroundTab.svelte";
  import PreferencesTab from "$lib/shared/settings/components/tabs/PreferencesTab.svelte";
  import LanguageTab from "$lib/shared/settings/components/tabs/LanguageTab.svelte";
  import ShortcutCenter from "$lib/shared/keyboard/components/ShortcutCenter.svelte";
  import NotificationPreferencesPanel from "$lib/features/feedback/components/NotificationPreferencesPanel.svelte";

  // Reactive settings - derives from getSettings() to maintain reactivity
  let settings = $derived(getSettings());

  // Toast notification state
  let showToast = $state(false);
  let toastMessage = $state("Settings saved");

  // Device detection for layout awareness
  let deviceDetector: DeviceDetector | null = null;
  let responsiveSettings = $state<ResponsiveSettings | null>(null);

  // Haptic feedback service
  let hapticService: HapticFeedback | null = null;

  // Back header is no longer needed on mobile/tablet since back button is now in bottom nav
  // Desktop has sidebar with its own back button
  // Keep this false - back functionality is handled by navigation
  let showBackHeader = $derived(false);

  onMount(() => {
    let deviceCleanup: (() => void) | undefined;
    try {
      deviceDetector = getDeviceDetector();
      if (deviceDetector) {
        responsiveSettings = deviceDetector.getResponsiveSettings();
        deviceCleanup = deviceDetector.onCapabilitiesChanged(() => {
          responsiveSettings = deviceDetector!.getResponsiveSettings();
        });
      }
      hapticService = getHapticFeedback();
    } catch (error) {
      console.warn("SettingsModule: Failed to resolve DeviceDetector", error);
    }

    return () => {
      deviceCleanup?.();
    };
  });

  // Ensure theme is applied whenever background changes
  $effect(() => {
    const bgType = settings?.backgroundType;
    if (bgType) {
      applyThemeForBackground(bgType);
    }
  });

  // Check if settings are loaded AND services are initialized
  const isSettingsLoaded = $derived(
    settings &&
      typeof settings === "object" &&
      Object.keys(settings).length > 0 &&
      areServicesInitialized()
  );

  // Adapter for settings updates with instant save
  // Uses updateSetting (singular) to avoid race conditions when multiple
  // updates happen in quick succession (e.g., resetToDefaults calls 7+ updates)
  function handleSettingUpdate(event: { key: string; value: unknown }) {
    try {
      // Use updateSetting to directly update the specific key
      // This avoids race conditions from spreading stale settings objects
      updateSetting(
        event.key as keyof AppSettings,
        event.value as AppSettings[keyof AppSettings]
      );

      // Show success toast briefly
      showToast = true;
      toastMessage = "Saved";

      // Auto-hide toast after 1.5 seconds
      setTimeout(() => {
        showToast = false;
      }, 1500);
    } catch (error) {
      console.error("Settings save failed:", error);
      showToast = true;
      toastMessage = "Save failed";
      // Keep error toast visible longer
      setTimeout(() => {
        showToast = false;
      }, 3000);
    }
  }

  // Use navigation state's active tab
  const activeTab = $derived(navigationState.activeTab);

  // Swipe-to-exit gesture state
  let swipeStartX = 0;
  let swipeStartY = 0;
  let isSwiping = $state(false);
  let swipeProgress = $state(0); // 0 to 1, for visual feedback
  const SWIPE_EDGE_ZONE = 50; // px from left edge to start swipe
  const SWIPE_THRESHOLD = 100; // px to trigger exit
  const SWIPE_ANGLE_THRESHOLD = 30; // degrees - must be mostly horizontal

  function handleTouchStart(e: TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;

    // Only track swipes starting from left edge
    if (touch.clientX <= SWIPE_EDGE_ZONE) {
      swipeStartX = touch.clientX;
      swipeStartY = touch.clientY;
      isSwiping = true;
      swipeProgress = 0;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isSwiping) return;

    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;

    // Check angle - must be mostly horizontal (swipe right to exit)
    const angle = Math.abs(Math.atan2(deltaY, deltaX) * (180 / Math.PI));
    if (angle > SWIPE_ANGLE_THRESHOLD && angle < 180 - SWIPE_ANGLE_THRESHOLD) {
      // Too vertical, cancel swipe
      isSwiping = false;
      swipeProgress = 0;
      return;
    }

    // Only track rightward swipes (positive deltaX)
    if (deltaX > 0) {
      swipeProgress = Math.min(deltaX / SWIPE_THRESHOLD, 1);
    }
  }

  async function handleTouchEnd() {
    if (!isSwiping) return;

    if (swipeProgress >= 1) {
      // Swipe completed - exit settings
      const previousModule = navigationState.previousModule || "create";
      await handleModuleChange(previousModule as ModuleId);
    }

    // Reset state
    isSwiping = false;
    swipeProgress = 0;
  }

  function handleTouchCancel() {
    isSwiping = false;
    swipeProgress = 0;
  }

  // Handle back button tap - return to previous module
  async function handleBackToModule() {
    hapticService?.trigger("selection");
    const previousModuleId = navigationState.previousModule || "create";
    await handleModuleChange(previousModuleId as ModuleId);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Swipe zone wrapper for edge-swipe to exit -->
<div
  class="settings-module settings-swipe-zone"
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
  ontouchcancel={handleTouchCancel}
>
  <!-- Back header - shown on mobile/tablet only (desktop has sidebar with back button) -->
  {#if showBackHeader}
    <header class="back-header">
      <button
        type="button"
        class="back-header-button"
        onclick={handleBackToModule}
        aria-label="Go back"
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="back-header-title">Settings</span>
    </header>
  {/if}

  <!-- Swipe indicator on left edge -->
  <div
    class="swipe-indicator"
    class:active={isSwiping}
    style="--swipe-progress: {swipeProgress}"
  >
    <div class="swipe-arrow">
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </div>
  </div>

  {#if !isSettingsLoaded}
    <div class="loading-state">
      <IOSSkeletonLoader variant="toggle" count={8} />
    </div>
  {:else}
    <div
      class="settings-module-body"
      class:theme-background-active={activeTab === "theme"}
    >
      <section
        class="panel"
        class:theme-background-active={activeTab === "theme"}
      >
        {#if activeTab === "profile"}
          <ProfileTab
            currentSettings={settings}
            onSettingUpdate={handleSettingUpdate}
          />
        {:else if activeTab === "release-notes"}
          <ReleaseNotesTab />
        {:else if activeTab === "props"}
          <PropTypeTab {settings} onUpdate={handleSettingUpdate} />
        {:else if activeTab === "theme"}
          <BackgroundTab {settings} onUpdate={handleSettingUpdate} />
        {:else if activeTab === "notifications"}
          <NotificationPreferencesPanel />
        {:else if activeTab === "preferences"}
          <PreferencesTab
            currentSettings={settings}
            onSettingUpdate={handleSettingUpdate}
          />
        {:else if activeTab === "keyboard"}
          <ShortcutCenter />
        {:else if activeTab === "language"}
          <LanguageTab />
        {:else}
          <!-- Fallback to account if unknown tab -->
          <ProfileTab
            currentSettings={settings}
            onSettingUpdate={handleSettingUpdate}
          />
        {/if}
      </section>
    </div>
  {/if}

  <!-- Toast Notification -->
  <Toast show={showToast} message={toastMessage} />
</div>

<style>
  .settings-module {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: transparent;
    color: var(--foreground, #ffffff);
    font-family:
      -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  }

  /* Remove tap highlight across all settings buttons */
  :global(.settings-module button) {
    -webkit-tap-highlight-color: transparent;
  }

  .back-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    /* Dark glass panel */
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .back-header-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    padding: 0;
    /* Subtle glass button */
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: all var(--duration-fast) ease;
  }

  .back-header-button:hover {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent)) 30%,
      transparent
    );
    color: var(--theme-accent);
  }

  .back-header-button:active {
    transform: scale(0.95);
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent)) 20%,
      transparent
    );
  }

  .back-header-button i {
    font-size: var(--font-size-sm);
    transition: transform var(--duration-fast) ease;
  }

  .back-header-button:hover i {
    transform: translateX(-2px);
  }

  .back-header-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text);
  }

  .settings-module-body {
    flex: 1 1 0%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    overflow-y: auto;
    padding: clamp(8px, 2vw, 16px);
    min-height: 0;
  }

  .settings-module-body::-webkit-scrollbar {
    width: 6px;
  }

  .settings-module-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .settings-module-body::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    border-radius: 3px;
  }

  .settings-module-body.theme-background-active {
    overflow: hidden;
    padding: 0;
  }

  /* Panel - content card - fills available space, allows internal scrolling */
  .panel {
    border-radius: 16px;
    /* Reduced padding to maximize grid space */
    padding: clamp(6px, 1.5vw, 12px);
    min-width: 0;
    width: 100%;
    /* Flex to fill available height, min-height: 0 allows shrinking */
    flex: 1 1 0%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .panel.theme-background-active {
    padding: 0;
    border-radius: 0;
  }

  /* Loading state */
  .loading-state {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: clamp(16px, 3vw, 32px);
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
  }

  .swipe-indicator {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 10;
    opacity: 0;
    transform: translateX(-100%);
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
  }

  .swipe-indicator.active {
    opacity: calc(var(--swipe-progress, 0) * 0.8 + 0.2);
    transform: translateX(calc(var(--swipe-progress, 0) * 100% - 100%));
  }

  .swipe-arrow {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent)) 20%,
      rgba(0, 0, 0, 0.3)
    );
    border-radius: 50%;
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent)) 35%,
        transparent
      );
    box-shadow: 0 0 12px
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent)) 30%,
        transparent
      );
  }

  .swipe-arrow i {
    color: var(--theme-accent);
    font-size: var(--font-size-sm);
    transform: translateX(calc(var(--swipe-progress, 0) * 2px));
    transition: transform var(--duration-instant) ease;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }

    .swipe-indicator,
    .swipe-arrow i {
      transition: none !important;
    }
  }
</style>
