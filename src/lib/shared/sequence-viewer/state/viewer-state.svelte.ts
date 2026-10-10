import {
	type ViewerMode,
	type ExportContext,
	type ContentType,
	type SplitConfig,
	loadViewerMode,
	loadSplitConfig,
	persistViewerMode,
	persistSplitConfig,
	isValidViewerMode,
	isValidSplitConfig
} from '../services/viewer-state-persistence';
import { coerce3DContent, coerce3DSplit } from '../services/viewer-modes';
import { viewportFits3D } from '#lib/shared/3d/capabilities/viewport-3d-gate.svelte.js';

export type { ViewerMode, ExportContext, ContentType, SplitConfig };

function deriveInitialExportContext(mode: ViewerMode): ExportContext {
	if (mode === 'animation' || mode === 'animation-3d') return 'animation-export';
	if (mode === 'card') return 'image-export';
	return null;
}

export interface ViewerStateOptions {
	/** Seed for the initial mode (a URL's `pane`). Beats localStorage. */
	initialMode?: ViewerMode;
	/** Seed for the initial split layout (a URL's `split`). Beats localStorage. */
	initialSplit?: SplitConfig;
	/**
	 * `false` = view-only mount: this state never writes to localStorage. Used
	 * when the URL carries someone else's view state, so looking at their link
	 * never overwrites the visitor's own remembered preferences.
	 */
	persist?: boolean;
}

export function createViewerState(options?: ViewerStateOptions) {
	const persist = options?.persist ?? true;

	// A seeded mode bypasses `loadViewerMode`'s post-studio/mandala filtering ON
	// PURPOSE: that filter guards against stale localStorage, and a URL is
	// explicit intent. Garbage (`?pane=lol`) still fails the type guard and falls
	// back to the stored preference.
	const seededMode = isValidViewerMode(options?.initialMode) ? options.initialMode : undefined;
	const initialMode = seededMode ?? loadViewerMode({ persist });
	const seededSplit = isValidSplitConfig(options?.initialSplit) ? options.initialSplit : undefined;

	let viewerMode = $state<ViewerMode>(initialMode);
	let exportContext = $state<ExportContext>(deriveInitialExportContext(initialMode));
	let splitConfig = $state<SplitConfig>(seededSplit ?? loadSplitConfig({ persist }));
	let videoUploadOpen = $state(false);

	function setViewerMode(mode: ViewerMode) {
		viewerMode = mode;
		videoUploadOpen = false;
		if (persist) persistViewerMode(mode);
	}

	function setExportContext(ctx: ExportContext) {
		exportContext = ctx;
	}

	function setSplitPaneContent(pane: 'left' | 'right', content: ContentType) {
		if (pane === 'left') {
			splitConfig = { ...splitConfig, leftPane: content };
		} else {
			splitConfig = { ...splitConfig, rightPane: content };
		}
		if (persist) persistSplitConfig(splitConfig);
	}

	function setSplitConfig(config: SplitConfig) {
		splitConfig = { ...config };
		if (persist) persistSplitConfig(splitConfig);
	}

	function enterExport(type: 'animation-export' | 'image-export', contentType?: 'animation' | 'animation-3d') {
		videoUploadOpen = false;
		if (type === 'animation-export') {
			viewerMode = contentType ?? 'animation';
		} else {
			viewerMode = 'card';
		}
		exportContext = type;
		if (persist) persistViewerMode(viewerMode);
	}

	function exitExport() {
		exportContext = null;
	}

	function openVideoUpload() {
		// The Video rail is a browseable gallery. Opening the upload flow is a
		// separate, temporary state so it never hides that gallery on small screens.
		viewerMode = 'videos';
		exportContext = null;
		videoUploadOpen = true;
		if (persist) persistViewerMode(viewerMode);
	}

	function closeVideoUpload() {
		videoUploadOpen = false;
	}


	// wants3D reflects the RAW stored preference (not the viewport-coerced getters
	// below), so folding a Z Fold suppresses 3D via the orchestrator's fits3D
	// guard while the preference survives — unfolding re-enters 3D automatically.
	const wants3D = $derived(
		viewerMode === 'animation-3d' ||
		(viewerMode === 'split' &&
			(splitConfig.leftPane === 'animation-3d' || splitConfig.rightPane === 'animation-3d'))
	);

	// Effective (viewport-gated) views for RENDERING. When the viewport can't host
	// 3D, a persisted 3D mode/pane renders as 2D without overwriting storage. Live
	// via viewportFits3D() — grows back to 3D the instant the screen fits again.
	const effectiveViewerMode = $derived<ViewerMode>(
		viewerMode === 'animation-3d' ? coerce3DContent('animation-3d', viewportFits3D()) : viewerMode
	);
	const effectiveSplitConfig = $derived<SplitConfig>(coerce3DSplit(splitConfig, viewportFits3D()));

	return {
		get viewerMode() {
			return effectiveViewerMode;
		},
		get exportContext() {
			return exportContext;
		},
		get videoUploadOpen() {
			return videoUploadOpen;
		},
		get splitConfig() {
			return effectiveSplitConfig;
		},
		/**
		 * The stored preference before viewport coercion. The URL session captures
		 * these so a 3D link opened on a folded phone does not get rewritten to 2D
		 * in the address bar within a debounce tick; the recipient's own gate
		 * coerces at render time, so a shared 3D link still renders 2D there.
		 */
		get rawViewerMode() {
			return viewerMode;
		},
		get rawSplitConfig() {
			return splitConfig;
		},
		get wants3D() {
			return wants3D;
		},
		setViewerMode,
		setExportContext,
		setSplitPaneContent,
		setSplitConfig,
		enterExport,
		exitExport,
		openVideoUpload,
		closeVideoUpload
	};
}
