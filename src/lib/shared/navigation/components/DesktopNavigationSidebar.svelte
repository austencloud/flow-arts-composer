<!-- Desktop Navigation Sidebar -->
<!-- Thin wrapper over @austencloud/sidebar. The package owns the hover-expand
     overlay shell, the morphing module/section tree, the brand slide-reveal +
     pin, and the reserved-width behaviour. This wrapper supplies TKA's data and
     bridges TKA services (i18n, haptics, auth, feature flags, inbox) to the
     package's DI seam, and reparents TKA's footer + settings + account popover +
     admin context menu into the package's slots/callbacks. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    Sidebar,
    type ModuleDefinition as SidebarModuleDefinition,
  } from "@austencloud/sidebar";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "../../application/services/haptic-feedback";
  import type { ModuleDefinition, Section, ModuleId } from "../domain/types";
  import {
    desktopSidebarState,
    setDesktopSidebarCollapsed,
    initializeDesktopSidebarCollapsedState,
    saveDesktopSidebarCollapsedState,
  } from "../../layout/desktop-sidebar-state.svelte";
  import SidebarFooter from "./desktop-sidebar/SidebarFooter.svelte";
  import SidebarContextMenu from "./desktop-sidebar/SidebarContextMenu.svelte";
  import type { ContextMenuState } from "./desktop-sidebar/SidebarContextMenu.svelte";
  import AccountPopover from "./account/AccountPopover.svelte";
  import {
    navigationState,
    SETTINGS_TABS,
  } from "../state/navigation-state.svelte";
  import { featureFlagService } from "../../auth/services/post-hog-feature-flag-service.svelte";
  import { authState } from "../../auth/state/auth-state.svelte";
  import { resolveAccessTier } from "../../auth/domain/access-tier";
  import { isTabAccessible } from "../../auth/domain/guest-access-config";
  import { isPremiumOrAbove } from "../../auth/domain/models/user-role";
  import { inboxState } from "../../inbox/state/inbox-state.svelte";
  import { prefetchOnIntent } from "../utils/module-prefetch";
  import { t } from "../../i18n/i18n.svelte";
  import { getReactiveLocale } from "../../i18n/locale-state.svelte";

  let {
    currentModule,
    currentSection,
    modules = [],
    onModuleChange,
    onModuleHomeSelect,
    onSectionChange,
    onHeightChange,
    isEntryAnimating = false,
  } = $props<{
    currentModule: string;
    currentSection: string;
    modules: ModuleDefinition[];
    onModuleChange?: (
      moduleId: ModuleId,
      targetTab?: string
    ) => void | Promise<void>;
    onModuleHomeSelect?: (moduleId: ModuleId) => void;
    onSectionChange?: (sectionId: string) => void;
    onHeightChange?: (height: number) => void;
    isEntryAnimating?: boolean;
  }>();

  let hapticService: HapticFeedback | undefined;
  const MODULE_HOME_SECTION_PREFIX = "__module-home__:";

  function moduleHomeSectionId(moduleId: string): string {
    return `${MODULE_HOME_SECTION_PREFIX}${moduleId}`;
  }

  function isModuleHomeSection(
    moduleId: string,
    sectionId: string | undefined
  ): boolean {
    return sectionId === moduleHomeSectionId(moduleId);
  }

  // Pin state is the package's model (rail vs pinned). It is kept in lockstep
  // with the legacy desktopSidebarState so MainInterface's reserved-width var
  // (--desktop-sidebar-width = desktopSidebarState.width) keeps working
  // unchanged. Seeded from storage on mount; persisted on change.
  let sidebarPinned = $state(false);
  $effect(() => {
    setDesktopSidebarCollapsed(!sidebarPinned);
    saveDesktopSidebarCollapsedState(!sidebarPinned);
  });

  const isInSettings = $derived(navigationState.currentModule === "settings");

  const accessTier = $derived(
    resolveAccessTier(
      authState.isAuthenticated,
      authState.isAnonymous,
      isPremiumOrAbove(authState.role)
    )
  );

  function onHaptic() {
    hapticService?.trigger("selection");
  }

  function translateLabel(id: string): string {
    getReactiveLocale(); // re-run on locale change
    if (isInSettings) {
      const settingsTab = SETTINGS_TABS.find((tab) => tab.id === id);
      if (settingsTab) return t(settingsTab.labelKey);
    }
    const m = modules.find((x: ModuleDefinition) => x.id === id);
    return m ? t(m.labelKey) : id;
  }

  function translateSectionLabel(
    moduleId: string,
    sectionId: string,
    fallback: string
  ): string {
    getReactiveLocale();
    const m = modules.find((x: ModuleDefinition) => x.id === moduleId);
    if (m?.home && isModuleHomeSection(moduleId, sectionId)) {
      return m.home.optionLabel ?? m.home.label;
    }
    const s = m?.sections.find((x: Section) => x.id === sectionId);
    return s ? t(s.labelKey) : fallback;
  }

  // Role-based access + guest-tier gating (mirrors the old getFilteredSections).
  function filterSection(moduleId: string, sectionId: string): boolean {
    if (isModuleHomeSection(moduleId, sectionId)) return true;
    return (
      featureFlagService.canAccessTab(moduleId as ModuleId, sectionId) &&
      isTabAccessible(moduleId as ModuleId, sectionId, accessTier)
    );
  }

  function getBadgeCount(moduleId: string, sectionId?: string): number {
    if (moduleId === "inbox") {
      return sectionId ? 0 : inboxState.totalUnreadCount;
    }
    if (moduleId === "dashboard" && !sectionId) {
      return inboxState.unreadNotificationCount;
    }
    return 0;
  }

  function onModuleHover(id: string) {
    if (isInSettings) return;
    prefetchOnIntent(id);
  }

  // Package calls with plain strings; TKA's onModuleChange wants ModuleId.
  // Link-out entries (e.g. Shop, `linkHref` set) navigate away instead of
  // activating a module — the external @austencloud/sidebar package has no
  // concept of a plain link cell, so this is the seam that intercepts it.
  function handleModuleChange(moduleId: string, targetSection?: string) {
    if (isInSettings) {
      const settingsTab = SETTINGS_TABS.find((tab) => tab.id === moduleId);
      if (settingsTab) {
        onSectionChange?.(settingsTab.id);
        return;
      }
    }

    const def = modules.find((m: ModuleDefinition) => m.id === moduleId);
    if (def?.linkHref) {
      goto(def.linkHref);
      return;
    }
    if (isModuleHomeSection(moduleId, targetSection)) {
      return onModuleHomeSelect?.(moduleId as ModuleId);
    }
    return onModuleChange?.(moduleId as ModuleId, targetSection);
  }

  function handleSectionChange(sectionId: string) {
    if (isModuleHomeSection(currentModule, sectionId)) {
      return onModuleHomeSelect?.(currentModule as ModuleId);
    }
    return onSectionChange?.(sectionId);
  }

  // --- Admin context menu (host-rendered) -----------------------------------
  let contextMenuState = $state<ContextMenuState>({ mode: "closed" });

  function openModuleContextMenu(moduleId: string, e: MouseEvent) {
    const m = modules.find((x: ModuleDefinition) => x.id === moduleId);
    if (!m || !m.sections.length) return;
    contextMenuState = {
      mode: "module",
      moduleId: moduleId as ModuleId,
      moduleLabel: m.label,
      x: e.clientX,
      y: e.clientY,
    };
  }

  function openSectionContextMenu(
    moduleId: string,
    sectionId: string,
    e: MouseEvent
  ) {
    if (isModuleHomeSection(moduleId, sectionId)) return;
    const m = modules.find((x: ModuleDefinition) => x.id === moduleId);
    const s = m?.sections.find((x: Section) => x.id === sectionId);
    contextMenuState = {
      mode: "tab",
      moduleId: moduleId as ModuleId,
      tabId: sectionId,
      tabLabel: s?.label ?? sectionId,
      x: e.clientX,
      y: e.clientY,
    };
  }

  function closeContextMenu() {
    contextMenuState = { mode: "closed" };
  }

  // --- Account popover (rendered outside nav to avoid overflow clipping) -----
  let accountPopoverOpen = $state(false);
  let accountSectionEl = $state<HTMLElement | null>(null);

  function toggleAccountPopover() {
    accountPopoverOpen = !accountPopoverOpen;
  }

  function closeAccountPopover() {
    accountPopoverOpen = false;
  }

  // Keep the hover overlay open while an anchored popover/menu is showing.
  const heldOpen = $derived(
    contextMenuState.mode !== "closed" || accountPopoverOpen
  );

  async function handleOpenSettings() {
    hapticService?.trigger("selection");
    if (navigationState.currentModule !== "settings") {
      await onModuleChange?.("settings" as ModuleId);
    }
  }

  async function handleSettingsBack() {
    hapticService?.trigger("selection");
    const previousModule = navigationState.previousModule || "create";
    await onModuleChange?.(
      previousModule as ModuleId,
      navigationState.previousTab || undefined
    );
  }

  // Settings is one flat destination list, not a Settings menu containing a
  // second menu. Present each tab through the package's top-level module row so
  // its icon stays put while the label appears beside it.
  const hostModules = $derived<SidebarModuleDefinition[]>(
    isInSettings
      ? SETTINGS_TABS.filter(
          (tab) =>
            !tab.navigationHidden &&
            featureFlagService.canAccessTab("settings", tab.id)
        ).map((tab) => ({
          id: tab.id,
          label: tab.label,
          icon: tab.icon,
          color: "#64748b",
          isMain: true,
          sections: [],
        }))
      : modules.map((module) => ({
          ...module,
          sections: module.home
            ? [
                {
                  id: moduleHomeSectionId(module.id),
                  label: module.home.optionLabel ?? module.home.label,
                  icon: module.home.icon ?? module.icon,
                  color: module.color,
                  gradient: module.color,
                },
                ...module.sections,
              ]
            : module.sections,
        }))
  );
  const hostCurrentModule = $derived(
    isInSettings
      ? SETTINGS_TABS.find((tab) => tab.id === navigationState.activeTab)
          ?.navigationHidden
        ? "preferences"
        : navigationState.activeTab
      : currentModule
  );
  const hostCurrentSection = $derived(
    !isInSettings && navigationState.isModuleHomeOpen(currentModule as ModuleId)
      ? moduleHomeSectionId(currentModule)
      : currentSection
  );

  onMount(() => {
    hapticService = getHapticFeedback();
    initializeDesktopSidebarCollapsedState();
    sidebarPinned = !desktopSidebarState.isCollapsed;
  });
</script>

<Sidebar
  navigationLabel={t("nav_main_navigation")}
  homeLabel={t("nav_go_home")}
  pinLabel={t("nav_pin_sidebar")}
  collapseLabel={t("nav_collapse_sidebar")}
  modules={hostModules}
  currentModule={hostCurrentModule}
  currentSection={hostCurrentSection}
  bind:pinned={sidebarPinned}
  railWidth={desktopSidebarState.collapsedWidth}
  expandedWidth={desktopSidebarState.expandedWidth}
  homeHref="/"
  onModuleChange={handleModuleChange}
  onSectionChange={handleSectionChange}
  onModuleContextMenu={featureFlagService.isAdmin && !isInSettings
    ? openModuleContextMenu
    : undefined}
  onSectionContextMenu={featureFlagService.isAdmin
    ? openSectionContextMenu
    : undefined}
  {onModuleHover}
  {onHaptic}
  {translateLabel}
  {translateSectionLabel}
  {filterSection}
  {getBadgeCount}
  holdOpen={heldOpen}
  class={`${isEntryAnimating ? "tka-sidebar-entry " : ""}ghost-hover-boundary`}
>
  <!-- Wordmark in the brand hero face (Fraunces italic 700), matching the
       landing SiteHeader wordmark so both read as one brand. Both words share
       the treatment to preserve the package's slide-reveal morph: the rail
       face shows "Flow", expanding reveals " Arts Composer". -->
  {#snippet brandLead()}<span class="brand-wordmark">Flow</span>{/snippet}
  {#snippet brandRest()}<span class="brand-wordmark">{" Arts Composer"}</span
    >{/snippet}

  {#snippet beforeTree(expanded)}
    {#if isInSettings}
      <div class="sidebar-settings-nav" class:collapsed={!expanded}>
        <button
          type="button"
          class="settings-back-button"
          class:collapsed={!expanded}
          onclick={handleSettingsBack}
          aria-label={t("nav_ui_back_to_modules")}
        >
          <span class="back-icon">
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
          </span>
          <span class="back-label" aria-hidden={!expanded}
            >{t("learn_back")}</span
          >
        </button>
      </div>
    {/if}
  {/snippet}

  {#snippet footer(expanded)}
    <SidebarFooter
      isCollapsed={!expanded}
      {isInSettings}
      onSettingsClick={handleOpenSettings}
      onAccountClick={toggleAccountPopover}
      bind:accountSectionElement={accountSectionEl}
    />
  {/snippet}
</Sidebar>

<!-- Context menu + account popover rendered outside the nav (overflow clipping) -->
<SidebarContextMenu menuState={contextMenuState} onClose={closeContextMenu} />
<AccountPopover
  isOpen={accountPopoverOpen}
  onClose={closeAccountPopover}
  anchorElement={accountSectionEl}
/>

<style>
  /* Ghost uses the package's real pointer-enter controller to open the rail,
     then `.ghost-hover` mirrors the visual half of a desktop mouseover while
     it pauses over each option. The package's scoped :hover rules cannot see a
     synthetic class added by the presenter, so the host owns this bridge. */
  :global(.ghost-hover-boundary .module-button.ghost-hover) {
    color: var(--theme-text);
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke);
    transform: translateX(3px);
  }

  :global(.ghost-hover-boundary .module-button.ghost-hover .module-icon) {
    transform: scale(1.08);
  }

  :global(.ghost-hover-boundary .section-button.ghost-hover:not(.disabled)) {
    color: var(--theme-text);
    background: var(--theme-card-bg);
    transform: translateX(3px);
  }

  :global(
    .ghost-hover-boundary
      .section-button.ghost-hover:not(.disabled)
      .section-icon
  ) {
    transform: scale(1.15);
  }

  /* Brand wordmark face — same as the landing SiteHeader .logo-text. The
     @austencloud/sidebar package leaves the brand font-family unset (inherits
     the app sans); these snippets override it to the Fraunces italic voice so
     the desktop-nav "TKA" matches the landing "TKA". Size + gradient stay owned
     by the package's .brand. Authored here, so this scoped rule reaches the
     span even though it renders inside the package. */
  .brand-wordmark {
    display: block;
    font-family: "Fraunces", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    /* "Flow Arts Composer" must clear the absolutely-placed pin toggle inside
       the 220px expanded sidebar (~160px of text room). The package's 1.05rem
       overflows; 0.9rem + tighter tracking fits with margin. Both words share
       the size so the slide-reveal morph never changes font mid-transition. */
    font-size: 0.9rem;
    letter-spacing: 0.01em;
  }

  /* The package mounts the always-visible word directly in a flex row, while
     the revealed words sit inside its clipping wrapper. Centering that wrapper
     gives both snippets the same line box, so the expanded name reads as one
     continuous wordmark instead of "Flow" floating above the rest. */
  :global(.ghost-hover-boundary .brand-rest-text) {
    display: flex;
    align-items: center;
  }

  /* ============================================================================
     SETTINGS SUB-NAV (rendered via the package's beforeTree slot)
     ============================================================================ */
  .sidebar-settings-nav {
    width: 100%;
    margin-bottom: 4px;
  }

  .settings-back-button {
    width: 100%;
    height: var(--min-touch-target);
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0 14px 0 0;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    cursor: pointer;
    overflow: hidden;
    transition:
      background-color var(--duration-normal) ease,
      border-color var(--duration-normal) ease,
      color var(--duration-normal) ease;
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  .settings-back-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .settings-back-button.collapsed {
    padding: 0;
  }

  .back-icon {
    width: var(--min-touch-target);
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: var(--font-size-base);
  }

  .back-label {
    flex: 1;
    text-align: left;
    font-weight: 500;
    white-space: nowrap;
    opacity: 1;
    transition: opacity var(--duration-normal) ease;
  }

  .settings-back-button.collapsed .back-label {
    opacity: 0;
  }

  .settings-back-button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-back-button,
    .back-label {
      transition: none !important;
    }
  }
</style>
