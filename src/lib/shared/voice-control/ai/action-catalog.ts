import type { ActionDefinition } from "../domain/intent-resolution-types";

export const ACTION_CATALOG: ActionDefinition[] = [
  {
    category: "navigation",
    action: "navigate_module",
    description: "Navigate to a module (main section of the app)",
    validTargets: [
      "create",
      "browse",
      "compose",
      "learn",
      "train",
      "video",
      "settings",
      "tika",
      "choreo_card",
      "choreo",
      "lab",
      "feedback",
    ],
  },
  {
    category: "navigation",
    action: "switch_tab",
    description: "Switch to a tab within the current module",
    validTargets: [
      "construct",
      "assemble",
      "generate",
      "spell",
      "concepts",
      "play",
      "guide",
      "gallery",
      "collections",
      "creators",
      "arrange",
      "browse",
      "practice",
      "challenges",
      "progress",
      "profile",
      "props",
      "theme",
      "visibility",
      "keyboard",
      "preferences",
      "language",
      "release-notes",
      "submit",
      "my-feedback",
      "manage",
      "library",
    ],
  },
  {
    category: "playback",
    action: "play",
    description: "Start or resume sequence playback",
  },
  {
    category: "playback",
    action: "pause",
    description: "Pause sequence playback",
  },
  {
    category: "playback",
    action: "stop",
    description: "Stop sequence playback completely",
  },
  {
    category: "playback",
    action: "next",
    description: "Advance to the next step in the sequence",
  },
  {
    category: "playback",
    action: "previous",
    description: "Go back to the previous step in the sequence",
  },
  {
    category: "playback",
    action: "faster",
    description: "Increase playback speed",
  },
  {
    category: "playback",
    action: "slower",
    description: "Decrease playback speed",
  },
  {
    category: "playback",
    action: "loop",
    description: "Toggle looping playback on/off",
  },
  {
    category: "playback",
    action: "set_bpm",
    description: "Set playback BPM (beats per minute)",
    validArgs: { value: "number (BPM)" },
  },
  {
    category: "playback",
    action: "jump",
    description: "Jump to a specific step number",
    validArgs: { value: "number (step number)" },
  },
  {
    category: "generator",
    action: "generate",
    description: "Generate a new random sequence with current settings",
    activeInModules: ["create"],
    activeInTabs: ["generate"],
  },
  {
    category: "generator",
    action: "set",
    description: "Set a generator parameter to a specific value",
    validTargets: [
      "level",
      "length",
      "mode",
      "gridMode",
      "propContinuity",
      "turnIntensity",
      "loopType",
      "period",
    ],
    validArgs: {
      value:
        "The value to set. level: 1-5, length: 1-64, mode: freeform|circular, gridMode: diamond|box, propContinuity: continuous|random, turnIntensity: 0-3, loopType: rotated|mirrored|etc., period: halved|quartered",
    },
    activeInModules: ["create"],
    activeInTabs: ["generate"],
  },
  {
    category: "generator",
    action: "toggle",
    description: "Cycle a generator parameter to its next value",
    validTargets: ["mode", "gridMode", "propContinuity", "loopType", "period"],
    activeInModules: ["create"],
    activeInTabs: ["generate"],
  },
  {
    category: "generator",
    action: "increment",
    description: "Increase a numeric generator parameter",
    validTargets: ["level", "length", "turnIntensity"],
    activeInModules: ["create"],
    activeInTabs: ["generate"],
  },
  {
    category: "generator",
    action: "decrement",
    description: "Decrease a numeric generator parameter",
    validTargets: ["level", "length", "turnIntensity"],
    activeInModules: ["create"],
    activeInTabs: ["generate"],
  },
  {
    category: "create",
    action: "undo",
    description: "Undo the last action in the sequence editor",
    activeInModules: ["create"],
  },
  {
    category: "create",
    action: "redo",
    description: "Redo the last undone action",
    activeInModules: ["create"],
  },
  {
    category: "create",
    action: "clear",
    description: "Clear the current sequence and start over",
    activeInModules: ["create"],
  },
  {
    category: "create",
    action: "save",
    description: "Save the current sequence",
    activeInModules: ["create"],
  },
  {
    category: "create",
    action: "mirror",
    description: "Mirror the sequence (swap left/right movement)",
    activeInModules: ["create"],
  },
  {
    category: "create",
    action: "swap",
    description: "Swap the left and right hand assignments",
    activeInModules: ["create"],
  },
  {
    category: "create",
    action: "reverse",
    description: "Reverse the sequence order",
    activeInModules: ["create"],
  },
  {
    category: "create",
    action: "rotate",
    description: "Rotate the sequence orientation",
    activeInModules: ["create"],
  },
  {
    category: "settings",
    action: "toggle",
    description: "Toggle a visual setting on/off",
    validTargets: [
      "showGrid",
      "stepNumbers",
      "nonRadialPoints",
      "tkaGlyph",
      "tndGlyph",
      "elementalGlyph",
      "placementsGlyph",
      "reversalIndicators",
      "darkMode",
      "wordHeader",
      "progressBar",
      "props",
      "musicianMode",
      "hapticFeedback",
      "reducedMotion",
      "showShortcutHints",
    ],
  },
  {
    category: "settings",
    action: "show",
    description: "Enable/show a visual setting",
    validTargets: [
      "showGrid",
      "stepNumbers",
      "nonRadialPoints",
      "tkaGlyph",
      "tndGlyph",
      "elementalGlyph",
      "placementsGlyph",
      "reversalIndicators",
      "darkMode",
      "wordHeader",
      "progressBar",
      "props",
    ],
  },
  {
    category: "settings",
    action: "hide",
    description: "Disable/hide a visual setting",
    validTargets: [
      "showGrid",
      "stepNumbers",
      "nonRadialPoints",
      "tkaGlyph",
      "tndGlyph",
      "elementalGlyph",
      "placementsGlyph",
      "reversalIndicators",
      "wordHeader",
      "progressBar",
      "props",
    ],
  },
  {
    category: "prop",
    action: "change_prop",
    description: "Change the prop type (for both hands or a specific hand)",
    validTargets: [
      "staff",
      "poi",
      "fan",
      "club",
      "hoop",
      "buugeng",
      "triad",
      "sword",
      "hand",
      "chicken",
      "guitar",
      "ukulele",
      "minihoop",
      "energy_saber",
      "energy_staff",
    ],
    validArgs: { hand: "both | left | right" },
  },
  {
    category: "sequence",
    action: "save_to_library",
    description: "Save the current sequence to the user's library",
  },
  {
    category: "sequence",
    action: "favorite",
    description: "Mark the current sequence as a favorite",
  },
  {
    category: "sequence",
    action: "unfavorite",
    description: "Remove favorite mark from the current sequence",
  },
  {
    category: "sequence",
    action: "share",
    description: "Share the current sequence",
  },
  {
    category: "sequence",
    action: "export",
    description: "Export/download the current sequence as an image",
  },
  {
    category: "sequence",
    action: "open_in_create",
    description: "Open the current sequence in the create/edit module",
  },
  {
    category: "search",
    action: "search",
    description: "Search for sequences by keyword",
    validArgs: { query: "search text" },
    activeInModules: ["browse"],
  },
  {
    category: "search",
    action: "filter",
    description: "Apply a filter to the browse results",
    validArgs: { filterType: "filter specification" },
    activeInModules: ["browse"],
  },
  {
    category: "search",
    action: "sort",
    description: "Sort browse results",
    validArgs: { sortBy: "newest | oldest | popular | alphabetical" },
    activeInModules: ["browse"],
  },
  {
    category: "search",
    action: "clear_filters",
    description: "Clear all active filters and show all sequences",
    activeInModules: ["browse"],
  },
  {
    category: "ui",
    action: "scroll_up",
    description: "Scroll the page up",
  },
  {
    category: "ui",
    action: "scroll_down",
    description: "Scroll the page down",
  },
  {
    category: "ui",
    action: "go_back",
    description: "Go back to the previous view",
  },
  {
    category: "ui",
    action: "fullscreen",
    description: "Toggle fullscreen mode",
  },
  {
    category: "system",
    action: "unknown",
    description:
      "The command could not be understood. Use this only as a last resort.",
  },
];

export function getAvailableActions(
  currentModule: string,
  currentTab: string
): ActionDefinition[] {
  return ACTION_CATALOG.filter((action) => {
    if (
      action.activeInModules &&
      !action.activeInModules.includes(currentModule)
    ) {
      return false;
    }
    if (action.activeInTabs && !action.activeInTabs.includes(currentTab)) {
      return false;
    }
    return true;
  });
}

export function getAllActionsWithContext(
  currentModule: string,
  currentTab: string
): (ActionDefinition & { requiresNavigation: boolean })[] {
  return ACTION_CATALOG.map((action) => {
    const needsModule =
      action.activeInModules && !action.activeInModules.includes(currentModule);
    const needsTab =
      action.activeInTabs && !action.activeInTabs.includes(currentTab);
    return {
      ...action,
      requiresNavigation: !!(needsModule || needsTab),
    };
  });
}

export const VALID_CATEGORIES = new Set(ACTION_CATALOG.map((a) => a.category));
