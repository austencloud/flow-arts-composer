<!--
  SidebarContextMenu - Right-click context menu for sidebar visibility toggling.
  Uses the shared ContextMenu primitive for rendering/positioning.

  Three modes:
  - Tab mode: Single "Hide [Tab Name]" action
  - Module mode: Lists all tabs with toggle checkmarks for batch visibility editing
  - Modules mode: Lists all toggleable modules with enable/disable checkmarks
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    getAllTabsForModule,
    hideTab,
    showTab,
  } from "../../get-sidebar-tab-toggler";
  import type { TabVisibilityInfo } from "../../services/types";
  import type { ModuleId } from "../../domain/types";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getReactiveLocale } from "#lib/shared/i18n/locale-state.svelte.js";
  import {
    featureFlagService,
    featureFlagState,
  } from "../../../auth/services/post-hog-feature-flag-service.svelte";
  import { MODULE_DEFINITIONS } from "../../config/module-definitions";
  import { moduleIdToFeatureId } from "../../../auth/domain/models/feature-flag";
  import { isModuleEnabledInEnvironment } from "../../../environment/environment-features";
  import { getModuleDefinitions } from "../../../navigation-coordinator/navigation-coordinator.svelte";
  import { toast } from "../../../toast/state/toast-state.svelte";
  import ContextMenu from "#lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuEntry,
    ContextMenuState as SharedMenuState,
  } from "#lib/shared/components/context-menu/context-menu-types.js";

  export type ContextMenuState =
    | { mode: "closed" }
    | {
        mode: "tab";
        moduleId: ModuleId;
        tabId: string;
        tabLabel: string;
        x: number;
        y: number;
      }
    | {
        mode: "module";
        moduleId: ModuleId;
        moduleLabel: string;
        x: number;
        y: number;
      }
    | { mode: "modules"; x: number; y: number };

  let { menuState, onClose } = $props<{
    menuState: ContextMenuState;
    onClose: () => void;
  }>();

  let tabInfos: TabVisibilityInfo[] = $state([]);

  // Reactive locale for translations
  const locale = $derived(getReactiveLocale());

  // Core modules that cannot be toggled
  const CORE_MODULES: ModuleId[] = [
    "create",
    "browse",
    "creators",
    "settings",
    "admin",
  ];

  // All toggleable modules with their current enabled state
  const toggleableModules = $derived.by(() => {
    if (menuState.mode !== "modules") return [];

    const _flagsVersion = featureFlagState.flagsVersion;
    const _globalOverrides = featureFlagState.globalFlagOverrides;

    const visibleModuleIds = new Set(getModuleDefinitions().map((m) => m.id));

    return MODULE_DEFINITIONS.filter(
      (m) =>
        m.isMain &&
        m.id !== "compose" &&
        !CORE_MODULES.includes(m.id) &&
        isModuleEnabledInEnvironment(m.id)
    ).map((m) => ({
      module: m,
      isEnabled: visibleModuleIds.has(m.id),
    }));
  });

  // Load tab infos when opening in module mode
  $effect(() => {
    if (menuState.mode === "module") {
      tabInfos = getAllTabsForModule(menuState.moduleId);
    }
  });

  // Convert sidebar state to shared ContextMenu state
  const sharedMenuState: SharedMenuState = $derived(
    menuState.mode === "closed"
      ? { open: false }
      : { open: true, x: menuState.x, y: menuState.y }
  );

  // Build menu items based on mode
  const menuItems = $derived.by((): ContextMenuEntry[] => {
    if (menuState.mode === "closed") return [];

    if (menuState.mode === "tab") {
      return [
        {
          id: "hide-tab",
          label: `Hide ${menuState.tabLabel}`,
          icon: "fa-eye-slash",
          action: async () => {
            await hideTab(menuState.moduleId, menuState.tabId);
          },
        },
      ];
    }

    if (menuState.mode === "module") {
      const items: ContextMenuEntry[] = [
        { type: "header", label: `${menuState.moduleLabel} Tabs` },
      ];

      for (const info of tabInfos) {
        const label = t(info.section.labelKey);
        items.push({
          id: `tab-${info.section.id}`,
          label,
          icon: info.isRoleLocked ? "fa-lock" : undefined,
          checked: info.isRoleLocked ? undefined : info.isVisible,
          disabled: info.isRoleLocked,
          keepOpen: true,
          action: async () => {
            if (info.isRoleLocked) return;
            const moduleId = (menuState as { moduleId: ModuleId }).moduleId;
            if (info.isVisible) {
              await hideTab(moduleId, info.section.id);
            } else {
              await showTab(moduleId, info.section.id);
            }
            tabInfos = getAllTabsForModule(moduleId);
          },
        });
      }

      return items;
    }

    if (menuState.mode === "modules") {
      const items: ContextMenuEntry[] = [
        { type: "header", label: t("nav_toggle_modules") },
      ];

      for (const { module, isEnabled } of toggleableModules) {
        items.push({
          id: `module-${module.id}`,
          label: module.label,
          checked: isEnabled,
          rawIcon: module.icon,
          rawIconColor: module.color || "#a855f7",
          keepOpen: true,
          action: async () => {
            if (!featureFlagService.isAdmin) {
              toast.error("Admin access required");
              return;
            }

            const featureId = moduleIdToFeatureId(module.id);
            const label = module.label;

            try {
              if (isEnabled) {
                await featureFlagService.updateGlobalFeatureFlag(featureId, {
                  enabled: false,
                });

                const overrides = featureFlagService.userOverrides;
                const currentOrder = overrides.moduleOrder || [];
                const currentDisabled = overrides.disabledFeatures || [];
                const currentEnabled = overrides.enabledFeatures || [];
                const userId = featureFlagService.userId;
                if (userId) {
                  await featureFlagService.setUserFeatureOverrides(userId, {
                    ...overrides,
                    moduleOrder: currentOrder.filter((id) => id !== module.id),
                    disabledFeatures: currentDisabled.includes(featureId)
                      ? currentDisabled
                      : [...currentDisabled, featureId],
                    enabledFeatures: currentEnabled.filter(
                      (f) => f !== featureId
                    ),
                  });
                }
                toast.success(`${label} disabled`, 2000);
              } else {
                await featureFlagService.updateGlobalFeatureFlag(featureId, {
                  enabled: true,
                });

                const overrides = featureFlagService.userOverrides;
                const currentOrder = overrides.moduleOrder || [];
                const currentDisabled = overrides.disabledFeatures || [];
                const userId = featureFlagService.userId;
                if (userId) {
                  await featureFlagService.setUserFeatureOverrides(userId, {
                    ...overrides,
                    moduleOrder: currentOrder.includes(module.id)
                      ? currentOrder
                      : [...currentOrder, module.id],
                    disabledFeatures: currentDisabled.filter(
                      (f) => f !== featureId
                    ),
                  });
                }
                toast.success(`${label} enabled`, 2000);
              }
            } catch (error) {
              console.error("Failed to toggle module:", error);
              toast.error("Failed to toggle module");
            }
          },
        });
      }

      return items;
    }

    return [];
  });

  onMount(() => {
    if (menuState.mode === "module") {
      tabInfos = getAllTabsForModule(menuState.moduleId);
    }
  });
</script>

<ContextMenu menuState={sharedMenuState} items={menuItems} {onClose} />
