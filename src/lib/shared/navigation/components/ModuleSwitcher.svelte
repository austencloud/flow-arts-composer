<!--
  ModuleSwitcher - Module Navigation Drawer

  A standardized drawer component for switching between app modules.
  Uses the shared Drawer component (vaul-svelte based) for consistent UX.
-->
<script lang="ts">
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import { desktopSidebarState } from "../../layout/desktop-sidebar-state.svelte";
  import type { ModuleDefinition, ModuleId } from "../domain/types";
  import ModuleList from "./ModuleList.svelte";
  import ModuleDestinationList from "./ModuleDestinationList.svelte";
  import type { HapticFeedback } from "../../application/services/haptic-feedback";
  import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
  import type { ResponsiveSettings } from "../../device/domain/models/device-models";
  import Drawer from "../../foundation/ui/Drawer.svelte";
  import AccountRow from "./account/AccountRow.svelte";
  import { authState } from "../../auth/state/auth-state.svelte";
  import { inboxState } from "../../inbox/state/inbox-state.svelte";
  import { userPreviewState } from "../../debug/state/user-preview-state.svelte";
  import { supportModalState } from "../../support/state/support-modal-state.svelte";
  import { whatsNewState } from "../../settings/state/whats-new-state.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { navigationState } from "../state/navigation-state.svelte";
  import { getAccessibleSectionsForModule } from "$lib/shared/navigation-coordinator/navigation-coordinator.svelte";

  let {
    // Current state
    currentModule,
    currentModuleName,

    // Available options
    modules = [],

    // Callbacks
    onModuleChange,
    onModuleHomeSelect,
  } = $props<{
    currentModule: ModuleId;
    currentModuleName: string;
    modules: ModuleDefinition[];
    onModuleChange?: (
      moduleId: ModuleId,
      targetTab?: string
    ) => void | Promise<void>;
    onModuleHomeSelect?: (moduleId: ModuleId) => void;
  }>();

  let hapticService: HapticFeedback = null!;
  let deviceDetector: DeviceDetector | null = null;
  let isOpen = $state(false);
  let selectedModuleId = $state<ModuleId | null>(null);

  // The list region is the only part of the sheet that scrolls, and only when
  // the sheet reaches its height cap. Each view starts at the top.
  let listScroller = $state<HTMLElement | null>(null);

  function resetListScroll() {
    listScroller?.scrollTo({ top: 0 });
  }

  const selectedModule = $derived(
    modules.find((module) => module.id === selectedModuleId) ?? null
  );
  const selectedSections = $derived(
    selectedModuleId ? getAccessibleSectionsForModule(selectedModuleId) : []
  );
  const drillDirection = $derived<-1 | 1>(selectedModuleId ? 1 : -1);

  const hasUnread = $derived(inboxState.totalUnreadCount > 0);
  const unreadCount = $derived(inboxState.totalUnreadCount);

  // A full account (member) — NOT an anonymous guest, who is technically
  // authenticated. Inbox / Sign Out / profile navigation are member-only;
  // guests get the AccountRow "Sign in" entry instead.
  const isFullAccount = $derived(authState.isFullAccount);

  // Responsive settings from DeviceDetector (same as MobileNavigation)
  let responsiveSettings = $state<ResponsiveSettings | null>(null);

  // Determine drawer placement based on navigation layout
  // - Landscape mobile (side navigation) → drawer from left
  // - Portrait mobile (bottom navigation) → drawer from bottom
  let drawerPlacement = $derived<"left" | "bottom">(
    responsiveSettings?.isLandscapeMobile ? "left" : "bottom"
  );

  // Auto-close drawer when desktop sidebar appears (e.g. viewport resized wider)
  $effect(() => {
    if (desktopSidebarState.isVisible && isOpen) {
      isOpen = false;
    }
  });

  function closeDrawer() {
    hapticService?.trigger("selection");
    isOpen = false;
  }

  function openDrawer() {
    hapticService?.trigger("selection");
    selectedModuleId = null;
    resetListScroll();
    isOpen = true;
  }

  function handleInboxClick() {
    hapticService?.trigger("selection");
    inboxState.open();
    closeDrawer();
  }

  onMount(() => {
    hapticService = getHapticFeedback();

    // Resolve DeviceDetector service (same pattern as MobileNavigation)
    let deviceCleanup: (() => void) | undefined;
    try {
      deviceDetector = getDeviceDetector();

      if (deviceDetector) {
        // Get initial responsive settings
        responsiveSettings = deviceDetector.getResponsiveSettings();

        // Subscribe to device capability changes
        deviceCleanup = deviceDetector.onCapabilitiesChanged(() => {
          responsiveSettings = deviceDetector!.getResponsiveSettings();
        });
      }
    } catch (error) {
      console.warn("ModuleSwitcher: Failed to resolve DeviceDetector", error);
    }

    // Return cleanup function
    return () => {
      deviceCleanup?.();
    };
  });

  async function handleModuleSelect(moduleId: ModuleId) {
    const module = modules.find((candidate) => candidate.id === moduleId);
    if (!module) return;

    const sections = getAccessibleSectionsForModule(moduleId);
    if (module.home || sections.length > 1) {
      resetListScroll();
      selectedModuleId = moduleId;
      return;
    }

    await onModuleChange?.(moduleId, sections[0]?.id);
    closeDrawer();
  }

  async function handleDestinationSelect(sectionId?: string) {
    if (!selectedModule) return;
    hapticService?.trigger("selection");
    if (sectionId) {
      await onModuleChange?.(selectedModule.id, sectionId);
    } else {
      onModuleHomeSelect?.(selectedModule.id);
    }
    closeDrawer();
  }

  function handleDrillBack() {
    hapticService?.trigger("selection");
    resetListScroll();
    selectedModuleId = null;
  }

  function handleAccountSettings() {
    hapticService?.trigger("selection");
    onModuleChange?.("settings" as ModuleId);
    closeDrawer();
  }

  function handleWhatsNew() {
    closeDrawer();
    void whatsNewState.openManual();
  }

  function handleProfileTap() {
    hapticService?.trigger("selection");
    onModuleChange?.("settings" as ModuleId);
    closeDrawer();
    // Navigate to profile tab after settings module loads
    setTimeout(() => {
      import("../state/navigation-state.svelte").then(({ navigationState }) => {
        navigationState.setActiveTab("profile");
      });
    }, 50);
  }

  async function handleSignOut() {
    hapticService?.trigger("selection");
    closeDrawer();
    try {
      await authState.signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  }

  // Listen for custom event from primary navigation
  onMount(() => {
    const handleToggleEvent = () => {
      if (isOpen) {
        closeDrawer();
      } else {
        openDrawer();
      }
    };
    window.addEventListener("module-switcher-toggle", handleToggleEvent);

    return () => {
      window.removeEventListener("module-switcher-toggle", handleToggleEvent);
    };
  });
</script>

<!-- Drawer Component -->
<Drawer
  bind:isOpen
  ariaLabel="Module navigation menu"
  class="module-switcher-drawer"
  backdropClass="module-switcher-backdrop"
  placement={drawerPlacement}
  showHandle={drawerPlacement === "bottom"}
  closeOnBackdrop={true}
>
  <div class="module-switcher-container">
    <!-- Header -->
    <div class="module-switcher-header">
      <button
        type="button"
        class="drill-back-button"
        class:visible={selectedModule !== null}
        aria-label="Back to all modules"
        aria-hidden={selectedModule === null}
        tabindex={selectedModule === null ? -1 : 0}
        onclick={handleDrillBack}
      >
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
      </button>
      <div class="header-content">
        <h2>{selectedModule?.label ?? "Navigation"}</h2>
        <div class="current-location">
          <span class="module-name">
            {selectedModule
              ? "Choose a destination"
              : `Currently in ${currentModuleName}`}
          </span>
        </div>
      </div>
      <button
        class="close-button"
        onclick={closeDrawer}
        aria-label="Close menu"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Content: sized by the list; scrolls only at the sheet's height cap -->
    <div
      class="module-switcher-content themed-scrollbar"
      bind:this={listScroller}
    >
      <Crossfade
        key={selectedModuleId ?? "__modules__"}
        mode="swap"
        motion="step"
        direction={drillDirection}
        duration={DURATION.normal}
        animateHeight={true}
      >
        <div class="navigator-body">
          {#if selectedModule}
            <ModuleDestinationList
              module={selectedModule}
              sections={selectedSections}
              {currentModule}
              currentSection={navigationState.activeTab}
              moduleHomeActive={navigationState.isModuleHomeOpen(
                selectedModule.id
              )}
              onSelect={handleDestinationSelect}
            />
          {:else}
            <ModuleList
              {currentModule}
              {modules}
              onModuleSelect={handleModuleSelect}
            />
          {/if}
        </div>
      </Crossfade>
    </div>

    <!-- Account Footer -->
    <div class="account-footer">
      <AccountRow
        variant="drawer"
        onclick={userPreviewState.isActive
          ? undefined
          : isFullAccount
            ? handleProfileTap
            : closeDrawer}
      />
      <div class="account-footer-actions" class:full-account={isFullAccount}>
        {#if isFullAccount}
          <button
            class="drawer-action inbox"
            onclick={handleInboxClick}
            aria-label="Inbox"
          >
            <div class="drawer-action-icon-wrapper">
              <i class="fas fa-inbox" aria-hidden="true"></i>
              {#if hasUnread && unreadCount > 0}
                <span class="drawer-unread-badge"
                  >{unreadCount > 99 ? "99+" : unreadCount}</span
                >
              {/if}
            </div>
            <span>Inbox</span>
          </button>
        {/if}
        <button
          class="drawer-action"
          onclick={handleAccountSettings}
          aria-label="Settings"
        >
          <i class="fas fa-cog" aria-hidden="true"></i>
          <span>Settings</span>
        </button>
        <button
          class="drawer-action release-notes"
          onclick={handleWhatsNew}
          aria-label="Open release notes"
        >
          <i class="fas fa-gift" aria-hidden="true"></i>
          <span>Release Notes</span>
        </button>
        <button
          class="drawer-action support"
          onclick={() => supportModalState.show()}
          aria-label="Support"
        >
          <i class="fas fa-heart" aria-hidden="true"></i>
          <span>Support</span>
        </button>
        {#if isFullAccount}
          <button
            class="drawer-action sign-out"
            onclick={handleSignOut}
            aria-label="Sign out"
          >
            <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
            <span>Sign Out</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
</Drawer>

<style>
  :global(.module-switcher-drawer) {
    /* Drawer fills viewport appropriately based on placement */
    --sheet-bg: var(--theme-panel-bg);
    --sheet-filter: blur(24px) saturate(140%);
    --sheet-border: 1px solid var(--theme-stroke);
    --sheet-radius-large: 20px;
    box-sizing: border-box;
  }

  /* Bottom placement: the sheet is as tall as its header, list, and footer,
     up to the height cap, and no wider than 720px (centered past that, like
     iPad and Material bottom sheets). The list region scrolls at the cap. */
  :global(.module-switcher-drawer[data-placement="bottom"]) {
    --sheet-max-height: 100dvh;
    --sheet-max-width: 720px;
    --sheet-min-height: 0px;
  }

  @media (min-width: 700px) and (min-height: 500px) {
    :global(.module-switcher-drawer[data-placement="bottom"]) {
      --sheet-max-height: 85dvh;
      border-radius: var(--sheet-radius-large, 20px)
        var(--sheet-radius-large, 20px) 0 0;
    }
  }

  /* Left placement: Full height, partial width.
     top/bottom/height are the Drawer left defaults (dropped). Width routes
     through --sheet-width; max-width has no var so it stays (Drawer left
     doesn't set max-width, so it wins on its own). */
  :global(.module-switcher-drawer[data-placement="left"]) {
    --sheet-width: 320px;
    max-width: 85vw;
  }

  :global(.module-switcher-backdrop) {
    --sheet-backdrop-bg: rgba(0, 0, 0, 0.4);
    --sheet-backdrop-filter: blur(3px);
  }

  /* Drawer inner fills available height */
  :global(.drawer-content.module-switcher-drawer .drawer-inner) {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .module-switcher-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    flex: 1;
    min-height: 0;
  }

  .module-switcher-header {
    display: grid;
    grid-template-columns: var(--min-touch-target) minmax(0, 1fr) var(
        --min-touch-target
      );
    align-items: center;
    padding: 16px 16px 14px; /* Adjusted for larger close button */
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
    gap: 16px; /* More space between header content and close button */
    position: relative;
  }

  /* Subtle gradient accent at top of header */
  .module-switcher-header::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--theme-accent) 30%, transparent),
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 30%,
        transparent
      ),
      transparent
    );
  }

  .header-content {
    min-width: 0;
  }

  .drill-back-button {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--transition-normal),
      background-color var(--transition-normal),
      border-color var(--transition-normal),
      color var(--transition-normal);
  }

  .drill-back-button.visible {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .drill-back-button:hover {
    border-color: var(--theme-stroke);
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .drill-back-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .module-switcher-header h2 {
    margin: 0 0 4px 0;
    font-size: var(--font-size-xl); /* Larger, more prominent on mobile */
    font-weight: 700;
    color: var(--theme-text, var(--theme-text));
    letter-spacing: -0.01em;
  }

  .current-location {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(
      --font-size-sm
    ); /* Increased from 12px for better mobile readability */
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .module-name {
    font-weight: 600;
    color: var(
      --theme-text,
      rgba(255, 255, 255, 0.75)
    ); /* Slightly more prominent */
  }

  /* Close button - accessible touch target (50px minimum) */
  .close-button {
    width: var(
      --min-touch-target
    ); /* Increased from 36px for proper touch target */
    height: var(
      --min-touch-target
    ); /* Increased from 36px for proper touch target */
    border-radius: 12px; /* Slightly larger to match new size */
    background: transparent;
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-base); /* Slightly larger icon */
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal),
      color var(--transition-normal),
      transform var(--transition-normal);
    flex-shrink: 0;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-stroke));
    color: var(--theme-text);
  }

  .close-button:active {
    transform: scale(0.95);
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
  }

  /* Shrinks below its content only when the sheet hits its height cap; the
     header and footer never shrink. The gutter is reserved on both edges so
     the grid width (and so its column count) never flips when a scrollbar
     appears. */
  .module-switcher-content {
    flex: 0 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable both-edges;
    -webkit-overflow-scrolling: touch;
  }

  .navigator-body {
    box-sizing: border-box;
    padding: 12px 20px 16px;
  }

  /* Landscape mobile - optimize for left drawer */
  @media (max-height: 600px) and (orientation: landscape) {
    .module-switcher-header {
      padding: 12px 14px 10px;
    }

    .module-switcher-header h2 {
      font-size: var(--font-size-lg); /* Keep it readable in landscape */
    }

    .current-location {
      font-size: var(--font-size-compact);
    }

    .navigator-body {
      padding: 10px 16px 12px;
    }

    :global(.module-switcher-drawer[data-placement="left"]) {
      --sheet-width: 280px; /* Slightly narrower in landscape */
    }
  }

  /* Portrait mobile - maintain readability */
  @media (max-width: 500px) and (orientation: portrait) {
    .module-switcher-header {
      padding: 14px 14px 12px;
    }

    .module-switcher-header h2 {
      font-size: var(
        --font-size-lg
      ); /* Slightly smaller on very small screens */
    }

    .current-location {
      font-size: var(--font-size-sm); /* Maintain readability */
    }

    .navigator-body {
      padding: 12px 16px 16px;
    }

    .account-footer {
      padding-inline: 16px;
    }
  }

  /* Widescreen bottom drawer: tighten padding so content is compact */
  @media (min-width: 700px) and (min-height: 500px) {
    .module-switcher-header {
      padding: 12px 16px 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .close-button,
    .drill-back-button {
      transition: none;
    }

    .close-button:active {
      transform: none;
    }
  }

  @media (prefers-contrast: high) {
    :global(.module-switcher-drawer) {
      --sheet-bg: rgba(0, 0, 0, 0.98);
      --sheet-border: 2px solid white;
    }

    .close-button {
      background: rgba(255, 255, 255, 0.95);
      border: 2px solid white;
      color: black;
    }
  }

  .account-footer {
    flex-shrink: 0;
    padding: 10px 20px max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--theme-stroke);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .drawer-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    flex: 1;
    box-sizing: border-box; /* Keep padding and borders inside each equal share. */
    min-width: 0; /* allow equal narrow columns to shrink without overflow */
    min-height: var(--min-touch-target, 50px);
    padding: 6px 4px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    cursor: pointer;
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-fast);
  }

  /* Every label reserves two lines so icons stay aligned when Release Notes
     wraps in the five-button signed-in footer. */
  .drawer-action > span {
    font-size: var(--font-size-compact, 12px);
    line-height: 1.05;
    min-height: 2.1em;
    display: grid;
    place-items: center;
    text-align: center;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .drawer-action:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .drawer-action:active {
    transform: scale(0.97);
  }

  .drawer-action:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    outline-offset: 2px;
  }

  .drawer-action i {
    font-size: var(--font-size-base, 16px);
  }

  /* Inbox - blue accent */
  .drawer-action.inbox {
    color: var(--semantic-info, #3b82f6);
    border-color: color-mix(
      in srgb,
      var(--semantic-info, #3b82f6) 25%,
      transparent
    );
  }

  .drawer-action.inbox:hover {
    background: color-mix(
      in srgb,
      var(--semantic-info, #3b82f6) 10%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-info, #3b82f6) 40%,
      transparent
    );
  }

  /* Sign Out - red by default */
  .drawer-action.sign-out {
    color: var(--semantic-error, #ef4444);
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 25%,
      transparent
    );
  }

  .drawer-action.sign-out:hover {
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error) 40%, transparent);
  }

  .drawer-action.support {
    text-decoration: none;
  }
  .drawer-action.support i {
    color: #f472b6; /* warm pink heart */
  }
  .drawer-action.support:hover {
    border-color: color-mix(in srgb, #f472b6 40%, transparent);
  }

  .drawer-action.release-notes i {
    color: var(--theme-accent);
  }

  .drawer-action.release-notes:hover {
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .account-footer-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 3rem), 1fr));
    align-items: stretch;
    gap: 8px;
  }

  /* A 280px landscape drawer cannot hold five useful columns. Three actions
     stay on the first row; Support and Sign Out sit centered beneath them. */
  @media (max-height: 600px) and (orientation: landscape) {
    .account-footer {
      padding: 6px;
      gap: 0;
    }

    :global(.account-footer .account-row.drawer) {
      display: none;
    }

    .account-footer-actions,
    .account-footer-actions.full-account {
      display: flex;
      gap: 4px;
    }

    .drawer-action {
      min-height: var(--min-touch-target);
      padding: 4px;
      gap: 0;
      border-radius: 10px;
    }

    .drawer-action > span {
      display: none;
    }
  }

  .drawer-action-icon-wrapper {
    position: relative;
  }

  /* Unread count as a badge pinned to the icon corner — min-width keeps
     the icon steady when the count grows from 1 to 2+ digits (no shift). */
  .drawer-unread-badge {
    position: absolute;
    top: -7px;
    right: -10px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--semantic-error, #ef4444);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .drawer-action {
      transition: none;
    }
  }
</style>
