/**
 * PropCommandHandler
 *
 * Executes prop type change voice commands.
 * Delegates to the settings service to update prop types.
 */

import type {
  VoiceCommand,
  VoiceCommandCategory,
  CommandResult,
} from "../../domain/voice-command-types";
import { settingsService } from "../../../settings/state/settings-state.svelte";
import type { PropType } from "../../../pictograph/prop/domain/enums/prop-type";
import type { IVoiceCommandHandler } from "../types";

export class PropCommandHandler implements IVoiceCommandHandler {
  readonly supportedCategories: VoiceCommandCategory[] = ["prop"];

  async execute(command: VoiceCommand): Promise<CommandResult> {
    if (command.action !== "change_prop") {
      return {
        success: false,
        message: `Unknown prop action: ${command.action}`,
      };
    }

    const propType = command.target as PropType;
    const hand = command.args?.hand as string | undefined;

    if (!propType) {
      return { success: false, message: "No prop type specified" };
    }

    // Color-keyed values are accepted only for older AI-planned commands.
    if (hand === "left" || hand === "blue") {
      await settingsService.updateSetting("leftPropType", propType);
      return { success: true, message: `Left prop: ${propType}` };
    }

    if (hand === "right" || hand === "red") {
      await settingsService.updateSetting("rightPropType", propType);
      return { success: true, message: `Right prop: ${propType}` };
    }

    // Both hands
    await settingsService.updateSettings({
      leftPropType: propType,
      rightPropType: propType,
    });
    return { success: true, message: `Props: ${propType}` };
  }
}
