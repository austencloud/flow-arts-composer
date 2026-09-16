import type { ISubInterpreter } from "../ISubInterpreter";
import type { VoiceCommand, VoiceCommandCategory, CommandContext } from "../../domain/voice-command-types";

// Setting alias map: spoken phrase → canonical key
/**
 * Maps natural language names to setting identifiers.
 * The key used by handlers to look up the correct state manager + property.
 */
const SETTING_ALIASES: Record<string, string> = {
  // Grid & display
  grid: "showGrid",
  "the grid": "showGrid",
  "step numbers": "stepNumbers",
  "beat numbers": "stepNumbers",
  "non radial points": "nonRadialPoints",
  "non-radial points": "nonRadialPoints",

  // Glyphs
  "tka glyph": "tkaGlyph",
  "tka": "tkaGlyph",
  "tnd glyph": "tndGlyph",
  "tnd": "tndGlyph",
  "elemental glyph": "elementalGlyph",
  "elemental": "elementalGlyph",
  "positions glyph": "placementsGlyph",
  "positions": "placementsGlyph",
  "reversal indicators": "reversalIndicators",
  reversals: "reversalIndicators",

  // Animation visibility
  "dark mode": "darkMode",
  "word header": "wordHeader",
  "progress bar": "progressBar",
  props: "props",
  "the props": "props",
  trails: "effect:trails",
  "trail style": "effect:trails",
  fire: "effect:fire",
  "fire effect": "effect:fire",
  leds: "effect:led",
  "led effect": "effect:led",
  charcoal: "effect:charcoal",
  "charcoal effect": "effect:charcoal",
  "left motion": "leftMotion",
  "right motion": "rightMotion",
  // Spoken color aliases remain accepted for people using the canonical palette.
  "blue motion": "leftMotion",
  "red motion": "rightMotion",

  // App settings
  "musician mode": "musicianMode",
  "haptic feedback": "hapticFeedback",
  haptics: "hapticFeedback",
  "reduced motion": "reducedMotion",
  "shortcut hints": "showShortcutHints",
};

// Toggle / Show / Hide patterns
/** Matches "toggle grid", "toggle step numbers" */
const TOGGLE_PATTERN = /^toggle\s+(.+)$/;

/** Matches "show X", "enable X", "turn on X" */
const SHOW_PATTERNS: RegExp[] = [
  /^(?:show|enable|turn on)\s+(.+)$/,
];

/** Matches "hide X", "disable X", "turn off X" */
const HIDE_PATTERNS: RegExp[] = [
  /^(?:hide|disable|turn off)\s+(.+)$/,
];

export class SettingsSubInterpreter implements ISubInterpreter {
  readonly category: VoiceCommandCategory = "settings";

  tryInterpret(text: string, _context: CommandContext): VoiceCommand | null {
    // Try toggle
    const toggleMatch = text.match(TOGGLE_PATTERN);
    if (toggleMatch?.[1]) {
      const settingKey = this.resolveSetting(toggleMatch[1].trim());
      if (settingKey) {
        return this.buildCommand("toggle", settingKey, text);
      }
    }

    // Try show/enable
    for (const pattern of SHOW_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const settingKey = this.resolveSetting(match[1].trim());
        if (settingKey) {
          return this.buildCommand("show", settingKey, text);
        }
      }
    }

    // Try hide/disable
    for (const pattern of HIDE_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const settingKey = this.resolveSetting(match[1].trim());
        if (settingKey) {
          return this.buildCommand("hide", settingKey, text);
        }
      }
    }

    return null;
  }

  private resolveSetting(spoken: string): string | null {
    const normalized = spoken.toLowerCase().trim();
    return SETTING_ALIASES[normalized] ?? null;
  }

  private buildCommand(action: string, target: string, rawText: string): VoiceCommand {
    return {
      category: "settings",
      action,
      target,
      rawText,
      confidence: 0.9,
    };
  }
}
