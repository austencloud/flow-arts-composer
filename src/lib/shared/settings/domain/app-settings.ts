/**
 * Application Settings Domain Model
 *
 * Defines the structure for application-wide settings and configuration.
 * This is a domain type that represents the user's preferences and app state.
 */

import type { PropType } from "../../pictograph/prop/domain/enums/prop-type";
import type { CompositionRecipe } from "../../pictograph/prop/domain/prop-composition-recipes";
import type {
  GridMode,
  GridPlacement,
} from "../../pictograph/grid/domain/enums/grid-enums";
import type { BackgroundType } from "@austencloud/backgrounds";
import type { BackgroundLabSettings } from "$lib/shared/background-builder/domain/lab-settings-types";
import type { TimeSignatureKey } from "../../foundation/domain/models/time-signature";
import { normalizeLegacyPropConfig } from "@tka/tka-types";
import type { FanAppearance } from "../../pictograph/prop/domain/fan-appearance";
import type { PropLook } from "../../pictograph/prop/domain/prop-look";
import { resolveViewerCustomColorPair, type ViewerCustomColorPair } from "../../sequence-viewer/domain/viewer-custom-colors";

/**
 * Prop Preset - A saved prop configuration for quick switching
 */
export interface PropPreset {
  leftPropType: PropType;
  rightPropType: PropType;
  catDogMode: boolean;
  leftBuugengFlipped?: boolean; // Flip buugeng for blue hand (asymmetric prop)
  rightBuugengFlipped?: boolean; // Flip buugeng for red hand (asymmetric prop)
}

export interface AppSettings {
  propViewingMode?: "my-props" | "as-saved";
  // Metadata for sync tracking (not persisted to Firebase)
  _localTimestamp?: number;

  gridMode: GridMode;
  userName?: string;
  propType?: PropType; // Legacy - kept for backward compatibility
  leftPropType?: PropType; // Prop type held in the performer's left hand
  rightPropType?: PropType; // Prop type held in the performer's right hand
  /** Null follows the theme's blue/red defaults. Hand identity stays left/right. */
  primaryPropColors?: ViewerCustomColorPair | null;
  /** Shared visual build for fan/bigfan across 2D, Tunnel, 3D, and rails. */
  fanAppearance?: FanAppearance;
  /** How the 2D canvas draws every non-fan prop: flat 3D-model sprite or pictograph. */
  /**
   * How the 2D canvas draws props. Named propArtwork (not propLook) on
   * purpose: an earlier build persisted a "model" default under propLook
   * into saved settings, and that stale key must not keep overriding the
   * canonical pictograph artwork.
   */
  propArtwork?: PropLook;
  catDogMode?: boolean; // Whether CatDog Mode is enabled in prop type settings
  leftBuugengFlipped?: boolean; // Flip buugeng for blue hand (asymmetric prop)
  rightBuugengFlipped?: boolean; // Flip buugeng for red hand (asymmetric prop)
  propPresets?: (PropPreset | null)[]; // Up to 10 saved prop configurations (nulls preserve slot indices)
  selectedPresetIndex?: number; // Index of currently active preset (0-9)
  backupFrequency?: string;
  enableFades?: boolean;
  growSequence?: boolean;
  numSteps?: number;
  beatLayout?: string;

  // Background settings
  backgroundCategory?: "animated" | "simple";
  backgroundType?: BackgroundType;
  backgroundQuality?: "high" | "medium" | "low" | "minimal";
  backgroundEnabled?: boolean;

  // Simple background settings
  backgroundColor?: string; // For solid color backgrounds
  gradientColors?: string[]; // For gradient backgrounds (2-4 colors)
  gradientDirection?: number; // Gradient angle in degrees (0-360)

  // Background Builder lab settings (persisted toggle states)
  backgroundLabSettings?: BackgroundLabSettings;

  // Accessibility & User Experience settings
  hapticFeedback?: boolean;
  reducedMotion?: boolean;

  // Keyboard shortcut settings
  singleKeyShortcuts?: boolean;
  showShortcutHints?: boolean;

  // Choreo Card Settings
  WordCard?: {
    defaultColumnCount?: number;
    defaultLayoutMode?: "grid" | "list" | "printable";
    enableTransparency?: boolean;
    cacheEnabled?: boolean;
    cacheSizeLimit?: number;
    exportQuality?: "low" | "medium" | "high";
    exportFormat?: "PNG" | "JPG" | "WebP";
    defaultPaperSize?: "A4" | "Letter" | "Legal" | "Tabloid";
  };

  // Pictograph Visibility Settings
  visibility?: {
    tkaGlyph?: boolean; // TKA Glyph includes turn numbers
    tndGlyph?: boolean;
    elementalGlyph?: boolean;
    propTndGlyph?: boolean; // Prop timing-and-direction element (top-right, dashed ring)
    placementsGlyph?: boolean;
    reversalIndicators?: boolean;
    showGrid?: boolean; // Master toggle for grid visibility
    nonRadialPoints?: boolean;
    handColorKey?: boolean; // L/R colour key in the start-placement bottom band
    handPointVisibility?: "all" | "active" | "none"; // all hand points, only where props are, or hidden
    stepNumbers?: boolean; // Show beat numbers on pictographs in sequences
    beatPositionGlyph?: boolean; // Show beat position glyph (musical timeline position)
  };

  // Community/Privacy Settings
  favoritesPublic?: boolean; // Whether favorites are visible to followers (default: true)

  // Workflow Settings
  skipClearConfirmation?: boolean; // Skip confirmation when clearing sequence (undo is available)
  skipLoopConfirmation?: boolean; // Skip confirmation when applying LOOP auto-completion (undo is available)

  // Generator Settings
  blockedStartPlacements?: GridPlacement[]; // Custom blocked positions for sequence generation
  // Saved independently so Diamond and Box restore their own selection
  blockedStartPlacementsByGridMode?: Partial<Record<GridMode, GridPlacement[]>>;

  // Global Visual Effects
  darkMode?: boolean; // Dark Mode: dark background, inverted grid, white text/outlines

  // Timing Display Settings
  musicianMode?: boolean; // Show positions as "1 e & a" instead of decimals (1.25, 1.5)
  defaultTimeSignature?: TimeSignatureKey; // Default time signature for sequences (default: "4/4")

  // Voice Control
  voiceControlEnabled?: boolean; // Enable "Hey Tika" voice control (opt-in, default false)

  // Prop Composition Recipes (lab-tuned overrides per family)
  compositionRecipeOverrides?: Record<string, CompositionRecipe>;

  // Assemble Grid Preferences (persisted from wizard)
  preferredGridMode?: GridMode; // Last-used grid mode in assemble
  preferredShowCenter?: boolean; // Last-used center toggle in assemble

  // Browse Grid Settings
  gridZoomLevel?: number; // DEPRECATED (2026-07-13): global density let a phone pinch pin desktops at 2 columns. Superseded by gridZoomByBucket; no longer read.
  gridColumnsExplicit?: boolean; // DEPRECATED (2026-07-13): global explicit-choice flag; superseded by gridZoomByBucket; no longer read.
  gridZoomByBucket?: Record<string, number>; // Chosen column density per width bucket (key = getWidthBucketKey). Widths without a choice auto-adapt to the bucket default.

  // Image Export Settings
  imageExport?: {
    addWord?: boolean;
    addStepNumbers?: boolean;
    addDifficultyLevel?: boolean;
    includeStartPlacement?: boolean;
    darkMode?: boolean;
    customName?: string; // Optional custom name for header

    showNotes?: boolean; // Bottom-center: notes text
    customNotesText?: string; // Custom text for notes (default: "Created using Flow Arts Composer")
    showLoopGlyph?: boolean; // Show LOOP glyph indicator
    columnCountOverrides?: Record<string, number | null>; // Per-length card columns; null = Auto
    columnCountPreferenceVersion?: number; // Provenance schema; unversioned numeric values migrate to Auto
    columnCountPreferenceOwner?: string; // Firebase identity that explicitly chose the numeric value
  };
}

/**
 * Accessibility Settings
 * Subset of AppSettings focused on accessibility features
 */
export interface AccessibilitySettings {
  reducedMotion: boolean;
  highContrast: boolean;
  visibleParticleSize?: number;
}

/** Normalize settings persisted before hand identity moved from colors to sides. */
export function normalizeLegacyAppSettings(value: unknown): AppSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value as AppSettings;
  }

  const source = value as Record<string, unknown>;
  const normalized = normalizeLegacyPropConfig(source) as Record<string, unknown>;
  if (source.primaryPropColors != null) {
    const colors = resolveViewerCustomColorPair(source.primaryPropColors);
    normalized.primaryPropColors = { left: colors.left.toLowerCase(), right: colors.right.toLowerCase() };
  }
  if (normalized.leftBuugengFlipped === undefined && source.blueBuugengFlipped !== undefined) {
    normalized.leftBuugengFlipped = source.blueBuugengFlipped;
  }
  if (normalized.rightBuugengFlipped === undefined && source.redBuugengFlipped !== undefined) {
    normalized.rightBuugengFlipped = source.redBuugengFlipped;
  }
  delete normalized.blueBuugengFlipped;
  delete normalized.redBuugengFlipped;

  // Position -> placement rename: fields renamed with no read-side migration.
  // Only fill the new key when it is absent so an already-migrated or
  // freshly saved value is never overwritten.
  if (normalized.blockedStartPlacements === undefined && source.blockedStartPositions !== undefined) {
    normalized.blockedStartPlacements = source.blockedStartPositions;
  }
  delete normalized.blockedStartPositions;

  if (
    normalized.blockedStartPlacementsByGridMode === undefined &&
    source.blockedStartPositionsByGridMode !== undefined
  ) {
    normalized.blockedStartPlacementsByGridMode = source.blockedStartPositionsByGridMode;
  }
  delete normalized.blockedStartPositionsByGridMode;

  if (
    source.visibility != null &&
    typeof source.visibility === "object" &&
    !Array.isArray(source.visibility)
  ) {
    const visibilitySource = source.visibility as Record<string, unknown>;
    const visibility: Record<string, unknown> = { ...visibilitySource };
    if (visibility.placementsGlyph === undefined && visibilitySource.positionsGlyph !== undefined) {
      visibility.placementsGlyph = visibilitySource.positionsGlyph;
    }
    delete visibility.positionsGlyph;
    normalized.visibility = visibility;
  }

  if (
    source.imageExport != null &&
    typeof source.imageExport === "object" &&
    !Array.isArray(source.imageExport)
  ) {
    const imageExportSource = source.imageExport as Record<string, unknown>;
    const imageExport: Record<string, unknown> = { ...imageExportSource };
    if (
      imageExport.includeStartPlacement === undefined &&
      imageExportSource.includeStartPosition !== undefined
    ) {
      imageExport.includeStartPlacement = imageExportSource.includeStartPosition;
    }
    delete imageExport.includeStartPosition;
    normalized.imageExport = imageExport;
  }

  if (Array.isArray(source.propPresets)) {
    normalized.propPresets = source.propPresets.map((preset) =>
      preset === null ? null : normalizeLegacyAppSettings(preset)
    );
  }

  return normalized as unknown as AppSettings;
}
