/**
 * Grid Zoom Controller
 *
 * Controls grid column count via:
 * - Pinch gestures on touch devices (iOS Photos-style)
 * - Shift+scroll on desktop
 *
 * Uses discrete column changes when threshold is crossed.
 * No scale transforms - layout changes are handled by CSS grid + transitions.
 */


import {
	MIN_COLUMNS,
	getMaxColumnsForWidth,
} from "#lib/shared/browse/services/grid-column-breakpoints.js";

export interface PinchZoomState {
	/** Current column count. Width-adaptive: phones 2-3, 4K up to 7. */
	columns: number;
	/** Whether gesture is active */
	isGesturing: boolean;
	/** True for ~200ms after column change (for CSS transition timing) */
	isTransitioning: boolean;
}

/** Scale threshold to trigger column change (lower = snappier response) */
const SCALE_THRESHOLD = 1.15;

/** Minimum finger distance to track (filters jitter) */
const MIN_PINCH_DISTANCE = 20;

/** Duration for transition state after column change */
const TRANSITION_DURATION_MS = 200;

/** Scroll delta threshold to trigger column change (in pixels) */
const SCROLL_THRESHOLD = 50;

export class PinchZoomGridController {
	private element: HTMLElement | null = null;
	private pointerCache: PointerEvent[] = [];
	private initialPinchDist = -1;
	private prevPinchDist = -1;
	private currentColumns: number;
	private onStateChange: ((state: PinchZoomState) => void) | null = null;

	// Cumulative scale for threshold detection (pinch)
	private cumulativeScale = 1;

	// Cumulative scroll delta for threshold detection (Shift+wheel)
	private cumulativeScrollDelta = 0;

	// Gesture state
	private isGesturing = false;
	private isTransitioning = false;
	private transitionTimeout: ReturnType<typeof setTimeout> | null = null;

	// Bound event handlers
	private boundPointerDown: (ev: PointerEvent) => void;
	private boundPointerMove: (ev: PointerEvent) => void;
	private boundPointerUp: (ev: PointerEvent) => void;
	private boundWheel: (ev: WheelEvent) => void;

	constructor() {
		this.currentColumns = MIN_COLUMNS;

		this.boundPointerDown = this.handlePointerDown.bind(this);
		this.boundPointerMove = this.handlePointerMove.bind(this);
		this.boundPointerUp = this.handlePointerUp.bind(this);
		this.boundWheel = this.handleWheel.bind(this);
	}

	attach(element: HTMLElement): void {
		if (this.element) {
			this.detach();
		}

		this.element = element;

		// Always attach wheel listener for Shift+scroll on desktop
		element.addEventListener("wheel", this.boundWheel, { passive: false });

		// Only attach touch listeners on touch devices
		if (this.isTouchDevice()) {
			element.addEventListener("pointerdown", this.boundPointerDown, { passive: true });
			element.addEventListener("pointermove", this.boundPointerMove, { passive: false });
			element.addEventListener("pointerup", this.boundPointerUp, { passive: true });
			element.addEventListener("pointercancel", this.boundPointerUp, { passive: true });
			element.addEventListener("pointerleave", this.boundPointerUp, { passive: true });
		}
	}

	detach(): void {
		if (this.element) {
			this.element.removeEventListener("wheel", this.boundWheel);
			this.element.removeEventListener("pointerdown", this.boundPointerDown);
			this.element.removeEventListener("pointermove", this.boundPointerMove);
			this.element.removeEventListener("pointerup", this.boundPointerUp);
			this.element.removeEventListener("pointercancel", this.boundPointerUp);
			this.element.removeEventListener("pointerleave", this.boundPointerUp);
			this.element = null;
		}

		this.clearTransitionTimeout();
		this.resetState();
	}

	setOnStateChange(callback: (state: PinchZoomState) => void): void {
		this.onStateChange = callback;
	}

	private get maxColumns(): number {
		// Shared width breakpoints (viewport width here; the engine re-clamps to
		// container width when it receives the emitted count).
		return getMaxColumnsForWidth(window.innerWidth);
	}

	setColumnCount(columns: number): void {
		this.currentColumns = Math.max(MIN_COLUMNS, Math.min(this.maxColumns, columns));
	}

	isTouchDevice(): boolean {
		return "ontouchstart" in window || navigator.maxTouchPoints > 0;
	}

	private resetState(): void {
		this.pointerCache = [];
		this.initialPinchDist = -1;
		this.prevPinchDist = -1;
		this.cumulativeScale = 1;
		this.cumulativeScrollDelta = 0;
		this.isGesturing = false;
	}

	private clearTransitionTimeout(): void {
		if (this.transitionTimeout !== null) {
			clearTimeout(this.transitionTimeout);
			this.transitionTimeout = null;
		}
	}

	private emitState(): void {
		this.onStateChange?.({
			columns: this.currentColumns,
			isGesturing: this.isGesturing,
			isTransitioning: this.isTransitioning,
		});
	}

	private handlePointerDown(ev: PointerEvent): void {
		if (ev.pointerType !== "touch") return;

		this.pointerCache.push(ev);
		(ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);

		// Start pinch when we have two fingers
		if (this.pointerCache.length === 2) {
			this.initialPinchDist = this.getPointerDistance();
			this.prevPinchDist = this.initialPinchDist;
			this.cumulativeScale = 1;
			this.isGesturing = true;
			this.emitState();
		}
	}

	private handlePointerMove(ev: PointerEvent): void {
		if (ev.pointerType !== "touch") return;

		// Update cached pointer
		const idx = this.pointerCache.findIndex((p) => p.pointerId === ev.pointerId);
		if (idx >= 0) {
			this.pointerCache[idx] = ev;
		}

		// Handle two-finger pinch
		if (this.pointerCache.length === 2) {
			ev.preventDefault(); // Prevent browser zoom
			this.handlePinch();
		}
	}

	private handlePointerUp(ev: PointerEvent): void {
		const idx = this.pointerCache.findIndex((p) => p.pointerId === ev.pointerId);
		if (idx >= 0) {
			this.pointerCache.splice(idx, 1);
		}

		// When gesture ends
		if (this.pointerCache.length < 2 && this.isGesturing) {
			this.isGesturing = false;
			this.emitState();
		}

		if (this.pointerCache.length < 2) {
			this.initialPinchDist = -1;
			this.prevPinchDist = -1;
		}
	}

	private getPointerDistance(): number {
		if (this.pointerCache.length < 2) return -1;
		const p1 = this.pointerCache[0];
		const p2 = this.pointerCache[1];
		if (!p1 || !p2) return -1;
		return Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
	}

	private handlePinch(): void {
		const curDist = this.getPointerDistance();

		if (curDist < MIN_PINCH_DISTANCE || this.prevPinchDist < MIN_PINCH_DISTANCE) {
			this.prevPinchDist = curDist;
			return;
		}

		if (this.prevPinchDist > 0 && curDist > 0) {
			// Calculate instantaneous scale change
			const scaleChange = curDist / this.prevPinchDist;

			// Update cumulative scale for threshold detection
			this.cumulativeScale *= scaleChange;

			if (this.cumulativeScale > SCALE_THRESHOLD) {
				// Pinch out = fewer columns (larger cards)
				this.changeColumns(-1);
			} else if (this.cumulativeScale < 1 / SCALE_THRESHOLD) {
				// Pinch in = more columns (smaller cards)
				this.changeColumns(1);
			}
		}

		this.prevPinchDist = curDist;
	}

	private handleWheel(ev: WheelEvent): void {
		// Only handle Shift+scroll (Ctrl/Cmd conflicts with browser zoom)
		if (!ev.shiftKey) {
			return;
		}

		// Prevent horizontal scroll that Shift+wheel normally triggers
		ev.preventDefault();

		// Accumulate scroll delta
		this.cumulativeScrollDelta += ev.deltaY;

		if (this.cumulativeScrollDelta > SCROLL_THRESHOLD) {
			// Scroll down with Shift = more columns (smaller cards)
			this.changeColumns(1);
		} else if (this.cumulativeScrollDelta < -SCROLL_THRESHOLD) {
			// Scroll up with Shift = fewer columns (larger cards)
			this.changeColumns(-1);
		}
	}

	private changeColumns(delta: number): void {
		const newColumns = Math.max(
			MIN_COLUMNS,
			Math.min(this.maxColumns, this.currentColumns + delta)
		);

		if (newColumns !== this.currentColumns) {
			this.currentColumns = newColumns;
			// Reset cumulative values for next threshold
			this.cumulativeScale = 1;
			this.cumulativeScrollDelta = 0;

			// Set transitioning state for CSS animation
			this.isTransitioning = true;
			this.emitState();

			// Clear transitioning state after animation completes
			this.clearTransitionTimeout();
			this.transitionTimeout = setTimeout(() => {
				this.isTransitioning = false;
				this.transitionTimeout = null;
				this.emitState();
			}, TRANSITION_DURATION_MS);
		}
	}
}
