/**
 * Translated names for each undo operation, shared by the undo button and the
 * undo/redo toasts.
 */
import { getLocale, t } from "#lib/shared/i18n/i18n.svelte.js";
import { UndoOperationType, type UndoHistoryEntry } from "./undo-manager";

export const undoTypeDescriptions: Record<UndoOperationType, () => string> = {
  [UndoOperationType.ADD_BEAT]: () => t("create_workspace_history_add_step"),
  [UndoOperationType.REMOVE_BEATS]: () =>
    t("create_workspace_history_remove_steps"),
  [UndoOperationType.CLEAR_SEQUENCE]: () => t("create_workspace_clear_sequence"),
  [UndoOperationType.SELECT_START_PLACEMENT]: () =>
    t("create_workspace_history_select_start"),
  [UndoOperationType.UPDATE_BEAT]: () =>
    t("create_workspace_history_update_step"),
  [UndoOperationType.INSERT_BEAT]: () =>
    t("create_workspace_history_insert_step"),
  [UndoOperationType.BATCH_EDIT]: () =>
    t("create_workspace_history_batch_edit"),
  [UndoOperationType.MIRROR_SEQUENCE]: () =>
    t("create_workspace_history_mirror"),
  [UndoOperationType.FLIP_SEQUENCE]: () => t("create_workspace_history_flip"),
  [UndoOperationType.ROTATE_SEQUENCE]: () =>
    t("create_workspace_history_rotate"),
  [UndoOperationType.SWAP_HANDS]: () =>
    t("create_workspace_history_swap_hands"),
  [UndoOperationType.INVERT_SEQUENCE]: () =>
    t("create_workspace_history_invert"),
  [UndoOperationType.REWIND_SEQUENCE]: () =>
    t("create_workspace_history_rewind"),
  [UndoOperationType.SET_GRID_JOIN]: () =>
    t("create_workspace_history_grid_join"),
  [UndoOperationType.SHIFT_START]: () =>
    t("create_workspace_history_shift_start"),
  [UndoOperationType.APPLY_TURN_PATTERN]: () =>
    t("create_workspace_history_turn_pattern"),
  [UndoOperationType.APPLY_ROTATION_PATTERN]: () =>
    t("create_workspace_history_rotation_pattern"),
  [UndoOperationType.APPLY_DURATION_PATTERN]: () =>
    t("create_workspace_history_duration_pattern"),
  [UndoOperationType.EXTEND_SEQUENCE]: () =>
    t("create_workspace_history_extend"),
  [UndoOperationType.MODIFY_BEAT_PROPERTIES]: () =>
    t("create_workspace_history_edit_step"),
  [UndoOperationType.GENERATE_SEQUENCE]: () => t("create_ui_generate_sequence"),
  [UndoOperationType.SPELL_GENERATE]: () =>
    t("create_workspace_history_spell_generate"),
  [UndoOperationType.SPELL_APPLY_LOOP]: () =>
    t("create_workspace_history_spell_loop"),
};

/**
 * Name of a history entry for a toast. English keeps the entry's own
 * description (for example "Add step 1"); other languages get the translated
 * operation name, because those descriptions are English text.
 */
export function describeUndoEntryForToast(
  entry: Pick<UndoHistoryEntry, "type" | "metadata">,
  englishFallback: string
): string {
  if (getLocale() === "en") {
    return entry.metadata?.description || englishFallback;
  }
  const named = undoTypeDescriptions[entry.type];
  return named ? named() : t("create_workspace_history_last_action");
}
