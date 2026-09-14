import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import type { PropType } from "../../../pictograph/prop/domain/enums/prop-type";
import type { MandalaPathShape } from "$lib/shared/mandala/domain/mandala-types";

export interface SequenceExportOptions {
  includeStartPosition: boolean;
  /** "row" = start position as top row, "column" = start position as left column */
  startPositionLayout?: "row" | "column";
  addStepNumbers: boolean;
  addReversalSymbols: boolean;
  /** @deprecated Footer visibility is now derived from individual flags. */
  addUserInfo?: boolean;
  addWord: boolean;
  combinedGrids: boolean;
  addDifficultyLevel: boolean;
  customName?: string;
  /** Render the header label literally instead of interpreting it as TKA glyphs. */
  renderWordAsText?: boolean;

  loopType?: LOOPType;
  showLoopGlyph?: boolean;

  showNotes?: boolean;
  customNotesText?: string;
  /** Left-side label override (e.g. "SS 🌊" for VTG cards) */
  leftLabel?: string;
  /** Right-side label override (e.g. "1:1" turn ratio) */
  rightLabel?: string;
  /** Icon image path drawn on both sides of center text */
  iconPath?: string;
  /** Elemental accent hex color for header/footer/margin tinting */
  accentColor?: string;
  /** CIELAB-tuned tint opacity (0–1) for side margin wash; overrides default "18" hex */
  accentTintOpacity?: number;

  propTypeOverride?: PropType;

  leftPropTypeOverride?: PropType;
  rightPropTypeOverride?: PropType;

  /**
   * When set, the composition worker wraps the rendered content in the MPC card
   * frame (diagonal stripe border + edge glow + inset white content area) via
   * `wrapContentInCardFrame`, returning a full framed card. The main-thread
   * `PrintCardRenderer.renderFront` applies the frame itself and leaves this
   * unset. Carried through `composeFrontBitmap`'s JSON-serialized options.
   */
  frontCardFrame?: {
    canvasWidth: number;
    canvasHeight: number;
    bleedPx: number;
    accent: string;
    dark: string;
    palette?: readonly string[];
  };

  stepScale: number;
  stepSize: number;
  margin: number;

  rightVisible: boolean;
  leftVisible: boolean;

  visibilityOverrides?: {
    fanAppearance?: FanAppearance;
    primaryPropColors?: { left: string; right: string } | null;
    showTKA?: boolean;
    showTnD?: boolean;
    showElemental?: boolean;
    showPositions?: boolean;
    showReversals?: boolean;
    showNonRadialPoints?: boolean;
    showTurnNumbers?: boolean;
    /** Dark Mode - dark background, inverted grid, white text/outlines */
    darkMode?: boolean;
    /** Print Mode - pure white background for professional printing (overrides darkMode) */
    printMode?: boolean;
    /** Show/hide grid background */
    showGrid?: boolean;
    /** Hand point visibility: "all" | "active" | "none" */
    handPointVisibility?: "all" | "active" | "none";
    /** Left-hand prop type override (for cache key consistency) */
    leftPropType?: PropType;
    /** Right-hand prop type override (for cache key consistency) */
    rightPropType?: PropType;
    /** Buugeng chirality (buugeng-family props only). Omitted = unflipped,
     *  which is the canonical look for locked deck/print cards. */
    leftBuugengFlipped?: boolean;
    rightBuugengFlipped?: boolean;
    /** Render QR code in empty cell (if available) */
    showQRCode?: boolean;
    /** Render as hand path visualization (HAND props, float arrows, no TKA) */
    handPathMode?: boolean;
    /** Render sequence mandalas in empty cells */
    showMandala?: boolean;
  };

  /**
   * Path shape for the mandalas drawn in empty cells. Matches the motion-path
   * policy the animation canvas draws with, so an exported card traces the same
   * paths the preview showed. Left unset by pipelines that want a fixed look
   * regardless of the viewer's current choice (printed decks), which keeps the
   * geometry calculator's "arc" default.
   */
  mandalaPathShape?: MandalaPathShape;

  notes: string;

  columnCount?: number | null;

  /**
   * Horizontal centering policy for fixed physical-card grids. The default
   * optical mode compensates for pictograph labels that sit toward each cell's
   * left edge. Geometric mode keeps the grid gutters equal when large centered
   * cells such as Start and QR make that compensation look off-center.
   */
  gridCentering?: "optical" | "geometric";

  format: "PNG" | "JPEG" | "WebP";
  quality: number;
  scale: number;
  width?: number;
  height?: number;
  backgroundColor?: string;

  /** Use 5:7 playing card layout (composeCardImage) for physical card export.
   *  Different from printMode (white background). cardMode = card aspect ratio. */
  cardMode?: boolean;

  /** Deck ID stamped on QR short codes generated for deck cards */
  deckId?: string;
  /** Human-readable deck name stamped on QR short codes for analytics */
  deckName?: string;

  /** Render at fixed playing card dimensions with consistent header/footer sizing.
   *  contentWidth/contentHeight = the content area inside the bleed (e.g. 750×1050 poker). */
  deckCard?: {
    contentWidth: number;
    contentHeight: number;
  };

  /**
   * A pre-rendered QR code image, drawn into the QR cell instead of generating
   * one. Render-only and NEVER serialized — the composition worker attaches it
   * to its local options copy after structured-clone, because the worker's
   * ImageComposer has no QR generator (and no Firebase). On the main thread this
   * stays undefined and renderQRCode generates as usual.
   */
  qrImageBitmap?: CanvasImageSource;
}

export interface StepRenderOptions {
  addStepNumbers: boolean;
  rightVisible: boolean;
  leftVisible: boolean;
  combinedGrids: boolean;
  stepScale: number;
}

export interface TextRenderOptions {
  margin: number;
  stepScale: number;
  additionalHeightTop?: number;
  additionalHeightBottom?: number;
}

export interface CompositionOptions extends SequenceExportOptions {
  layout: [number, number]; // [columns, rows]
  additionalHeightTop: number;
  additionalHeightBottom: number;
}

export interface LayoutData {
  columns: number;
  rows: number;
  stepSize: number;
  includeStartPosition: boolean;
  additionalHeightTop: number;
  additionalHeightBottom: number;
}

export interface ExportProgress {
  stage: "validation" | "rendering" | "composition" | "share" | "complete";
  progress: number; // 0-100
  message: string;
  currentStep?: number;
  totalSteps?: number;
}

export interface ExportError extends Error {
  stage: string;
  details?: unknown;
}

export interface MemoryEstimate {
  estimatedMB: number;
  safe: boolean;
}

export interface SequenceExportResult {
  success: boolean;
  blob?: Blob;
  filename: string;
  error?: ExportError;
  metadata: {
    format: string;
    size: number;
    dimensions: { width: number; height: number };
    stepCount: number;
    processingTime: number;
  };
}

export interface SequenceRenderQualitySettings {
  antialiasing: boolean;
  smoothScaling: boolean;
  highResolution: boolean;
  textQuality: "low" | "medium" | "high";
}

export interface LayoutConstraints {
  maxColumns: number;
  maxRows: number;
  minBeatSize: number;
  maxBeatSize: number;
  aspectRatio?: number;
}

export const ITKAImageExportServiceInterface = Symbol.for(
  "ITKAImageExportService"
);
