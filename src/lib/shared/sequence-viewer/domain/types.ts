/**
 * SequenceViewer Domain Types
 *
 * Types for the unified SequenceViewer component that works in both
 * Create (preview mode) and Browse (full mode) contexts.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/**
 * Viewer mode determines which features are available
 */
export type ViewerMode = "preview" | "full";

/**
 * Media type tabs available in the viewer
 */
export type MediaType = "image" | "animation" | "video";

/**
 * Animation controls configuration
 */
export type ControlsLevel = "minimal" | "standard" | "full";

/**
 * Props for the unified AnimationPlayer component
 */
export interface AnimationPlayerProps {
	/** Sequence to animate */
	sequence: SequenceData;

	/** Auto-start playback on load */
	autoPlay?: boolean;

	/** Show controls below canvas */
	showControls?: boolean;

	/** Level of controls to show */
	controlsLevel?: ControlsLevel;

	/** External control mode - uses callbacks instead of internal state */
	externalControl?: boolean;

	// External control callbacks (only used when externalControl=true)
	isPlaying?: boolean;
	speed?: number;
	currentStep?: number;
	onPlaybackToggle?: () => void;
	onSpeedChange?: (speed: number) => void;
	onStepForward?: () => void;
	onStepBackward?: () => void;

	// Export-related (only for full controls)
	isExporting?: boolean;
	exportProgress?: ExportProgress | null;
	onExport?: () => void;
	onCancelExport?: () => void;
}

export interface ExportProgress {
	stage: "capturing" | "encoding" | "complete" | "error";
	progress: number;
	currentFrame?: number;
	totalFrames?: number;
}

/**
 * Props for the main SequenceViewer component
 */
export interface SequenceViewerProps {
	/** Sequence data to display */
	sequence: SequenceData;

	/** Viewer mode: preview (Create) or full (Browse) */
	mode: ViewerMode;

	/** Initial media type to show */
	initialMediaType?: MediaType;

	// Common callbacks
	onClose?: () => void;
	onShare?: () => void;

	// Preview mode props (export-focused)
	onExport?: (format: MediaFormat, settings: ExportSettings) => void;
	isExporting?: boolean;
	exportProgress?: ExportProgress | null;

	// Full mode props (detail-focused)
	onFavorite?: () => void;
	onEdit?: () => void;
	onDelete?: () => void;
	isFavorited?: boolean;
	creatorInfo?: CreatorInfo | null;
}

/**
 * Creator information for full mode
 */
export interface CreatorInfo {
	id: string;
	displayName: string;
	avatarUrl?: string;
}

/**
 * Media format for export
 */
export type MediaFormat = "animation" | "static" | "performance";

export interface ExportSettings {
	format: MediaFormat;
	animationSettings?: {
		fps: number;
		loopCount: number;
		showOverlays: boolean;
	};
	staticSettings?: {
		width: number;
		height: number;
		quality: number;
		background: "transparent" | "white" | "black";
	};
}
