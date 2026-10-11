/**
 * KeyboardShortcutManager Implementation
 *
 * Manages keyboard shortcuts globally.
 * Handles registration, event listening, and execution of shortcuts.
 *
 * Domain: Keyboard Shortcuts
 */

import type { ShortcutRegistry } from "./shortcut-registry";
import type {
  ShortcutContext,
  ShortcutDefinition,
  ShortcutRegistrationOptions,
} from "../domain/types/keyboard-types";
import { Shortcut } from "../domain/models/shortcut";
import { NormalizedKeyboardEvent } from "../domain/models/keyboard-event";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { selectedArrowState } from "#lib/shared/create/state/selected-arrow-state.svelte.js";
import {
  hasOpenDrawers,
  dismissTopDrawer,
} from "#lib/shared/foundation/ui/drawer/drawer-stack.js";
import { getActiveModule } from "#lib/shared/application/state/ui/ui-state.svelte.js";
import { isEditableKeyboardTarget } from "../domain/shortcut-target-resolution";
import {
  logKeyboardShortcutExecuted,
  logKeyboardShortcutFailed,
} from "#lib/shared/keyboard/keyboard-shortcut-analytics.js";

const debug = createComponentLogger("KeyboardShortcutManager");

export class KeyboardShortcutManager {
  private currentContext: ShortcutContext = "global";
  private isInitialized = false;
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  private inputSuppressors = new Set<(event: KeyboardEvent) => boolean>();

  constructor(private registry: ShortcutRegistry) {}

  initialize(): void {
    if (this.isInitialized) return;

    this.keydownHandler = this.handleKeydown.bind(this);
    // Use capture phase to intercept events BEFORE browser defaults
    window.addEventListener("keydown", this.keydownHandler, true);
    this.isInitialized = true;
  }

  dispose(): void {
    if (this.keydownHandler) {
      window.removeEventListener("keydown", this.keydownHandler, true);
      this.keydownHandler = null;
    }
    this.registry.clear();
    this.isInitialized = false;

    debug.log("KeyboardShortcutManager disposed");
  }

  register(options: ShortcutRegistrationOptions): () => void {
    if (!options.id) {
      throw new Error("Shortcut ID is required");
    }

    if (!options.key) {
      throw new Error("Shortcut key is required");
    }

    if (!options.action) {
      throw new Error("Shortcut action is required");
    }

    // Check if already registered - update the action if so
    if (this.registry.has(options.id)) {
      const existing = this.registry.get(options.id);
      if (existing) {
        // Update the action handler (for dynamic binding)
        existing.action = options.action;
      }
      return () => {}; // Don't unregister when updating
    }

    // Create shortcut with defaults
    const shortcutDefinition: ShortcutDefinition = {
      id: options.id,
      label: options.label,
      key: options.key,
      modifiers: options.modifiers ?? [],
      alternateBindings: options.alternateBindings ?? [],
      context: options.context ?? "global",
      scope: options.scope ?? "action",
      priority: options.priority ?? "medium",
      preventDefault: options.preventDefault ?? true,
      stopPropagation: options.stopPropagation ?? false,
      action: options.action,
      enabled: options.enabled ?? true,
      isSingleKey: (options.modifiers ?? []).length === 0,
      forceExecute: options.forceExecute ?? false,
      preserveDrawers: options.preserveDrawers ?? false,
    };

    // Only add description if it's defined
    if (options.description !== undefined) {
      shortcutDefinition.description = options.description;
    }

    // Only add condition if it's defined
    if (options.condition !== undefined) {
      shortcutDefinition.condition = options.condition;
    }

    const shortcut = new Shortcut(shortcutDefinition);

    this.registry.add(shortcut);

    // Return unregister function
    return () => this.unregister(options.id);
  }

  unregister(id: string): void {
    this.registry.remove(id);
  }

  /**
   * Register a predicate that makes the manager ignore matching keydown events
   * for as long as it stays registered. Used when a feature temporarily owns
   * raw key input — e.g. the Assemble numpad builder claims all Numpad* codes —
   * so the global single-key shortcuts never double-fire for keys another
   * surface is already consuming. The manager listens in the capture phase and
   * matches by normalized `event.key`, so a feature cannot reliably out-order it
   * or distinguish (NumLock-off) Numpad from Arrow/Delete on its own; suppressing
   * by `event.code` here is the robust seam. Returns an unregister function.
   */
  addInputSuppressor(predicate: (event: KeyboardEvent) => boolean): () => void {
    this.inputSuppressors.add(predicate);
    return () => {
      this.inputSuppressors.delete(predicate);
    };
  }

  enable(id: string): void {
    const shortcut = this.registry.get(id);
    if (shortcut) {
      shortcut.enabled = true;
    }
  }

  disable(id: string): void {
    const shortcut = this.registry.get(id);
    if (shortcut) {
      shortcut.enabled = false;
    }
  }

  setContext(context: ShortcutContext): void {
    this.currentContext = context;
  }

  getContext(): ShortcutContext {
    return this.currentContext;
  }

  isRegistered(id: string): boolean {
    return this.registry.has(id);
  }

  getAllShortcuts(): ShortcutRegistrationOptions[] {
    return this.registry.getAll().map((shortcut) => ({
      id: shortcut.id,
      label: shortcut.label,
      ...(shortcut.description !== undefined && {
        description: shortcut.description,
      }),
      key: shortcut.key,
      modifiers: shortcut.modifiers,
      alternateBindings: shortcut.alternateBindings,
      context: shortcut.context,
      scope: shortcut.scope,
      priority: shortcut.priority,
      preventDefault: shortcut.preventDefault,
      stopPropagation: shortcut.stopPropagation,
      ...(shortcut.condition !== undefined && {
        condition: shortcut.condition,
      }),
      action: shortcut.action,
      enabled: shortcut.enabled,
    }));
  }

  getShortcutsForContext(
    context: ShortcutContext
  ): ShortcutRegistrationOptions[] {
    return this.registry.getByContext(context).map((shortcut) => ({
      id: shortcut.id,
      label: shortcut.label,
      ...(shortcut.description !== undefined && {
        description: shortcut.description,
      }),
      key: shortcut.key,
      modifiers: shortcut.modifiers,
      alternateBindings: shortcut.alternateBindings,
      context: shortcut.context,
      scope: shortcut.scope,
      priority: shortcut.priority,
      preventDefault: shortcut.preventDefault,
      stopPropagation: shortcut.stopPropagation,
      ...(shortcut.condition !== undefined && {
        condition: shortcut.condition,
      }),
      action: shortcut.action,
      enabled: shortcut.enabled,
    }));
  }

  private handleKeydown(event: KeyboardEvent): void {
    // A feature may temporarily own raw key input (e.g. the Assemble numpad
    // builder claims all Numpad* codes). Honour suppressors first so global
    // shortcuts never double-fire for keys another surface already consumes.
    for (const suppress of this.inputSuppressors) {
      if (suppress(event)) return;
    }

    // PostHog captured Safari dispatching a keydown-shaped event without `key`
    // while an auth input was active. There is nothing a shortcut can match in
    // that event, so stop before normalization instead of turning it into a
    // burst of uncaught exceptions.
    if (typeof event.key !== "string" || event.key.length === 0) return;

    // Text entry owns printable keys, even when a command has `forceExecute`.
    // That flag keeps deliberate combos such as Ctrl+K available in inputs; it
    // must never let a bare or Shift-modified letter cancel text insertion.
    if (
      isEditableKeyboardTarget(event.target) &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      return;
    }

    // Skip WASD shortcuts when an arrow is selected for adjustment
    // The ArrowAdjustmentControls component handles WASD in this case
    const key = event.key.toLowerCase();
    const isSaveCombo =
      key === "s" &&
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey;
    if (
      selectedArrowState.selectedArrow &&
      ["w", "a", "s", "d"].includes(key) &&
      !isSaveCombo
    ) {
      // Arrow is selected, let ArrowAdjustmentPanel handle WASD
      return;
    }

    // Recover context from active module if still at default "global"
    if (this.currentContext === "global") {
      const module = getActiveModule();
      if (module) {
        this.currentContext = module as ShortcutContext;
      }
    }

    // Normalize the event
    const normalized = new NormalizedKeyboardEvent(event);

    // Find matching shortcuts
    const matches = this.registry.findMatches(
      normalized.key,
      normalized.modifiers,
      normalized.ctrlOrMeta,
      this.currentContext
    );

    if (matches.length === 0) return;

    // Get the highest priority match
    const shortcut = matches[0];
    if (!shortcut) return;

    // Check if we should ignore (e.g., typing in input)
    // forceExecute bypasses the interactive element check
    if (!shortcut.forceExecute && normalized.shouldIgnore(shortcut.isSingleKey))
      return;

    // If a drawer is open and this is a single-key shortcut,
    // dismiss the top drawer, then execute the shortcut.
    // The drawer unregisters asynchronously via Svelte reactivity,
    // so we dismiss once per keypress rather than looping.
    // Shortcuts with preserveDrawers (e.g. dark mode toggle) skip this.
    if (shortcut.isSingleKey && !shortcut.preserveDrawers && hasOpenDrawers()) {
      dismissTopDrawer();
    }

    // Log for debugging
    debug.log(`Executing shortcut: ${shortcut.id}`, {
      key: normalized.key,
      modifiers: normalized.modifiers,
      context: this.currentContext,
    });

    const analytics = {
      shortcutId: shortcut.id,
      context: this.currentContext,
      scope: shortcut.scope,
      key: normalized.key,
      modifiers: normalized.modifiers,
      isSingleKey: shortcut.isSingleKey,
    };
    logKeyboardShortcutExecuted(analytics);

    // Execute the shortcut (this will call preventDefault if configured)
    shortcut.execute(event).catch((error) => {
      logKeyboardShortcutFailed(analytics, error);
      console.error(`Error executing shortcut "${shortcut.id}":`, error);
    });
  }
}
