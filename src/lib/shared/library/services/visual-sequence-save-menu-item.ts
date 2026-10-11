import type { ContextMenuItem } from "#lib/shared/components/context-menu/context-menu-types.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { VisualSequenceSaveIntent } from "#lib/shared/library/services/contracts/IVisualSequenceSaveCoordinator.js";
import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";

export function buildVisualSequenceSaveMenuItem(
  sequence: SequenceData,
  intent: VisualSequenceSaveIntent = {},
  onSaveToLibrary?: () => void | Promise<void>
): ContextMenuItem {
  return {
    id: "save-to-library",
    label: "Save sequence to Library",
    icon: "fa-bookmark",
    disabled: !sequence.steps?.length,
    async action() {
      if (onSaveToLibrary) {
        await onSaveToLibrary();
        return;
      }
      // No host callback here means no save dialog either - this call is the
      // whole save, with nothing downstream to report a problem. The shared
      // ContextMenu awaits this action with no catch, so a rejection would
      // otherwise vanish instead of reaching the person.
      try {
        const { getVisualSequenceSaveCoordinator } =
          await import("#lib/shared/library/get-visual-sequence-save-coordinator.js");
        const coordinator = await getVisualSequenceSaveCoordinator();
        await coordinator.save(sequence, intent);
      } catch (error) {
        console.error(
          "[buildVisualSequenceSaveMenuItem] Could not reach library saving:",
          error
        );
        showToast("Couldn't save this sequence right now", "error");
      }
    },
  };
}
