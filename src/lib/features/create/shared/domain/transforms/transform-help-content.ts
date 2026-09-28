import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type {
  SequenceActionId,
  SequencePatternActionId,
  SequenceTransformActionId,
} from "$lib/shared/create/domain/sequence-action-types";

/**
 * Sequence Action Help Content
 *
 * Static data for action help UI: descriptions, icons, colors.
 * Includes both transforms (mirror, flip, etc.) and patterns/tools (turn pattern, extend, etc.)
 * Separated from UI components for easy editing and testing.
 */

// Transform IDs (geometric operations)
export type TransformId = SequenceTransformActionId;

// Pattern/Tool IDs (pattern application and sequence tools)
export type PatternId = SequencePatternActionId;

// All action IDs that support help mode
export type ActionHelpId = SequenceActionId;

export interface ActionHelpItem {
  id: ActionHelpId;
  icon: string;
  name: string;
  color: string;
  shortDesc: string;
  fullDesc: string;
  warning?: string;
  /** Category for grouping in UI */
  category: "transform" | "pattern" | "tool";
}

// Legacy alias for backwards compatibility
export type TransformHelpItem = ActionHelpItem;

export const actionHelpContent: ActionHelpItem[] = [
  // === TRANSFORMS (geometric operations) ===
  {
    id: "mirror",
    icon: "fa-left-right",
    get name() { return t("create_action_help_mirror_name"); },
    color: "#a855f7",
    get shortDesc() { return t("create_action_help_mirror_shortdesc"); },
    get fullDesc() { return t("create_action_help_mirror_fulldesc"); },
    category: "transform",
  },
  {
    id: "flip",
    icon: "fa-up-down",
    get name() { return t("create_action_help_flip_name"); },
    color: "#6366f1",
    get shortDesc() { return t("create_action_help_flip_shortdesc"); },
    get fullDesc() { return t("create_action_help_flip_fulldesc"); },
    category: "transform",
  },
  {
    id: "invert",
    icon: "fa-repeat",
    get name() { return t("create_action_help_invert_name"); },
    color: "#eab308",
    get shortDesc() { return t("create_action_help_invert_shortdesc"); },
    get fullDesc() { return t("create_action_help_invert_fulldesc"); },
    get warning() { return t("create_action_help_invert_warning"); },
    category: "transform",
  },
  {
    id: "rotate",
    icon: "fa-rotate-right",
    get name() { return t("create_action_help_rotate_name"); },
    color: "#fb923c",
    get shortDesc() { return t("create_action_help_rotate_shortdesc"); },
    get fullDesc() { return t("create_action_help_rotate_fulldesc"); },
    category: "transform",
  },
  {
    id: "swap",
    icon: "fa-arrows-rotate",
    get name() { return t("create_action_help_swap_name"); },
    color: "#22c55e",
    get shortDesc() { return t("create_action_help_swap_shortdesc"); },
    get fullDesc() { return t("create_action_help_swap_fulldesc"); },
    category: "transform",
  },
  {
    id: "rewind",
    icon: "fa-backward",
    get name() { return t("create_action_help_rewind_name"); },
    color: "#f43f5e",
    get shortDesc() { return t("create_action_help_rewind_shortdesc"); },
    get fullDesc() { return t("create_action_help_rewind_fulldesc"); },
    category: "transform",
  },

  // === PATTERNS (apply patterns to sequence) ===
  {
    id: "turn-pattern",
    icon: "fa-wand-magic-sparkles",
    get name() { return t("create_action_help_turn_pattern_name"); },
    color: "#14b8a6",
    get shortDesc() { return t("create_action_help_turn_pattern_shortdesc"); },
    get fullDesc() { return t("create_action_help_turn_pattern_fulldesc"); },
    category: "pattern",
  },
  {
    id: "direction",
    icon: "fa-compass",
    get name() { return t("create_action_help_direction_name"); },
    color: "#0ea5e9",
    get shortDesc() { return t("create_action_help_direction_shortdesc"); },
    get fullDesc() { return t("create_action_help_direction_fulldesc"); },
    category: "pattern",
  },
  {
    id: "duration",
    icon: "fa-stopwatch",
    get name() { return t("create_action_help_duration_name"); },
    color: "#fb923c",
    get shortDesc() { return t("create_action_help_duration_shortdesc"); },
    get fullDesc() { return t("create_action_help_duration_fulldesc"); },
    category: "pattern",
  },

  // === TOOLS (sequence manipulation) ===
  {
    id: "extend",
    icon: "fa-circle-check",
    get name() { return t("create_action_help_extend_name"); },
    color: "#22c55e",
    get shortDesc() { return t("create_action_help_extend_shortdesc"); },
    get fullDesc() { return t("create_action_help_extend_fulldesc"); },
    category: "tool",
  },
  {
    id: "shift-start",
    icon: "fa-forward",
    get name() { return t("create_action_help_shift_start_name"); },
    color: "#06b6d4",
    get shortDesc() { return t("create_action_help_shift_start_shortdesc"); },
    get fullDesc() { return t("create_action_help_shift_start_fulldesc"); },
    category: "tool",
  },
];

// Legacy export for backwards compatibility
export const transformHelpContent = actionHelpContent;
