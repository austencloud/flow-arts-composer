/**
 * Sequence Handoff Coordinator
 *
 * Manages handoff of sequences between modules:
 * - Browse → /sequence/[id] route (view sequence)
 * - /sequence/[id] → Compose (multi-performer or export)
 *
 * Uses sessionStorage to persist handoff data across navigation.
 */

import type { SequenceData } from '#lib/shared/foundation/domain/models/sequence-data.js';
import { navigationState } from '#lib/shared/navigation/state/navigation-state.svelte.js';

const HANDOFF_STORAGE_KEY = 'tka_sequence_handoff';
const ROUTE_HANDOFF_STORAGE_KEY = 'tka_sequence_route_handoff';

/**
 * Handoff data passed from the sequence viewer (SequenceViewerDrawerHost on mobile,
 * /sequence/[id] route on desktop) to Compose
 */
export interface SequenceHandoff {
	/** The sequence to visualize */
	sequence: SequenceData;

	/** Current playback state to restore */
	playbackState?: {
		currentStep: number;
		bpm: number;
		isPlaying: boolean;
	};

	/** Which visualization preset to open */
	preferredPreset?: 'stagger' | 'mirror' | 'combo-export';

	/** Path to return to when closing Compose (e.g., "/browse") */
	returnPath?: string;
}

/**
 * Extended handoff data for Browse → /sequence/[id] navigation
 * Includes return context for restoring gallery state
 */
export interface SequenceRouteHandoff {
	/** The sequence to view (cached for instant loading) */
	sequence: SequenceData;

	/** Current playback state to restore */
	playbackState?: {
		currentStep: number;
		bpm: number;
		isPlaying: boolean;
	};

	/** Path to return to (e.g., "/browse/gallery") */
	returnPath: string;

	/** Label for back button (e.g., "Browse", "My Library") */
	returnLabel?: string;

	/** Scroll position to restore on return */
	scrollY?: number;

	/** Active filters to restore on return */
	filters?: Record<string, unknown>;

	/** Timestamp for staleness checking */
	timestamp: number;
}

/**
 * Save handoff data to sessionStorage for consumption after navigation.
 * Called by the sequence viewer before navigating to Compose.
 */
export function saveSequenceHandoff(handoff: SequenceHandoff): void {
	try {
		const serialized = JSON.stringify(handoff);
		sessionStorage.setItem(HANDOFF_STORAGE_KEY, serialized);
	} catch (err) {
		console.error('[SequenceHandoff] Failed to save handoff:', err);
	}
}

/**
 * Consume handoff data from sessionStorage.
 * Called by Compose module on mount when handoff=true query param is present.
 * Returns null if no handoff data exists or parsing fails.
 * Automatically clears the storage after consuming.
 */
export function consumeSequenceHandoff(): SequenceHandoff | null {
	try {
		const serialized = sessionStorage.getItem(HANDOFF_STORAGE_KEY);
		if (!serialized) return null;

		// Clear after reading (one-time consumption)
		sessionStorage.removeItem(HANDOFF_STORAGE_KEY);

		const handoff = JSON.parse(serialized) as SequenceHandoff;

		// Basic validation
		if (!handoff.sequence?.id) {
			console.warn('[SequenceHandoff] Invalid handoff data - missing sequence');
			return null;
		}

		return handoff;
	} catch (err) {
		console.error('[SequenceHandoff] Failed to consume handoff:', err);
		sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
		return null;
	}
}

/**
 * Check if there's pending handoff data without consuming it.
 * Useful for conditional rendering before fully loading the handoff.
 */
export function hasSequenceHandoff(): boolean {
	return sessionStorage.getItem(HANDOFF_STORAGE_KEY) !== null;
}

/**
 * Clear any pending handoff data.
 * Called if navigation is cancelled or handoff is no longer needed.
 */
export function clearSequenceHandoff(): void {
	sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
}

// ROUTE HANDOFF (Browse → /sequence/[id])

/**
 * Save route handoff data for Browse → /sequence/[id] navigation.
 * Caches the sequence for instant loading and stores return context.
 */
export function saveSequenceRouteHandoff(handoff: Omit<SequenceRouteHandoff, 'timestamp'>): void {
	try {
		const data: SequenceRouteHandoff = {
			...handoff,
			timestamp: Date.now()
		};
		const serialized = JSON.stringify(data);
		sessionStorage.setItem(ROUTE_HANDOFF_STORAGE_KEY, serialized);
	} catch (err) {
		console.error('[SequenceRouteHandoff] Failed to save:', err);
	}
}

/**
 * Consume route handoff data from sessionStorage.
 * Called by /sequence/[id] route on mount.
 * Returns null if no handoff exists, is stale (>5 min), or parsing fails.
 * Automatically clears the storage after consuming.
 */
export function consumeSequenceRouteHandoff(): SequenceRouteHandoff | null {
	try {
		const serialized = sessionStorage.getItem(ROUTE_HANDOFF_STORAGE_KEY);
		if (!serialized) return null;

		// Clear after reading (one-time consumption)
		sessionStorage.removeItem(ROUTE_HANDOFF_STORAGE_KEY);

		const handoff = JSON.parse(serialized) as SequenceRouteHandoff;

		// Check staleness (5 minute max)
		const STALE_THRESHOLD_MS = 5 * 60 * 1000;
		if (Date.now() - handoff.timestamp > STALE_THRESHOLD_MS) {
			console.warn('[SequenceRouteHandoff] Handoff data is stale, ignoring');
			return null;
		}

		// Basic validation - sequence must exist with at least an id, word, or steps
		if (!handoff.sequence || (!handoff.sequence.id && !handoff.sequence.word && !handoff.sequence.steps)) {
			console.warn('[SequenceRouteHandoff] Invalid handoff data - missing sequence');
			return null;
		}

		return handoff;
	} catch (err) {
		console.error('[SequenceRouteHandoff] Failed to consume:', err);
		sessionStorage.removeItem(ROUTE_HANDOFF_STORAGE_KEY);
		return null;
	}
}

/**
 * Check if there's pending route handoff data without consuming it.
 */
export function hasSequenceRouteHandoff(): boolean {
	return sessionStorage.getItem(ROUTE_HANDOFF_STORAGE_KEY) !== null;
}

/**
 * Clear any pending route handoff data.
 */
export function clearSequenceRouteHandoff(): void {
	sessionStorage.removeItem(ROUTE_HANDOFF_STORAGE_KEY);
}


/**
 * Return context for sequence viewer navigation.
 * Describes where to return when the user closes the sequence viewer.
 */
export interface ReturnContext {
	/** Path to navigate back to (e.g., "/create/generate") */
	returnPath: string;
	/** Human-readable label for back button (e.g., "Generate") */
	returnLabel: string;
}

/**
 * Get the current return context based on navigation state.
 * Use this when opening the sequence viewer to determine where to return.
 *
 * @example
 * const { returnPath, returnLabel } = getReturnContext();
 * openSequenceViewer(sequence, { returnPath, returnLabel });
 */
export function getReturnContext(): ReturnContext {
	const currentModule = navigationState.currentModule;
	const activeTab = navigationState.activeTab;

	// Build return path from current navigation state
	const returnPath = activeTab ? `/${currentModule}/${activeTab}` : `/${currentModule}`;

	// Get proper label from tab definitions, or capitalize tab ID as fallback
	let returnLabel = 'Back';
	if (activeTab) {
		const tabs = navigationState.getTabsForModule(currentModule);
		const tabDef = tabs?.find((t) => t.id === activeTab);
		returnLabel = tabDef?.label ?? capitalize(activeTab);
	} else {
		// No tab, use module name
		const moduleDef = navigationState.getModuleDefinition(currentModule);
		returnLabel = moduleDef?.label ?? capitalize(currentModule);
	}

	return { returnPath, returnLabel };
}

/**
 * Capitalize first letter of a string.
 */
function capitalize(str: string): string {
	if (!str) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}
