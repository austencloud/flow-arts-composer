import type { ContextMenuEntry } from "#lib/shared/components/context-menu/context-menu-types.js";
import type { ArrangementCell } from "#lib/shared/media-composition/domain/arrangement.js";

export type ArrangementCellMenuTool = "sequence" | "layers" | "offset";

export interface ArrangementCellMenuCallbacks {
  onOpenTool: (tool: ArrangementCellMenuTool) => void;
  onClear: () => void;
}

/** The right-click and long-press menu of one cell: its panels, then Clear. */
export function buildArrangementCellMenu(
  cell: ArrangementCell,
  callbacks: ArrangementCellMenuCallbacks
): ContextMenuEntry[] {
  if (cell.layers.length === 0) {
    return [
      {
        id: "add-sequence",
        label: "Add sequence",
        icon: "fa-plus",
        action: () => callbacks.onOpenTool("sequence"),
      },
    ];
  }
  const count = cell.layers.length;
  return [
    {
      id: "sequence",
      label: "Sequence",
      icon: "fa-shuffle",
      action: () => callbacks.onOpenTool("sequence"),
    },
    {
      id: "layers",
      label: `Layers (${count})`,
      icon: "fa-layer-group",
      action: () => callbacks.onOpenTool("layers"),
    },
    {
      id: "offset",
      label: "Offset",
      icon: "fa-stopwatch",
      action: () => callbacks.onOpenTool("offset"),
    },
    { type: "separator" },
    {
      id: "clear",
      label: "Clear cell",
      icon: "fa-eraser",
      danger: true,
      action: callbacks.onClear,
    },
  ];
}
