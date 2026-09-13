/**
 * Workspace button layout — the single source of truth for which workspace
 * action buttons exist, which zone they live in, and their order.
 *
 * Consumed by:
 *  - `ButtonPanel.svelte` and `StandardWorkspaceLayout.svelte` — render the
 *    real buttons in the bottom rail and workspace header.
 *  - the create tutorial's `ReadyStep.svelte` — renders a labelled diagram of
 *    the workspace.
 *
 * Because both read this one array, the tutorial diagram can never drift from
 * the real panel. Move a button here and it moves in both places.
 */

export type WorkspaceButtonId =
  | "undo"
  | "redo"
  | "clear"
  | "view"
  | "sequence-actions"
  | "share"
  | "save"
  | "step-editor";

/**
 * Zones map to the real workspace layout. Undo and Redo occupy the familiar
 * leading navigation position, while `header-trailing` holds Save at the
 * workspace's top-right edge. `grid` is NOT a real button — the user taps a
 * step in the grid to edit it; it exists only so the tutorial can label that
 * affordance.
 */
export type WorkspaceButtonZone =
  | "header-leading"
  | "header-trailing"
  | "left"
  | "center"
  | "right"
  | "grid";

export interface WorkspaceButtonLayoutEntry {
  id: WorkspaceButtonId;
  zone: WorkspaceButtonZone;
  /** 1-based reading order — also the badge number in the tutorial diagram. */
  order: number;
}

/** THE source of truth. Order = left-to-right reading order across the panel. */
export const WORKSPACE_BUTTON_LAYOUT: WorkspaceButtonLayoutEntry[] = [
  { id: "undo", zone: "header-leading", order: 1 },
  { id: "redo", zone: "header-leading", order: 2 },
  { id: "clear", zone: "left", order: 3 },
  { id: "view", zone: "center", order: 4 },
  { id: "sequence-actions", zone: "right", order: 5 },
  { id: "share", zone: "right", order: 6 },
  { id: "save", zone: "header-trailing", order: 7 },
  { id: "step-editor", zone: "grid", order: 8 },
];

/** Buttons in a zone, in reading order. */
export function workspaceButtonsInZone(
  zone: WorkspaceButtonZone
): WorkspaceButtonLayoutEntry[] {
  return WORKSPACE_BUTTON_LAYOUT.filter((b) => b.zone === zone).sort(
    (a, b) => a.order - b.order
  );
}

/**
 * Canonical glyph for each button — THE single icon source. The real workspace
 * buttons each render `<i class="fa-solid {WORKSPACE_BUTTON_ICON[id].icon}">`
 * (icon stays inline so their scoped `i` CSS keeps working), and the create
 * tutorial's diagram renders from the same map. So a button's icon can never
 * drift between the live toolbar and the tutorial that teaches it — change it
 * here and it changes in both places. (The broom-vs-eraser bug was exactly this
 * drift before the icon string was centralized.)
 */
export interface WorkspaceButtonGlyph {
  /** FontAwesome class (e.g. "fa-eraser"), or the "undo-svg" sentinel for the
   *  one button (Undo) whose glyph is an inline SVG, not a FontAwesome icon. */
  icon: string;
  iconType: "fa" | "svg";
  /** Accessible action name shared by the live button and tutorial. */
  actionLabel: string;
  /** Short text shown beside the glyph when the workspace has room. */
  visibleLabel?: string;
}

export const WORKSPACE_BUTTON_ICON: Record<
  WorkspaceButtonId,
  WorkspaceButtonGlyph
> = {
  undo: {
    icon: "undo-svg",
    iconType: "svg",
    actionLabel: "Undo",
    visibleLabel: "Undo",
  },
  redo: {
    icon: "undo-svg",
    iconType: "svg",
    actionLabel: "Redo",
    visibleLabel: "Redo",
  },
  clear: {
    icon: "fa-eraser",
    iconType: "fa",
    actionLabel: "Clear sequence",
    visibleLabel: "Clear",
  },
  view: {
    icon: "fa-play",
    iconType: "fa",
    actionLabel: "Play sequence",
    visibleLabel: "Play",
  },
  "sequence-actions": {
    icon: "fa-tools",
    iconType: "fa",
    actionLabel: "Sequence actions",
    visibleLabel: "Actions",
  },
  share: {
    icon: "fa-share-nodes",
    iconType: "fa",
    actionLabel: "Share",
    visibleLabel: "Share",
  },
  save: {
    icon: "fa-bookmark",
    iconType: "fa",
    actionLabel: "Save to library",
    visibleLabel: "Save",
  },
  "step-editor": {
    icon: "fa-hand-pointer",
    iconType: "fa",
    actionLabel: "Edit step",
  },
};

/**
 * Tutorial-only presentation for each button (legend text + diagram color).
 * The real buttons own their own labels/colors; this drives the tutorial's
 * labelled diagram, legend, and accordion. Icons are NOT here — they live in
 * WORKSPACE_BUTTON_ICON above (shared with the real buttons). ButtonPanel does
 * not depend on this map.
 */
export interface WorkspaceButtonTutorialMeta {
  label: string;
  description: string;
  colorClass: "accent" | "success" | "error" | "info";
}

export const WORKSPACE_BUTTON_TUTORIAL: Record<
  WorkspaceButtonId,
  WorkspaceButtonTutorialMeta
> = {
  undo: {
    label: "Undo",
    description: "Steps back to before your last action.",
    colorClass: "accent",
  },
  redo: {
    label: "Redo",
    description: "Restores the last action you undid.",
    colorClass: "accent",
  },
  clear: {
    label: "Clear",
    description: "Wipes the sequence so you can start fresh.",
    colorClass: "error",
  },
  view: {
    label: WORKSPACE_BUTTON_ICON.view.actionLabel,
    description:
      "Plays the full sequence, with viewer, share, and export tools ready.",
    colorClass: "success",
  },
  "sequence-actions": {
    label: "Sequence Actions",
    description: "Mirror, flip, rotate, and transform your sequence.",
    colorClass: "success",
  },
  share: {
    label: "Share",
    description:
      "Share a card, send the sequence in Flow Arts Composer, copy a link, or download the card.",
    colorClass: "info",
  },
  save: {
    label: "Save to Library",
    description: "Stores your sequence so you can find it later.",
    colorClass: "accent",
  },
  "step-editor": {
    label: "Step Editor",
    description: "Tap any step to adjust turns, rotation, and duration.",
    colorClass: "info",
  },
};
