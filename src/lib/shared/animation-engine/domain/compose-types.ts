/**
 * Composition Builder Types
 *
 * Type definitions for the unified composition builder that replaces
 * the mode-first approach with a layout-first cell-based system.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  type TrailSettings,
  DEFAULT_TRAIL_SETTINGS,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type {
  TipEffectMap,
  TipEffortMap,
} from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

// Grid Layout

/**
 * Grid layout configuration
 * Defines how many rows and columns the composition canvas has
 */
export interface GridLayout {
  rows: number; // 1-4
  cols: number; // 1-4
}

/**
 * Common layout presets
 */
export const LAYOUT_PRESETS = {
  "1x1": { rows: 1, cols: 1 },
  "1x2": { rows: 1, cols: 2 },
  "2x1": { rows: 2, cols: 1 },
  "2x2": { rows: 2, cols: 2 },
  "1x3": { rows: 1, cols: 3 },
  "3x1": { rows: 3, cols: 1 },
  "2x3": { rows: 2, cols: 3 },
  "3x2": { rows: 3, cols: 2 },
  "3x3": { rows: 3, cols: 3 },
} as const;

export type LayoutPresetKey = keyof typeof LAYOUT_PRESETS;

// Cell Media Types

/**
 * Media type that can be assigned to a composition cell.
 * Controls how cell content is rendered in the Arrange grid.
 */
export type CellMediaType =
  | "video" // Recorded/uploaded video
  | "animation" // Pictograph animation (tunnel mode)
  | "image" // Static image or composite
  | "choreo-card" // Sequence choreo card
  | "viewer-3d" // 3D animation viewer
  | "empty"; // Placeholder/empty cell

// Transform Types

/**
 * Transform operations that can be applied to a sequence layer.
 * Tracked in order of application for clipboard and serialization.
 */
export type TransformType =
  | "rotate45L"
  | "rotate45R"
  | "shiftStart"
  | "rotate90"
  | "rotate180"
  | "rotate270"
  | "mirror"
  | "flip"
  | "swapHands"
  | "invert"
  | "rewind";

export type TargetHand = "left" | "right" | "both";

export interface AppliedTransform {
  type: TransformType;
  hand: TargetHand;
  timestamp: number;
}

// Tunnel (Layered Sequence) Configuration

/**
 * Prop color configuration for a tunnel layer
 */
export interface PropColors {
  left: string; // CSS color for left prop
  right: string; // CSS color for right prop
}

/**
 * Default prop color sets for tunnel layers
 * Layer 1: blue/red (primary)
 * Layer 2: purple/orange (secondary)
 * Layer 3: emerald/pink
 * Layer 4: cyan/yellow
 */
export const TUNNEL_LAYER_COLORS: PropColors[] = [
  { left: "#3b82f6", right: "#ef4444" }, // blue/red
  { left: "#8b5cf6", right: "#f97316" }, // purple/orange
  { left: "#10b981", right: "#ec4899" }, // emerald/pink
  { left: "#06b6d4", right: "#eab308" }, // cyan/yellow
];

/**
 * Configuration for a single sequence layer in a tunnel
 * Tunnels overlay multiple sequences with individual timing and colors
 */
export interface TunnelLayerConfig {
  /** The sequence data for this layer */
  sequence: SequenceData;

  /** Beat offset for stagger timing (0 = in sync) */
  beatOffset: number;

  /** Prop colors for this layer */
  propColors: PropColors;

  /** Ordered stack of transforms applied to this layer */
  transformStack: AppliedTransform[];

  /** @deprecated Use transformStack. Kept for deserialization migration. */
  appliedTransforms?: TransformType[];
}

/**
 * Visual effect overlay for a cell
 */
export type CellEffect = "none" | "fire" | "charcoal" | "led" | "trails";

/**
 * Get default prop colors for a tunnel layer index
 */
const DEFAULT_PROP_COLORS: PropColors = { left: "#3b82f6", right: "#ef4444" };

export function getTunnelLayerColors(layerIndex: number): PropColors {
  return (
    TUNNEL_LAYER_COLORS[layerIndex % TUNNEL_LAYER_COLORS.length] ??
    DEFAULT_PROP_COLORS
  );
}

// Cell Configuration

/**
 * Cell content type
 * - single: One sequence plays in this cell
 * - tunnel: Multiple sequences overlaid (2-4) with individual timing/colors
 */
export type CellType = "single" | "tunnel";

/**
 * Media display type for a cell
 * Controls how the sequence content is rendered
 */
export type MediaDisplayType = "animation" | "video" | "stepGrid" | "image";

/**
 * Individual cell configuration
 * Each cell in the grid has its own independent configuration
 */
export interface CellConfig {
  /** Unique cell identifier: "cell-{row}-{col}" */
  id: string;

  /** Cell content type */
  type: CellType;

  /** How to display the sequence content */
  mediaType?: MediaDisplayType;

  /** Sequences assigned to this cell (1 for single, 2-4 for tunnel) */
  sequences: SequenceData[];

  /**
   * Tunnel layer configurations (used when type === "tunnel")
   * Contains detailed per-layer settings: beatOffset, propColors
   * If not provided for tunnel type, defaults are derived from sequences array
   */
  tunnelLayers?: TunnelLayerConfig[];

  /** Trail effect settings for this cell */
  trailSettings: TrailSettings;

  /** Rotation offset in degrees (0, 90, 180, 270) for grid mode */
  rotationOffset?: number;

  /** Per-tip effect assignments that override the global TipEffectMap for this cell */
  tipEffectMap?: TipEffectMap;

  /** Per-tip effort assignments that override the global TipEffortMap for this cell */
  tipEffortMap?: TipEffortMap;

  /** Whether this cell mirrors another cell's sequence */
  isMirrored?: boolean;

  /** Cell this mirrors (for mirror template) */
  mirrorSourceCellId?: string;
}

/**
 * Generate cell ID from row and column
 */
export function generateCellId(row: number, col: number): string {
  return `cell-${row}-${col}`;
}

/**
 * Parse cell ID to get row and column
 */
export function parseCellId(
  cellId: string
): { row: number; col: number } | null {
  const match = cellId.match(/^cell-(\d+)-(\d+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { row: parseInt(match[1], 10), col: parseInt(match[2], 10) };
}

// ============================================================================
// Composition
// ============================================================================

/**
 * Complete composition definition
 * This is what gets saved/loaded and rendered
 */
export interface Composition {
  /** Unique composition ID */
  id: string;

  /** User-provided name */
  name: string;

  /** Grid layout (rows x cols) */
  layout: GridLayout;

  /** Cell configurations (one per grid cell) */
  cells: CellConfig[];

  /** Creation timestamp */
  createdAt: Date;

  /** Last modified timestamp */
  updatedAt: Date;

  /** Creator identifier */
  creator: string;

  /** Whether this is a favorite */
  isFavorite: boolean;

  /** Thumbnail URL for gallery display */
  thumbnailUrl?: string;
}

// ============================================================================
// Builder State
// ============================================================================

/**
 * Playback speed options
 */
export type PlaybackSpeed = 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

/**
 * Composition builder UI state
 * Manages the builder interface, playback, and configuration
 */
export interface CompositionBuilderState {
  /** The composition being built/edited */
  composition: Composition;

  // Playback state
  /** Whether animation is currently playing */
  isPlaying: boolean;

  /** Whether to show live preview or static thumbnails */
  isPreviewing: boolean;

  /** Playback speed multiplier */
  speed: PlaybackSpeed;

  /** Whether to loop playback */
  shouldLoop: boolean;

  /** Current beat position (for synchronized cells) */
  currentStep: number;

  // UI state
  /** Currently selected cell for configuration (null = none) */
  selectedCellId: string | null;

  /** Whether overlay controls are visible */
  showOverlayControls: boolean;

  /** Whether templates sheet is open */
  isTemplatesOpen: boolean;

  /** Whether cell config sheet is open */
  isCellConfigOpen: boolean;

  /** Whether global settings sheet is open */
  isSettingsOpen: boolean;
}

// ============================================================================
// Template Definition
// ============================================================================

/**
 * Composition template (preset)
 * Pre-configured layouts that users can apply as starting points
 */
export interface CompositionTemplate {
  /** Unique template ID */
  id: string;

  /** Display name */
  name: string;

  /** FontAwesome icon class */
  icon: string;

  /** Short description */
  description: string;

  /** Grid layout */
  layout: GridLayout;

  /** Default cell configurations */
  cellDefaults: Partial<CellConfig>[];

  /** Accent color for UI */
  color: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create empty cells for a given layout
 */
export function createEmptyCells(layout: GridLayout): CellConfig[] {
  const cells: CellConfig[] = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      cells.push({
        id: generateCellId(row, col),
        type: "single",
        sequences: [],
        trailSettings: getDefaultTrailSettings(),
        rotationOffset: 0,
      });
    }
  }
  return cells;
}

/**
 * Get default trail settings
 * Returns a fresh copy of the default settings
 */
export function getDefaultTrailSettings(): TrailSettings {
  return { ...DEFAULT_TRAIL_SETTINGS };
}

/**
 * Check if a cell has sequences assigned
 */
export function isCellConfigured(cell: CellConfig): boolean {
  return cell.sequences.length > 0;
}

/**
 * Check if all cells in a composition have sequences
 */
export function isCompositionComplete(composition: Composition): boolean {
  return composition.cells.every(isCellConfigured);
}

/**
 * Get the total number of cells in a layout
 */
export function getCellCount(layout: GridLayout): number {
  return layout.rows * layout.cols;
}
