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
import { t } from "$lib/shared/i18n/i18n.svelte.js";

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
    get actionLabel() { return t("create_workspace_undo"); },
    get visibleLabel() { return t("create_workspace_undo"); },
  },
  redo: {
    icon: "undo-svg",
    iconType: "svg",
    get actionLabel() { return t("create_workspace_redo"); },
    get visibleLabel() { return t("create_workspace_redo"); },
  },
  clear: {
    icon: "fa-eraser",
    iconType: "fa",
    get actionLabel() { return t("create_workspace_clear_sequence"); },
    get visibleLabel() { return t("shared_controls_clear"); },
  },
  view: {
    icon: "fa-play",
    iconType: "fa",
    get actionLabel() { return t("create_workspace_play_sequence"); },
    get visibleLabel() { return t("create_workspace_play"); },
  },
  "sequence-actions": {
    icon: "fa-tools",
    iconType: "fa",
    get actionLabel() { return t("create_workspace_sequence_actions"); },
    get visibleLabel() { return t("create_workspace_actions"); },
  },
  share: {
    icon: "fa-share-nodes",
    iconType: "fa",
    get actionLabel() { return t("create_workspace_share"); },
    get visibleLabel() { return t("create_workspace_share"); },
  },
  save: {
    icon: "fa-bookmark",
    iconType: "fa",
    get actionLabel() { return t("create_workspace_save_to_library"); },
    get visibleLabel() { return t("create_workspace_save"); },
  },
  "step-editor": {
    icon: "fa-hand-pointer",
    iconType: "fa",
    get actionLabel() { return t("create_workspace_edit_step"); },
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
    get label() { return t("create_workspace_undo"); },
    get description() { return t("create_workspace_undo_description"); },
    colorClass: "accent",
  },
  redo: {
    get label() { return t("create_workspace_redo"); },
    get description() { return t("create_workspace_redo_description"); },
    colorClass: "accent",
  },
  clear: {
    get label() { return t("shared_controls_clear"); },
    get description() { return t("create_workspace_clear_description"); },
    colorClass: "error",
  },
  view: {
    get label() { return WORKSPACE_BUTTON_ICON.view.actionLabel; },
    get description() { return t("create_workspace_view_description"); },
    colorClass: "success",
  },
  "sequence-actions": {
    get label() { return t("create_workspace_sequence_actions"); },
    get description() { return t("create_workspace_actions_description"); },
    colorClass: "success",
  },
  share: {
    get label() { return t("create_workspace_share"); },
    get description() { return t("create_workspace_share_description"); },
    colorClass: "info",
  },
  save: {
    get label() { return t("create_workspace_save_to_library"); },
    get description() { return t("create_workspace_save_description"); },
    colorClass: "accent",
  },
  "step-editor": {
    get label() { return t("create_workspace_step_editor"); },
    get description() { return t("create_workspace_step_editor_description"); },
    colorClass: "info",
  },
};
