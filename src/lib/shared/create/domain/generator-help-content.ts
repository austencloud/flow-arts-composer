/**
 * Generator Help Content
 *
 * Static data for generator control help UI: descriptions, icons, colors.
 * Each control in the Generator tab has an entry explaining what it does.
 */

// Generator control IDs (matches card IDs in CardBasedSettingsContainer)
export type GeneratorHelpId =
  | "level"
  | "length"
  | "generation-mode"
  | "grid-mode"
  | "prop-continuity"
  | "turn-intensity"
  | "tnd"
  | "loop-type"
  | "period"
  | "duration-rhythm"
  | "start-end"
  | "favorite"
  | "generate";

export interface GeneratorHelpItem {
  id: GeneratorHelpId;
  icon: string;
  name: string;
  color: string;
  shortDesc: string;
  fullDesc: string;
  /** Optional bullet points for complex explanations */
  bullets?: string[];
  /** Optional images with labels */
  images?: { src: string; label: string }[];
  /** Optional tip shown at bottom */
  tip?: string;
}

export const generatorHelpContent: GeneratorHelpItem[] = [
  // === CORE SETTINGS ===
  {
    id: "level",
    icon: "fa-layer-group",
    name: "Difficulty Level",
    color: "#3b82f6",
    shortDesc: "How complex the turns are",
    fullDesc:
      "Controls how many additional turns your props can do during each step.",
    bullets: [
      "Level 1: Base Motions",
      "Level 2: Whole Turns",
      "Level 3: Half Turns, Floats",
    ],
    tip: "Start at Level 1 to learn the base motions, then progress to Level 3 for the full vocabulary.",
  },
  {
    id: "length",
    icon: "fa-ruler",
    name: "Sequence Length",
    color: "#6366f1",
    shortDesc: "Number of moves",
    fullDesc:
      "Sets how many steps (individual moves) your generated sequence will have. Each step is one pictograph showing a single movement.",
    bullets: [
      "Freeform mode: 1-64 steps",
      "LOOP mode: 4-64 steps (must be even for symmetry)",
    ],
    tip: "Shorter sequences are easier to learn and memorize.",
  },
  {
    id: "generation-mode",
    icon: "fa-circle-notch",
    name: "Generation Mode",
    color: "#8b5cf6",
    shortDesc: "LOOP vs Freeform",
    fullDesc:
      "Determines whether your sequence loops back to its starting placement or ends freely.",
    bullets: [
      "LOOP: Creates a circular sequence that returns to start - perfect for continuous flow",
      "Freeform: Generates without constraints - ends wherever the pattern takes you",
    ],
    tip: "LOOP sequences are great for practice because you can repeat them seamlessly.",
  },
  {
    id: "grid-mode",
    icon: "fa-border-all",
    name: "Grid System",
    color: "#14b8a6",
    shortDesc: "Diamond vs Box hand locations",
    fullDesc:
      "Changes the underlying grid that determines where your hands can be located.",
    bullets: [
      "Diamond: Hands on cardinal points (N, E, S, W)",
      "Box: Hands on intercardinal points (NE, SE, SW, NW)",
    ],
    tip: "Diamond grid is most common. Try Box for a different movement vocabulary.",
  },
  {
    id: "prop-continuity",
    icon: "fa-link",
    name: "Prop Continuity",
    color: "#f59e0b",
    shortDesc: "Continuous vs Reversals",
    fullDesc:
      "Controls whether props maintain their spinning direction or can reverse mid-sequence.",
    bullets: [
      "Continuous: Props keep spinning the same direction - smooth, flowing movements",
      "Reversals: Props can change spin direction - more dynamic, varied patterns",
    ],
    tip: "Continuous is easier to execute. Reversals add visual interest but require more control.",
  },
  {
    id: "turn-intensity",
    icon: "fa-gauge-high",
    name: "Turn Intensity",
    color: "#ef4444",
    shortDesc: "How much spinning",
    fullDesc:
      "Limits the maximum number of additional turns per step. Lower intensity means gentler, simpler movements.",
    bullets: [
      "Lower = gentler, simpler movements",
      "Higher = more spinning, more dynamic",
      "The card color shifts green→red to match",
    ],
    tip: "The color gradient (green→red) indicates intensity visually.",
  },

  {
    id: "tnd",
    icon: "fa-hands",
    name: "Timing and direction",
    color: "#f2673a",
    shortDesc: "How the hands and props relate",
    fullDesc:
      "Pick how the two hands travel relative to each other, how the two props sit in their circles, or both. Each choice is a timing (Together, Split, Quarter) and a direction (Same, Opposite), named by its element. Free leaves that side to the generator.",
    bullets: [
      "Hands: the geometric relation between the two hand paths on the grid",
      "Props: the relation between the two prop bearings and spins",
      "Match turns: both hands take the same turns on every step",
      "A LOOP that cannot keep a hand mode switches that mode off, and the reverse",
    ],
    tip: "Start with one side set and the other Free; the workspace's shape matrix shows the element each beat lands on.",
  },

  // === LOOP-SPECIFIC SETTINGS ===
  {
    id: "loop-type",
    icon: "fa-rotate",
    name: "LOOP Type",
    color: "#ec4899",
    shortDesc: "How the sequence loops",
    fullDesc:
      "When using LOOP mode, this determines HOW your sequence returns to start. Each type creates a different visual effect.",
    bullets: [
      "Rotated: Placements rotate around the grid center",
      "Mirrored: Second half mirrors the first (left↔right)",
      "Swapped: Hands switch roles in the return (blue↔red)",
      "Inverted: Motion types transform (pro↔anti, static↔dash)",
      "Combinations: Mix multiple types for complex patterns",
    ],
    tip: "Try different LOOP types with the same settings to see how they change the feel.",
  },
  {
    id: "period",
    icon: "fa-circle-half-stroke",
    name: "Period",
    color: "#06b6d4",
    shortDesc: "Quartered vs Halved",
    fullDesc:
      "In LOOP mode, this controls how the sequence is divided before the return pattern is applied.",
    bullets: [
      "Halved: Sequence splits into 2 parts - simpler, more obvious loop point",
      "Quartered: Sequence splits into 4 parts - more complex, subtler transitions",
    ],
    tip: "Halved is easier to follow. Quartered creates more intricate patterns.",
  },

  // === DURATION RHYTHM ===
  {
    id: "duration-rhythm",
    icon: "fa-wave-square",
    name: "Rhythm",
    color: "#f59e0b",
    shortDesc: "Duration pattern for generated sequences",
    fullDesc:
      "Pre-selects a duration rhythm template that gets applied automatically after each generation. Changes how long each step is held relative to others.",
    bullets: [
      "Accent: Emphasize specific beats (downbeat, triplet, bookends)",
      "Meter: Time signature patterns (waltz, 6/8, 5/4, march)",
      "Feel: Rhythmic character (swing, shuffle, accelerando)",
      "World: Global rhythm traditions (clave, bossa nova, samba)",
    ],
    tip: "Set to 'Off' for equal-duration steps. Pick a rhythm to add musical timing to every generated sequence.",
  },

  // === START/END PLACEMENTS ===
  {
    id: "start-end",
    icon: "fa-sliders",
    name: "Start/End",
    color: "#22c55e",
    shortDesc: "Lock start/end placements",
    fullDesc:
      "Lets you constrain where your sequence begins and/or ends by selecting specific grid placements.",
    bullets: [
      "Start Placement: Force the sequence to begin from a specific hand placement",
      "End Placement: (Freeform only) Force the sequence to end at a specific placement",
    ],
    tip: "Use this to practice transitioning into or out of specific placements.",
  },

  // === SAVED SETUPS ===
  {
    id: "favorite",
    icon: "fa-heart",
    name: "Setups",
    color: "#e11d48",
    shortDesc: "Save and reuse your settings",
    fullDesc:
      "Save your current generator settings as a private setup and bring them back in one tap. Share one setup as your Favorite so other people can try it.",
    bullets: [
      "Save: Keeps up to 10 private setups with your Level, Length, Grid, and LOOP settings",
      "Apply: Tap a setup to load all of its settings",
      "Share: Pick one setup as your public Favorite for the Community tab",
    ],
    tip: "Setups are private until you share one as your Favorite.",
  },

  // === GENERATE ACTION ===
  {
    id: "generate",
    icon: "fa-dice",
    name: "Generate",
    color: "#22c55e",
    shortDesc: "Create a new sequence",
    fullDesc:
      "Generates a random sequence based on all your current settings. The new sequence will replace whatever is currently in your workspace.",
    bullets: [
      "Creates a brand new sequence using the Level, Length, Mode, and other settings above",
      "Replaces the current sequence in your workspace - save first if you want to keep it!",
      "Each generation is unique - tap again for a different result",
    ],
    tip: "Don't like what you got? Just tap again! You can generate as many times as you want.",
  },
];

export function getGeneratorHelpContent(
  id: GeneratorHelpId
): GeneratorHelpItem | undefined {
  return generatorHelpContent.find((item) => item.id === id);
}
