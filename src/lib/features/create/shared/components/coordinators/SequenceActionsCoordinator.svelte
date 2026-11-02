<script lang="ts">
  /**
   * Sequence Actions Coordinator Component
   *
   * Manages the sequence actions panel that combines:
   * - Individual beat editing (turns, rotation)
   * - Sequence transformations (mirror, rotate, swap, reverse)
   *
   * Domain: Create module - Sequence Editing Coordination
   */

  import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import SequenceActionsPanel from "../sequence-actions/SequenceActionsPanel.svelte";
  import { getCreateModuleContext } from "../../context/create-module-context";

  const logger = createComponentLogger("SequenceActionsCoordinator");

  // Tabs that support the Sequence Actions Panel
  const SUPPORTED_TABS = new Set([
    "construct",
    "assemble",
    "generate",
    "spell",
  ]);

  const ctx = getCreateModuleContext();
  const { panelState } = ctx;

  // Only show panel if the current tab supports it AND panel state says it's open
  const currentTab = $derived(navigationState.activeTab);
  const isTabSupported = $derived(SUPPORTED_TABS.has(currentTab));
  const isEditorOpen = $derived.by(
    () => panelState.isSequenceActionsPanelOpen && isTabSupported
  );

  // Event handlers
  function handleClose() {
    logger.log("SequenceActionsCoordinator closing sequence actions panel");
    panelState.closeSequenceActionsPanel();
    // No selection clear here. Opening Actions already dropped the selection,
    // and when a step click closes the drawer this handler runs after that
    // click selected the step; clearing it would undo the selection and leave
    // the editor with nothing to show.
  }

  // Debug effect to track panel visibility
  $effect(() => {
    logger.log(
      "SequenceActionsCoordinator panel state changed:",
      panelState.isSequenceActionsPanelOpen
    );
  });
</script>

<SequenceActionsPanel show={isEditorOpen} onClose={handleClose} />
