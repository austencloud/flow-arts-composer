/**
 * The tool panel height the stacked Create layout gives way to while the
 * Sequence Actions drawer shows its root actions (see fittedToolPanelHeight).
 * Zero means no fit: the drawer is closed, side by side, or in a drill-down
 * that wants its usual height.
 *
 * SequenceActionsPanel writes it; StandardWorkspaceLayout reads it and moves
 * the split, so the step grid takes the height the actions leave unused.
 */
let toolPanelHeight = $state(0);

export const sequenceActionsFit = {
  get toolPanelHeight(): number {
    return toolPanelHeight;
  },
  set(height: number): void {
    toolPanelHeight = height > 0 ? Math.round(height) : 0;
  },
};
