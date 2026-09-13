/**
 * Keyboard Event Domain Model
 *
 * Represents a normalized keyboard event with cross-platform support.
 *
 * Domain: Keyboard Shortcuts
 */

import type {
  KeyModifier,
  KeyboardEventDetails,
} from "../types/keyboard-types";
import { isEditableKeyboardTarget } from "../shortcut-target-resolution";

export class NormalizedKeyboardEvent implements KeyboardEventDetails {
  key: string;
  modifiers: KeyModifier[];
  ctrlOrMeta: boolean;
  originalEvent: KeyboardEvent;
  target: EventTarget | null;
  isInputTarget: boolean;

  constructor(event: KeyboardEvent) {
    this.originalEvent = event;
    this.target = event.target;
    this.key = this.normalizeKey(event.key);
    this.modifiers = this.extractModifiers(event);
    this.ctrlOrMeta = this.detectCtrlOrMeta();
    this.isInputTarget =
      isEditableKeyboardTarget(event.target) ||
      event.target instanceof HTMLInputElement;
  }

  /**
   * Normalize the key value for consistent comparison
   */
  private normalizeKey(key: string): string {
    // Handle special key mappings
    const keyMap: Record<string, string> = {
      " ": "Space",
      Esc: "Escape",
      // Shifted number keys (US keyboard layout) - map back to numbers
      // This allows Shift+1 to be detected as Shift+1, not Shift+!
      "!": "1",
      "@": "2",
      "#": "3",
      $: "4",
      "%": "5",
      "^": "6",
      "&": "7",
      "*": "8",
      "(": "9",
      ")": "0",
      "?": "/",
    };

    return keyMap[key] || key;
  }

  /**
   * Extract active modifiers from the event
   */
  private extractModifiers(event: KeyboardEvent): KeyModifier[] {
    const modifiers: KeyModifier[] = [];

    if (event.ctrlKey) modifiers.push("ctrl");
    if (event.altKey) modifiers.push("alt");
    if (event.shiftKey) modifiers.push("shift");
    if (event.metaKey) modifiers.push("meta");

    return modifiers;
  }

  /**
   * Detect if Ctrl (Windows/Linux) or Meta (Mac) was pressed
   * This allows shortcuts defined with "ctrl" to work with Cmd on Mac
   */
  private detectCtrlOrMeta(): boolean {
    return (
      this.originalEvent.ctrlKey ||
      this.originalEvent.metaKey ||
      this.modifiers.includes("ctrl") ||
      this.modifiers.includes("meta")
    );
  }

  /**
   * Check if the target is an interactive element that handles Enter/Space
   * (buttons, links, etc.)
   */
  private isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;

    const tagName = target.tagName.toLowerCase();

    // Check for naturally interactive elements
    if (tagName === "button" || tagName === "a" || tagName === "summary") {
      return true;
    }

    // Check for elements with button-like roles
    const role = target.getAttribute("role");
    if (
      role === "button" ||
      role === "link" ||
      role === "menuitem" ||
      role === "option" ||
      role === "tab" ||
      role === "checkbox" ||
      role === "radio" ||
      role === "switch"
    ) {
      return true;
    }

    // Check for elements with tabindex (explicitly focusable)
    // that might be acting as buttons
    const tabindex = target.getAttribute("tabindex");
    if (tabindex !== null && tabindex !== "-1") {
      // If it has an onclick or is a common interactive pattern, respect it
      if (target.onclick || target.hasAttribute("onclick")) {
        return true;
      }
    }

    return false;
  }

  /**
   * Some composite widgets own keys that also exist as application shortcuts.
   * The marker can live on the widget root so nested visual elements inherit it.
   */
  private isLocallyHandledTarget(target: EventTarget | null): boolean {
    // Element, not HTMLElement: the Stage's drill-chart spots are SVG <g>
    // widgets that own the arrow keys, and an HTMLElement test silently
    // skipped the marker for every SVG widget in the app.
    return (
      target instanceof Element &&
      target.closest("[data-keyboard-shortcuts-ignore]") !== null
    );
  }

  /**
   * Check if this event should be ignored for shortcuts
   * (e.g., when typing in an input field, or activating a button)
   */
  shouldIgnore(isSingleKeyShortcut: boolean): boolean {
    if (this.isLocallyHandledTarget(this.target)) return true;

    // Single-key shortcuts should be ignored when typing in inputs
    if (isSingleKeyShortcut && this.isInputTarget) return true;

    // ...and equally when the key was pressed inside an open drawer. A drawer
    // is a surface the user is working *inside*; a bare key there belongs to
    // that surface, not to the application behind it. Without this, any
    // registered single-key shortcut fired from within a sheet, and
    // KeyboardShortcutManager's `dismissTopDrawer()` step then closed the sheet
    // out from under the user — on /create the bare Arrow keys
    // (register-create-shortcuts.ts) did exactly that while their own actions
    // were still stubs, so the only visible effect of pressing an arrow in a
    // sheet was that the sheet vanished.
    //
    // Deliberately narrower than `data-keyboard-shortcuts-ignore`, which
    // suppresses ALL shortcuts under it: modifier combos (Ctrl+S save, Ctrl+Z
    // undo) must keep working inside a drawer, and a single key pressed
    // OUTSIDE an open drawer must keep its existing dismiss-then-execute
    // behaviour. Both are preserved because this only matches when the event
    // target is itself within the drawer.
    if (isSingleKeyShortcut && this.isInsideOpenDrawer()) return true;

    // Shift-only shortcuts in input fields should be treated as typing.
    // Shift+1 = !, Shift+2 = @, Shift+A = A, etc.
    // These are characters the user wants to type, not commands.
    if (this.isInputTarget && this.isShiftOnlyTyping()) return true;

    // Enter and Space on interactive elements should activate the element,
    // not trigger shortcuts
    if (this.key === "Enter" || this.key === "Space") {
      if (this.isInteractiveTarget(this.target)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Is the event's target inside an open drawer?
   *
   * Matches `data-drawer-id`, which `Drawer.svelte` already stamps on its
   * `<dialog>` while open — no new marker, and the attribute is emitted by
   * that primitive alone.
   */
  private isInsideOpenDrawer(): boolean {
    return (
      this.target instanceof Element &&
      this.target.closest("[data-drawer-id]") !== null
    );
  }

  /**
   * Check if this is a Shift-only combo that produces a typeable character.
   * Shift+letter = uppercase, Shift+number = symbol (!@#$%^&*())
   * These should be treated as typing, not shortcuts.
   */
  private isShiftOnlyTyping(): boolean {
    // Only applies when Shift is the only modifier
    if (this.modifiers.length !== 1 || !this.modifiers.includes("shift")) {
      return false;
    }

    // Numbers produce symbols: !@#$%^&*()
    if (/^[0-9]$/.test(this.key)) return true;

    // Letters produce uppercase
    if (/^[a-zA-Z]$/.test(this.key)) return true;

    // Common punctuation that shifts to other characters
    // ` ~ - _ = + [ { ] } \ | ; : ' " , < . > / ?
    const shiftableSymbols = [
      "`",
      "-",
      "=",
      "[",
      "]",
      "\\",
      ";",
      "'",
      ",",
      ".",
      "/",
    ];
    if (shiftableSymbols.includes(this.key)) return true;

    return false;
  }

  /**
   * Check if this is a navigation key (arrows, page up/down, etc.)
   */
  isNavigationKey(): boolean {
    const navigationKeys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ];

    return navigationKeys.includes(this.key);
  }

  /**
   * Check if this is a special key (Enter, Escape, Tab, etc.)
   */
  isSpecialKey(): boolean {
    const specialKeys = [
      "Enter",
      "Escape",
      "Tab",
      "Space",
      "Backspace",
      "Delete",
    ];

    return specialKeys.includes(this.key);
  }

  /**
   * Get a string representation for debugging
   */
  toString(): string {
    const modifierStr =
      this.modifiers.length > 0 ? this.modifiers.join("+") + "+" : "";
    return `${modifierStr}${this.key}`;
  }
}
