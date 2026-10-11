/**
 * DrawerStack - Manages z-index stacking for nested drawers
 *
 * When multiple drawers are open simultaneously, this ensures proper
 * z-index ordering so newer drawers appear on top of older ones.
 *
 * Usage is automatic - the Drawer component registers/unregisters
 * itself when opening/closing.
 */

import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { Z } from '#lib/shared/ui/z-index.js';
import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";

const debug = createComponentLogger("DrawerStack");

// Global drawer stack - tracks open drawer IDs in order
const drawerStack: string[] = [];

// Map of drawer IDs to their dismiss callbacks
const dismissCallbacks = new Map<string, () => void>();

const BASE_Z_INDEX = Z.DRAWER;

// Z-index increment per drawer level
const Z_INDEX_INCREMENT = 10;

/**
 * Generate a unique ID for a drawer instance
 */
export function generateDrawerId(): string {
  return `drawer-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Register a drawer as open and get its z-index
 * @param id - Unique drawer ID
 * @param onDismiss - Optional callback to dismiss this drawer
 * @param canEscapeDismiss - Whether Escape may close the drawer right now
 * @returns The z-index to use for this drawer
 */
export function registerDrawer(
  id: string,
  onDismiss?: () => void,
  canEscapeDismiss: () => boolean = () => true
): number {
  // Remove if already exists (shouldn't happen, but be safe)
  const existingIndex = drawerStack.indexOf(id);
  if (existingIndex !== -1) {
    drawerStack.splice(existingIndex, 1);
    dismissCallbacks.delete(id);
  }

  // Add to top of stack
  drawerStack.push(id);

  // Store dismiss callback if provided
  if (onDismiss) {
    dismissCallbacks.set(id, onDismiss);
  }

  getEscapeLayerManager().register({
    id: `drawer:${id}`,
    dismiss: onDismiss ?? (() => {}),
    canDismiss: () => Boolean(onDismiss) && canEscapeDismiss(),
  });

  const zIndex = BASE_Z_INDEX + (drawerStack.length - 1) * Z_INDEX_INCREMENT;
  debug.log(`registerDrawer: ${id} | stack: [${drawerStack.join(", ")}] | zIndex: ${zIndex}`);

  return zIndex;
}

/**
 * Unregister a drawer when it closes
 */
export function unregisterDrawer(id: string): void {
  const index = drawerStack.indexOf(id);
  if (index !== -1) {
    drawerStack.splice(index, 1);
  }
  dismissCallbacks.delete(id);
  getEscapeLayerManager().unregister(`drawer:${id}`);
}

/**
 * Dismiss the topmost drawer in the stack.
 * Used when a swipe is detected on a non-top drawer (e.g., when a child drawer
 * has pointer-events: none on its backdrop, allowing touches to pass through).
 * @returns true if a drawer was dismissed, false if stack is empty
 */
export function dismissTopDrawer(): boolean {
  if (drawerStack.length === 0) {
    return false;
  }

  const topDrawerId = drawerStack[drawerStack.length - 1]!;
  const dismissCallback = dismissCallbacks.get(topDrawerId);

  debug.log(`dismissTopDrawer: dismissing ${topDrawerId}`);

  if (dismissCallback) {
    dismissCallback();
    return true;
  }

  // No callback registered - drawer can't be dismissed this way
  debug.log(`dismissTopDrawer: no callback for ${topDrawerId}`);
  return false;
}

/**
 * Check if a drawer is the topmost drawer
 */
export function isTopDrawer(id: string): boolean {
  const result =
    drawerStack.length > 0 && drawerStack[drawerStack.length - 1] === id;
  debug.log(`isTopDrawer: ${id} | stack: [${drawerStack.join(", ")}] | result: ${result}`);
  return result;
}

/**
 * Get the current drawer stack depth
 */
export function getStackDepth(): number {
  return drawerStack.length;
}

/**
 * Get z-index for a specific drawer
 */
export function getDrawerZIndex(id: string): number {
  const index = drawerStack.indexOf(id);
  if (index === -1) {
    return BASE_Z_INDEX;
  }
  return BASE_Z_INDEX + index * Z_INDEX_INCREMENT;
}

/**
 * Check if any drawer is currently open
 */
export function hasOpenDrawers(): boolean {
  return drawerStack.length > 0;
}
