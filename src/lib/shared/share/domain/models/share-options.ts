/**
 * Share Options Domain Model
 *
 * Configuration options for sharing/downloading sequence images.
 * Simplified from the over-engineered export options.
 */

export interface ShareOptions {
  // === IMAGE FORMAT ===
  format: "PNG" | "JPEG" | "WebP";
  quality: number; // 0-1 for JPEG/WebP

  includeStartPlacement: boolean;
  addStepNumbers: boolean;
  addUserInfo: boolean;
  addWord: boolean;
  addDifficultyLevel: boolean;
  customName?: string; // Optional custom name for header

  stepSize: number; // Size of each beat in pixels
  margin: number; // Margin around the sequence
  backgroundColor: string;
  darkMode: boolean; // Dark mode toggle (affects grid, text colors)

  notes: string;

  showNotes?: boolean;
  customNotesText?: string;
}

export interface SharePreset {
  name: string;
  description: string;
  options: ShareOptions;
}

// Predefined sharing presets
export const SHARE_PRESETS: Record<string, SharePreset> = {
  social: {
    name: "Social Media",
    description: "Optimized for Instagram, TikTok, etc.",
    options: {
      format: "JPEG",
      quality: 0.9,
      includeStartPlacement: true,
      addStepNumbers: true,
      addUserInfo: false, // Keep clean for social
      addWord: true,
      addDifficultyLevel: false,
      stepSize: 950, // Always 1:1 scale
      margin: 20,
      backgroundColor: "#ffffff",
      darkMode: false,
      notes: "",
    },
  },

  print: {
    name: "Print Quality",
    description: "High quality for printing",
    options: {
      format: "PNG",
      quality: 1.0,
      includeStartPlacement: true,
      addStepNumbers: true,
      addUserInfo: true,
      addWord: true,
      addDifficultyLevel: true,
      stepSize: 950, // Always 1:1 scale
      margin: 50,
      backgroundColor: "#ffffff",
      darkMode: false,
      notes: "Created with Flow Arts Composer",
    },
  },

  web: {
    name: "Web Sharing",
    description: "Balanced quality and file size",
    options: {
      format: "WebP",
      quality: 0.85,
      includeStartPlacement: true,
      addStepNumbers: true,
      addUserInfo: true,
      addWord: true,
      addDifficultyLevel: false,
      stepSize: 950, // Always 1:1 scale
      margin: 30,
      backgroundColor: "#ffffff",
      darkMode: false,
      notes: "",
    },
  },
};

// Optimized default options for modern devices and sharing
export const DEFAULT_SHARE_OPTIONS: ShareOptions = {
  // Fixed sensible defaults - no user choice needed
  format: "PNG", // Best quality for clear images
  quality: 1.0, // Maximum quality
  stepSize: 950, // Always 1:1 scale - no user choice needed
  margin: 24, // Clean spacing
  backgroundColor: "#ffffff", // Clean white background
  darkMode: false, // Light mode by default

  // User-configurable content options
  includeStartPlacement: true,
  addStepNumbers: true,
  addUserInfo: false,
  addWord: true,
  addDifficultyLevel: false,
  notes: "",

  // Footer controls
  showNotes: true,
  customNotesText: "Created using Flow Arts Composer",
};
