<script lang="ts">
  import { getLocale, t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { UndoOperationType } from "../../../../services/undo-manager";
  import type { createCreateModuleState } from "$lib/features/create/shared/state/create-module-state.svelte";
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import { WORKSPACE_BUTTON_ICON } from "../../workspace-button-layout";
  import UndoGlyph from "./UndoGlyph.svelte";

  type ModuleState = ReturnType<typeof createCreateModuleState>;
  type CreateModuleState = Pick<
    ModuleState,
    "canUndo" | "canRedo" | "undo" | "redo"
  > &
    Partial<Pick<ModuleState, "assembleTabState" | "undoController">>;

  // Props
  let {
    CreateModuleState,
    direction = "undo",
    onAction = () => {},
    quiet = false,
  }: {
    CreateModuleState: CreateModuleState;
    direction?: "undo" | "redo";
    onAction?: () => void;
    /** Plain surface for the phone Assemble rail, where the pictures lead. */
    quiet?: boolean;
  } = $props();

  // Resolve haptic feedback service
  const hapticService = getHapticFeedback();

  const isAssembleTab = $derived(navigationState.activeTab === "assemble");

  // Type descriptions for all operation types
  const typeDescriptions: Record<UndoOperationType, () => string> = {
    [UndoOperationType.ADD_BEAT]: () => t("create_workspace_history_add_step"),
    [UndoOperationType.REMOVE_BEATS]: () => t("create_workspace_history_remove_steps"),
    [UndoOperationType.CLEAR_SEQUENCE]: () => t("create_workspace_clear_sequence"),
    [UndoOperationType.SELECT_START_PLACEMENT]: () => t("create_workspace_history_select_start"),
    [UndoOperationType.UPDATE_BEAT]: () => t("create_workspace_history_update_step"),
    [UndoOperationType.INSERT_BEAT]: () => t("create_workspace_history_insert_step"),
    [UndoOperationType.BATCH_EDIT]: () => t("create_workspace_history_batch_edit"),
    [UndoOperationType.MIRROR_SEQUENCE]: () => t("create_workspace_history_mirror"),
    [UndoOperationType.FLIP_SEQUENCE]: () => t("create_workspace_history_flip"),
    [UndoOperationType.ROTATE_SEQUENCE]: () => t("create_workspace_history_rotate"),
    [UndoOperationType.SWAP_HANDS]: () => t("create_workspace_history_swap_hands"),
    [UndoOperationType.INVERT_SEQUENCE]: () => t("create_workspace_history_invert"),
    [UndoOperationType.REWIND_SEQUENCE]: () => t("create_workspace_history_rewind"),
    [UndoOperationType.SHIFT_START]: () => t("create_workspace_history_shift_start"),
    [UndoOperationType.APPLY_TURN_PATTERN]: () => t("create_workspace_history_turn_pattern"),
    [UndoOperationType.APPLY_ROTATION_PATTERN]: () => t("create_workspace_history_rotation_pattern"),
    [UndoOperationType.APPLY_DURATION_PATTERN]: () => t("create_workspace_history_duration_pattern"),
    [UndoOperationType.EXTEND_SEQUENCE]: () => t("create_workspace_history_extend"),
    [UndoOperationType.MODIFY_BEAT_PROPERTIES]: () => t("create_workspace_history_edit_step"),
    [UndoOperationType.GENERATE_SEQUENCE]: () => t("create_ui_generate_sequence"),
    [UndoOperationType.SPELL_GENERATE]: () => t("create_workspace_history_spell_generate"),
    [UndoOperationType.SPELL_APPLY_LOOP]: () => t("create_workspace_history_spell_loop"),
  };

  // Derived state for button text/tooltip
  const canAct = $derived(
    direction === "undo" ? CreateModuleState.canUndo : CreateModuleState.canRedo
  );

  const historyAction = $derived.by(() => {
    if (isAssembleTab) {
      const builder = CreateModuleState.assembleTabState?.assembleBuilderState;
      const label = direction === "undo" ? builder?.undoLabel : builder?.redoLabel;
      return getLocale() === "en" && label ? label : t("create_workspace_history_last_action");
    }

    const entry = direction === "undo"
      ? CreateModuleState.undoController?.nextUndoEntry
      : CreateModuleState.undoController?.nextRedoEntry;
    const type = entry?.type as UndoOperationType | undefined;
    if (getLocale() === "en" && entry?.metadata?.description) {
      return entry.metadata.description;
    }
    return type && typeDescriptions[type]
      ? typeDescriptions[type]()
      : t("create_workspace_history_last_action");
  });

  const historyButtonText = $derived(
    !canAct
      ? t(direction === "undo" ? "create_workspace_nothing_to_undo" : "create_workspace_nothing_to_redo")
      : t(direction === "undo" ? "create_workspace_undo_named" : "create_workspace_redo_named", { action: historyAction })
  );
  const historyTooltip = $derived(
    !canAct
      ? t(direction === "undo" ? "create_workspace_no_actions_to_undo" : "create_workspace_no_actions_to_redo")
      : historyButtonText
  );

  // Simple click handler
  function handleAction() {
    hapticService?.trigger("selection");
    const success =
      direction === "undo"
        ? CreateModuleState.undo()
        : CreateModuleState.redo();
    if (success) {
      onAction();
    }
  }
</script>

<button
  type="button"
  data-undo-shortcut={direction === "undo" ? "" : undefined}
  data-redo-shortcut={direction === "redo" ? "" : undefined}
  data-undo-shortcut-label={direction === "undo"
    ? historyAction
    : undefined}
  data-redo-shortcut-label={direction === "redo"
    ? historyAction
    : undefined}
  class="undo-button"
  class:quiet
  class:disabled={!canAct}
  onclick={handleAction}
  disabled={!canAct}
  title={historyTooltip}
  aria-label={historyButtonText}
  data-ghost={direction === "undo" && canAct ? "safe" : undefined}
  data-ghost-kind={direction === "undo" ? "undo" : undefined}
  data-ghost-label={direction === "undo" ? t("create_workspace_undo") : undefined}
>
  <UndoGlyph size={20} {direction} />
  <span class="workspace-action-label" aria-hidden="true">
    {WORKSPACE_BUTTON_ICON[direction].visibleLabel}
  </span>
</button>

<style>
  .undo-button {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: var(--workspace-action-width, var(--min-touch-target));
    min-width: var(--min-touch-target);
    height: var(--min-touch-target);
    gap: var(--workspace-action-gap, 0);
    padding-inline: var(--workspace-action-padding-inline, 0);
    border: none;
    border-radius: var(--workspace-action-radius, 50%);
    cursor: pointer;
    transition:
      transform var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1),
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
    font-size: var(--font-size-lg);
    color: var(--theme-text);

    /* Purple gradient matching SaveToLibraryButton */
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong) 0%,
      color-mix(
          in srgb,
          var(--theme-accent-strong) 85%,
          var(--theme-accent-strong)
        )
        100%
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent-strong) 30%, transparent);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent-strong) 40%, transparent);
  }

  .workspace-action-label {
    display: var(--workspace-action-label-display, none);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
  }

  @container create-workspace (min-width: 768px) {
    .undo-button {
      width: auto;
      gap: 8px;
      padding-inline: 16px;
      border-radius: 999px;
    }

    .workspace-action-label {
      display: inline;
    }
  }

  .undo-button:hover:not(:disabled) {
    transform: scale(1.05);
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--theme-accent-strong) 85%,
          var(--theme-accent-strong)
        )
        0%,
      color-mix(
          in srgb,
          var(--theme-accent-strong) 70%,
          var(--theme-accent-strong)
        )
        100%
    );
    box-shadow: 0 6px 16px
      color-mix(in srgb, var(--theme-accent-strong) 60%, transparent);
  }

  .undo-button.quiet {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    box-shadow: none;
  }

  .undo-button.quiet:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    box-shadow: none;
  }

  /* Quiet keeps the familiar purple on the icon only. */
  .undo-button.quiet :global(.undo-glyph) {
    color: color-mix(in srgb, var(--theme-accent-strong) 62%, white);
  }

  .undo-button:active {
    transform: scale(0.95);
    transition-duration: var(--duration-instant);
  }

  .undo-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .undo-button:disabled,
  .undo-button.disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .undo-button {
      transition: none;
    }
  }
</style>
