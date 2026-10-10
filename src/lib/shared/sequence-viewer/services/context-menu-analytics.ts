import type {
  ContextMenuEntry,
  ContextMenuItem,
} from "#lib/shared/components/context-menu/context-menu-types.js";

export type ContextMenuAnalyticsValue = string | number | boolean | null;
export type ContextMenuAnalyticsSink = (
  action: string,
  properties?: Record<string, ContextMenuAnalyticsValue>,
  options?: { count?: boolean }
) => void;

export function contextMenuCloseCounts(
  reason: "item" | "outside" | "dismiss"
): boolean {
  return reason !== "item";
}

const ALREADY_INSTRUMENTED_ACTIONS = new Set([
  "send-to",
  "send-to-sticker-lab",
]);

/** Add analytics around leaf actions without changing their return behavior. */
export function instrumentContextMenuEntries(
  entries: ContextMenuEntry[],
  group: "pictograph" | "card",
  onAction?: ContextMenuAnalyticsSink
): ContextMenuEntry[] {
  return entries.map((entry) => {
    if ("type" in entry) return entry;
    return instrumentContextMenuItem(entry, group, onAction);
  });
}

function instrumentContextMenuItem(
  entry: ContextMenuItem,
  group: "pictograph" | "card",
  onAction?: ContextMenuAnalyticsSink
): ContextMenuItem {
  const children = entry.children?.map((child) =>
    instrumentContextMenuItem(child, group, onAction)
  );
  const skipAction = ALREADY_INSTRUMENTED_ACTIONS.has(entry.id);
  return {
    ...entry,
    children,
    action:
      entry.action && !skipAction
        ? () => {
            onAction?.(`${group}_${entry.id}`, {
              was_checked: entry.checked ?? null,
            });
            return entry.action?.();
          }
        : entry.action,
  };
}
