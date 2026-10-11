/**
 * ModalStack - Global registry for managing nested modals
 *
 * Tracks which modals are open and their stacking order.
 * Ensures only the topmost modal responds to escape/backdrop clicks.
 *
 * Also manages pull-to-refresh blocking:
 * - When any modal is open: blocks pull-to-refresh (overscroll-behavior-y: contain)
 * - When all modals close: enables pull-to-refresh (removes the property)
 *
 * Similar pattern to DrawerStack.
 */

import { Z } from '#lib/shared/ui/z-index.js';
import { getEscapeLayerManager } from '#lib/shared/keyboard/get-escape-layer-manager.js';

type DismissCallback = () => void;

const modalStack: string[] = [];
const dismissCallbacks = new Map<string, DismissCallback>();
const canEscapeDismissCallbacks = new Map<string, () => boolean>();

const BASE_Z_INDEX = Z.MODAL;
const Z_INDEX_INCREMENT = 10;

/**
 * Update pull-to-refresh blocking based on modal state.
 * When any modal is open, block pull-to-refresh to prevent conflicts with swipe-to-dismiss.
 * When all modals are closed, pull-to-refresh works normally.
 */
function updatePullToRefreshBlocking(): void {
	if (typeof document === 'undefined') return;

	const html = document.documentElement;

	if (modalStack.length > 0) {
		html.style.overscrollBehaviorY = 'contain';
	} else {
		html.style.removeProperty('overscroll-behavior-y');
	}
}

/**
 * Register a modal when it opens
 * @returns The z-index this modal should use
 */
export function registerModal(
	id: string,
	onDismiss: DismissCallback,
	canEscapeDismiss: () => boolean = () => true
): number {
	// Remove if already registered (shouldn't happen, but safety)
	const existingIndex = modalStack.indexOf(id);
	if (existingIndex > -1) {
		modalStack.splice(existingIndex, 1);
	}

	modalStack.push(id);
	dismissCallbacks.set(id, onDismiss);
	canEscapeDismissCallbacks.set(id, canEscapeDismiss);
	getEscapeLayerManager().register({
		id: `modal:${id}`,
		dismiss: onDismiss,
		canDismiss: canEscapeDismiss,
	});

	// Block pull-to-refresh when modal opens
	updatePullToRefreshBlocking();

	return BASE_Z_INDEX + modalStack.length * Z_INDEX_INCREMENT;
}

/**
 * Unregister a modal when it closes
 */
export function unregisterModal(id: string): void {
	const index = modalStack.indexOf(id);
	if (index > -1) {
		modalStack.splice(index, 1);
	}
	dismissCallbacks.delete(id);
	canEscapeDismissCallbacks.delete(id);
	getEscapeLayerManager().unregister(`modal:${id}`);

	// Re-enable pull-to-refresh if no modals are open
	updatePullToRefreshBlocking();
}

/**
 * Check if a modal is the topmost in the stack
 */
export function isTopModal(id: string): boolean {
	return modalStack.length > 0 && modalStack[modalStack.length - 1] === id;
}

/**
 * Get the current stack depth (for debugging)
 */
export function getStackDepth(): number {
	return modalStack.length;
}

/**
 * Dismiss the topmost modal (used for escape key handling)
 */
export function dismissTopModal(): boolean {
	const topId = modalStack[modalStack.length - 1];
	if (!topId) return false;

	const callback = dismissCallbacks.get(topId);
	const canDismiss = canEscapeDismissCallbacks.get(topId);
	if (callback && (canDismiss?.() ?? true)) {
		callback();
		return true;
	}

	return false;
}

/**
 * Check if any modals are open
 */
export function hasOpenModals(): boolean {
	return modalStack.length > 0;
}

/**
 * Generate a unique modal ID
 */
export function generateModalId(): string {
	return `modal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
