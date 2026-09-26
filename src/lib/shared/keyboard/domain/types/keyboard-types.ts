/**
 * Keyboard Shortcut Domain Types
 *
 * Type definitions for the keyboard shortcut system.
 * Based on WCAG 2.1.4 guidelines and modern keyboard UX patterns.
 *
 * Domain: Keyboard Shortcuts
 */

/**
 * Keyboard modifier keys
 */
export type KeyModifier = "ctrl" | "alt" | "shift" | "meta";

export interface ShortcutBinding {
  key: string;
  modifiers: KeyModifier[];
}

/**
 * Keyboard shortcut context - determines when a shortcut is active
 */
export type ShortcutContext =
  | "global" // Active anywhere in the app
  | "create" // Active in CREATE module
  | "browse" // Active in BROWSE module
  | "learn" // Active in LEARN module
  | "collect" // Active in COLLECT module
  | "compose" // Active in COMPOSE module
  | "choreo" // Active in CHOREO module (sheet builder)
  | "admin" // Active in ADMIN module
  | "realm" // Active in the 3D viewer surfaces (Museum, scene viewer)
  | "stage" // Active in the STAGE module (drill chart + show timeline)
  | "edit-panel" // Active when Edit panel is open
  | "animation-panel" // Active when Animation panel is open
  | "share-panel" // Active when Share panel is open
  | "export-panel" // Active when Export panel is open
  | "modal" // Active when any modal is open
  | "command-palette"; // Active when command palette is open

/**
 * Keyboard shortcut scope - defines what the shortcut operates on
 */
export type ShortcutScope =
  | "navigation" // Navigation shortcuts (module switching, tab switching)
  | "action" // Action shortcuts (play, save, share)
  | "editing" // Editing shortcuts (undo, redo, delete)
  | "panel" // Panel management (open, close, navigate)
  | "focus" // Focus management (regions, inputs)
  | "help" // Help and information
  | "sequence-management" // Sequence management (save, add, delete steps)
  | "animation" // Animation control (play, pause, seek)
  | "workspace" // Workspace navigation and interaction
  | "playback" // Media playback controls
  | "view" // View toggles and display options
  | "selection" // Selection operations
  | "special" // Special/misc shortcuts
  | "admin"; // Admin-only shortcuts (debug tools, impersonation)

/**
 * Shortcut priority - determines which shortcut takes precedence when multiple match
 */
export type ShortcutPriority = "low" | "medium" | "high" | "critical";

/**
 * Keyboard shortcut definition
 */
export interface ShortcutDefinition {
  /** Unique identifier for this shortcut */
  id: string;

  /** Human-readable label */
  label: string;

  /** Optional description for help dialog */
  description?: string;

  /** The key to press (e.g., "k", "Space", "Enter", "ArrowLeft") */
  key: string;

  /** Required modifier keys */
  modifiers: KeyModifier[];

  /** Additional default bindings for the same command */
  alternateBindings?: ShortcutBinding[];

  /** Context where this shortcut is active */
  context: ShortcutContext | ShortcutContext[];

  /** Scope/category of the shortcut */
  scope: ShortcutScope;

  /** Priority when multiple shortcuts match */
  priority: ShortcutPriority;

  /** Whether to prevent default browser behavior */
  preventDefault: boolean;

  /** Whether to stop event propagation */
  stopPropagation: boolean;

  /** Optional condition function - return false to disable shortcut temporarily */
  condition?: () => boolean;

  /** The action to execute when shortcut is triggered */
  action: (event: KeyboardEvent) => void | Promise<void>;

  /** Whether this shortcut is enabled (can be toggled by user) */
  enabled: boolean;

  /** Whether this is a single-key shortcut (WCAG 2.1.4 consideration) */
  isSingleKey: boolean;

  /** Force execution even when focus is on interactive elements (overrides shouldIgnore) */
  forceExecute: boolean;

  /** When true, skip the automatic drawer-dismiss on single-key shortcuts */
  preserveDrawers: boolean;
}

/**
 * Shortcut registration options
 */
export interface ShortcutRegistrationOptions {
  /** Unique identifier for this shortcut */
  id: string;

  /** Human-readable label */
  label: string;

  /** Optional description for help dialog */
  description?: string;

  /** The key to press */
  key: string;

  /** Required modifier keys (default: []) */
  modifiers?: KeyModifier[];

  /** Additional default bindings for the same command */
  alternateBindings?: ShortcutBinding[];

  /** Context where this shortcut is active (default: "global") */
  context?: ShortcutContext | ShortcutContext[];

  /** Scope/category of the shortcut (default: "action") */
  scope?: ShortcutScope;

  /** Priority when multiple shortcuts match (default: "medium") */
  priority?: ShortcutPriority;

  /** Whether to prevent default browser behavior (default: true) */
  preventDefault?: boolean;

  /** Whether to stop event propagation (default: false) */
  stopPropagation?: boolean;

  /** Optional condition function */
  condition?: () => boolean;

  /** The action to execute when shortcut is triggered */
  action: (event: KeyboardEvent) => void | Promise<void>;

  /** Whether this shortcut is enabled (default: true) */
  enabled?: boolean;

  /** Force execution even when focus is on interactive elements (default: false) */
  forceExecute?: boolean;

  /** When true, skip the automatic drawer-dismiss on single-key shortcuts (default: false) */
  preserveDrawers?: boolean;
}

/**
 * Command palette item
 */
export interface CommandPaletteItem {
  /** Unique identifier */
  id: string;

  /** Display label */
  label: string;

  /** Parent location shown before a destination label, such as Create */
  parentLabel?: string;

  /** Optional description/subtitle */
  description?: string;

  /** Icon (Font Awesome class) */
  icon?: string;

  /** Category for grouping */
  category: string;

  /** Destinations move through the app; actions operate on the current app */
  kind?: "destination" | "action";

  /** Stable key used to match ordinary navigation history */
  destinationId?: string;

  /** Associated shortcut keys (for display) */
  shortcut?: string;

  /** Keywords for fuzzy search */
  keywords: string[];

  /** Whether this command is available in current context */
  available: boolean | (() => boolean);

  /** Resolve labels that depend on the active editor when the palette opens */
  resolvePresentation?: () => {
    label?: string;
    parentLabel?: string;
    description?: string;
  };

  /** Action to execute */
  action: () => void | Promise<void>;

  /** Relevance score for search results */
  score?: number;
}

/**
 * Shortcut group for help dialog
 */
export interface ShortcutGroup {
  /** Group label */
  label: string;

  /** Group description */
  description?: string;

  /** Shortcuts in this group */
  shortcuts: ShortcutDefinition[];
}

/**
 * Keyboard event details
 */
export interface KeyboardEventDetails {
  /** The key that was pressed */
  key: string;

  /** Modifier keys that were held */
  modifiers: KeyModifier[];

  /** Whether Ctrl/Cmd was held */
  ctrlOrMeta: boolean;

  /** Original keyboard event */
  originalEvent: KeyboardEvent;

  /** Target element */
  target: EventTarget | null;

  /** Whether target is an input element */
  isInputTarget: boolean;
}

/**
 * Shortcut settings (user preferences)
 */
export interface ShortcutSettings {
  /** Persistence schema version */
  schemaVersion: number;

  /** Whether single-key shortcuts are enabled (WCAG 2.1.4) */
  enableSingleKeyShortcuts: boolean;

  /** Whether Vim-style navigation (j/k) is enabled */
  enableVimStyleNavigation: boolean;

  /** Whether to show shortcut hints in UI */
  showShortcutHints: boolean;

  /** Whether to play sound on shortcut activation */
  playSoundOnActivation: boolean;

  /** Custom key bindings (override defaults) - maps shortcut ID to CustomBinding */
  customBindings: Record<string, CustomBinding>;
}

/**
 * Custom binding for a shortcut
 * Allows users to override the default key combination
 */
export interface CustomBinding {
  /** The custom key combo string (e.g., "ctrl+shift+k", "Space", "alt+ArrowUp") */
  keyCombo: string;

  /** Whether this binding is disabled (allows disabling without deleting) */
  disabled?: boolean;
}

/**
 * Conflict detection result when attempting to bind a key combo
 */
export interface ShortcutConflict {
  /** ID of the shortcut that already uses this key combo */
  existingShortcutId: string;

  /** Human-readable label of the conflicting shortcut */
  existingShortcutLabel: string;

  /** The key combo that conflicts */
  keyCombo: string;

  /** Context where the conflict occurs */
  context: ShortcutContext;

  /**
   * Severity of the conflict:
   * - 'error': Same context, cannot bind without removing existing
   * - 'warning': Overlapping contexts, may work in some situations
   */
  severity: "error" | "warning";
}

/**
 * Parsed key combo representation
 */
export interface ParsedKeyCombo extends ShortcutBinding {
  /** The main key (e.g., "k", "Space", "ArrowLeft") */
  key: string;

  /** Modifier keys */
  modifiers: KeyModifier[];
}

/**
 * OS detection for displaying correct keys in UI
 */
export type OperatingSystem = "macos" | "windows" | "linux" | "unknown";

/**
 * Platform-specific key labels
 */
export interface PlatformKeyLabels {
  ctrl: string; // "Ctrl" or "^"
  meta: string; // "⌘" (Mac) or "Win"
  alt: string; // "Alt" or "⌥"
  shift: string; // "Shift" or "⇧"
  enter: string; // "Enter" or "↵"
  escape: string; // "Esc"
  backspace: string; // "Backspace" or "⌫"
  delete: string; // "Delete" or "⌦"
  space: string; // "Space"
  tab: string; // "Tab" or "⇥"
  arrowUp: string; // "↑"
  arrowDown: string; // "↓"
  arrowLeft: string; // "←"
  arrowRight: string; // "→"
}
