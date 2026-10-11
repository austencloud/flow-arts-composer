import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import type { ShortcutWithBinding } from "../services/types";
import { getModuleDefinitions } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";

const TRANSLATABLE_IDS = new Set([
  "global.command-palette", "global.shortcuts-help", "global.quick-feedback",
  "global.toggle-dark-mode", "global.toggle-prop-drawer", "global.cycle-prop-type",
  "global.toggle-fire", "global.toggle-led", "global.save", "global.escape",
  "global.undo", "global.redo",
  "create.toggle-animation", "create.grid-nav-up", "create.grid-nav-down",
  "create.grid-nav-left", "create.grid-nav-right", "create.edit-nav-left",
  "create.edit-nav-right", "create.edit-accept", "create.add-beat",
  "create.delete-beat", "create.delete-beat-delete-key",
  "create.transform-mirror", "create.transform-flip", "create.transform-swap-hands",
  "create.transform-invert", "create.transform-shift-start",
  "create.transform-rewind", "create.transform-rotate-cw",
  "create.transform-rotate-ccw", "create.edit-decrease",
  "create.edit-increase", "create.shuffle-prop",
]);

function shortcutKey(id: string, field: "label" | "description"): TranslationKey {
  return `keyboard_shortcut_${id.replaceAll(/[.-]/g, "_")}_${field}` as TranslationKey;
}

export function localizeShortcutLabel(id: string, fallback: string): string {
  if (id.startsWith("global.switch-to-")) {
    const moduleId = id.slice("global.switch-to-".length);
    const module = getModuleDefinitions().find(({ id }) => id === moduleId);
    return module ? t(module.labelKey) : fallback;
  }
  if (id.startsWith("global.prop-preset-")) {
    return t("keyboard_shortcut_prop_preset_label", { number: id.slice("global.prop-preset-".length) });
  }
  if (!TRANSLATABLE_IDS.has(id)) return fallback;
  return t(shortcutKey(id, "label"));
}

export function localizeShortcut(item: ShortcutWithBinding): ShortcutWithBinding {
  const { id, label, description } = item.shortcut;
  let localizedDescription = description;
  if (TRANSLATABLE_IDS.has(id) && description) {
    localizedDescription = t(shortcutKey(id, "description"));
  } else if (id.startsWith("global.switch-to-")) {
    localizedDescription = t("keyboard_shortcut_switch_module_description", {
      module: localizeShortcutLabel(id, label),
      key: item.defaultBinding.key.toUpperCase(),
    });
  } else if (id.startsWith("global.prop-preset-")) {
    const number = id.slice("global.prop-preset-".length);
    localizedDescription = t("keyboard_shortcut_prop_preset_description", { number, key: item.defaultBinding.key.toUpperCase() });
  }
  return { ...item, shortcut: { ...item.shortcut, label: localizeShortcutLabel(id, label), description: localizedDescription } };
}
