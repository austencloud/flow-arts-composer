/**
 * Grid Zoom State
 *
 * Shared state for grid column count, controlled by:
 * - Pinch gestures on touch devices
 * - +/- buttons in the top bar (for dev tools / non-touch)
 *
 * Density is scoped per width bucket (getWidthBucketKey): a choice made on a
 * phone never pins a desktop at 2 huge columns. Widths without a stored choice
 * auto-adapt to the bucket default (dense on 4K, readable on phones).
 * Preserves state across HMR updates.
 */

import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
import {
	MIN_COLUMNS,
	getMaxColumnsForWidth,
	getDefaultColumnsForWidth,
	getWidthBucketKey,
} from "#lib/shared/browse/services/grid-column-breakpoints.js";

// Preserve state across HMR
function getInitialColumns(): number {
	// Check HMR preserved data first
	if (import.meta.hot?.data?.gridColumns !== undefined) {
		return import.meta.hot.data.gridColumns;
	}
	// Min until the first width measurement adapts it to the bucket density.
	return MIN_COLUMNS;
}

class GridZoomManager {
	// Current column count
	columns = $state<number>(getInitialColumns());

	// True for ~200ms after column change (for CSS transition)
	isTransitioning = $state(false);

	// Container width reported by BrowseGrid's ResizeObserver
	private _containerWidth = 0;

	private transitionTimeout: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Max columns allowed for the current container width.
	 * Uses per-breakpoint limits so small phones can never exceed 2,
	 * mid-size devices cap at 3, etc.
	 */
	get maxColumns(): number {
		return getMaxColumnsForWidth(this._containerWidth);
	}

	/**
	 * Called by BrowseGrid when it measures its container.
	 * Adopts the density for this width's bucket: the user's stored choice for
	 * this viewport class if any, else the bucket default. Never persists —
	 * only a deliberate setColumns writes, so a transient clamp can't
	 * masquerade as a preference.
	 */
	updateContainerWidth(width: number) {
		if (width <= 0 || width === this._containerWidth) return;
		this._containerWidth = width;

		const chosen =
			settingsService.settings.gridZoomByBucket?.[getWidthBucketKey(width)];
		const target = Math.max(
			MIN_COLUMNS,
			Math.min(this.maxColumns, chosen ?? getDefaultColumnsForWidth(width))
		);
		if (target !== this.columns) {
			this.columns = target;
		}
	}

	/**
	 * Set column count directly (from pinch controller or buttons)
	 */
	setColumns(newColumns: number) {
		const clamped = Math.max(MIN_COLUMNS, Math.min(this.maxColumns, newColumns));
		if (clamped !== this.columns) {
			this.columns = clamped;
			this.triggerTransition();
			this.persistToSettings();
		}
	}

	/**
	 * Zoom in = more columns = smaller cards
	 */
	zoomIn() {
		this.setColumns(this.columns + 1);
	}

	/**
	 * Zoom out = fewer columns = larger cards
	 */
	zoomOut() {
		this.setColumns(this.columns - 1);
	}

	/**
	 * Check if zoom in is possible
	 */
	get canZoomIn() {
		return this.columns < this.maxColumns;
	}

	/**
	 * Check if zoom out is possible
	 */
	get canZoomOut() {
		return this.columns > MIN_COLUMNS;
	}

	private triggerTransition() {
		this.isTransitioning = true;

		if (this.transitionTimeout) {
			clearTimeout(this.transitionTimeout);
		}

		this.transitionTimeout = setTimeout(() => {
			this.isTransitioning = false;
			this.transitionTimeout = null;
		}, 200);
	}

	private persistToSettings() {
		// Only reached via setColumns — a deliberate gesture. Scope the choice to
		// the current width bucket so other viewport classes keep auto-adapting.
		const key = getWidthBucketKey(this._containerWidth);
		const buckets = settingsService.settings.gridZoomByBucket ?? {};
		if (buckets[key] !== this.columns) {
			settingsService.updateSetting("gridZoomByBucket", {
				...buckets,
				[key]: this.columns,
			});
		}
	}
}

export const gridZoomManager = new GridZoomManager();

// Preserve state across HMR
if (import.meta.hot) {
	import.meta.hot.accept();
	import.meta.hot.dispose(() => {
		// Save current state before module is replaced
		import.meta.hot!.data.gridColumns = gridZoomManager.columns;
	});
}
