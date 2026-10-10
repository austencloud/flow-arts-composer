import type { ISubInterpreter } from "../ISubInterpreter";
import type {
  VoiceCommand,
  VoiceCommandCategory,
  CommandContext,
} from "../../domain/voice-command-types";
import { getGeneratorVoiceRef } from "#lib/shared/create/state/generator-voice-ref.svelte.js";
import type { GeneratorHelpId } from "#lib/shared/create/domain/generator-help-content.js";

// Generate trigger phrases
const GENERATE_PHRASES = new Set([
  "generate",
  "go",
  "again",
  "create",
  "make one",
  "build",
  "new sequence",
  "generate sequence",
  "generate one",
  "make a sequence",
  "build a sequence",
  "create a sequence",
  "run",
  "do it",
  "let's go",
  "another",
  "another one",
  "one more",
  "try again",
  "reroll",
]);

// Parameter alias map: spoken term → config key
type GeneratorParam =
  | "level"
  | "length"
  | "mode"
  | "gridMode"
  | "propContinuity"
  | "turnIntensity"
  | "loopType"
  | "period";

const PARAM_ALIASES: Record<string, GeneratorParam> = {
  // level
  level: "level",
  difficulty: "level",
  // length
  length: "length",
  steps: "length",
  beats: "length",
  // mode
  mode: "mode",
  "generation mode": "mode",
  // gridMode
  grid: "gridMode",
  "grid mode": "gridMode",
  "grid type": "gridMode",
  // propContinuity
  continuity: "propContinuity",
  "prop continuity": "propContinuity",
  reversals: "propContinuity",
  // turnIntensity
  "turn intensity": "turnIntensity",
  turns: "turnIntensity",
  intensity: "turnIntensity",
  spinning: "turnIntensity",
  "loop type": "loopType",
  loop: "loopType",
  "loop kind": "loopType",
  // period
  slice: "period",
  "slice size": "period",
};

// Value alias maps per parameter

const MODE_ALIASES: Record<string, string> = {
  freeform: "freeform",
  free: "freeform",
  circular: "circular",
  loop: "circular",
};

const GRID_MODE_ALIASES: Record<string, string> = {
  diamond: "diamond",
  box: "box",
  square: "box",
};

const CONTINUITY_ALIASES: Record<string, string> = {
  continuous: "continuous",
  smooth: "continuous",
  random: "random",
  reversals: "random",
};

const SLICE_SIZE_ALIASES: Record<string, string> = {
  halved: "halved",
  half: "halved",
  quartered: "quartered",
  quarter: "quartered",
};

const LOOP_TYPE_ALIASES: Record<string, string> = {
  rotated: "rotated",
  mirrored: "mirrored",
  flipped: "flipped",
  swapped: "swapped",
  inverted: "inverted",
  rewound: "strict_rewound",
  "swapped inverted": "swapped_inverted",
  "rotated inverted": "rotated_inverted",
  "mirrored swapped": "mirrored_swapped",
  "mirrored inverted": "mirrored_inverted",
  "rotated swapped": "rotated_swapped",
  "mirrored rotated": "mirrored_rotated",
  "all four": "mirrored_rotated_inverted_swapped",
  "mirrored inverted rotated": "mirrored_inverted_rotated",
};

// Help topic aliases: spoken → GeneratorHelpId
const HELP_TOPIC_ALIASES: Record<string, GeneratorHelpId> = {
  level: "level",
  difficulty: "level",
  "difficulty level": "level",
  length: "length",
  "sequence length": "length",
  steps: "length",
  beats: "length",
  mode: "generation-mode",
  "generation mode": "generation-mode",
  "freeform mode": "generation-mode",
  "circular mode": "generation-mode",
  "loop mode": "generation-mode",
  grid: "grid-mode",
  "grid mode": "grid-mode",
  "grid system": "grid-mode",
  "grid type": "grid-mode",
  continuity: "prop-continuity",
  "prop continuity": "prop-continuity",
  reversals: "prop-continuity",
  "turn intensity": "turn-intensity",
  turns: "turn-intensity",
  intensity: "turn-intensity",
  spinning: "turn-intensity",
  "loop type": "loop-type",
  "loop kind": "loop-type",
  slice: "period",
  "slice size": "period",
  "start end": "start-end",
  "start and end": "start-end",
  "start position": "start-end",
  "end position": "start-end",
  generate: "generate",
};
// Regex patterns
// "set {param} to {value}" or "change {param} to {value}" or "make {param} {value}"
const SET_PATTERN =
  /^(?:set|change|make|switch)\s+(.+?)\s+(?:to|=)\s+(.+)$/;

// "toggle {param}" or "cycle {param}" or "switch {param}"
const TOGGLE_PATTERN = /^(?:toggle|cycle|switch)\s+(.+)$/;

// "increase {param}" or "more {param}" or "higher {param}" or "raise {param}"
const INCREMENT_PATTERN = /^(?:increase|more|higher|raise|up|bump up)\s+(.+)$/;

// "decrease {param}" or "fewer {param}" or "lower {param}" or "reduce {param}"
const DECREMENT_PATTERN =
  /^(?:decrease|fewer|lower|reduce|down|less|bump down)\s+(.+)$/;

// "what is {topic}" or "explain {topic}" or "help with {topic}" or "help {topic}"
const HELP_PATTERN =
  /^(?:what is|what's|explain|help with|help|tell me about)\s+(.+?)(?:\?)?$/;

// Bare set: "{param} {number}" e.g. "length 16", "level 3"
const BARE_SET_PATTERN = /^(\w[\w\s]*?)\s+(\d+(?:\.\d+)?)$/;

export class GeneratorSubInterpreter implements ISubInterpreter {
  readonly category: VoiceCommandCategory = "generator";
  readonly activeInModules = ["create"];

  tryInterpret(text: string, context: CommandContext): VoiceCommand | null {
    // Tab-gate: only active on generate tab
    if (context.currentTab !== "generate") return null;

    // Only match if generator ref is available (panel mounted)
    if (!getGeneratorVoiceRef()) return null;

    // Generate trigger (exact phrase match - highest priority within generator)
    if (GENERATE_PHRASES.has(text)) {
      return this.build("generate", "", text);
    }

    // Help questions
    const helpResult = this.tryParseHelp(text);
    if (helpResult) return helpResult;

    // Set value: "set level to 3"
    const setResult = this.tryParseSet(text);
    if (setResult) return setResult;

    // Bare set: "length 16"
    const bareResult = this.tryParseBareSet(text);
    if (bareResult) return bareResult;

    // Toggle/cycle: "toggle mode"
    const toggleResult = this.tryParseToggle(text);
    if (toggleResult) return toggleResult;

    // Increment: "increase length"
    const incResult = this.tryParseIncrement(text);
    if (incResult) return incResult;

    // Decrement: "decrease length"
    const decResult = this.tryParseDecrement(text);
    if (decResult) return decResult;

    return null;
  }

  private tryParseSet(text: string): VoiceCommand | null {
    const match = text.match(SET_PATTERN);
    if (!match?.[1] || !match[2]) return null;

    const paramName = match[1].trim();
    const valuePart = match[2].trim();
    const param = this.resolveParam(paramName);
    if (!param) return null;

    const value = this.resolveValue(param, valuePart);
    if (value === null) return null;

    return this.build("set", param, text, { value });
  }

  private tryParseBareSet(text: string): VoiceCommand | null {
    const match = text.match(BARE_SET_PATTERN);
    if (!match?.[1] || !match[2]) return null;

    const paramName = match[1].trim();
    const valuePart = match[2];
    const param = this.resolveParam(paramName);
    if (!param) return null;

    // Only numeric params accept bare number values
    if (!this.isNumericParam(param)) return null;

    return this.build("set", param, text, { value: valuePart });
  }

  private tryParseToggle(text: string): VoiceCommand | null {
    const match = text.match(TOGGLE_PATTERN);
    if (!match?.[1]) return null;

    const paramName = match[1].trim();
    const param = this.resolveParam(paramName);
    if (!param) return null;

    return this.build("toggle", param, text);
  }

  private tryParseIncrement(text: string): VoiceCommand | null {
    const match = text.match(INCREMENT_PATTERN);
    if (!match?.[1]) return null;

    const paramName = match[1].trim();
    const param = this.resolveParam(paramName);
    if (!param) return null;

    return this.build("increment", param, text);
  }

  private tryParseDecrement(text: string): VoiceCommand | null {
    const match = text.match(DECREMENT_PATTERN);
    if (!match?.[1]) return null;

    const paramName = match[1].trim();
    const param = this.resolveParam(paramName);
    if (!param) return null;

    return this.build("decrement", param, text);
  }

  private tryParseHelp(text: string): VoiceCommand | null {
    const match = text.match(HELP_PATTERN);
    if (!match?.[1]) return null;

    const topicName = match[1].trim();
    const helpId = HELP_TOPIC_ALIASES[topicName];
    if (!helpId) return null;

    return this.build("help", helpId, text);
  }

  private resolveParam(spoken: string): GeneratorParam | null {
    return PARAM_ALIASES[spoken] ?? null;
  }

  private resolveValue(param: GeneratorParam, spoken: string): string | null {
    switch (param) {
      case "mode":
        return MODE_ALIASES[spoken] ?? null;
      case "gridMode":
        return GRID_MODE_ALIASES[spoken] ?? null;
      case "propContinuity":
        return CONTINUITY_ALIASES[spoken] ?? null;
      case "period":
        return SLICE_SIZE_ALIASES[spoken] ?? null;
      case "loopType":
        return LOOP_TYPE_ALIASES[spoken] ?? null;
      case "level":
      case "length":
      case "turnIntensity": {
        // Accept raw numbers
        const num = parseFloat(spoken);
        return isNaN(num) ? null : String(num);
      }
      default:
        return null;
    }
  }

  private isNumericParam(param: GeneratorParam): boolean {
    return param === "level" || param === "length" || param === "turnIntensity";
  }

  private build(
    action: string,
    target: string,
    rawText: string,
    args?: Record<string, string | boolean | number>
  ): VoiceCommand {
    return {
      category: "generator",
      action,
      target,
      rawText,
      confidence: 0.9,
      ...(args ? { args } : {}),
    };
  }
}
