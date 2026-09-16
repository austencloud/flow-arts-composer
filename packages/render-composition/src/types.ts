/** LOOP component identifiers — shared between app and MCP */
export type LOOPComponentId =
  | "rotated"
  | "mirrored"
  | "flipped"
  | "swapped"
  | "inverted"
  | "rewound";

/** Gradient stop for canvas rendering */
export interface GradientStop {
  offset: number;
  color: string;
}

/** Difficulty level visual config */
export interface DifficultyLevel {
  /** CSS background string for Svelte UI components */
  cssBg: string;
  /** Canvas gradient stops */
  stops: GradientStop[];
  /** Border color */
  border: string;
  /** Text color */
  text: string;
}

/** Start position layout mode */
export type StartPlacementLayout = "sidebar" | "top" | "column" | "row" | "none";

/** Letter styling for header (bridge/derived letters) */
export interface LetterStyle {
  letter: string;
  dimmed: boolean;
}

/** Compressed word segment for bracket notation display */
export interface CompressedSegment {
  tokens: string[];
  repeat: number;
}

/** Per-letter image data for glyph word rendering in renderHeader */
export interface GlyphImageData {
  /** Canvas-drawable image (HTMLImageElement in browser, node-canvas Image in Node) */
  image: CanvasImageSource;
  /** Intrinsic width of the SVG in pixels */
  naturalWidth: number;
  /** Intrinsic height of the SVG in pixels */
  naturalHeight: number;
  /** True for Type3/5 letters (W-, Σ-, Φ-, τ-, etc.) — triggers dash bar rendering */
  isDash: boolean;
}
