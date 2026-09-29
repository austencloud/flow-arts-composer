/**
 * FocusRestore - Helper for managing focus restoration
 *
 * Native <dialog> handles basic focus restoration, but this helper provides:
 * - Explicit control over which element to restore focus to
 * - Fallback handling when the original element is removed
 * - Option to disable restoration entirely
 */

export class FocusRestore {
	private previouslyFocusedElement: HTMLElement | null = null;
	private enabled: boolean;

	constructor(options: { enabled?: boolean } = {}) {
		this.enabled = options.enabled ?? true;
	}

	/**
	 * Capture the currently focused element before opening modal
	 */
	capture(): void {
		if (!this.enabled) return;

		const activeElement = document.activeElement;
		if (activeElement instanceof HTMLElement && activeElement !== document.body) {
			this.previouslyFocusedElement = activeElement;
		}
	}

	/**
	 * Restore focus to the previously captured element
	 */
	restore(): void {
		if (!this.enabled || !this.previouslyFocusedElement) return;

		// Check if element is still in the DOM and focusable
		if (document.body.contains(this.previouslyFocusedElement)) {
			try {
				this.previouslyFocusedElement.focus();
			} catch {
				// Element may not be focusable anymore, fail silently
			}
		}

		this.previouslyFocusedElement = null;
	}

	/**
	 * Clear the captured element without restoring
	 */
	clear(): void {
		this.previouslyFocusedElement = null;
	}

	/**
	 * Update the enabled state
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) {
			this.clear();
		}
	}
}

/**
 * Find the first focusable element within a container
 */
export function findFirstFocusable(container: HTMLElement): HTMLElement | null {
	const focusableSelector = [
		'button:not([disabled])',
		'[href]',
		'input:not([disabled]):not([type="hidden"])',
		'select:not([disabled])',
		'textarea:not([disabled])',
		'[tabindex]:not([tabindex="-1"])',
		'[contenteditable="true"]'
	].join(',');

	const elements = container.querySelectorAll<HTMLElement>(focusableSelector);

	for (const element of elements) {
		// Check if element is visible
		const style = window.getComputedStyle(element);
		if (style.display !== 'none' && style.visibility !== 'hidden') {
			return element;
		}
	}

	return null;
}

/**
 * Focus the first focusable element or the container itself
 */
export function focusFirstOrContainer(container: HTMLElement, options?: FocusOptions): void {
	const firstFocusable = findFirstFocusable(container);

	if (firstFocusable) {
		firstFocusable.focus(options);
	} else {
		// Make container focusable and focus it
		if (!container.hasAttribute('tabindex')) {
			container.setAttribute('tabindex', '-1');
		}
		container.focus(options);
	}
}
