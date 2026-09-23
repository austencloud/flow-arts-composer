/**
 * Register Global Shortcuts
 *
 * Registers all global keyboard shortcuts that are available app-wide.
 *
 * Side-effectful registration/orchestration (touches auth, navigation, settings,
 * toast, props) — lives in registration/, not utils/.
 *
 * Domain: Keyboard Shortcuts - Registration
 */

import type { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
import type { createKeyboardShortcutState } from "../state/keyboard-shortcut-state.svelte";
import {
  handleModuleChange,
  getModuleDefinitions,
} from "../../navigation-coordinator/navigation-coordinator.svelte";
import { authState } from "../../auth/state/auth-state.svelte";
import { isModuleAccessible } from "../../auth/domain/guest-access-config";
import { resolveAccessTier } from "../../auth/domain/access-tier";
import { isPremiumOrAbove } from "../../auth/domain/models/user-role";
import { quickFeedbackState } from "$lib/shared/feedback/state/quick-feedback-state.svelte";
import { adminToolbarState } from "../../debug/state/admin-toolbar-state.svelte";
import { settingsService } from "../../settings/state/settings-state.svelte";
import { healPropPair } from "../../settings/domain/prop-pair-rule";
import { getAnimationVisibilityManager } from "../../animation-engine/state/animation-visibility-state.svelte";
import { getImageCompositionManager } from "../../share/state/image-composition-state.svelte";
import {
  getSettings,
  updateSettings,
  isSettingsPreviewMode,
} from "../../application/state/app-state.svelte";
import { toast } from "../../toast/state/toast-state.svelte";
import { BackgroundType } from "@austencloud/backgrounds";
import { BACKGROUND_CARD_REGISTRY } from "@austencloud/backgrounds/card";
import { applyThemeFromColors } from "../../settings/utils/background-theme-calculator";
import { openShortcutSettings } from "../open-shortcut-settings";
import { propDrawerState } from "../../settings/state/prop-drawer-state.svelte";
import {
  getAllPropTypes,
  PROP_TYPE_DISPLAY_REGISTRY,
} from "../../pictograph/prop/domain/prop-type-display-registry";
import { filterPremiumCosmeticProps } from "../../subscription/domain/premium-prop-access";
import { commandPaletteState } from "../state/command-palette-state.svelte";
import { registerSaveShortcut } from "./register-save-shortcut";
import { registerEditHistoryShortcuts } from "./register-edit-history-shortcuts";
import { registerEscapeShortcut } from "./register-escape-shortcut";

export function registerGlobalShortcuts(
  service: KeyboardShortcutManager,
  state: ReturnType<typeof createKeyboardShortcutState>
) {
  const moduleDefinitions = getModuleDefinitions();
  const isAdmin = authState.isAdmin;

  // Filter modules to only show accessible ones
  const accessibleModules = moduleDefinitions.filter((module) => {
    // Filter out admin module for non-admin users
    if (module.id === "admin" && !isAdmin) {
      return false;
    }
    // Filter out modules that aren't implemented yet
    const notImplemented = ["choreo"];
    if (notImplemented.includes(module.id)) {
      return false;
    }
    return true;
  });
  // ==================== TIER 1: Essential Global Shortcuts ====================
  // Using single-key shortcuts (Gmail/Notion style) since Chrome blocks most Ctrl combinations

  service.register({
    id: "global.command-palette",
    label: "Jump to",
    description: "Open a page, tab, or action",
    key: "k",
    modifiers: state.isMac ? ["meta"] : ["ctrl"],
    context: "global",
    scope: "navigation",
    priority: "critical",
    forceExecute: true,
    action: () => {
      state.openCommandPalette();
      commandPaletteState.open();
    },
  });

  registerSaveShortcut(service, state.isMac);
  registerEditHistoryShortcuts(service, state.isMac);
  registerEscapeShortcut(service);

  // ? - Open the canonical shortcut center
  service.register({
    id: "global.shortcuts-help",
    label: "Keyboard shortcuts",
    description: "Open the keyboard shortcut center",
    key: "/",
    modifiers: ["shift"],
    context: "global",
    scope: "help",
    priority: "critical",
    action: () => void openShortcutSettings("keyboard_shortcut"),
  });

  // ==================== Module Switching (Ctrl + Numbers) ====================
  // Ctrl+1-5 for module navigation
  // Part of the trifecta: Ctrl=modules, Alt=props, Shift=themes

  // Map modules to number keys
  const moduleKeyMap = ["1", "2", "3", "4", "5"];

  accessibleModules.slice(0, 5).forEach((module, index) => {
    const key = moduleKeyMap[index];
    if (!key) return;

    service.register({
      id: `global.switch-to-${module.id}`,
      label: module.label,
      description: `Navigate to ${module.label} (Ctrl+${key})`,
      key: key,
      modifiers: ["ctrl"],
      context: "global",
      scope: "navigation",
      priority: "high",
      action: async () => {
        // Guests can only navigate to modules their access tier allows.
        const tier = resolveAccessTier(
          authState.isAuthenticated,
          authState.isAnonymous,
          isPremiumOrAbove(authState.role)
        );
        if (!isModuleAccessible(module.id, tier)) {
          return;
        }
        // Force View Transition for keyboard shortcuts (even when leaving Dashboard)
        await handleModuleChange(module.id, undefined, {
          forceViewTransition: true,
        });
      },
    });
  });

  // ==================== Quick Actions ====================

  // f - Quick Feedback (opens feedback drawer)
  service.register({
    id: "global.quick-feedback",
    label: "Quick Feedback",
    description: "Open the quick feedback panel (press f)",
    key: "f",
    modifiers: [],
    context: "global",
    scope: "action",
    priority: "high",
    action: () => {
      quickFeedbackState.toggle();
    },
  });

  // l - Toggle Dark Mode (dark background)
  // Track last toggled value locally so rapid presses always flip correctly
  // (getSettings() reads from async state that may not have flushed yet)
  let darkModeOverride: boolean | null = null;

  service.register({
    id: "global.toggle-dark-mode",
    label: "Toggle Dark Mode",
    description: "Toggle Dark Mode (dark background)",
    key: "d",
    modifiers: ["alt"],
    context: "global",
    scope: "view",
    priority: "high",
    preserveDrawers: true,
    action: () => {
      // Block changes in preview mode - don't modify the previewed user's settings
      if (isSettingsPreviewMode()) {
        return;
      }

      const beforeValue = darkModeOverride ?? getSettings().darkMode ?? false;
      const newValue = !beforeValue;
      darkModeOverride = newValue;

      // Update AppSettings (syncs to Firebase)
      void updateSettings({ darkMode: newValue });

      // Sync to animation visibility manager for immediate visual feedback
      const visibilityManager = getAnimationVisibilityManager();
      visibilityManager.setDarkMode(newValue);

      // Sync to image composition manager so previews match thumbnails
      const imageCompositionManager = getImageCompositionManager();
      imageCompositionManager.setDarkMode(newValue);

      // Show toast notification
      const message = newValue
        ? "Dark Mode enabled - press L to toggle"
        : "Dark Mode disabled - press L to toggle";
      toast.info(message, 2500);
    },
  });

  // ==================== Prop Preset Shortcuts ====================

  // Alt+1 - Switch to Prop Preset 1
  service.register({
    id: "global.prop-preset-1",
    label: "Prop Preset 1",
    description: "Switch to prop preset 1 (Alt+1)",
    key: "1",
    modifiers: ["alt"],
    context: "global",
    scope: "action",
    priority: "high", // Higher priority than module navigation
    action: () => {
      const presets = settingsService.settings.propPresets || [];
      const preset = presets[0];
      if (preset) {
        // Heal a preset saved before this branch, same as a loaded profile.
        const healed = healPropPair(preset);
        settingsService.updateSettings({
          selectedPresetIndex: 0,
          leftPropType: healed.leftPropType,
          rightPropType: healed.rightPropType,
          catDogMode: healed.catDogMode,
        });
        toast.info(`Preset 1: ${healed.leftPropType}`, 1500);
      }
    },
  });

  // Alt+2 - Switch to Prop Preset 2
  service.register({
    id: "global.prop-preset-2",
    label: "Prop Preset 2",
    description: "Switch to prop preset 2 (Alt+2)",
    key: "2",
    modifiers: ["alt"],
    context: "global",
    scope: "action",
    priority: "high", // Higher priority than module navigation
    action: () => {
      const presets = settingsService.settings.propPresets || [];
      const preset = presets[1];
      if (preset) {
        // Heal a preset saved before this branch, same as a loaded profile.
        const healed = healPropPair(preset);
        settingsService.updateSettings({
          selectedPresetIndex: 1,
          leftPropType: healed.leftPropType,
          rightPropType: healed.rightPropType,
          catDogMode: healed.catDogMode,
        });
        toast.info(`Preset 2: ${healed.leftPropType}`, 1500);
      }
    },
  });

  // Alt+3 - Switch to Prop Preset 3
  service.register({
    id: "global.prop-preset-3",
    label: "Prop Preset 3",
    description: "Switch to prop preset 3 (Alt+3)",
    key: "3",
    modifiers: ["alt"],
    context: "global",
    scope: "action",
    priority: "high", // Higher priority than module navigation
    action: () => {
      const presets = settingsService.settings.propPresets || [];
      const preset = presets[2];
      if (preset) {
        // Heal a preset saved before this branch, same as a loaded profile.
        const healed = healPropPair(preset);
        settingsService.updateSettings({
          selectedPresetIndex: 2,
          leftPropType: healed.leftPropType,
          rightPropType: healed.rightPropType,
          catDogMode: healed.catDogMode,
        });
        toast.info(`Preset 3: ${healed.leftPropType}`, 1500);
      }
    },
  });

  // ==================== Prop Drawer Toggle ====================

  // P - Toggle prop selection drawer
  service.register({
    id: "global.toggle-prop-drawer",
    label: "Toggle Prop Drawer",
    description: "Open or close the prop selection drawer (P)",
    key: "p",
    modifiers: [],
    context: "global",
    scope: "action",
    priority: "high",
    action: () => {
      propDrawerState.toggle();
    },
  });

  // ==================== Prop Cycling (Shift+P) ====================

  // Shift+P - Cycle to next prop type (all props, all variations)
  service.register({
    id: "global.cycle-prop-type",
    label: "Next Prop Type",
    description: "Cycle to the next prop type (Shift+P)",
    key: "P",
    modifiers: ["shift"],
    context: "global",
    scope: "action",
    priority: "high",
    action: () => {
      // Cycling walks the whole enum, so paid cosmetics drop out unless the
      // user may actually use them — otherwise Shift+P hands one over free.
      const allProps = filterPremiumCosmeticProps(getAllPropTypes());
      if (allProps.length === 0) return;

      const currentProp = settingsService.settings.leftPropType;
      if (!currentProp) return;
      const currentIndex = allProps.indexOf(currentProp);
      const nextIndex = (currentIndex + 1) % allProps.length;
      const nextProp = allProps[nextIndex];
      if (!nextProp) return;

      const displayInfo = PROP_TYPE_DISPLAY_REGISTRY[nextProp];
      settingsService.updateSettings({
        leftPropType: nextProp,
        rightPropType: nextProp,
      });
      toast.info(displayInfo.label, 1500);
    },
  });

  // ==================== Effects Shortcuts (Shift + Letter) ====================

  // Shift+F - Toggle Fire Effect
  service.register({
    id: "global.toggle-fire",
    label: "Toggle Fire",
    description: "Toggle fire effect on props (Shift+F)",
    key: "F",
    modifiers: ["shift"],
    context: "global",
    scope: "action",
    priority: "high",
    action: () => {
      const visibilityManager = getAnimationVisibilityManager();
      const isFireActive = visibilityManager.getActiveEffect() === "fire";
      visibilityManager.setActiveEffect(isFireActive ? "none" : "fire");
      toast.info(isFireActive ? "Fire OFF" : "Fire ON", 1500);
    },
  });

  // Shift+L - Toggle LED Effect
  service.register({
    id: "global.toggle-led",
    label: "Toggle LED",
    description: "Toggle LED effect on props (Shift+L)",
    key: "L",
    modifiers: ["shift"],
    context: "global",
    scope: "action",
    priority: "high",
    action: () => {
      const visibilityManager = getAnimationVisibilityManager();
      const isLedActive = visibilityManager.getActiveEffect() === "led";
      visibilityManager.setActiveEffect(isLedActive ? "none" : "led");
      toast.info(isLedActive ? "LED OFF" : "LED ON", 1500);
    },
  });

  // ==================== Admin Shortcuts ====================
  // Only registered for admin users

  // F9 - Admin Toolbar (admin-only debug tools)
  service.register({
    id: "admin.toolbar",
    label: "Admin Toolbar",
    description: "Toggle the admin debug toolbar (admin only)",
    key: "F9",
    modifiers: [],
    context: "global",
    scope: "admin",
    priority: "high",
    // No condition needed - AdminToolbar handles admin check
    action: () => {
      adminToolbarState.toggle();
    },
  });

  // ==================== Theme/Background Shortcuts (Shift + Numbers) ====================
  // Shift+1-0 for quick theme switching
  // Part of the trifecta: Ctrl=modules, Alt=props, Shift=themes

  // Map number keys to background indices (1-9, 0 for 10th)
  const themeKeyMap = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  BACKGROUND_CARD_REGISTRY.slice(0, 10).forEach((bg, index) => {
    const key = themeKeyMap[index];
    if (!key) return;

    service.register({
      id: `global.theme-${bg.type}`,
      label: bg.label,
      description: `Switch to ${bg.label} theme (Shift+${key})`,
      key: key,
      modifiers: ["shift"],
      context: "global",
      scope: "action",
      priority: "high",
      action: () => {
        if (isSettingsPreviewMode()) return;

        const bgType = bg.type as BackgroundType;

        // Apply theme colors for UI
        if (bg.themeColors) {
          applyThemeFromColors(undefined, bg.themeColors);
        }
        void updateSettings({
          backgroundType: bgType,
        });

        toast.info(`Theme: ${bg.label}`, 1500);
      },
    });
  });
}
