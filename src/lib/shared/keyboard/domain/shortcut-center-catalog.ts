import type { ShortcutContext } from "./types/keyboard-types";
import type { ShortcutWithBinding } from "../services/types";
import { buildKeyCombo } from "../utils/key-combo-utils";
import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "$lib/shared/i18n/i18n-types.js";

export type ShortcutCenterView = "current" | "all" | "changed";

export interface ShortcutCatalogGroup {
  context: ShortcutContext;
  label: string;
  items: ShortcutWithBinding[];
}

const CONTEXT_LABELS: Partial<Record<ShortcutContext, string>> = {
  global: "Everywhere",
  create: "Create",
  browse: "Browse",
  learn: "Learn",
  collect: "Collect",
  compose: "Compose",
  choreo: "Choreo",
  admin: "Admin",
  realm: "Realm",
  "edit-panel": "Edit panel",
  "animation-panel": "Animation panel",
  "share-panel": "Share panel",
  "export-panel": "Export panel",
  modal: "Dialogs",
  "command-palette": "Command palette",
};

export function buildShortcutCatalog(
  items: ShortcutWithBinding[],
  view: ShortcutCenterView,
  currentContext: ShortcutContext,
  query: string
): ShortcutCatalogGroup[] {
  const normalizedQuery = normalizeSearchText(query);
  const filteredItems = items
    .filter((item) => belongsInView(item, view, currentContext))
    .filter(
      (item) =>
        !normalizedQuery || getSearchText(item).includes(normalizedQuery)
    );

  const grouped = new Map<ShortcutContext, ShortcutWithBinding[]>();
  for (const item of filteredItems) {
    const context = chooseGroupContext(item, view, currentContext);
    grouped.set(context, [...(grouped.get(context) ?? []), item]);
  }

  return Array.from(grouped, ([context, groupItems]) => ({
    context,
    label: getShortcutContextLabel(context),
    items: groupItems.sort((a, b) =>
      a.shortcut.label.localeCompare(b.shortcut.label)
    ),
  })).sort((a, b) => {
    const aRank = contextRank(a.context, currentContext);
    const bRank = contextRank(b.context, currentContext);
    return aRank - bRank || a.label.localeCompare(b.label);
  });
}

export function getShortcutContextLabel(context: ShortcutContext): string {
  if (!(context in CONTEXT_LABELS)) return titleCase(context);
  return t(`keyboard_context_${context.replaceAll("-", "_")}` as TranslationKey);
}

function belongsInView(
  item: ShortcutWithBinding,
  view: ShortcutCenterView,
  currentContext: ShortcutContext
): boolean {
  if (view === "changed") return item.isCustomized;
  if (view === "all") return true;

  const contexts = getContexts(item);
  return contexts.includes("global") || contexts.includes(currentContext);
}

function chooseGroupContext(
  item: ShortcutWithBinding,
  view: ShortcutCenterView,
  currentContext: ShortcutContext
): ShortcutContext {
  const contexts = getContexts(item);
  if (view === "current") {
    if (contexts.includes("global")) return "global";
    if (contexts.includes(currentContext)) return currentContext;
  }

  return contexts[0] ?? "global";
}

function getContexts(item: ShortcutWithBinding): ShortcutContext[] {
  return Array.isArray(item.shortcut.context)
    ? item.shortcut.context
    : [item.shortcut.context ?? "global"];
}

function getSearchText(item: ShortcutWithBinding): string {
  const effectiveCombo = buildKeyCombo(
    item.effectiveBinding.key,
    item.effectiveBinding.modifiers
  );
  const defaultCombo = buildKeyCombo(
    item.defaultBinding.key,
    item.defaultBinding.modifiers
  );
  const contexts = getContexts(item)
    .map((context) => `${context} ${getShortcutContextLabel(context)}`)
    .join(" ");

  return normalizeSearchText(
    [
      item.shortcut.id,
      item.shortcut.label,
      item.shortcut.description ?? "",
      contexts,
      expandKeyCombo(effectiveCombo),
      expandKeyCombo(defaultCombo),
    ].join(" ")
  );
}

function expandKeyCombo(combo: string): string {
  const aliases =
    combo.toLocaleLowerCase() === "shift+/" ? "? question mark" : "";
  return `${combo} ${combo.replaceAll("+", " ")} ${combo.replace(
    /([a-z])([A-Z])/g,
    "$1 $2"
  )} ${aliases}`;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function contextRank(
  context: ShortcutContext,
  currentContext: ShortcutContext
): number {
  if (context === "global") return 0;
  if (context === currentContext) return 1;
  return 2;
}

function titleCase(value: string): string {
  const words = value.replaceAll("-", " ");
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}
