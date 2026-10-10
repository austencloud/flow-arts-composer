/**
 * CreateCommandHandler
 *
 * Executes create module voice commands (undo, redo, save, mirror, swap, etc.)
 * by delegating to the create module's global state ref and sequence state.
 */

import type {
  VoiceCommand,
  VoiceCommandCategory,
  CommandResult,
} from "../../domain/voice-command-types";
import { getCreateModuleRef } from "#lib/shared/create/state/create-module-state-ref.svelte.js";
import type { IVoiceCommandHandler } from "../types";

export class CreateCommandHandler implements IVoiceCommandHandler {
  readonly supportedCategories: VoiceCommandCategory[] = ["create"];

  async execute(command: VoiceCommand): Promise<CommandResult> {
    const ref = getCreateModuleRef();
    if (!ref) {
      return { success: false, message: "Create module not loaded" };
    }

    const { CreateModuleState: state, panelState } = ref;

    switch (command.action) {
      case "undo": {
        if (!state.canUndo) {
          return { success: false, message: "Nothing to undo" };
        }
        state.undo();
        return { success: true, message: "Undone" };
      }

      case "redo": {
        if (!state.canRedo) {
          return { success: false, message: "Nothing to redo" };
        }
        state.redo();
        return { success: true, message: "Redone" };
      }

      case "save": {
        panelState.openSaveToLibraryPanel();
        return { success: true, message: "Save panel opened" };
      }

      case "clear": {
        const seqState = state.sequenceState;
        if (!seqState?.currentSequence) {
          return { success: false, message: "No sequence to clear" };
        }
        seqState.clearSequence();
        return { success: true, message: "Sequence cleared" };
      }

      case "mirror": {
        const seqState = state.sequenceState;
        if (!seqState?.currentSequence) {
          return { success: false, message: "No sequence to mirror" };
        }
        await seqState.mirrorSequence("both");
        return { success: true, message: "Mirrored" };
      }

      case "flip": {
        const seqState = state.sequenceState;
        if (!seqState?.currentSequence) {
          return { success: false, message: "No sequence to flip" };
        }
        await seqState.flipSequence("both");
        return { success: true, message: "Flipped" };
      }

      case "swap": {
        const seqState = state.sequenceState;
        if (!seqState?.currentSequence) {
          return { success: false, message: "No sequence to swap" };
        }
        await seqState.swapHands();
        return { success: true, message: "Hands swapped" };
      }

      case "reverse": {
        const seqState = state.sequenceState;
        if (!seqState?.currentSequence) {
          return { success: false, message: "No sequence to reverse" };
        }
        await seqState.rewindSequence("both");
        return { success: true, message: "Reversed" };
      }

      case "rotate": {
        const seqState = state.sequenceState;
        if (!seqState?.currentSequence) {
          return { success: false, message: "No sequence to rotate" };
        }
        await seqState.rotateSequence("clockwise", "both");
        return { success: true, message: "Rotated" };
      }

      default:
        return {
          success: false,
          message: `Unknown create action: ${command.action}`,
        };
    }
  }
}
