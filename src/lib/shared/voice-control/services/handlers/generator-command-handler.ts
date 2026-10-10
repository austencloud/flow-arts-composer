import type {
  VoiceCommand,
  VoiceCommandCategory,
  CommandResult,
} from "../../domain/voice-command-types";
import {
  getGeneratorVoiceRef,
  type GeneratorVoiceRef,
} from "#lib/shared/create/state/generator-voice-ref.svelte.js";
import type { GeneratorHelpId } from "#lib/shared/create/domain/generator-help-content.js";
import type { UIGenerationConfig } from "#lib/shared/create/utils/config-mapper.js";
import type { IVoiceCommandHandler } from "../types";

// Parameter metadata for validation
interface NumericParamMeta {
  type: "numeric";
  display: string;
  min: number;
  max: number;
  step: number;
}

interface CyclicParamMeta {
  type: "cyclic";
  display: string;
  values: string[];
}

type ParamMeta = NumericParamMeta | CyclicParamMeta;

const PARAM_META: Record<string, ParamMeta> = {
  level: { type: "numeric", display: "level", min: 1, max: 4, step: 1 },
  length: { type: "numeric", display: "length", min: 1, max: 64, step: 2 },
  turnIntensity: {
    type: "numeric",
    display: "turn intensity",
    min: 0.5,
    max: 3.0,
    step: 0.5,
  },
  mode: {
    type: "cyclic",
    display: "mode",
    values: ["freeform", "circular"],
  },
  gridMode: {
    type: "cyclic",
    display: "grid mode",
    values: ["diamond", "box"],
  },
  propContinuity: {
    type: "cyclic",
    display: "prop continuity",
    values: ["continuous", "random"],
  },
  period: {
    type: "cyclic",
    display: "period",
    values: ["halved", "quartered"],
  },
  loopType: {
    type: "cyclic",
    display: "LOOP type",
    values: [
      "rotated",
      "mirrored",
      "flipped",
      "swapped",
      "inverted",
      "swapped_inverted",
      "rotated_inverted",
      "mirrored_swapped",
      "mirrored_inverted",
      "rotated_swapped",
      "mirrored_rotated",
      "mirrored_inverted_rotated",
      "mirrored_rotated_inverted_swapped",
      "strict_rewound",
    ],
  },
};

// Display name helpers
const LOOP_TYPE_DISPLAY: Record<string, string> = {
  rotated: "Rotated",
  mirrored: "Mirrored",
  flipped: "Flipped",
  swapped: "Swapped",
  inverted: "Inverted",
  swapped_inverted: "Swapped / Inverted",
  rotated_inverted: "Rotated / Inverted",
  mirrored_swapped: "Mirrored / Swapped",
  mirrored_inverted: "Mirrored / Inverted",
  rotated_swapped: "Rotated / Swapped",
  mirrored_rotated: "Mirrored / Rotated",
  mirrored_inverted_rotated: "Mir / Inv / Rot",
  mirrored_swapped_inverted: "Mir / Swap / Inv",
  rotated_swapped_inverted: "Rot / Swap / Inv",
  mirrored_rotated_inverted_swapped: "All Four",
  strict_rewound: "Rewound",
};

function displayValue(param: string, value: string | number): string {
  if (param === "loopType" && typeof value === "string") {
    return LOOP_TYPE_DISPLAY[value] ?? value;
  }
  return String(value);
}

/**
 * Keys of UIGenerationConfig that this handler reads/writes. Every PARAM_META
 * entry corresponds to one of these, so narrowing to the config's own keyspace
 * lets us index it without bypassing the type system.
 */
type ConfigParamKey = keyof UIGenerationConfig;

/** Read a config field by key name */
function getConfigValue(
  config: UIGenerationConfig,
  key: string
): string | number | undefined {
  const value = config[key as ConfigParamKey];
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

export class GeneratorCommandHandler implements IVoiceCommandHandler {
  readonly supportedCategories: VoiceCommandCategory[] = ["generator"];

  /** Update a single config field by key name */
  private setConfigField(
    ref: GeneratorVoiceRef,
    key: string,
    value: string | number
  ): void {
    const update: Partial<UIGenerationConfig> = { [key as ConfigParamKey]: value };
    ref.updateConfig(update);
  }

  async execute(command: VoiceCommand): Promise<CommandResult> {
    const ref = getGeneratorVoiceRef();
    if (!ref) {
      return { success: false, message: "Generator not loaded" };
    }

    switch (command.action) {
      case "generate":
        return this.handleGenerate(ref);
      case "set":
        return this.handleSet(ref, command);
      case "toggle":
        return this.handleToggle(ref, command);
      case "increment":
        return this.handleIncrement(ref, command);
      case "decrement":
        return this.handleDecrement(ref, command);
      case "help":
        return this.handleHelp(ref, command);
      default:
        return {
          success: false,
          message: `Unknown generator action: ${command.action}`,
        };
    }
  }

  private handleGenerate(ref: GeneratorVoiceRef): CommandResult {
    ref.triggerGeneration();
    return { success: true, message: "Generating" };
  }

  private handleSet(
    ref: GeneratorVoiceRef,
    command: VoiceCommand
  ): CommandResult {
    const param = command.target;
    const meta = PARAM_META[param];
    if (!meta) {
      return { success: false, message: `Unknown parameter: ${param}` };
    }

    const rawValue = command.args?.value;
    if (rawValue === undefined) {
      return {
        success: false,
        message: `No value provided for ${meta.display}`,
      };
    }

    if (meta.type === "numeric") {
      const numVal = parseFloat(String(rawValue));
      if (isNaN(numVal)) {
        return {
          success: false,
          message: `Invalid number for ${meta.display}`,
        };
      }
      if (numVal < meta.min || numVal > meta.max) {
        return {
          success: false,
          message: `${meta.display} must be between ${meta.min} and ${meta.max}`,
        };
      }

      // Round level and length to integers
      const finalVal =
        param === "level" || param === "length" ? Math.round(numVal) : numVal;

      // In circular mode, length must be even
      const config = ref.getConfig();
      let adjustedVal = finalVal;
      if (
        param === "length" &&
        config.mode === "circular" &&
        finalVal % 2 !== 0
      ) {
        adjustedVal = finalVal + 1;
      }

      this.setConfigField(ref, param, adjustedVal);
      const displayMsg =
        adjustedVal !== finalVal
          ? `${meta.display}: ${adjustedVal} (rounded to even for LOOP mode)`
          : `${meta.display}: ${adjustedVal}`;
      return { success: true, message: displayMsg };
    }

    // Cyclic param - validate value is in the allowed set
    const strVal = String(rawValue);
    if (!meta.values.includes(strVal)) {
      return {
        success: false,
        message: `Invalid ${meta.display}: ${strVal}`,
      };
    }

    this.setConfigField(ref, param, strVal);
    return {
      success: true,
      message: `${meta.display}: ${displayValue(param, strVal)}`,
    };
  }

  private handleToggle(
    ref: GeneratorVoiceRef,
    command: VoiceCommand
  ): CommandResult {
    const param = command.target;
    const meta = PARAM_META[param];
    if (!meta) {
      return { success: false, message: `Unknown parameter: ${param}` };
    }

    if (meta.type === "numeric") {
      return {
        success: false,
        message: `Can't toggle ${meta.display} - use "increase" or "decrease"`,
      };
    }

    const config = ref.getConfig();
    const current = String(getConfigValue(config, param) ?? "");
    const idx = meta.values.indexOf(current);
    const nextIdx = (idx + 1) % meta.values.length;
    const nextVal = meta.values[nextIdx]!;

    this.setConfigField(ref, param, nextVal);
    return {
      success: true,
      message: `${meta.display}: ${displayValue(param, nextVal)}`,
    };
  }

  private handleIncrement(
    ref: GeneratorVoiceRef,
    command: VoiceCommand
  ): CommandResult {
    const param = command.target;
    const meta = PARAM_META[param];
    if (!meta) {
      return { success: false, message: `Unknown parameter: ${param}` };
    }

    if (meta.type === "cyclic") {
      // Treat increment as forward cycle for cyclic params
      return this.handleToggle(ref, command);
    }

    const config = ref.getConfig();
    const current = Number(getConfigValue(config, param) ?? meta.min);
    if (current >= meta.max) {
      return {
        success: false,
        message: `${meta.display} already at maximum (${meta.max})`,
      };
    }

    let next = Math.min(current + meta.step, meta.max);

    // Round length to even in circular mode
    if (param === "length" && config.mode === "circular" && next % 2 !== 0) {
      next = Math.min(next + 1, meta.max);
    }

    this.setConfigField(ref, param, next);
    return { success: true, message: `${meta.display}: ${next}` };
  }

  private handleDecrement(
    ref: GeneratorVoiceRef,
    command: VoiceCommand
  ): CommandResult {
    const param = command.target;
    const meta = PARAM_META[param];
    if (!meta) {
      return { success: false, message: `Unknown parameter: ${param}` };
    }

    if (meta.type === "cyclic") {
      // Treat decrement as backward cycle
      const config = ref.getConfig();
      const current = String(getConfigValue(config, param) ?? "");
      const idx = meta.values.indexOf(current);
      const prevIdx = idx <= 0 ? meta.values.length - 1 : idx - 1;
      const prevVal = meta.values[prevIdx]!;

      this.setConfigField(ref, param, prevVal);
      return {
        success: true,
        message: `${meta.display}: ${displayValue(param, prevVal)}`,
      };
    }

    const config = ref.getConfig();
    const current = Number(getConfigValue(config, param) ?? meta.min);
    if (current <= meta.min) {
      return {
        success: false,
        message: `${meta.display} already at minimum (${meta.min})`,
      };
    }

    let next = Math.max(current - meta.step, meta.min);

    // Round length to even in circular mode
    if (param === "length" && config.mode === "circular" && next % 2 !== 0) {
      next = Math.max(next - 1, meta.min);
    }

    this.setConfigField(ref, param, next);
    return { success: true, message: `${meta.display}: ${next}` };
  }

  private handleHelp(
    ref: GeneratorVoiceRef,
    command: VoiceCommand
  ): CommandResult {
    const helpId = command.target as GeneratorHelpId;
    ref.openHelpForControl(helpId);
    return { success: true, message: `Showing help for ${helpId}` };
  }
}
