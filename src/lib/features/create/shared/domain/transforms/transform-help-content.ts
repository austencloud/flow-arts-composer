import type {
  SequenceActionId,
  SequencePatternActionId,
  SequenceTransformActionId,
} from "$lib/shared/create/domain/sequence-action-types";

/**
 * Sequence Action Help Content
 *
 * Static data for action help UI: descriptions, icons, colors.
 * Includes both transforms (mirror, flip, etc.) and patterns/tools (turn pattern, extend, etc.)
 * Separated from UI components for easy editing and testing.
 */

// Transform IDs (geometric operations)
export type TransformId = SequenceTransformActionId;

// Pattern/Tool IDs (pattern application and sequence tools)
export type PatternId = SequencePatternActionId;

// All action IDs that support help mode
export type ActionHelpId = SequenceActionId;

export interface ActionHelpItem {
  id: ActionHelpId;
  icon: string;
  name: string;
  color: string;
  shortDesc: string;
  fullDesc: string;
  warning?: string;
  /** Category for grouping in UI */
  category: "transform" | "pattern" | "tool";
}

// Legacy alias for backwards compatibility
export type TransformHelpItem = ActionHelpItem;

export const actionHelpContent: ActionHelpItem[] = [
  // === TRANSFORMS (geometric operations) ===
  {
    id: "mirror",
    icon: "fa-left-right",
    name: "Mirror",
    color: "#a855f7",
    shortDesc: "Flip left & right",
    fullDesc:
      "Creates a mirror image of your sequence, as if mirrored across the vertical center line. All movements that go left now go right, and vice versa. Clockwise turns become counter-clockwise. You can combine this with other transforms for unique variations.",
    category: "transform",
  },
  {
    id: "flip",
    icon: "fa-up-down",
    name: "Flip",
    color: "#6366f1",
    shortDesc: "Flip up & down",
    fullDesc:
      "Flips your sequence vertically, as if mirrored across the horizontal center line. All movements that go up (north) now go down (south), and vice versa. Clockwise turns become counter-clockwise. Great for creating vertical variations of your sequences.",
    category: "transform",
  },
  {
    id: "invert",
    icon: "fa-repeat",
    name: "Invert",
    color: "#eab308",
    shortDesc: "Flip rotation & motion type",
    fullDesc:
      "Inverts all rotation directions and motion types in your sequence. Every clockwise turn becomes counter-clockwise (and vice versa), and every PRO motion becomes ANTI (and vice versa). The movement paths stay the same, but the way you spin changes. This creates new letters since rotation direction and motion type are part of what defines each letter.",
    warning: "This will change the letters in your sequence!",
    category: "transform",
  },
  {
    id: "rotate",
    icon: "fa-rotate-right",
    name: "Rotate",
    color: "#fb923c",
    shortDesc: "Pivot 45° clockwise or counter-clockwise",
    fullDesc:
      "Rotates the entire sequence 45° as if you physically turned your body. N becomes NE (clockwise) or NW (counter-clockwise). Tap the arrows to rotate clockwise or counter-clockwise. Rotate 4 times in the same direction for a full 180°.",
    category: "transform",
  },
  {
    id: "swap",
    icon: "fa-arrows-rotate",
    name: "Swap Hands",
    color: "#22c55e",
    shortDesc: "Switch which hand does what",
    fullDesc:
      "Exchanges all left-hand movements with right-hand movements. Your sequence looks the same, but the opposite hand now performs each movement. Great for creating mirror variations or practicing both sides.",
    category: "transform",
  },
  {
    id: "rewind",
    icon: "fa-backward",
    name: "Rewind",
    color: "#f43f5e",
    shortDesc: "Rewind the sequence backwards",
    fullDesc:
      "Like rewinding a video! Takes the end position as your new start, then plays every step backwards. Turns flip direction (clockwise becomes counter-clockwise). Note: This will change the letters or word of your sequence!",
    category: "transform",
  },

  // === PATTERNS (apply patterns to sequence) ===
  {
    id: "turn-pattern",
    icon: "fa-wand-magic-sparkles",
    name: "Turn Pattern",
    color: "#14b8a6",
    shortDesc: "Apply turn patterns",
    fullDesc:
      "Applies a turn pattern across your entire sequence. Turn patterns let you create consistent rhythms by setting how many turns (0, 0.5, 1, 1.5, 2, 2.5, or 3) each step has. Choose from presets like 'All Half Turns' or 'Alternating 1-2' or create your own custom pattern.",
    category: "pattern",
  },
  {
    id: "direction",
    icon: "fa-compass",
    name: "Rotation Direction",
    color: "#0ea5e9",
    shortDesc: "CW/CCW patterns",
    fullDesc:
      "Sets the rotation direction pattern for your sequence. Control whether each step rotates clockwise (CW) or counter-clockwise (CCW). Choose from presets like 'All Clockwise', 'Alternating', or create custom direction patterns for each step.",
    category: "pattern",
  },
  {
    id: "duration",
    icon: "fa-stopwatch",
    name: "Duration",
    color: "#fb923c",
    shortDesc: "Beat timing",
    fullDesc:
      "Controls how long each beat is held. Apply rhythmic patterns like 'Every Third Doubled' (beats 3, 6, 9 hold twice as long), 'Swing' (triplet feel), or musical meters like 'Waltz' or 'Shuffle'. Use uniform buttons to speed up (50%, 25%) or slow down (150%, 200%, 400%) your entire sequence.",
    category: "pattern",
  },

  // === TOOLS (sequence manipulation) ===
  {
    id: "extend",
    icon: "fa-circle-check",
    name: "Extend",
    color: "#22c55e",
    shortDesc: "Complete to start",
    fullDesc:
      "Extends your sequence back to its starting position using a LOOP pattern. When the last step's position matches the first step's position group, you can choose from different LOOP types (like Mirrored, Swapped, or Rotated) to loop your sequence.",
    category: "tool",
  },
  {
    id: "shift-start",
    icon: "fa-forward",
    name: "Choose Start",
    color: "#06b6d4",
    shortDesc: "Pick the start pose",
    fullDesc:
      "Changes where the sequence starts. While choosing, every tile shows the pose it ends in, with the motion dimmed. Tap the pose you want to start from and the sequence reorders to begin there. Sequences that don't loop drop the steps before it.",
    category: "tool",
  },
];

// Legacy export for backwards compatibility
export const transformHelpContent = actionHelpContent;
