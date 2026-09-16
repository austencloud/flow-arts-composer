/**
 * Register CREATE Module Shortcuts
 *
 * Registers keyboard shortcuts specific to the CREATE module.
 *
 * Side-effectful registration/orchestration — lives in registration/, not utils/.
 *
 * Domain: Keyboard Shortcuts - CREATE Module
 */

import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
import type { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
import type { createKeyboardShortcutState } from "../state/keyboard-shortcut-state.svelte";
import { getCreateModuleRef } from "$lib/shared/create/state/create-module-state-ref.svelte";
import { getAnimationPlaybackRef } from "$lib/shared/coordinators/animation-playback-ref.svelte";
import { executeClearSequenceWorkflow } from "$lib/shared/create/utils/clear-sequence-workflow";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import {
  getSettings,
  updateSettings,
} from "$lib/shared/application/state/app-state.svelte";
import type { SequenceTransformCommandId } from "$lib/shared/create/domain/sequence-action-types";
import { getAllPropTypes } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
import { filterPremiumCosmeticProps } from "$lib/shared/subscription/domain/premium-prop-access";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  isLayerOwnedKeyboardTarget,
  isWidgetOwnedKeyboardTarget,
} from "../domain/shortcut-target-resolution";

const debug = createComponentLogger("CreateShortcuts");

/**
 * The manager dismisses the top drawer and cancels the browser default for any
 * single-key match before the action runs, and `condition` is the only thing
 * that can stop the match. So the bare navigation and adjustment keys below
 * must yield whenever a widget already owns them: with the Customize drawer
 * open, ArrowDown on a Hand Relationship radio used to close the whole drawer
 * instead of moving the selection.
 */
function singleKeyShortcutAllowed(
  state: ReturnType<typeof createKeyboardShortcutState>
): boolean {
  if (!state.settings.enableSingleKeyShortcuts) return false;
  if (typeof document === "undefined") return true;
  return !isWidgetOwnedKeyboardTarget(document.activeElement);
}

/**
 * Backspace and Delete really delete the selected step, so they cannot yield
 * to every focusable control the way the placeholders do: the step cell the
 * user just clicked is a focusable control, and Backspace on it is the
 * feature. They yield only inside an open dialog or drawer that is foreign to
 * the sequence. With the Customize drawer open on /create/generate, Backspace
 * on the Inverted chip used to close the drawer and delete a step behind it.
 * The step editor marks its body as passthrough so the key stays live there.
 */
function deleteShortcutAllowed(): boolean {
  if (typeof document === "undefined") return true;
  return !isLayerOwnedKeyboardTarget(document.activeElement);
}

async function executeSequenceShortcut(
  action: SequenceTransformCommandId,
  stepNumber?: number
): Promise<void> {
  const ref = getCreateModuleRef();
  if (!ref) return;

  await ref.executeSequenceAction(action, {
    source: "keyboard",
    targetHand: "both",
    ...(stepNumber === undefined ? {} : { stepNumber }),
  });
}

/**
 * Apply a prop preset from settings by index
 */
async function applyPropPreset(presetIndex: number): Promise<void> {
  const settings = getSettings();
  const propPresets = settings?.propPresets || [];

  // Check if this preset slot is filled
  const preset = propPresets[presetIndex];
  if (!preset) {
    debug.log(`Preset ${presetIndex} is empty, ignoring`);
    return;
  }

  // Trigger haptic feedback
  const hapticService = getHapticFeedback();
  hapticService?.trigger("selection");

  // Apply the preset settings
  await updateSettings({
    selectedPresetIndex: presetIndex,
    leftPropType: preset.leftPropType,
    rightPropType: preset.rightPropType,
    catDogMode: preset.catDogMode,
    leftBuugengFlipped: preset.leftBuugengFlipped ?? false,
    rightBuugengFlipped: preset.rightBuugengFlipped ?? false,
  });

  debug.log(`Applied prop preset ${presetIndex}:`, preset);
}

export function registerCreateShortcuts(
  service: KeyboardShortcutManager,
  state: ReturnType<typeof createKeyboardShortcutState>
) {
  // ==================== Animation Control ====================

  // Space - Toggle play/pause on animation, or open animation panel if closed
  service.register({
    id: "create.toggle-animation",
    label: "Play/Pause Animation",
    description: "Toggle animation playback or open animation panel",
    key: "Space", // Normalized key name (not " ")
    modifiers: [],
    context: ["create", "export-panel"], // Works in both contexts
    scope: "animation",
    priority: "high",
    // Note: forceExecute removed - let shouldIgnore() handle text inputs naturally
    // Space should type a space when focused on input/textarea, not trigger playback
    condition: () => {
      // Only check for single-key shortcuts enabled - sequence check is in action
      return state.settings.enableSingleKeyShortcuts;
    },
    action: () => {
      const ref = getCreateModuleRef();
      if (!ref) return;

      const { panelState } = ref;

      // Check if any animation panel is open (Animation Panel, Export Panel, or Sequence Viewer)
      if (
        panelState.isAnimationPanelOpen ||
        panelState.isExportPanelOpen ||
        panelState.isSequenceViewerOpen
      ) {
        // Animation is visible - toggle play/pause
        const playbackController = getAnimationPlaybackRef();
        if (playbackController) {
          playbackController.togglePlayback();
        }
      } else {
        // No animation panel open - check if we have a sequence first
        const sequenceState = ref.CreateModuleState.getActiveTabSequenceState();
        if (sequenceState?.hasSequence()) {
          // Open the sequence viewer (full-screen with animation + image views)
          panelState.openSequenceViewer();
        }
      }
    },
  });

  // ==================== Step Grid Navigation ====================

  // Arrow Up - Move focus up in step grid
  service.register({
    id: "create.grid-nav-up",
    label: "Navigate Grid Up",
    description: "Move focus up in the step grid",
    key: "ArrowUp",
    modifiers: [],
    context: "create",
    scope: "workspace",
    priority: "medium",
    condition: () => singleKeyShortcutAllowed(state),
    action: () => {
      debug.log("Arrow Up - Grid navigation (not yet implemented)");
      // TODO: Integrate with step grid navigation
    },
  });

  // Arrow Down - Move focus down in step grid
  service.register({
    id: "create.grid-nav-down",
    label: "Navigate Grid Down",
    description: "Move focus down in the step grid",
    key: "ArrowDown",
    modifiers: [],
    context: "create",
    scope: "workspace",
    priority: "medium",
    condition: () => singleKeyShortcutAllowed(state),
    action: () => {
      debug.log("Arrow Down - Grid navigation (not yet implemented)");
      // TODO: Integrate with step grid navigation
    },
  });

  // Arrow Left - Move focus left in step grid
  service.register({
    id: "create.grid-nav-left",
    label: "Navigate Grid Left",
    description: "Move focus left in the step grid",
    key: "ArrowLeft",
    modifiers: [],
    context: "create",
    scope: "workspace",
    priority: "medium",
    condition: () => singleKeyShortcutAllowed(state),
    action: () => {
      debug.log("Arrow Left - Grid navigation (not yet implemented)");
      // TODO: Integrate with step grid navigation
    },
  });

  // Arrow Right - Move focus right in step grid
  service.register({
    id: "create.grid-nav-right",
    label: "Navigate Grid Right",
    description: "Move focus right in the step grid",
    key: "ArrowRight",
    modifiers: [],
    context: "create",
    scope: "workspace",
    priority: "medium",
    condition: () => singleKeyShortcutAllowed(state),
    action: () => {
      debug.log("Arrow Right - Grid navigation (not yet implemented)");
      // TODO: Integrate with step grid navigation
    },
  });

  // ==================== Edit Panel Navigation ====================

  // Arrow Left - Navigate to previous beat (when edit panel is open)
  service.register({
    id: "create.edit-nav-left",
    label: "Previous Step",
    description: "Navigate to previous step in edit panel",
    key: "ArrowLeft",
    modifiers: [],
    context: ["create", "edit-panel"],
    scope: "editing",
    priority: "high", // Higher priority than grid navigation
    condition: () => singleKeyShortcutAllowed(state),
    action: () => {
      debug.log("Arrow Left - Previous beat (not yet implemented)");
      // TODO: Integrate with edit panel navigation
      // navigateToPreviousBeat();
    },
  });

  // Arrow Right - Navigate to next beat (when edit panel is open)
  service.register({
    id: "create.edit-nav-right",
    label: "Next Step",
    description: "Navigate to next step in edit panel",
    key: "ArrowRight",
    modifiers: [],
    context: ["create", "edit-panel"],
    scope: "editing",
    priority: "high", // Higher priority than grid navigation
    condition: () => singleKeyShortcutAllowed(state),
    action: () => {
      debug.log("Arrow Right - Next beat (not yet implemented)");
      // TODO: Integrate with edit panel navigation
      // navigateToNextBeat();
    },
  });

  // Enter - Accept changes and close edit panel
  service.register({
    id: "create.edit-accept",
    label: "Accept Changes",
    description: "Accept changes and close edit panel",
    key: "Enter",
    modifiers: [],
    context: ["create", "edit-panel"],
    scope: "editing",
    priority: "high",
    action: () => {
      debug.log("Enter - Accept changes (not yet implemented)");
      // TODO: Integrate with edit panel
      // acceptChangesAndClose();
    },
  });

  // ==================== Sequence Management ====================

  // + (Plus) - Add beat
  // Note: This adds to the sequence, but we need to figure out which prop color
  service.register({
    id: "create.add-beat",
    label: "Add Step",
    description: "Add a step to the sequence",
    key: "+",
    modifiers: [],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => singleKeyShortcutAllowed(state),
    action: () => {
      debug.log("Plus - Add beat (not yet implemented)");
      // TODO: Determine logic for which prop color to add
      // User mentioned needing to figure out non-confusing pattern
    },
  });

  // Backspace - Delete selected beat
  service.register({
    id: "create.delete-beat",
    label: "Delete Step",
    description: "Delete the currently selected step",
    key: "Backspace",
    modifiers: [],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => deleteShortcutAllowed(),
    action: async () => {
      debug.log("Backspace key pressed!");

      const ref = getCreateModuleRef();
      debug.log("Create module ref:", ref ? "Available" : "Not available");

      if (!ref) {
        debug.log("Create module reference not available");
        return;
      }

      const { CreateModuleState, constructTabState, panelState } = ref;
      const sequenceState = CreateModuleState.sequenceState;

      // Check if start position (beat 0) is selected
      const selectedStepData = sequenceState.selectedStepData;

      if (selectedStepData?.stepNumber === 0) {
        // Start position is selected — clearing it clears the whole sequence.
        // Prefer the module-owned flow (confirmation dialog + undo + picker);
        // fall back to the raw workflow if the ref predates it.
        if (ref.requestClearSequence) {
          ref.requestClearSequence();
          return;
        }
        try {
          await executeClearSequenceWorkflow({
            CreateModuleState,
            constructTabState,
            panelState,
          });

          // Close step editor panel if it's open
          if (panelState.isStepEditorPanelOpen) {
            panelState.closeStepEditorPanel();
          }
        } catch (err) {
          console.error("Failed to clear sequence:", err);
        }
        return;
      }

      const selectedStepIndex = sequenceState.getSelectedStepIndex();

      if (selectedStepIndex === null) {
        debug.log("Backspace - No beat selected");
        return;
      }

      // Remove the beat and all subsequent steps with animation (same as trash can button)
      sequenceState.removeStepAndSubsequentWithAnimation(
        selectedStepIndex,
        () => {
          // After animation completes, select appropriate beat
          if (selectedStepIndex > 0) {
            sequenceState.selectStep(selectedStepIndex);
          } else {
            sequenceState.selectStartPlacementForEditing();
          }
        }
      );
    },
  });

  // Delete - Delete selected beat (same as Backspace)
  service.register({
    id: "create.delete-beat-delete-key",
    label: "Delete Step",
    description: "Delete the currently selected step (Delete key)",
    key: "Delete",
    modifiers: [],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => deleteShortcutAllowed(),
    action: async () => {
      const ref = getCreateModuleRef();
      if (!ref) return;

      const { CreateModuleState, constructTabState, panelState } = ref;
      const sequenceState = CreateModuleState.sequenceState;

      const selectedStepData = sequenceState.selectedStepData;

      if (selectedStepData?.stepNumber === 0) {
        try {
          await executeClearSequenceWorkflow({
            CreateModuleState,
            constructTabState,
            panelState,
          });

          if (panelState.isStepEditorPanelOpen) {
            panelState.closeStepEditorPanel();
          }
        } catch (err) {
          console.error("Failed to clear sequence:", err);
        }
        return;
      }

      const selectedStepIndex = sequenceState.getSelectedStepIndex();

      if (selectedStepIndex === null) {
        debug.log("Delete - No beat selected");
        return;
      }

      sequenceState.removeStepAndSubsequentWithAnimation(
        selectedStepIndex,
        () => {
          if (selectedStepIndex > 0) {
            sequenceState.selectStep(selectedStepIndex);
          } else {
            sequenceState.selectStartPlacementForEditing();
          }
        }
      );
    },
  });

  // ==================== Sequence Transforms ====================
  // Alt+key hotkeys for sequence transforms - require explicit intent, no accidental triggers

  // Alt+M - Mirror sequence (flip left/right)
  service.register({
    id: "create.transform-mirror",
    label: "Mirror Sequence",
    description: "Mirror the sequence (flip left and right)",
    key: "m",
    modifiers: ["alt"],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => {
      const ref = getCreateModuleRef();
      if (!ref) return false;
      const sequenceState = ref.CreateModuleState.getActiveTabSequenceState();
      return sequenceState?.hasSequence() ?? false;
    },
    action: () => executeSequenceShortcut("mirror"),
  });

  // Alt+V - Flip sequence
  service.register({
    id: "create.transform-flip",
    label: "Flip Sequence",
    description: "Flip the sequence",
    key: "v",
    modifiers: ["alt"],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => {
      const ref = getCreateModuleRef();
      if (!ref) return false;
      const sequenceState = ref.CreateModuleState.getActiveTabSequenceState();
      return sequenceState?.hasSequence() ?? false;
    },
    action: () => executeSequenceShortcut("flip"),
  });

  // Alt+X - Swap hands. Was Alt+S but Chrome/extensions steal it.
  service.register({
    id: "create.transform-swap-hands",
    label: "Swap Hands",
    description: "Swap hand movements (left becomes right, right becomes left)",
    key: "x",
    modifiers: ["alt"],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => {
      const ref = getCreateModuleRef();
      if (!ref) return false;
      const sequenceState = ref.CreateModuleState.getActiveTabSequenceState();
      return sequenceState?.hasSequence() ?? false;
    },
    action: () => executeSequenceShortcut("swap"),
  });

  // Alt+I - Invert sequence
  service.register({
    id: "create.transform-invert",
    label: "Invert Sequence",
    description: "Invert the sequence",
    key: "i",
    modifiers: ["alt"],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => {
      const ref = getCreateModuleRef();
      if (!ref) return false;
      const sequenceState = ref.CreateModuleState.getActiveTabSequenceState();
      return sequenceState?.hasSequence() ?? false;
    },
    action: () => executeSequenceShortcut("invert"),
  });

  // Alt+F - Shift start (move first beat to end)
  service.register({
    id: "create.transform-shift-start",
    label: "Shift Start",
    description: "Move the first step to the end of the sequence",
    key: "f",
    modifiers: ["alt"],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => {
      const ref = getCreateModuleRef();
      if (!ref) return false;
      const sequenceState = ref.CreateModuleState.getActiveTabSequenceState();
      return sequenceState?.hasSequence() ?? false;
    },
    action: () => executeSequenceShortcut("shift_start", 2),
  });

  // Alt+W - Rewind/Reverse sequence
  service.register({
    id: "create.transform-rewind",
    label: "Rewind Sequence",
    description: "Reverse the sequence to return to start position",
    key: "w",
    modifiers: ["alt"],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => {
      const ref = getCreateModuleRef();
      if (!ref) return false;
      const sequenceState = ref.CreateModuleState.getActiveTabSequenceState();
      return sequenceState?.hasSequence() ?? false;
    },
    action: () => executeSequenceShortcut("rewind"),
  });

  // Alt+] - Rotate sequence clockwise (45°)
  service.register({
    id: "create.transform-rotate-cw",
    label: "Rotate Clockwise",
    description: "Rotate the sequence 45° clockwise",
    key: "]",
    modifiers: ["alt"],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => {
      const ref = getCreateModuleRef();
      if (!ref) return false;
      const sequenceState = ref.CreateModuleState.getActiveTabSequenceState();
      return sequenceState?.hasSequence() ?? false;
    },
    action: () => executeSequenceShortcut("rotate_clockwise"),
  });

  // Alt+[ - Rotate sequence counter-clockwise (45°)
  service.register({
    id: "create.transform-rotate-ccw",
    label: "Rotate Counter-Clockwise",
    description: "Rotate the sequence 45° counter-clockwise",
    key: "[",
    modifiers: ["alt"],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    condition: () => {
      const ref = getCreateModuleRef();
      if (!ref) return false;
      const sequenceState = ref.CreateModuleState.getActiveTabSequenceState();
      return sequenceState?.hasSequence() ?? false;
    },
    action: () => executeSequenceShortcut("rotate_counterclockwise"),
  });

  // ==================== Prop Presets ====================

  // Alt+1 through Alt+9,0 - Select prop presets
  for (let i = 0; i < 10; i++) {
    const displayKey = i === 9 ? "0" : String(i + 1);
    const presetIndex = i;

    service.register({
      id: `create.select-preset-${presetIndex}`,
      label: `Select Prop Preset ${displayKey}`,
      description: `Apply prop preset ${displayKey}`,
      key: displayKey,
      modifiers: ["alt"],
      context: "create",
      scope: "sequence-management",
      priority: "medium",
      action: async () => {
        await applyPropPreset(presetIndex);
      },
    });
  }

  // ==================== Edit Panel Adjustments ====================

  // [ - Decrease rotation/adjustment value
  service.register({
    id: "create.edit-decrease",
    label: "Decrease Value",
    description: "Decrease rotation or adjustment value in edit panel",
    key: "[",
    modifiers: [],
    context: ["create", "edit-panel"],
    scope: "editing",
    priority: "low",
    condition: () => singleKeyShortcutAllowed(state),
    action: () => {
      debug.log("[ - Decrease value (not yet implemented)");
      // TODO: Integrate with edit panel controls
      // decreaseCurrentValue();
    },
  });

  // ] - Increase rotation/adjustment value
  service.register({
    id: "create.edit-increase",
    label: "Increase Value",
    description: "Increase rotation or adjustment value in edit panel",
    key: "]",
    modifiers: [],
    context: ["create", "edit-panel"],
    scope: "editing",
    priority: "low",
    condition: () => singleKeyShortcutAllowed(state),
    action: () => {
      debug.log("] - Increase value (not yet implemented)");
      // TODO: Integrate with edit panel controls
      // increaseCurrentValue();
    },
  });

  // ==================== Easter Eggs ====================

  // Ctrl+Shift+P - Shuffle to a random prop type
  service.register({
    id: "create.shuffle-prop",
    label: "Shuffle Prop",
    description: "Pick a random prop type",
    key: "p",
    modifiers: ["alt"],
    context: "create",
    scope: "sequence-management",
    priority: "medium",
    action: async () => {
      const settings = getSettings();
      const currentProp = settings.leftPropType ?? PropType.STAFF;
      // Shuffle draws from the whole enum, so paid cosmetics drop out unless
      // the user may actually use them.
      const allProps = filterPremiumCosmeticProps(getAllPropTypes());
      const otherProps = allProps.filter((p) => p !== currentProp);
      const randomProp =
        otherProps[Math.floor(Math.random() * otherProps.length)]!;

      const hapticService = getHapticFeedback();
      hapticService?.trigger("selection");

      await updateSettings({
        leftPropType: randomProp,
        rightPropType: randomProp,
      });
      debug.log(`Shuffled prop to: ${randomProp}`);
    },
  });
}
