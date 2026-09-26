<!--
  ModuleQuickToggle - Full-viewport modal for managing module visibility and order

  Layout:
  - LEFT: Hidden modules (globally disabled) - tap to enable
  - RIGHT: Visible modules (enabled AND user has access) - tap to disable, drag to reorder

  Features:
  - Toggles GLOBAL feature flag enabled state (same as Permission Matrix)
  - Module order is still per-user preference
  - Core modules (create, browse, creators, settings, admin) shown with lock icon, cannot be disabled
  - Uses svelte-dnd-action for drag-and-drop
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import { flip } from "svelte/animate";
  import { dragHandleZone, dragHandle } from "svelte-dnd-action";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import {
    featureFlagService,
    featureFlagState,
  } from "../../../auth/services/post-hog-feature-flag-service.svelte";
  import { getModuleDefinitions } from "../../../navigation-coordinator/navigation-coordinator.svelte";
  import { MODULE_DEFINITIONS } from "../../config/module-definitions";
  import { moduleIdToFeatureId } from "../../../auth/domain/models/feature-flag";
  import { isModuleEnabledInEnvironment } from "../../../environment/environment-features";
  import { toast } from "../../../toast/state/toast-state.svelte";
  import type { ModuleDefinition, ModuleId } from "../../domain/types";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";

  interface Props {
    isCollapsed: boolean;
  }

  let { isCollapsed }: Props = $props();

  let hapticService: HapticFeedback = null!;
  let open = $state(false);
  let saving = $state(false);
  let savingModuleId = $state<string | null>(null);

  // DND configuration
  const FLIP_DURATION_MS = 200;

  // Core modules that cannot be toggled (always visible, shown but not clickable)
  const CORE_MODULES: ModuleId[] = [
    "create",
    "browse",
    "creators",
    "settings",
    "admin",
  ];

  // Helper to check if a module is a core module
  function isCoreModule(moduleId: ModuleId): boolean {
    return CORE_MODULES.includes(moduleId);
  }

  // Get modules currently visible in sidebar (enabled AND user has role access)
  // Must use $derived.by() so Svelte tracks reactive reads inside getModuleDefinitions()
  const sidebarModules = $derived.by(() => getModuleDefinitions());

  // Get all main modules (for showing in the UI)
  const allMainModules = $derived.by(() => {
    return MODULE_DEFINITIONS.filter((module) => module.isMain);
  });

  // Get modules that are NOT visible in the sidebar but COULD be enabled
  // Only shows modules that pass environment checks (no point showing env-blocked modules)
  const hiddenModules = $derived.by(() => {
    // Read $state directly (not through getter) to ensure Svelte 5 reactivity
    // These values are updated by updateGlobalFeatureFlag() in the admin UI
    const _flagsVersion = featureFlagState.flagsVersion;
    const _globalOverrides = featureFlagState.globalFlagOverrides;

    // Get the set of currently visible module IDs
    const visibleModuleIds = new Set(sidebarModules.map((m) => m.id));

    return allMainModules.filter((module) => {
      // Core modules are never "hidden" in this UI
      if (isCoreModule(module.id)) return false;

      // Skip modules that are blocked by environment (can't be enabled via flag)
      if (!isModuleEnabledInEnvironment(module.id)) return false;

      // Module is hidden if it's not currently visible in the sidebar
      return !visibleModuleIds.has(module.id);
    });
  });

  // Visible modules - mutable state for reordering
  // svelte-dnd-action requires items to have an `id` property
  let visibleModules = $state<ModuleDefinition[]>([]);

  // Sync visibleModules when source data changes
  $effect(() => {
    const overrides = featureFlagService.userOverrides;
    const moduleOrder = overrides.moduleOrder || [];
    const enabledModules = sidebarModules.filter((m) => m.isMain);

    const ordered: ModuleDefinition[] = [];
    const seenIds = new Set<string>();

    // First, add modules in the custom order (skip duplicates)
    for (const id of moduleOrder) {
      if (seenIds.has(id)) continue;
      const mod = enabledModules.find((m) => m.id === id);
      if (mod) {
        ordered.push(mod);
        seenIds.add(id);
      }
    }

    // Then add remaining enabled modules not in the order
    for (const mod of enabledModules) {
      if (!seenIds.has(mod.id)) {
        ordered.push(mod);
        seenIds.add(mod.id);
      }
    }

    visibleModules = ordered;
  });

  // DRAG AND DROP with svelte-dnd-action

  // Handle drag events from svelte-dnd-action
  function handleDndConsider(e: CustomEvent<{ items: ModuleDefinition[] }>) {
    visibleModules = e.detail.items;
    hapticService?.trigger("selection");
  }

  function handleDndFinalize(e: CustomEvent<{ items: ModuleDefinition[] }>) {
    visibleModules = e.detail.items;
    hapticService?.trigger("success");

    // Persist order to user preferences
    saveOrder(visibleModules.map((m) => m.id));
  }

  // Transformer to prevent dragging core modules
  function transformDraggedElement(
    element?: HTMLElement,
    data?: unknown,
    index?: number
  ): void {
    if (!element || !data) return;

    // Style the dragged element
    element.style.boxShadow =
      "0 25px 50px rgba(0, 0, 0, 0.5), 0 10px 20px rgba(0, 0, 0, 0.3)";
    element.style.transform = "scale(1.05) rotate(2deg)";
    element.style.zIndex = "999999";
  }

  function openModal() {
    hapticService?.trigger("selection");
    open = true;
  }

  function closeModal() {
    hapticService?.trigger("selection");
    open = false;
  }

  // MODULE VISIBILITY - Now uses global feature flags

  /**
   * Enable a module globally (sets feature flag enabled: true)
   */
  async function showModule(module: ModuleDefinition) {
    if (!featureFlagService.isAdmin) {
      toast.error("Admin access required to enable modules");
      return;
    }

    saving = true;
    savingModuleId = module.id;
    hapticService?.trigger("selection");

    try {
      const featureId = moduleIdToFeatureId(module.id);
      const result = await featureFlagService.updateGlobalFeatureFlag(
        featureId,
        {
          enabled: true,
        }
      );

      toast.success(`${module.label} enabled`, 2000);
      hapticService?.trigger("success");

      // Update user overrides: add to module order AND remove from disabledFeatures
      const currentOverrides = featureFlagService.userOverrides;
      const currentOrder =
        currentOverrides.moduleOrder || visibleModules.map((m) => m.id);
      const currentDisabled = currentOverrides.disabledFeatures || [];

      // Check if we need to update user overrides
      const needsOrderUpdate = !currentOrder.includes(module.id);
      const needsDisabledUpdate = currentDisabled.includes(featureId);

      if (needsOrderUpdate || needsDisabledUpdate) {
        const userId = featureFlagService.userId;
        if (userId) {
          await featureFlagService.setUserFeatureOverrides(userId, {
            ...currentOverrides,
            moduleOrder: needsOrderUpdate
              ? [...currentOrder, module.id]
              : currentOrder,
            // Remove from disabledFeatures if present (user override was blocking it)
            disabledFeatures: currentDisabled.filter((f) => f !== featureId),
          });
        }
      }
    } catch (error) {
      console.error("Failed to enable module:", error);
      const errorMessage =
        error instanceof Error ? error.message : t("nav_ui_unknown_error");
      toast.error(`Failed to enable ${module.label}: ${errorMessage}`);
      hapticService?.trigger("error");
    } finally {
      saving = false;
      savingModuleId = null;
    }
  }

  /**
   * Disable a module globally (sets feature flag enabled: false)
   */
  async function hideModule(module: ModuleDefinition) {
    if (!featureFlagService.isAdmin) {
      toast.error("Admin access required to disable modules");
      return;
    }

    saving = true;
    savingModuleId = module.id;
    hapticService?.trigger("selection");

    try {
      const featureId = moduleIdToFeatureId(module.id);
      await featureFlagService.updateGlobalFeatureFlag(featureId, {
        enabled: false,
      });

      toast.success(`${module.label} disabled`, 2000);
      hapticService?.trigger("success");

      // Update user overrides: remove from module order, add to disabledFeatures,
      // and REMOVE from enabledFeatures (enabledFeatures bypasses all other checks)
      const currentOverrides = featureFlagService.userOverrides;
      const currentOrder =
        currentOverrides.moduleOrder || visibleModules.map((m) => m.id);
      const currentDisabled = currentOverrides.disabledFeatures || [];
      const currentEnabled = currentOverrides.enabledFeatures || [];

      const newOrder = currentOrder.filter((id) => id !== module.id);
      const newDisabled = currentDisabled.includes(featureId)
        ? currentDisabled
        : [...currentDisabled, featureId];
      const newEnabled = currentEnabled.filter((f) => f !== featureId);

      const userId = featureFlagService.userId;
      if (userId) {
        await featureFlagService.setUserFeatureOverrides(userId, {
          ...currentOverrides,
          moduleOrder: newOrder,
          disabledFeatures: newDisabled,
          enabledFeatures: newEnabled,
        });
      }
    } catch (error) {
      console.error("Failed to disable module:", error);
      const errorMessage =
        error instanceof Error ? error.message : t("nav_ui_unknown_error");
      toast.error(`Failed to disable ${module.label}: ${errorMessage}`);
      hapticService?.trigger("error");
    } finally {
      saving = false;
      savingModuleId = null;
    }
  }

  /**
   * Save module order (per-user preference, not global)
   */
  async function saveOrder(newOrder: string[]) {
    const userId = featureFlagService.userId;
    if (!userId) return;

    const currentOverrides = featureFlagService.userOverrides;
    const oldOrder = currentOverrides.moduleOrder || [];

    // Check if order changed
    const orderChanged =
      newOrder.length !== oldOrder.length ||
      newOrder.some((id, i) => oldOrder[i] !== id);

    if (!orderChanged) return;

    saving = true;

    try {
      await featureFlagService.setUserFeatureOverrides(userId, {
        ...currentOverrides,
        moduleOrder: newOrder,
      });
    } catch (error) {
      console.error("Failed to reorder modules:", error);
      hapticService?.trigger("error");
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    hapticService = getHapticFeedback();
  });
</script>

<!-- Trigger Button -->
<button
  class="toggle-trigger"
  class:collapsed={isCollapsed}
  onclick={openModal}
  type="button"
  aria-label={t("nav_ui_manage_modules")}
>
  <div class="button-icon">
    <i class="fas fa-sliders-h" aria-hidden="true"></i>
  </div>
  {#if !isCollapsed}
    <span class="button-label">{t("admin_modules")}</span>
  {/if}
</button>

<!-- Full-viewport Modal -->
<BaseModal bind:open size="module-grid" animation="pop">
  {#snippet header()}
    <div class="modal-header">
      <h2 class="modal-title">{t("nav_ui_manage_modules")}</h2>
      <button
        class="close-button"
        onclick={closeModal}
        type="button"
        aria-label={t("action_close")}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  {/snippet}

  <div class="sections-container">
    <!-- Hidden Modules Section (LEFT) - Globally disabled modules -->
    <section class="module-section hidden-section">
      <div class="section-header">
        <h3 class="section-title">
          <i class="fas fa-eye-slash" aria-hidden="true"></i>
          {t("nav_ui_disabled_modules")}
        </h3>
        <span class="section-hint">{t("nav_ui_tap_to_enable_globally")}</span>
      </div>

      {#if hiddenModules.length === 0}
        <div class="empty-state">
          <p>{t("nav_ui_all_modules_enabled")}</p>
          <p class="empty-hint">
            {t("nav_ui_disabled_modules_will_appear_here")}
          </p>
        </div>
      {:else}
        <div
          class="module-grid hidden-grid"
          role="list"
          aria-label={t("nav_ui_disabled_modules")}
        >
          {#each hiddenModules as module (module.id)}
            {@const isThisSaving = savingModuleId === module.id}
            <button
              class="module-cell hidden-module-cell"
              onclick={() => showModule(module)}
              type="button"
              style="--module-color: {module.color}"
              aria-label={t("nav_enable_module", { module: module.label })}
              disabled={saving}
            >
              <div class="cell-background"></div>
              <div class="cell-content">
                {#if isThisSaving}
                  <span class="cell-icon">
                    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                  </span>
                {:else}
                  <span class="cell-icon">{@html module.icon}</span>
                {/if}
                <span class="cell-label">{module.label}</span>
              </div>
              {#if !isThisSaving}
                <div class="add-indicator">
                  <i class="fas fa-plus-circle" aria-hidden="true"></i>
                </div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Divider -->
    <div class="section-divider">
      <span class="divider-line"></span>
      <span class="divider-icon">
        <i class="fas fa-arrows-alt-h" aria-hidden="true"></i>
      </span>
      <span class="divider-line"></span>
    </div>

    <!-- Visible Modules Section (RIGHT) - enabled modules user can access -->
    <section class="module-section visible-section">
      <div class="section-header">
        <h3 class="section-title">
          <i class="fas fa-eye" aria-hidden="true"></i>
          {t("nav_ui_enabled_modules")}
        </h3>
        <span class="section-hint"
          >{t("nav_ui_drag_to_reorder_tap_to_disable")}</span
        >
      </div>

      {#if visibleModules.length === 0}
        <div class="empty-state">
          <p>{t("nav_ui_no_visible_modules")}</p>
          <p class="empty-hint">{t("nav_ui_tap_a_hidden_module_to_add_it")}</p>
        </div>
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="module-grid visible-grid"
          role="list"
          aria-label={t(
            "nav_ui_visible_modules_in_sidebar_order_drag_to_reorder"
          )}
          use:dragHandleZone={{
            items: visibleModules,
            flipDurationMs: FLIP_DURATION_MS,
            dropTargetStyle: {},
            transformDraggedElement,
          }}
          onconsider={handleDndConsider}
          onfinalize={handleDndFinalize}
        >
          {#each visibleModules as module (module.id)}
            {@const isCore = isCoreModule(module.id)}
            {@const isThisSaving = savingModuleId === module.id}
            <div
              class="module-cell visible-module-cell"
              class:core-module={isCore}
              class:is-saving={isThisSaving}
              style="--module-color: {module.color}"
              role="listitem"
              aria-label="{module.label}{isCore
                ? ', always enabled'
                : ', drag to reorder or tap to disable'}"
              animate:flip={{ duration: FLIP_DURATION_MS }}
            >
              <div class="cell-background"></div>
              <div class="cell-glow"></div>
              <div class="cell-content">
                {#if !isCore}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="drag-handle"
                    use:dragHandle
                    aria-label={t("nav_drag_module", { module: module.label })}
                  >
                    <i class="fas fa-grip-vertical" aria-hidden="true"></i>
                  </div>
                {/if}
                {#if isThisSaving}
                  <span class="cell-icon">
                    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                  </span>
                {:else}
                  <span class="cell-icon">{@html module.icon}</span>
                {/if}
                <span class="cell-label">{module.label}</span>
              </div>
              {#if isCore}
                <div class="lock-indicator">
                  <i class="fas fa-lock" aria-hidden="true"></i>
                </div>
              {:else if !isThisSaving}
                <button
                  class="remove-button"
                  onclick={(e) => {
                    e.stopPropagation();
                    hideModule(module);
                  }}
                  type="button"
                  aria-label={t("nav_disable_module", { module: module.label })}
                  disabled={saving}
                >
                  <i class="fas fa-minus-circle" aria-hidden="true"></i>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <!-- Saving indicator -->
  {#if saving}
    <div class="saving-overlay">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>{t("action_saving")}</span>
    </div>
  {/if}
</BaseModal>

<style>
  .toggle-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  .toggle-trigger:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .toggle-trigger.collapsed {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    padding: 0;
    justify-content: center;
    border-radius: 12px;
  }

  .button-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-base);
    border-radius: 8px;
    background: var(--theme-card-bg);
    transition: all var(--duration-normal) ease;
  }

  .toggle-trigger.collapsed .button-icon {
    width: 100%;
    height: 100%;
    background: transparent;
    border-radius: 12px;
  }

  .toggle-trigger:hover .button-icon {
    background: var(--theme-card-hover-bg);
  }

  .button-label {
    flex: 1;
    text-align: left;
    font-weight: 500;
  }

  .toggle-trigger:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    outline-offset: 2px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .modal-title {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text);
  }

  .close-button {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 10px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    font-size: var(--font-size-base);
  }

  .close-button:hover {
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }

  .close-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .sections-container {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 24px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .module-section {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 8px;
  }

  .section-title {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-title i {
    font-size: 12px;
    opacity: 0.7;
  }

  .section-hint {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    font-style: italic;
  }

  .section-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 0;
  }

  .divider-line {
    flex: 1;
    height: 1px;
    background: var(--theme-stroke);
  }

  .divider-icon {
    color: var(--theme-text-dim);
    font-size: 12px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    text-align: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border: 1px dashed var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
  }

  .empty-state p {
    margin: 0;
  }

  .empty-hint {
    font-size: var(--font-size-compact);
    opacity: 0.7;
    margin-top: 4px;
  }

  .module-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 12px;
    flex: 1;
    align-content: start;
    overflow-y: auto;
    min-height: 0;
    padding: 4px;
  }

  .visible-grid {
    min-height: 80px;
  }

  .hidden-grid {
    min-height: 60px;
  }

  .module-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* UNIFORM SIZE - fixed dimensions */
    width: 100%;
    height: 90px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 12px;
    color: var(--theme-text);
    text-align: center;
    overflow: hidden;
    isolation: isolate;
    transition:
      transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.15s ease,
      opacity 0.15s ease;
    user-select: none;
    touch-action: none; /* Prevent scroll during drag */
  }

  .cell-background {
    position: absolute;
    inset: 0;
    border-radius: 12px;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 0;
  }

  .cell-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 50% 25%,
      var(--module-color, #667eea) 0%,
      transparent 60%
    );
    opacity: 0.1;
    transition: opacity var(--duration-emphasis) ease;
    z-index: 1;
    mix-blend-mode: screen;
  }

  .cell-content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 8px;
    width: 100%;
    height: 100%;
    z-index: 2;
  }

  .cell-icon {
    font-size: 24px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--duration-normal) ease;
  }

  .cell-icon :global(svg),
  .cell-icon :global(i) {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
  }

  .cell-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* ============================================================================
     VISIBLE MODULE CELLS - Vibrant, module-colored (shown in sidebar)
     ============================================================================ */
  .visible-module-cell .cell-background {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--module-color) 25%, rgba(255, 255, 255, 0.08)) 0%,
      color-mix(in srgb, var(--module-color) 15%, rgba(255, 255, 255, 0.03))
        100%
    );
    border: 1.5px solid
      color-mix(in srgb, var(--module-color) 50%, rgba(255, 255, 255, 0.2));
    box-shadow: 0 0 20px
      color-mix(in srgb, var(--module-color) 25%, transparent);
  }

  .visible-module-cell .cell-glow {
    opacity: 0.15;
  }

  .visible-module-cell:hover .cell-background {
    border-color: color-mix(
      in srgb,
      var(--module-color) 60%,
      rgba(255, 255, 255, 0.3)
    );
    box-shadow: 0 0 28px
      color-mix(in srgb, var(--module-color) 35%, transparent);
  }

  .visible-module-cell:hover .cell-glow {
    opacity: 0.22;
  }

  .visible-module-cell:hover {
    transform: scale(1.02);
  }

  .visible-module-cell:hover .cell-icon {
    transform: scale(1.1);
  }

  .visible-module-cell .cell-icon :global(svg),
  .visible-module-cell .cell-icon :global(i) {
    filter: drop-shadow(
      0 0 6px color-mix(in srgb, var(--module-color) 40%, transparent)
    );
  }

  /* Drag handle */
  .drag-handle {
    position: absolute;
    top: 6px;
    left: 6px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: grab;
    padding: 4px;
    transition: color var(--duration-fast) ease;
  }

  .drag-handle:hover {
    color: rgba(255, 255, 255, 0.9);
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .visible-module-cell:hover .drag-handle {
    color: rgba(255, 255, 255, 0.8);
  }

  /* Remove button */
  .remove-button {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    border: none;
    border-radius: 6px;
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 80%, transparent);
    font-size: 14px;
    cursor: pointer;
    opacity: 0;
    transition: all var(--duration-fast) ease;
    z-index: 10;
  }

  .remove-button:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .visible-module-cell:hover .remove-button {
    opacity: 1;
  }

  /* Always show remove button on touch devices */
  @media (hover: none) {
    .remove-button {
      opacity: 1;
    }
  }

  /* Core module - always visible, not toggleable, not draggable */
  .visible-module-cell.core-module {
    cursor: default;
  }

  .visible-module-cell.core-module .cell-background {
    opacity: 0.7;
  }

  .visible-module-cell.core-module:hover {
    transform: none;
  }

  .visible-module-cell.core-module:hover .cell-icon {
    transform: none;
  }

  /* Lock indicator for core modules */
  .lock-indicator {
    position: absolute;
    top: 6px;
    right: 6px;
    color: rgba(255, 255, 255, 0.4);
    font-size: var(--font-size-compact, 12px);
  }

  /* ============================================================================
     DRAG STATES (svelte-dnd-action)
     ============================================================================ */

  /* Shadow element (placeholder where item was) */
  :global([data-is-dnd-shadow-item]) {
    opacity: 0.3;
    transform: scale(0.95);
  }

  :global([data-is-dnd-shadow-item] .cell-background) {
    border-style: dashed;
  }

  /* Dragged item styling is handled by transformDraggedElement */

  /* During drag - disable hover effects on other items */
  :global(.svelte-dnd-action-dragging .module-cell) {
    pointer-events: none;
  }

  .hidden-module-cell {
    opacity: 0.85;
    cursor: pointer;
  }

  .hidden-module-cell .cell-background {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--module-color) 12%, rgba(255, 255, 255, 0.04)) 0%,
      color-mix(in srgb, var(--module-color) 6%, rgba(255, 255, 255, 0.02)) 100%
    );
    border: 1.5px solid
      color-mix(in srgb, var(--module-color) 25%, rgba(255, 255, 255, 0.1));
  }

  .hidden-module-cell .cell-icon {
    filter: none;
    opacity: 0.8;
  }

  .hidden-module-cell:hover,
  .hidden-module-cell:active {
    opacity: 1;
    transform: scale(1.02);
  }

  .hidden-module-cell:hover .cell-background,
  .hidden-module-cell:active .cell-background {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--module-color) 20%, rgba(255, 255, 255, 0.06)) 0%,
      color-mix(in srgb, var(--module-color) 10%, rgba(255, 255, 255, 0.03))
        100%
    );
    border-color: color-mix(
      in srgb,
      var(--module-color) 40%,
      rgba(255, 255, 255, 0.2)
    );
  }

  .hidden-module-cell:hover .cell-icon,
  .hidden-module-cell:active .cell-icon {
    opacity: 1;
  }

  .hidden-module-cell .cell-label {
    color: var(--theme-text);
    opacity: 0.85;
  }

  /* Add indicator */
  .add-indicator {
    position: absolute;
    top: 6px;
    right: 6px;
    color: rgba(16, 185, 129, 0.8);
    font-size: 14px;
    opacity: 0.6;
    transition: opacity var(--duration-fast) ease;
  }

  .hidden-module-cell:hover .add-indicator {
    opacity: 1;
  }

  /* ============================================================================
     SAVING STATE (per-module)
     ============================================================================ */
  .module-cell.is-saving {
    opacity: 0.7;
    pointer-events: none;
  }

  .module-cell.is-saving .cell-icon {
    color: var(--theme-accent, #8b5cf6);
  }

  /* ============================================================================
     SAVING OVERLAY (global - deprecated, kept for backwards compatibility)
     ============================================================================ */
  .saving-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.5);
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    z-index: 100;
    border-radius: inherit;
  }

  .module-cell:disabled,
  .remove-button:disabled {
    cursor: not-allowed;
    pointer-events: none;
    opacity: 0.5;
  }

  .module-cell:focus-visible,
  .remove-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (min-width: 768px) {
    .module-grid {
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 12px;
    }

    .module-cell {
      height: 90px;
    }

    .sections-container {
      padding: 24px;
    }
  }

  @media (min-width: 1100px) {
    .sections-container {
      flex-direction: row;
      gap: 24px;
    }

    .module-section {
      flex: 1;
      max-height: 100%;
    }

    .section-divider {
      flex-direction: column;
      padding: 0 12px;
      flex-shrink: 0;
    }

    .divider-line {
      width: 1px;
      height: auto;
      flex: 1;
    }

    .module-grid {
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    }
  }

  @media (max-width: 520px) {
    .sections-container {
      padding: 16px;
    }

    .module-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    .module-cell {
      height: 80px;
    }

    .cell-icon {
      font-size: 22px;
    }

    .cell-label {
      font-size: var(--font-size-compact, 12px);
    }

    .modal-header {
      padding: 16px 16px 12px;
    }

    .modal-title {
      font-size: var(--font-size-base, 16px);
    }

    .section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle-trigger,
    .button-icon,
    .module-cell,
    .close-button,
    .cell-background,
    .cell-glow,
    .cell-icon,
    .drag-handle,
    .remove-button,
    .add-indicator {
      transition: none !important;
    }

    .module-cell:hover,
    .module-cell:active {
      transform: none !important;
    }
  }
</style>
